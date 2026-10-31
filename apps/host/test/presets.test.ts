import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PRESETS } from '@tabbydeck/shared/presets';
import { ProfileFileSchema, starterProfileFiles } from '@tabbydeck/shared';
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
  it('the starter decks are full, valid 8 x 6 decks whose every step calls a real action with valid parameters', () => {
    const files = starterProfileFiles().map(f => ProfileFileSchema.parse(f));
    expect(files.map(f => f.profile.name)).toEqual(['Main', 'Work']);
    for (const f of files) {
      expect([f.profile.cols, f.profile.rows, f.widgets.length]).toEqual([8, 6, 48]);
      expect(new Set(f.widgets.map(w => `${w.x},${w.y}`)).size).toBe(48);
      for (const w of f.widgets) {
        const t = (w.config as { triggers: Record<string, { action: string; params: unknown }[]> }).triggers;
        for (const s of Object.values(t).flat()) {
          const def = host.registry.get(s.action);
          expect(def, `${f.profile.name} ${w.look.label}: ${s.action}`).toBeDefined();
          const r = validateParams(def!.schema, s.params);
          expect(r.ok ? '' : `${f.profile.name} ${w.look.label}: ${r.error}`).toBe('');
        }
      }
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
