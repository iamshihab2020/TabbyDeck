import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { AssetStore } from '../src/assets/store.ts';
import { exportAll, importAll } from '../src/store/exportImport.ts';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const dirs: string[] = []; const stores: Store[] = [];
async function fresh() {
  const dir = mkdtempSync(path.join(tmpdir(), 'tabby-ex-')); dirs.push(dir);
  const store = new Store({ dir, log: nullLogger() }); await store.load(); stores.push(store);
  return { store, assets: new AssetStore(store) };
}
// Wait for background saves before deleting the folder, or Windows reports it as not empty.
afterEach(async () => { for (const s of stores.splice(0)) await s.flush(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

async function populated() {
  const a = await fresh();
  const f = a.store.profiles()[0];
  const sub = a.store.createFolder(f.profile.id, f.profile.rootFolderId, 'Media');
  a.store.createWidget(f.profile.rootFolderId, { x: 1, y: 0, w: 1, h: 1, look: DEFAULT_LOOK, config: { kind: 'folder', targetFolderId: sub.id } });
  const img = await a.assets.save('logo.png', PNG);
  a.store.createWidget(sub.id, { x: 0, y: 0, w: 2, h: 1, look: { ...DEFAULT_LOOK, label: 'Logo', image: img.id }, config: { kind: 'button', policy: 'queue', triggers: { press: [{ id: 'st1', action: 'deck.openFolder', params: { folder: sub.id } }] } } });
  a.store.createProfile('Streaming', 4, 3);
  a.store.setVariable('count', 7, { persist: true });
  a.store.upsertDevice({ id: 'dev1', name: 'Tablet', approved: true, blocked: false, tokenHash: 'secret', lastSeen: 'x', createdAt: 'x' });
  a.store.updateSettings({ theme: 'light', port: 9999 });
  return a;
}

describe('export', () => {
  it('includes profiles, assets, variables and settings, but no tokens and no port settings', async () => {
    const a = await populated();
    const ex = exportAll(a.store, a.assets);
    expect(ex).toMatchObject({ format: 'tabbydeck-export', version: 1 });
    expect(ex.profiles).toHaveLength(2);
    expect(ex.assets).toHaveLength(1);
    expect(ex.assets[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(ex.variables.map(v => v.key)).toEqual(['count']);
    expect(JSON.stringify(ex)).not.toContain('secret');
    expect(ex.settings).toEqual({ theme: 'light', autoStart: false, openEditorOnStart: true });
  });
});

describe('import', () => {
  it('replace on a fresh install reproduces every profile, folder, widget and step id for id', async () => {
    const a = await populated();
    const ex = JSON.parse(JSON.stringify(exportAll(a.store, a.assets)));
    const b = await fresh();
    const r = await importAll(b.store, b.assets, ex, 'replace');
    expect(r).toMatchObject({ profiles: 2, widgets: 3, assets: 1, warnings: [] });
    const strip = (s: Store) => s.profiles().map(f => ({ ...f, profile: { ...f.profile, order: 0 } }));
    expect(strip(b.store)).toEqual(strip(a.store));
    expect(b.assets.list()).toEqual(a.assets.list());
    expect(b.store.variable('count')?.value).toBe(7);
    expect(b.store.settings().theme).toBe('light');
    expect(b.store.settings().port).toBe(8191);
  });

  it('merge keeps existing profiles and adds imported ones with new ids, remapping folder links and step params', async () => {
    const a = await populated();
    const ex = JSON.parse(JSON.stringify(exportAll(a.store, a.assets)));
    const r = await importAll(a.store, a.assets, ex, 'merge');
    expect(r.profiles).toBe(2);
    expect(a.store.profiles()).toHaveLength(4);
    const ids = new Set(a.store.profiles().flatMap(f => f.widgets.map(w => w.id)));
    expect(ids.size).toBe(6);
    const copy = a.store.profiles()[2];
    const link = copy.widgets.find(w => w.config.kind === 'folder')!;
    const target = link.config.kind === 'folder' ? link.config.targetFolderId : '';
    expect(copy.folders.some(d => d.id === target)).toBe(true);
    const logo = copy.widgets.find(w => w.look.label === 'Logo')!;
    expect(logo.folderId).toBe(target);
    if (logo.config.kind === 'button') expect(logo.config.triggers.press![0].params.folder).toBe(target);
  });

  it('a widget whose image is missing from the export imports with a warning and no image (Review Focus 5)', async () => {
    const a = await populated();
    const ex = JSON.parse(JSON.stringify(exportAll(a.store, a.assets)));
    ex.assets = [];
    const b = await fresh();
    const r = await importAll(b.store, b.assets, ex, 'replace');
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/Logo/);
    const logo = b.store.profiles().flatMap(f => f.widgets).find(w => w.look.label === 'Logo')!;
    expect(logo.look.image).toBeUndefined();
  });

  it('devices come back unapproved so they must pair again', async () => {
    const a = await populated();
    const ex = JSON.parse(JSON.stringify(exportAll(a.store, a.assets)));
    const b = await fresh();
    await importAll(b.store, b.assets, ex, 'replace');
    expect(b.store.device('dev1')).toMatchObject({ name: 'Tablet', approved: false, blocked: false });
    expect(b.store.device('dev1')?.tokenHash).toBeUndefined();
  });

  it('rejects something that is not a TabbyDeck export, changing nothing', async () => {
    const b = await fresh();
    const before = JSON.stringify(b.store.profiles());
    await expect(importAll(b.store, b.assets, { hello: 1 }, 'replace')).rejects.toThrow(/not a TabbyDeck backup/);
    expect(JSON.stringify(b.store.profiles())).toBe(before);
  });

  it('rejects a corrupt profile inside an export before changing anything', async () => {
    const a = await populated();
    const ex = JSON.parse(JSON.stringify(exportAll(a.store, a.assets)));
    ex.profiles[1].folders[0].parentId = 'ghost';
    ex.profiles[1].folders[0].id = 'notroot';
    const b = await fresh();
    const before = JSON.stringify(b.store.profiles());
    await expect(importAll(b.store, b.assets, ex, 'replace')).rejects.toThrow();
    expect(JSON.stringify(b.store.profiles())).toBe(before);
  });
});
