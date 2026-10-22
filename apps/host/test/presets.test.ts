import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRESETS } from '@tabbydeck/shared/presets';
import { ProfileFileSchema, starterProfileFile } from '@tabbydeck/shared';
import { createHost, type Host } from '../src/host.ts';
import { validateParams } from '../src/engine/params.ts';
import { nullLogger } from '../src/log/logger.ts';

let dir: string; let host: Host;
beforeAll(async () => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-presets-')); host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 }); });
afterAll(async () => { await host.close(); rmSync(dir, { recursive: true, force: true }); });

describe('presets', () => {
  it('have unique ids', () => {
    expect(new Set(PRESETS.map(p => p.id)).size).toBe(PRESETS.length);
  });
  it('the starter deck is a full, valid 7 x 5 deck whose every key calls a real action with valid parameters', () => {
    const f = ProfileFileSchema.parse(starterProfileFile());
    expect([f.profile.cols, f.profile.rows, f.widgets.length]).toEqual([7, 5, 35]);
    expect(new Set(f.widgets.map(w => `${w.x},${w.y}`)).size).toBe(35);
    for (const w of f.widgets) {
      const s = (w.config as { triggers: { press: { action: string; params: unknown }[] } }).triggers.press[0];
      const def = host.registry.get(s.action);
      expect(def, `${w.look.label}: ${s.action}`).toBeDefined();
      const r = validateParams(def!.schema, s.params);
      expect(r.ok ? '' : `${w.look.label}: ${r.error}`).toBe('');
    }
  });
  it('every step names a real action with valid parameters', () => {
    for (const p of PRESETS) for (const s of [...p.steps, ...(p.long ?? [])]) {
      const def = host.registry.get(s.action);
      expect(def, `${p.id}: ${s.action}`).toBeDefined();
      const r = validateParams(def!.schema, s.params ?? {});
      expect(r.ok ? '' : `${p.id}: ${r.error}`).toBe('');
    }
  });
});
