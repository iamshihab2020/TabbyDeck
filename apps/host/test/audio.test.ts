import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { registerAudio } from '../src/integrations/audio.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { nullLogger } from '../src/log/logger.ts';
import { PowerShellHost } from '../src/native/win/ps.ts';
import { createWinAudio } from '../src/native/win/audio.ts';

let native: ReturnType<typeof createFakeNative>; let registry: ActionRegistry; let ctx: ActionContext;
beforeEach(() => {
  native = createFakeNative(); registry = new ActionRegistry(); registerAudio(registry, { native });
  ctx = { signal: new AbortController().signal, vars: { get: () => undefined, set() {} }, host: { switchProfile() {}, openFolder() {}, notify() {}, flash() {} }, log: nullLogger() };
});
const run = (id: string, p: Record<string, unknown> = {}) => registry.get(id)!.run(p, ctx);

describe('audio actions', () => {
  it('sets an absolute volume', async () => {
    await run('system.volume', { percent: 30 });
    expect(native.volume).toBe(30);
  });
  it('steps and clamps to 0..100', async () => {
    native.volume = 95; await run('system.volumeStep', { delta: 10 }); expect(native.volume).toBe(100);
    native.volume = 3; await run('system.volumeStep', { delta: -10 }); expect(native.volume).toBe(0);
  });
  it('mute on, off and toggle', async () => {
    await run('system.mute', { mode: 'on' }); expect(native.mute).toBe(true);
    await run('system.mute', { mode: 'toggle' }); expect(native.mute).toBe(false);
    await run('system.micMute', { mode: 'toggle' }); expect(native.micMute).toBe(true);
    await run('system.micMute', { mode: 'off' }); expect(native.micMute).toBe(false);
  });
  it('rejects a volume outside 0..100 by schema', () => {
    expect(registry.get('system.volume')!.schema.percent).toMatchObject({ min: 0, max: 100 });
  });
});

describe.runIf(process.platform === 'win32')('Windows Core Audio', () => {
  const ps = new PowerShellHost();
  const audio = createWinAudio(ps);
  afterAll(() => ps.dispose());
  it('reads the volume and round-trips it, then answers fast', async () => {
    // The PC's real volume: someone may change it mid-test, so a mismatch is retried before it counts.
    let v = -1, back = -2;
    for (let i = 0; i < 3 && back !== v; i++) {
      v = await audio.getVolume();
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100);
      await audio.setVolume(v);
      back = await audio.getVolume();
    }
    expect(back).toBe(v);
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) await audio.getVolume();
    const per = (performance.now() - t0) / 10;
    console.log(`core audio: ${per.toFixed(1)} ms per call after warm-up`);
    // ~35 ms on this PC when idle; the full suite on a busy machine can be several times slower. The check is that
    // calls reuse the warm PowerShell (a restart per call would cost seconds), not a benchmark.
    expect(per).toBeLessThan(1000);
    expect(typeof await audio.getMute()).toBe('boolean');
    expect(typeof await audio.getMicMute()).toBe('boolean');
  }, 30000);
});
