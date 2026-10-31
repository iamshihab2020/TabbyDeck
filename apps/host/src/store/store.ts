import { EventEmitter } from 'node:events';
import { mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  DEFAULT_SETTINGS, DeviceSchema, ProfileFileSchema, SettingsSchema, VariableSchema, WidgetSchema,
  defaultProfileFile, firstFreeCell, fits, newId, newProfileFile,
  type Device, type Folder, type Profile, type ProfileFile, type Settings, type Variable, type Widget,
} from '@tabbydeck/shared';
import type { Logger } from '../log/logger.ts';
import { readJsonOr, writeJsonAtomic } from './files.ts';

export type StoreErrorCode = 'not_found' | 'overlap' | 'out_of_grid' | 'last_profile' | 'root_folder' | 'no_space' | 'invalid';
export class StoreError extends Error {
  constructor(public code: StoreErrorCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); this.name = 'StoreError'; }
}

/** Structural checks the schema cannot express: one root, parents exist, no cycles, widgets in known folders. */
export function profileFileProblem(f: ProfileFile): string | null {
  const byId = new Map(f.folders.map(d => [d.id, d]));
  if (byId.size !== f.folders.length) return 'duplicate folder id';
  const root = byId.get(f.profile.rootFolderId);
  if (!root || root.parentId !== null) return 'root folder missing or has a parent';
  for (const d of f.folders) {
    if (d.profileId !== f.profile.id) return `folder ${d.id} belongs to another profile`;
    if (d.id !== root.id && (d.parentId === null || !byId.has(d.parentId))) return `folder ${d.id} has a missing parent`;
    const seen = new Set<string>();
    for (let x: typeof d | undefined = d; x; x = x.parentId ? byId.get(x.parentId) : undefined) {
      if (seen.has(x.id)) return `folder cycle at ${d.id}`;
      seen.add(x.id);
    }
  }
  const widgetIds = new Set<string>();
  for (const w of f.widgets) {
    if (widgetIds.has(w.id)) return 'duplicate widget id';
    widgetIds.add(w.id);
    if (!byId.has(w.folderId)) return `widget ${w.id} is in a missing folder`;
  }
  return null;
}

type WidgetInput = Omit<Widget, 'id' | 'folderId'>;
type WidgetPatch = Partial<WidgetInput>;

interface StoreEvents { profile: [profileId: string]; profileDeleted: [profileId: string]; devices: []; variables: [keys: string[]]; settings: [] }

export class Store extends EventEmitter<StoreEvents> {
  readonly dir: string;
  private log: Logger;
  private files = new Map<string, ProfileFile>();
  private devs: Device[] = [];
  private vars = new Map<string, Variable>();
  private cfg: Settings = { ...DEFAULT_SETTINGS };
  private pending = new Set<Promise<void>>();

  private firstRun: () => ProfileFile[];
  /** Whether this start made the first-run decks (the data folder had no profiles). */
  fresh = false;
  /** firstRun: the decks an empty data folder starts with (the app passes the starter decks; tests keep the one-button default). */
  constructor(opts: { dir: string; log: Logger; firstRun?: () => ProfileFile[] }) { super(); this.dir = opts.dir; this.log = opts.log; this.firstRun = opts.firstRun ?? (() => [defaultProfileFile()]); }

  get assetsDir() { return path.join(this.dir, 'assets'); }
  private profilePath(id: string) {
    const root = path.resolve(this.dir, 'profiles');
    const p = path.resolve(root, `${id}.json`);
    if (path.dirname(p) !== root) throw new StoreError('invalid', 'profile id escapes the profiles folder');
    return p;
  }

  async load(): Promise<void> {
    for (const d of ['profiles', 'assets']) mkdirSync(path.join(this.dir, d), { recursive: true });
    for (const f of readdirSync(path.join(this.dir, 'profiles')).filter(f => f.endsWith('.json'))) {
      const { value, created } = await readJsonOr(path.join(this.dir, 'profiles', f), ProfileFileSchema.nullable(), () => null, this.log);
      if (value && !created) {
        const problem = profileFileProblem(value);
        if (problem) this.log.warn('store', 'skipped invalid profile file', { file: f, problem });
        else this.files.set(value.profile.id, value);
      }
    }
    if (this.files.size === 0) for (const d of this.firstRun()) { this.fresh = true; this.files.set(d.profile.id, d); this.persistProfile(d.profile.id); }
    const devs = await readJsonOr(path.join(this.dir, 'devices.json'), z.array(DeviceSchema), () => [], this.log);
    this.devs = devs.value; if (devs.created) this.persistDevices();
    const vars = await readJsonOr(path.join(this.dir, 'variables.json'), z.array(VariableSchema), () => [], this.log);
    for (const v of vars.value) this.vars.set(v.key, v);
    if (vars.created) this.persistVariables();
    const cfg = await readJsonOr(path.join(this.dir, 'settings.json'), SettingsSchema, () => ({ ...DEFAULT_SETTINGS }), this.log);
    this.cfg = cfg.value; if (cfg.created) this.persistSettings();
  }

