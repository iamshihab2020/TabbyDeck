import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK, type Widget } from '@tabbydeck/shared';
import { createFakeNative } from '../src/native/fake.ts';
import { Stats, appName, dayKey } from '../src/engine/stats.ts';

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-stats-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const key = (id: string, label: string): Widget => ({ id, folderId: 'f', x: 0, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label }, config: { kind: 'button', policy: 'ignore', triggers: {} } });

describe('stats', () => {
  it('counts presses per key and day, and finds the busiest day and top key of the week', () => {
    let now = new Date(2026, 9, 20, 12);
    const s = new Stats({ dir, native: createFakeNative(), now: () => now });
    const copy = key('a', 'Copy'), paste = key('b', 'Paste');
    for (let i = 0; i < 5; i++) s.press(copy);
    s.press(paste);
    now = new Date(2026, 9, 22, 9);
    for (let i = 0; i < 3; i++) s.press(copy);
    const w = s.summary(7);
    expect(w.days).toHaveLength(7);
    expect(w.days.at(-1)).toEqual({ date: '2026-10-22', presses: 3 });
    expect(w.total).toBe(9);
    expect(w.busiest).toEqual({ date: '2026-10-20', presses: 6 });
    expect(w.keys).toEqual([{ label: 'Copy', n: 8 }, { label: 'Paste', n: 1 }]);
    now = new Date(2026, 10, 10);
    expect(s.summary(7).total).toBe(0); // last week's presses are out of this week
    expect(s.summary(30).total).toBe(9);
  });
  it('adds up the time each app was in front, without counting TabbyDeck', () => {
    const n = createFakeNative();
    const s = new Stats({ dir, native: n, now: () => new Date(2026, 9, 20, 12), sampleMs: 30_000 });
    n.front = { title: 'x', exe: 'code.exe' };
    for (let i = 0; i < 6; i++) s.sample(); // 3 minutes
    n.front = { title: 'y', exe: 'chrome.exe' }; s.sample(); s.sample(); // 1 minute
    n.front = { title: 'z', exe: 'tabbydeck.exe' }; s.sample();
    n.front = null; s.sample();
    expect(s.summary(7).apps).toEqual([{ app: 'VS Code', minutes: 3 }, { app: 'Chrome', minutes: 1 }]);
    expect([appName('MSEDGE.EXE'), appName('hubstaffclient.exe')]).toEqual(['Edge', 'Hubstaffclient']);
  });
  it('keeps the numbers on disk, keeps a deleted key\'s name, and forgets days older than 60', () => {
    let now = new Date(2026, 0, 1);
    const a = new Stats({ dir, native: createFakeNative(), now: () => now });
    a.press(key('old', 'Old key'));
    now = new Date(2026, 3, 1);
    a.press(key('k', 'Lock'));
    a.flush();
    expect(existsSync(path.join(dir, 'stats.json'))).toBe(true);
    expect(Object.keys(JSON.parse(readFileSync(path.join(dir, 'stats.json'), 'utf8')).days)).toEqual([dayKey(now)]); // January is gone
    const b = new Stats({ dir, native: createFakeNative(), now: () => now });
    expect(b.summary(7).keys).toEqual([{ label: 'Lock', n: 1 }]);
  });
  it('starts again from a damaged file', () => {
    writeFileSync(path.join(dir, 'stats.json'), '{not json');
    expect(new Stats({ dir, native: createFakeNative() }).summary(7).total).toBe(0);
  });
  it('earns Early bird, Night owl and Speed run once a day each, and lists them with their day', () => {
    let now = new Date(2026, 9, 20, 6, 0);
    const s = new Stats({ dir, native: createFakeNative(), now: () => now }), got: string[] = [];
    s.on('badge', id => got.push(id));
    s.press(key('a', 'Copy')); s.press(key('a', 'Copy'));
    expect(got).toEqual(['early-bird']); // once, not per press
    now = new Date(2026, 9, 20, 12, 0);
    for (let i = 0; i < 49; i++) { now = new Date(now.getTime() + 1000); s.press(key('a', 'Copy')); }
    expect(got).toEqual(['early-bird']); // 49 in a minute: not yet
    now = new Date(now.getTime() + 1000); s.press(key('a', 'Copy'));
    expect(got).toEqual(['early-bird', 'speed-run']);
    now = new Date(2026, 9, 21, 2, 30); s.press(key('a', 'Copy'));
    now = new Date(2026, 9, 21, 7, 0); s.press(key('a', 'Copy')); // 7 am is no longer early
    expect(got).toEqual(['early-bird', 'speed-run', 'night-owl']);
    expect(s.summary(7).badges).toEqual([{ id: 'night-owl', date: '2026-10-21' }, { id: 'early-bird', date: '2026-10-20' }, { id: 'speed-run', date: '2026-10-20' }]);
  });
  it('slow presses never make a Speed run', () => {
    let now = new Date(2026, 9, 20, 12);
    const s = new Stats({ dir, native: createFakeNative(), now: () => now }), got: string[] = [];
    s.on('badge', id => got.push(id));
    for (let i = 0; i < 200; i++) { now = new Date(now.getTime() + 2000); s.press(key('a', 'Copy')); } // 30 a minute
    expect(got).toEqual([]);
  });
  it('earns Zen after two hours of Do not disturb in a day', async () => {
    const n = createFakeNative();
    const s = new Stats({ dir, native: n, now: () => new Date(2026, 9, 20, 15), sampleMs: 15 * 60_000 }), got: string[] = [];
    s.on('badge', id => got.push(id));
    await s.sampleDnd(); expect(got).toEqual([]); // off: not counted
    n.dnd = true;
    for (let i = 0; i < 7; i++) await s.sampleDnd();
    expect(got).toEqual([]); // 1 h 45 min
    await s.sampleDnd(); await s.sampleDnd();
    expect(got).toEqual(['zen']);
  });
});
