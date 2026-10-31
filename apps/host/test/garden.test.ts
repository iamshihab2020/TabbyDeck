import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { InfoKeys } from '../src/engine/info.ts';
import { Stats } from '../src/engine/stats.ts';

let dir: string; let store: Store;
beforeEach(async () => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-garden-')); store = new Store({ dir, log: nullLogger() }); await store.load(); });
afterEach(async () => { await store.flush(); rmSync(dir, { recursive: true, force: true }); });

describe('focus garden', () => {
  it('a Pomodoro focus that runs out grows a plant; one reset part way wilts; a break reset does neither', () => {
    let now = 0; const got: string[] = [];
    const info = new InfoKeys({ store, native: createFakeNative(), onFocus: k => got.push(k), now: () => now });
    const f = store.profiles()[0];
    const w = store.createWidget(f.profile.rootFolderId, { x: 1, y: 0, w: 1, h: 1, look: DEFAULT_LOOK, config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 's', action: 'timer.pomodoro', params: { focus: 1, rest: 1 } }] } } });
    info.toggle(w); now = 61_000; info.tick();
    expect(got).toEqual(['grow']); // now on its break
    info.reset(w); expect(got).toEqual(['grow']);
    info.toggle(w); now += 10_000; info.reset(w);
    expect(got).toEqual(['grow', 'wilt']);
  });

  it('stats keep plants per day and send them in the summary', () => {
    const s = new Stats({ dir, native: createFakeNative(), now: () => new Date(2026, 9, 28, 10) });
    s.focus('grow'); s.focus('grow'); s.focus('wilt');
    expect(s.garden()).toEqual({ plants: 2, wilted: 1 });
    const g = s.summary(7).garden!;
    expect(g).toHaveLength(7);
    expect(g[6]).toEqual({ date: '2026-10-28', plants: 2, wilted: 1 });
    expect(g[0]).toMatchObject({ plants: 0, wilted: 0 });
  });
});
