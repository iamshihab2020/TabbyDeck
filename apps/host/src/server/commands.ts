import { spawn } from 'node:child_process';
import { z } from 'zod';
import { IdSchema, SettingsSchema, StepSchema, type EditorCommandName } from '@tabbydeck/shared';
import { StoreError } from '../store/store.ts';
import { AssetError } from '../assets/store.ts';
import { exportAll, importAll } from '../store/exportImport.ts';
import type { Host } from '../host.ts';
import type { Logger } from '../log/logger.ts';

/** A command failure with a code the editor shows directly (e.g. wrong_code). */
export class CommandError extends Error { constructor(public code: string) { super(code); } }

export type CommandResult = { ok: true; data?: unknown } | { ok: false; error: string };
// The Start menu apps change rarely: the list is kept a minute, icons for the life of the host.
let apps: { at: number; list: { id: string; name: string }[] } | null = null;
const icons = new Map<string, string | null>();

export interface CommandContext { host: Host; log: Logger; onPausedChange(): void }

const Name = z.string().trim().min(1).max(40);
const Rect = { x: z.number().int(), y: z.number().int(), w: z.number().int().min(1), h: z.number().int().min(1) };
const ProfilePatch = z.object({ name: Name.optional(), cols: z.number().int().optional(), rows: z.number().int().optional(), gap: z.number().optional(), bg: z.string().optional(), bgImage: z.string().optional() }).strict();

// One zod schema per command: arguments from the editor are untrusted until parsed.
const ARGS = {
  'profile.create': z.object({ name: Name, cols: z.number().int(), rows: z.number().int() }),
  'profile.update': z.object({ id: IdSchema, patch: ProfilePatch }),
  'profile.delete': z.object({ id: IdSchema }),
  'profile.reorder': z.object({ ids: z.array(IdSchema) }),
  'folder.create': z.object({ profileId: IdSchema, parentId: IdSchema, name: Name }),
  'folder.update': z.object({ id: IdSchema, name: Name }),
  'folder.delete': z.object({ id: IdSchema }),
  'widget.create': z.object({ folderId: IdSchema, widget: z.object({ ...Rect, look: z.unknown(), config: z.unknown() }) }),
  'widget.update': z.object({ id: z.string(), patch: z.record(z.string(), z.unknown()) }),
  'widget.move': z.object({ id: z.string(), ...Rect }),
  'widget.moveMany': z.object({ moves: z.array(z.object({ id: z.string(), x: z.number().int(), y: z.number().int() })).min(1).max(200) }),
  'widget.delete': z.object({ id: z.string() }),
  'widget.duplicate': z.object({ id: z.string() }),
  'device.approve': z.object({ deviceId: IdSchema, code: z.string().max(12) }),
  'device.deny': z.object({ deviceId: IdSchema }),
  'device.block': z.object({ id: IdSchema }),
  'device.unblock': z.object({ id: IdSchema }),
  'device.forget': z.object({ id: IdSchema }),
  'device.update': z.object({ id: IdSchema, name: Name.optional(), profileId: IdSchema.nullable().optional() }),
  'asset.upload': z.object({ name: z.string().max(200), dataUrl: z.string().max(2_000_000) }),
  'asset.delete': z.object({ id: z.string().max(64) }),
  'action.test': z.object({ step: StepSchema }),
  'settings.update': z.object({ patch: z.record(z.string(), z.unknown()) }),
  'export': z.object({}).passthrough(),
  'import': z.object({ data: z.unknown(), mode: z.enum(['merge', 'replace']) }),
  'log.clear': z.object({}).passthrough(),
  'editor.openDataDir': z.object({}).passthrough(),
  'host.pause': z.object({ paused: z.boolean() }),
  'display.screens': z.unknown(),
  'apps.list': z.unknown(),
  'apps.icon': z.object({ id: z.string().min(1).max(512) }),
} as const;

type Args<K extends keyof typeof ARGS> = z.infer<(typeof ARGS)[K]>;

function device(ctx: CommandContext, id: string) {
  const d = ctx.host.store.device(id);
  if (!d) throw new StoreError('not_found', `device ${id}`);
  return d;
}

