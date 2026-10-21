import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DeviceSchema, ProfileFileSchema, SettingsSchema, DEFAULT_LOOK, DEFAULT_SETTINGS } from '@tabbydeck/shared';
import { Store, StoreError } from '../src/store/store.ts';
import { writeJsonAtomic } from '../src/store/files.ts';
import { nullLogger } from '../src/log/logger.ts';

let dir: string;
let store: Store;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-store-'));
  store = new Store({ dir, log: nullLogger() });
  await store.load();
});
afterEach(async () => { await store.flush(); rmSync(dir, { recursive: true, force: true }); });

const button = (x: number, y: number, w = 1, h = 1) => ({
  x, y, w, h, look: { ...DEFAULT_LOOK, label: 'B' },
  config: { kind: 'button' as const, policy: 'ignore' as const, triggers: {} },
});
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as StoreError).code; } return 'no error'; };

describe('Store.load', () => {
  it('creates the default profile, devices, variables and settings on an empty dir', async () => {
    await store.flush();
    expect(store.profiles()).toHaveLength(1);
    expect(store.profiles()[0].profile.name).toBe('Main');
    expect(readdirSync(path.join(dir, 'profiles'))).toHaveLength(1);
    expect(existsSync(path.join(dir, 'devices.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'variables.json'))).toBe(true);
    expect(SettingsSchema.parse(JSON.parse(readFileSync(path.join(dir, 'settings.json'), 'utf8')))).toEqual(DEFAULT_SETTINGS);
    expect(existsSync(path.join(dir, 'assets'))).toBe(true);
  });

  it('moves a corrupt settings.json aside and returns defaults', async () => {
    const d2 = mkdtempSync(path.join(tmpdir(), 'tabby-store-'));
    writeFileSync(path.join(d2, 'settings.json'), '{ not json');
    const s2 = new Store({ dir: d2, log: nullLogger() });
    await s2.load();
    expect(s2.settings()).toEqual(DEFAULT_SETTINGS);
    expect(readdirSync(d2).some(f => f.startsWith('settings.json.corrupt-'))).toBe(true);
    rmSync(d2, { recursive: true, force: true });
  });

  it('reloads what it saved', async () => {
    const p = store.createProfile('Streaming', 4, 3);
    await store.flush();
    const s2 = new Store({ dir, log: nullLogger() });
    await s2.load();
    expect(s2.profiles().map(f => f.profile.name).sort()).toEqual(['Main', 'Streaming']);
    expect(s2.profile(p.id)?.profile.cols).toBe(4);
  });
});

describe('widgets', () => {
  it('createWidget overlapping throws overlap', () => {
    const root = store.profiles()[0].profile.rootFolderId;
    expect(code(() => store.createWidget(root, button(0, 0)))).toBe('overlap');
  });
  it('moveWidget out of grid throws out_of_grid', () => {
    const w = store.profiles()[0].widgets[0];
    expect(code(() => store.moveWidget(w.id, 4, 2, 2, 1))).toBe('out_of_grid');
  });
  it('moveWidgets applies a shuffle as one change, and rolls back a bad one whole', () => {
    const root = store.profiles()[0].profile.rootFolderId;
    const a = store.profiles()[0].widgets[0]; // the default button at 0,0
    const b = store.createWidget(root, button(1, 0));
    let events = 0; store.on('profile', () => events++);
    store.moveWidgets([{ id: a.id, x: 1, y: 0 }, { id: b.id, x: 0, y: 0 }]); // a swap: only valid when checked together
    expect([store.widget(a.id)!.x, store.widget(b.id)!.x]).toEqual([1, 0]);
    expect(events).toBe(1);
    expect(code(() => store.moveWidgets([{ id: a.id, x: 0, y: 0 }]))).toBe('overlap');
    expect([store.widget(a.id)!.x, store.widget(b.id)!.x]).toEqual([1, 0]);
  });
  it('updateWidget on an unknown id throws not_found', () => {
    expect(code(() => store.updateWidget('nope', { look: DEFAULT_LOOK }))).toBe('not_found');
  });
  it('updateWidget emits profile with the right id and persists a valid file', async () => {
    const f = store.profiles()[0];
    const seen: string[] = [];
    store.on('profile', id => seen.push(id));
    store.updateWidget(f.widgets[0].id, { look: { ...f.widgets[0].look, label: 'Edited' } });
    expect(seen).toEqual([f.profile.id]);
    await store.flush();
    const onDisk = ProfileFileSchema.parse(JSON.parse(readFileSync(path.join(dir, 'profiles', `${f.profile.id}.json`), 'utf8')));
    expect(onDisk.widgets[0].look.label).toBe('Edited');
  });
  it('duplicateWidget places the copy in the first free cell', () => {
    const w = store.profiles()[0].widgets[0];
    const copy = store.duplicateWidget(w.id);
    expect(copy).toMatchObject({ x: 1, y: 0 });
    expect(copy.id).not.toBe(w.id);
  });
  it('duplicateWidget throws no_space on a full grid', () => {
    const p = store.createProfile('Tiny', 1, 1);
    const w = store.createWidget(p.rootFolderId, button(0, 0));
    expect(code(() => store.duplicateWidget(w.id))).toBe('no_space');
  });
  it('deleteWidget removes it', () => {
    const w = store.profiles()[0].widgets[0];
    store.deleteWidget(w.id);
    expect(store.widget(w.id)).toBeUndefined();
  });
});

describe('folders and profiles', () => {
  it('deleteFolder(root) throws root_folder', () => {
    expect(code(() => store.deleteFolder(store.profiles()[0].profile.rootFolderId))).toBe('root_folder');
  });
  it('deleteFolder cascades subfolders, their widgets, and folder buttons pointing at them', () => {
    const f = store.profiles()[0];
    const sub = store.createFolder(f.profile.id, f.profile.rootFolderId, 'Sub');
    const subsub = store.createFolder(f.profile.id, sub.id, 'SubSub');
    const inner = store.createWidget(subsub.id, button(0, 0));
    const link = store.createWidget(f.profile.rootFolderId, { ...button(1, 0), config: { kind: 'folder', targetFolderId: sub.id } });
    store.deleteFolder(sub.id);
    expect(store.folder(sub.id)).toBeUndefined();
    expect(store.folder(subsub.id)).toBeUndefined();
    expect(store.widget(inner.id)).toBeUndefined();
    expect(store.widget(link.id)).toBeUndefined();
  });
  it('deleteProfile of the only profile throws last_profile', () => {
    expect(code(() => store.deleteProfile(store.profiles()[0].profile.id))).toBe('last_profile');
  });
  it('updateProfile refuses a size that leaves a widget outside', () => {
    const f = store.profiles()[0];
    store.moveWidget(f.widgets[0].id, 4, 2, 1, 1);
    expect(code(() => store.updateProfile(f.profile.id, { cols: 3 }))).toBe('out_of_grid');
  });
  it('reorderProfiles sets order', () => {
    const a = store.profiles()[0].profile;
    const b = store.createProfile('B', 5, 3);
    store.reorderProfiles([b.id, a.id]);
    expect(store.profiles().map(f => f.profile.id)).toEqual([b.id, a.id]);
  });
});

describe('devices, variables, settings', () => {
  it('upserts and deletes devices', async () => {
    const d = { id: 'd1', name: 'Phone', approved: true, blocked: false, lastSeen: 'x', createdAt: 'x' };
    store.upsertDevice(d);
    store.upsertDevice({ ...d, name: 'Renamed' });
    expect(store.devices()).toHaveLength(1);
    expect(store.device('d1')?.name).toBe('Renamed');
    await store.flush();
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'devices.json'), 'utf8'));
    expect(DeviceSchema.array().parse(onDisk)[0].name).toBe('Renamed');
    store.deleteDevice('d1');
    expect(store.device('d1')).toBeUndefined();
  });
  it('setVariable infers type, emits keys, persists only persistent ones', async () => {
    const keys: string[][] = [];
    store.on('variables', k => keys.push(k));
    store.setVariable('count', 3, { persist: true });
    store.setVariable('scratch', 'x');
    expect(store.variables().find(v => v.key === 'count')).toMatchObject({ type: 'number', value: 3, persist: true });
    expect(keys).toEqual([['count'], ['scratch']]);
    await store.flush();
    const onDisk = JSON.parse(readFileSync(path.join(dir, 'variables.json'), 'utf8'));
    expect(onDisk.map((v: { key: string }) => v.key)).toEqual(['count']);
  });
  it('updateSettings validates and persists', async () => {
    store.updateSettings({ theme: 'light' });
    expect(store.settings().theme).toBe('light');
    expect(code(() => store.updateSettings({ port: 0 }))).toBe('invalid');
  });
});

