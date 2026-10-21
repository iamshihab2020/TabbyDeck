import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { buildDeckView } from '../src/view/deckView.ts';

let dir: string; let store: Store;
beforeEach(async () => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-view-')); store = new Store({ dir, log: nullLogger() }); await store.load(); });
afterEach(async () => { await store.flush(); rmSync(dir, { recursive: true, force: true }); });

describe('buildDeckView', () => {
  it('root folder has a path of length 1 and lists profiles', () => {
    const f = store.profiles()[0];
    const v = buildDeckView(store, f.profile.id, f.profile.rootFolderId);
    expect(v.path).toEqual([{ id: f.profile.rootFolderId, name: 'Main' }]);
    expect(v.profiles).toEqual([{ id: f.profile.id, name: 'Main' }]);
    expect(v).toMatchObject({ cols: 5, rows: 3, profileName: 'Main' });
    expect(v.widgets).toHaveLength(1);
    expect(v.widgets[0]).toMatchObject({ kind: 'button', x: 0, y: 0, w: 1, h: 1 });
  });

  it('nested folder path is root then child, and excludes other folders\' widgets', () => {
    const f = store.profiles()[0];
    const sub = store.createFolder(f.profile.id, f.profile.rootFolderId, 'Media');
    store.createWidget(sub.id, { x: 2, y: 1, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Play' }, config: { kind: 'button', policy: 'ignore', triggers: {} } });
    store.createWidget(f.profile.rootFolderId, { x: 1, y: 0, w: 1, h: 1, look: DEFAULT_LOOK, config: { kind: 'folder', targetFolderId: sub.id } });
    const v = buildDeckView(store, f.profile.id, sub.id);
    expect(v.path.map(p => p.name)).toEqual(['Main', 'Media']);
    expect(v.widgets.map(w => w.look.label)).toEqual(['Play']);
    expect(buildDeckView(store, f.profile.id, f.profile.rootFolderId).widgets.map(w => w.kind)).toEqual(['button', 'folder']);
  });

  it('copies looks, so mutating the view does not touch the store', () => {
    const f = store.profiles()[0];
    const v = buildDeckView(store, f.profile.id, f.profile.rootFolderId);
    v.widgets[0].look.label = 'Changed';
    expect(store.profiles()[0].widgets[0].look.label).toBe('Notepad');
  });

  it('throws not_found for an unknown profile or a folder from another profile', () => {
    const f = store.profiles()[0];
    const other = store.createProfile('Other', 3, 3);
    expect(() => buildDeckView(store, 'nope', f.profile.rootFolderId)).toThrow(/not_found/);
    expect(() => buildDeckView(store, f.profile.id, other.rootFolderId)).toThrow(/not_found/);
  });
});

describe('buildDeckView path guard', () => {
  it('stops instead of looping when folders form a cycle in memory', () => {
    const f = store.profiles()[0];
    const sub = store.createFolder(f.profile.id, f.profile.rootFolderId, 'S');
    // corrupt in memory, bypassing validation, to prove the walk terminates
    store.profile(f.profile.id)!.folders.find(d => d.id === f.profile.rootFolderId)!.parentId = sub.id;
    expect(() => buildDeckView(store, f.profile.id, sub.id)).toThrow(/invalid/);
  });
});