  /** Resolves when every pending write has reached disk. */
  async flush(): Promise<void> { while (this.pending.size) await Promise.allSettled([...this.pending]); }

  private track(p: Promise<void>) {
    this.pending.add(p);
    p.catch(e => this.log.error('store', 'write failed', { error: String(e) })).finally(() => this.pending.delete(p));
  }
  private persistProfile(id: string) { const f = this.files.get(id); if (f) this.track(writeJsonAtomic(this.profilePath(id), f)); }
  private persistDevices() { this.track(writeJsonAtomic(path.join(this.dir, 'devices.json'), this.devs)); }
  private persistVariables() { this.track(writeJsonAtomic(path.join(this.dir, 'variables.json'), [...this.vars.values()].filter(v => v.persist))); }
  private persistSettings() { this.track(writeJsonAtomic(path.join(this.dir, 'settings.json'), this.cfg)); }
  private changed(profileId: string) { this.persistProfile(profileId); this.emit('profile', profileId); }

  // ---- readers ----
  profiles(): ProfileFile[] { return [...this.files.values()].sort((a, b) => a.profile.order - b.profile.order); }
  profile(id: string): ProfileFile | undefined { return this.files.get(id); }
  folder(id: string): Folder | undefined { for (const f of this.files.values()) { const x = f.folders.find(d => d.id === id); if (x) return x; } }
  widget(id: string): Widget | undefined { for (const f of this.files.values()) { const x = f.widgets.find(w => w.id === id); if (x) return x; } }
  devices(): Device[] { return this.devs; }
  device(id: string): Device | undefined { return this.devs.find(d => d.id === id); }
  variables(): Variable[] { return [...this.vars.values()]; }
  variable(key: string): Variable | undefined { return this.vars.get(key); }
  settings(): Settings { return this.cfg; }

  private fileOfFolder(folderId: string): ProfileFile {
    for (const f of this.files.values()) if (f.folders.some(d => d.id === folderId)) return f;
    throw new StoreError('not_found', `folder ${folderId}`);
  }
  private fileOfWidget(widgetId: string): [ProfileFile, number] {
    for (const f of this.files.values()) { const i = f.widgets.findIndex(w => w.id === widgetId); if (i >= 0) return [f, i]; }
    throw new StoreError('not_found', `widget ${widgetId}`);
  }
  private checkFits(f: ProfileFile, folderId: string, r: { id?: string; x: number; y: number; w: number; h: number }) {
    const { cols, rows } = f.profile;
    if (r.x < 0 || r.y < 0 || r.x + r.w > cols || r.y + r.h > rows) throw new StoreError('out_of_grid');
    if (!fits(f.widgets.filter(w => w.folderId === folderId), cols, rows, r)) throw new StoreError('overlap');
  }

  // ---- profiles ----
  createProfile(name: string, cols: number, rows: number): Profile {
    const order = Math.max(-1, ...this.profiles().map(f => f.profile.order)) + 1;
    const f = newProfileFile(name, cols, rows, order);
    ProfileFileSchema.parse(f);
    this.files.set(f.profile.id, f);
    this.changed(f.profile.id);
    return f.profile;
  }
  updateProfile(id: string, patch: Partial<Omit<Profile, 'id' | 'rootFolderId'>>): Profile {
    const f = this.files.get(id); if (!f) throw new StoreError('not_found');
    const next = { ...f.profile, ...patch };
    const parsed = ProfileFileSchema.shape.profile.safeParse(next); if (!parsed.success) throw new StoreError('invalid', parsed.error.message);
    if (f.widgets.some(w => w.x + w.w > next.cols || w.y + w.h > next.rows)) throw new StoreError('out_of_grid');
    f.profile = parsed.data;
    const root = f.folders.find(d => d.id === f.profile.rootFolderId); if (root && patch.name) root.name = patch.name;
    this.changed(id);
    return f.profile;
  }
  deleteProfile(id: string): void {
    if (!this.files.has(id)) throw new StoreError('not_found');
    if (this.files.size === 1) throw new StoreError('last_profile');
    this.files.delete(id);
    this.track(import('node:fs/promises').then(fs => fs.rm(this.profilePath(id), { force: true })));
    this.emit('profileDeleted', id);
  }
  reorderProfiles(ids: string[]): void {
    ids.forEach((id, order) => { const f = this.files.get(id); if (f) { f.profile.order = order; this.persistProfile(id); } });
    for (const id of ids) this.emit('profile', id);
  }
  /** Replace a whole profile file (import). */
  putProfileFile(f: ProfileFile): void {
    const parsed = ProfileFileSchema.safeParse(f);
    if (!parsed.success) throw new StoreError('invalid', parsed.error.message);
    const problem = profileFileProblem(parsed.data);
    if (problem) throw new StoreError('invalid', problem);
    this.files.set(parsed.data.profile.id, parsed.data);
    this.changed(parsed.data.profile.id);
  }

