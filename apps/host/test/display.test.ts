import { describe, expect, it } from 'vitest';
import { createFakeNative } from '../src/native/fake.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { registerDisplay } from '../src/integrations/display.ts';
import { createWinDisplay } from '../src/native/win/display.ts';
import { PowerShellHost } from '../src/native/win/ps.ts';

const setup = () => {
  const native = createFakeNative(); const registry = new ActionRegistry();
  registerDisplay(registry, { native });
  const run = (id: string, params: Record<string, unknown>) => registry.get(id)!.run(params, {} as ActionContext);
  return { native, run };
};

describe('display actions', () => {
  it('brightness steps move every screen within 0 to 100, or only the one chosen', async () => {
    const { native, run } = setup();
    const levels = () => native.screens.map(s => s.brightness);
    native.screens[0].brightness = 95; native.screens[1].brightness = 50;
    await run('display.brightnessStep', { delta: 10, screen: 'all' });
    expect(levels()).toEqual([100, 60]);
    await run('display.brightnessStep', { delta: -30, screen: 'MON1' });
    expect(levels()).toEqual([100, 30]);
    await run('display.brightness', { percent: 50, screen: 'LAP1' });
    expect(levels()).toEqual([50, 30]);
    await expect(run('display.brightnessStep', { delta: 10, screen: 'GONE' })).rejects.toThrow(/not connected/);
  });
  it('screens switch to the chosen Win+P mode', async () => {
    const { native, run } = setup();
    await run('display.project', { mode: 'duplicate' });
    await run('display.project', { mode: 'extend' });
    expect(native.calls.filter(c => c.method === 'project').map(c => c.args[0])).toEqual(['duplicate', 'extend']);
  });
  it('screens off: every screen, or one that is connected', async () => {
    const { native, run } = setup();
    await run('display.screensOff', { screen: 'all' });
    await run('display.screensOff', { screen: 'MON1' });
    expect(native.calls.filter(c => c.method === 'screensOff').map(c => c.args[0])).toEqual(['all', 'MON1']);
    await expect(run('display.screensOff', { screen: 'GONE' })).rejects.toThrow(/not connected/);
  });
  it('bluetooth toggles and can be set on or off', async () => {
    const { native, run } = setup();
    await run('system.bluetooth', { mode: 'toggle' });
    expect(native.bluetooth).toBe(false);
    await run('system.bluetooth', { mode: 'on' });
    expect(native.bluetooth).toBe(true);
    await run('system.bluetooth', { mode: 'off' });
    expect(native.bluetooth).toBe(false);
  });
  it('energy saver toggles on and back off', async () => {
    const { native, run } = setup();
    await run('system.energySaver', { mode: 'toggle' });
    expect(native.energySaver).toBe(true);
    await run('system.energySaver', { mode: 'toggle' });
    expect(native.energySaver).toBe(false);
  });
  it('night light toggles, and on/off are idempotent', async () => {
    const { native, run } = setup();
    await run('display.nightLight', { mode: 'toggle' });
    expect(native.nightLight).toBe(true);
    await run('display.nightLight', { mode: 'on' });
    expect(native.nightLight).toBe(true);
    await run('display.nightLight', { mode: 'off' });
    expect(native.nightLight).toBe(false);
  });
});

// Reads only: the real screen is never changed by the test run.
describe.runIf(process.platform === 'win32')('display on this PC', () => {
  it('lists the screens it can dim, each with a level from 0 to 100', async () => {
    const ps = new PowerShellHost();
    try {
      const d = createWinDisplay(ps);
      for (const s of await d.screens()) { expect(s.name).toBeTruthy(); expect(s.brightness).toBeGreaterThanOrEqual(0); expect(s.brightness).toBeLessThanOrEqual(100); }
      expect(typeof await d.getNightLight()).toBe('boolean');
    } finally { await ps.dispose(); }
  }, 40000);
});