describe('writeJsonAtomic', () => {
  it('leaves no .tmp file behind', async () => {
    const sub = path.join(dir, 'x');
    mkdirSync(sub);
    await writeJsonAtomic(path.join(sub, 'a.json'), { a: 1 });
    expect(readdirSync(sub)).toEqual(['a.json']);
  });
});

describe('id safety', () => {
  it('putProfileFile rejects an id that could escape the profiles folder', () => {
    const f = structuredClone(store.profiles()[0]);
    f.profile.id = '../evil';
    expect(code(() => store.putProfileFile(f))).toBe('invalid');
  });
  it('rejects a widget id with path characters', () => {
    const f = structuredClone(store.profiles()[0]);
    f.profile.id = 'okid';
    f.widgets[0].id = 'a/b';
    expect(code(() => store.putProfileFile(f))).toBe('invalid');
  });
});

describe('profile file integrity on put', () => {
  const sub = () => {
    const f = structuredClone(store.profiles()[0]);
    f.profile.id = 'imported01';
    for (const d of f.folders) d.profileId = 'imported01';
    return f;
  };
  it('rejects a folder parent cycle', () => {
    const f = sub();
    f.folders.push({ id: 'fa', profileId: f.profile.id, parentId: 'fb', name: 'A' }, { id: 'fb', profileId: f.profile.id, parentId: 'fa', name: 'B' });
    expect(code(() => store.putProfileFile(f))).toBe('invalid');
  });
  it('rejects a parentId that points at a missing folder', () => {
    const f = sub();
    f.folders.push({ id: 'fa', profileId: f.profile.id, parentId: 'ghost', name: 'A' });
    expect(code(() => store.putProfileFile(f))).toBe('invalid');
  });
  it('rejects a widget in a missing folder', () => {
    const f = sub();
    f.widgets[0].folderId = 'ghost';
    expect(code(() => store.putProfileFile(f))).toBe('invalid');
  });
  it('accepts a valid file', () => {
    expect(code(() => store.putProfileFile(sub()))).toBe('no error');
  });
});