  // ---- folders ----
  createFolder(profileId: string, parentId: string, name: string): Folder {
    const f = this.files.get(profileId); if (!f) throw new StoreError('not_found');
    if (!f.folders.some(d => d.id === parentId)) throw new StoreError('not_found', `parent ${parentId}`);
    const folder: Folder = { id: newId(), profileId, parentId, name };
    f.folders.push(folder);
    this.changed(profileId);
    return folder;
  }
  updateFolder(id: string, patch: { name?: string }): Folder {
    const f = this.fileOfFolder(id); const folder = f.folders.find(d => d.id === id)!;
    if (patch.name !== undefined) folder.name = patch.name;
    this.changed(f.profile.id);
    return folder;
  }
  deleteFolder(id: string): void {
    const f = this.fileOfFolder(id);
    if (f.profile.rootFolderId === id) throw new StoreError('root_folder');
    const doomed = new Set([id]);
    for (let grew = true; grew;) { grew = false; for (const d of f.folders) if (d.parentId && doomed.has(d.parentId) && !doomed.has(d.id)) { doomed.add(d.id); grew = true; } }
    f.folders = f.folders.filter(d => !doomed.has(d.id));
    f.widgets = f.widgets.filter(w => !doomed.has(w.folderId) && !(w.config.kind === 'folder' && doomed.has(w.config.targetFolderId)));
    this.changed(f.profile.id);
  }

  // ---- widgets ----
  createWidget(folderId: string, input: WidgetInput): Widget {
    const f = this.fileOfFolder(folderId);
    const w = { ...input, id: newId(), folderId };
    const parsed = WidgetSchema.safeParse(w); if (!parsed.success) throw new StoreError('invalid', parsed.error.message);
    this.checkFits(f, folderId, w);
    f.widgets.push(parsed.data);
    this.changed(f.profile.id);
    return parsed.data;
  }
  updateWidget(id: string, patch: WidgetPatch): Widget {
    const [f, i] = this.fileOfWidget(id);
    const next = { ...f.widgets[i], ...patch, id, folderId: f.widgets[i].folderId };
    const parsed = WidgetSchema.safeParse(next); if (!parsed.success) throw new StoreError('invalid', parsed.error.message);
    this.checkFits(f, next.folderId, next);
    f.widgets[i] = parsed.data;
    this.changed(f.profile.id);
    return parsed.data;
  }
  moveWidget(id: string, x: number, y: number, w: number, h: number): Widget { return this.updateWidget(id, { x, y, w, h }); }
  /** Move several widgets of one folder at once (a drag that shuffles its neighbours). Checked as a whole, saved once. */
  moveWidgets(moves: { id: string; x: number; y: number }[]): void {
    if (!moves.length) return;
    const [f, i0] = this.fileOfWidget(moves[0].id);
    const folderId = f.widgets[i0].folderId;
    const next = f.widgets.map(w => { const m = moves.find(v => v.id === w.id); return m ? { ...w, x: m.x, y: m.y } : w; });
    for (const m of moves) if (next.find(w => w.id === m.id)?.folderId !== folderId) throw new StoreError('invalid', 'moves must stay in one folder');
    const prev = f.widgets; f.widgets = next;
    try { for (const w of next.filter(v => v.folderId === folderId)) this.checkFits(f, folderId, w); }
    catch (e) { f.widgets = prev; throw e; }
    this.changed(f.profile.id);
  }
  deleteWidget(id: string): void {
    const [f, i] = this.fileOfWidget(id);
    f.widgets.splice(i, 1);
    this.changed(f.profile.id);
  }
  duplicateWidget(id: string): Widget {
    const [f, i] = this.fileOfWidget(id);
    const src = f.widgets[i];
    const cell = firstFreeCell(f.widgets.filter(w => w.folderId === src.folderId), f.profile.cols, f.profile.rows, src.w, src.h);
    if (!cell) throw new StoreError('no_space');
    const copy = structuredClone(src);
    if (copy.config.kind === 'button') for (const steps of Object.values(copy.config.triggers)) for (const s of steps ?? []) s.id = newId();
    const { id: _id, folderId: _f, ...rest } = copy;
    return this.createWidget(src.folderId, { ...rest, ...cell });
  }

  // ---- devices, variables, settings ----
  upsertDevice(d: Device): void {
    const v = DeviceSchema.parse(d);
    const i = this.devs.findIndex(x => x.id === v.id);
    if (i >= 0) this.devs[i] = v; else this.devs.push(v);
    this.persistDevices(); this.emit('devices');
  }
  deleteDevice(id: string): void { this.devs = this.devs.filter(d => d.id !== id); this.persistDevices(); this.emit('devices'); }

  setVariable(key: string, value: string | number | boolean, opts: { persist?: boolean; source?: string } = {}): Variable {
    const prev = this.vars.get(key);
    const v: Variable = { key, value, type: typeof value as Variable['type'], persist: opts.persist ?? prev?.persist ?? false, source: opts.source ?? prev?.source ?? 'user' };
    this.vars.set(key, VariableSchema.parse(v));
    if (v.persist || prev?.persist) this.persistVariables();
    this.emit('variables', [key]);
    return v;
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const parsed = SettingsSchema.safeParse({ ...this.cfg, ...patch });
    if (!parsed.success) throw new StoreError('invalid', parsed.error.message);
    this.cfg = parsed.data; this.persistSettings(); this.emit('settings');
    return this.cfg;
  }
}
