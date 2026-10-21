import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMouse } from '../src/integrations/mouse.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { nullLogger } from '../src/log/logger.ts';

let native: ReturnType<typeof createFakeNative>; let registry: ActionRegistry; let ctx: ActionContext;
beforeEach(() => {
  native = createFakeNative(); registry = new ActionRegistry(); registerMouse(registry, { input: native.input });
  ctx = { signal: new AbortController().signal, vars: { get: () => undefined, set() {} }, host: { switchProfile() {}, openFolder() {}, notify() {}, flash() {} }, log: nullLogger() };
});
afterEach(() => vi.useRealTimers());
const run = (id: string, p: Record<string, unknown>) => registry.get(id)!.run(p, ctx);

describe('mouse actions', () => {
  it('double click is down/up twice with a 40 ms gap', async () => {
    vi.useFakeTimers();
    const done = run('mouse.click', { button: 'left', count: 2 });
    expect(native.calls.map(c => `${c.method}:${c.args.join(',')}`)).toEqual(['mouseButton:left,true', 'mouseButton:left,false']);
    await vi.advanceTimersByTimeAsync(40);
    await done;
    expect(native.calls).toHaveLength(4);
  });
  it('move passes coordinates and the absolute flag', async () => {
    await run('mouse.move', { x: 100, y: 200, absolute: true });
    expect(native.calls).toEqual([{ method: 'mouseMove', args: [100, 200, true] }]);
  });
  it('scroll passes through', async () => {
    await run('mouse.scroll', { dy: -3, dx: 0 });
    expect(native.calls).toEqual([{ method: 'scroll', args: [-3, 0] }]);
  });
  it('hold and release', async () => {
    await run('mouse.hold', { button: 'right' }); await run('mouse.release', { button: 'right' });
    expect(native.calls.map(c => c.args.join(','))).toEqual(['right,true', 'right,false']);
  });
  it('declares schemas the engine can validate', () => {
    expect(registry.get('mouse.click')!.schema.button).toMatchObject({ type: 'enum', options: ['left', 'right', 'middle'] });
  });
});