const handlers: { [K in keyof typeof ARGS]: (a: Args<K>, ctx: CommandContext) => unknown | Promise<unknown> } = {
  'profile.create': (a, { host }) => ({ id: host.store.createProfile(a.name, a.cols, a.rows).id }),
  'profile.update': (a, { host }) => { host.store.updateProfile(a.id, a.patch); },
  'profile.delete': (a, { host }) => { host.store.deleteProfile(a.id); },
  'profile.reorder': (a, { host }) => { host.store.reorderProfiles(a.ids); },
  'folder.create': (a, { host }) => ({ id: host.store.createFolder(a.profileId, a.parentId, a.name).id }),
  'folder.update': (a, { host }) => { host.store.updateFolder(a.id, { name: a.name }); },
  'folder.delete': (a, { host }) => { host.store.deleteFolder(a.id); },
  'widget.create': (a, { host }) => ({ id: host.store.createWidget(a.folderId, a.widget as never).id }),
  'widget.update': (a, { host }) => { host.store.updateWidget(a.id, a.patch as never); },
  'widget.move': (a, { host }) => { host.store.moveWidget(a.id, a.x, a.y, a.w, a.h); },
  'widget.moveMany': (a, { host }) => { host.store.moveWidgets(a.moves); },
  'widget.delete': (a, { host }) => { host.store.deleteWidget(a.id); },
  'widget.duplicate': (a, { host }) => ({ id: host.store.duplicateWidget(a.id).id }),
  'device.approve': (a, { host }) => {
    const r = host.pairing.approve(a.deviceId, a.code);
    if (r !== 'ok') throw new CommandError(r);
  },
  'device.deny': (a, { host }) => { host.pairing.deny(a.deviceId); },
  'device.block': (a, ctx) => { ctx.host.store.upsertDevice({ ...device(ctx, a.id), blocked: true }); },
  'device.unblock': (a, ctx) => { ctx.host.store.upsertDevice({ ...device(ctx, a.id), blocked: false }); },
  'device.forget': (a, ctx) => { device(ctx, a.id); ctx.host.store.deleteDevice(a.id); },
  'device.update': (a, ctx) => {
    const d = device(ctx, a.id);
    if (a.profileId && !ctx.host.store.profile(a.profileId)) throw new StoreError('not_found', 'profile');
    const { profileId: _old, ...rest } = d;
    ctx.host.store.upsertDevice({ ...rest, ...(a.name ? { name: a.name } : {}), ...(a.profileId === null ? {} : { profileId: a.profileId ?? d.profileId }) });
    if (a.profileId) ctx.host.clients.switchProfile(a.id, a.profileId);
  },
  'asset.upload': (a, { host }) => host.assets.save(a.name, a.dataUrl),
  'asset.delete': (a, { host }) => { host.assets.delete(a.id); },
  'action.test': async (a, { host }) => { await host.engine.runSteps([a.step], {}); },
  'settings.update': async (a, { host }) => {
    const cur = host.store.settings();
    const next = { ...cur, ...a.patch };
    const parsed = SettingsSchema.safeParse(next);
    if (!parsed.success) throw new StoreError('invalid');
    if (parsed.data.port !== cur.port || parsed.data.bindAddress !== cur.bindAddress) {
      try { await host.rebind(parsed.data.bindAddress, parsed.data.port); }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'EADDRINUSE' || (e as NodeJS.ErrnoException).code === 'EACCES') throw new CommandError('port_in_use'); throw e; }
    }
    host.store.updateSettings(a.patch);
  },
  'export': (_a, { host }) => exportAll(host.store, host.assets),
  'import': async (a, { host }) => {
    try { return await importAll(host.store, host.assets, a.data, a.mode); } catch (e) { throw new CommandError(e instanceof Error ? e.message : 'import_failed'); }
  },
  'log.clear': (_a, { log }) => { log.clear(); },
  'editor.openDataDir': (_a, { host }) => { spawn('explorer.exe', [host.store.dir], { detached: true, stdio: 'ignore' }).unref(); },
  'host.pause': (a, ctx) => { ctx.host.engine.paused = a.paused; ctx.onPausedChange(); },
  'display.screens': (_a, { host }) => host.native.display.screens(),
  'apps.list': async (_a, { host }) => {
    if (!apps || Date.now() - apps.at > 60_000) apps = { at: Date.now(), list: await host.native.system.listApps() };
    return apps.list;
  },
  'apps.icon': async (a, { host }) => {
    let url = icons.get(a.id);
    if (url === undefined) {
      const png = await host.native.system.appIcon(a.id, 128).catch(() => null);
      url = png ? `data:image/png;base64,${png.toString('base64')}` : null;
      if (icons.size >= 400) icons.clear(); // shortcut: crude bound on the cache, fine for one editor
      icons.set(a.id, url);
    }
    return { dataUrl: url };
  },
};

/** Run one editor command. Never throws: every failure becomes { ok: false, error }. */
export async function dispatchCommand(name: EditorCommandName, args: unknown, ctx: CommandContext): Promise<CommandResult> {
  const schema = (ARGS as Record<string, z.ZodTypeAny>)[name];
  if (!schema) return { ok: false, error: 'not_implemented' };
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) return { ok: false, error: 'invalid' };
  try {
    const data = await (handlers as Record<string, (a: unknown, c: CommandContext) => unknown>)[name](parsed.data, ctx);
    return data === undefined ? { ok: true } : { ok: true, data };
  } catch (e) {
    if (e instanceof StoreError || e instanceof CommandError || e instanceof AssetError) return { ok: false, error: e.code };
    if (name === 'action.test' && e instanceof Error) return { ok: false, error: e.message };
    ctx.log.error('editor', 'command failed', { name, error: String(e) });
    return { ok: false, error: 'internal' };
  }
}
