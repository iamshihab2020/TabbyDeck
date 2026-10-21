import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type Widget } from '@tabbydeck/shared';
import { ActionRegistry, type HostApi } from '../src/engine/registry.ts';
import { Engine } from '../src/engine/engine.ts';
import { nullLogger } from '../src/log/logger.ts';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function setup() {
  const runs: string[] = [];
  const aborted: string[] = [];
  const flashes: string[] = [];
  const registry = new ActionRegistry();
  registry.register({ id: 't.slow', name: 'slow', group: 'T', schema: { tag: { type: 'string', title: 'Tag' } }, run: async (p, ctx) => {
    runs.push(`start ${p.tag}`);
    await new Promise<void>((res, rej) => { const t = setTimeout(res, 100); ctx.signal.addEventListener('abort', () => { clearTimeout(t); aborted.push(String(p.tag)); rej(new Error('aborted')); }); });
    runs.push(`end ${p.tag}`);
  } });
  registry.register({ id: 't.fast', name: 'fast', group: 'T', schema: { tag: { type: 'string', title: 'Tag' } }, run: async p => { runs.push(`fast ${p.tag}`); } });
  registry.register({ id: 't.boom', name: 'boom', group: 'T', schema: {}, run: async () => { throw new Error('kaboom'); } });
  registry.register({ id: 't.need', name: 'need', group: 'T', schema: { x: { type: 'string', title: 'X', required: true } }, run: async () => { runs.push('need ran'); } });
  const host: HostApi = { switchProfile() {}, openFolder() {}, notify() {}, flash: (id, k) => flashes.push(`${id}:${k}`) };
  const vars = { get: () => undefined, set() {} };
  const engine = new Engine(registry, { vars, host, log: nullLogger() });
  const errors: { widgetId: string; message: string }[] = [];
  engine.on('actionError', e => errors.push(e));
  return { engine, runs, aborted, flashes, errors };
}

const widget = (steps: { action: string; params?: Record<string, unknown>; continueOnError?: boolean }[], policy: 'ignore' | 'queue' | 'cancel' = 'ignore'): Widget => ({
  id: 'w1', folderId: 'f1', x: 0, y: 0, w: 1, h: 1, look: DEFAULT_LOOK,
  config: { kind: 'button', policy, triggers: { press: steps.map((s, i) => ({ id: `s${i}`, action: s.action, params: s.params ?? {}, ...(s.continueOnError ? { continueOnError: true } : {}) })) } },
});

describe('Engine policies', () => {
  it('ignore: a second trigger while running is dropped', async () => {
    const { engine, runs } = setup();
    const w = widget([{ action: 't.slow', params: { tag: 'a' } }], 'ignore');
    engine.trigger(w, 'press', { deviceId: 'd' });
    engine.trigger(w, 'press', { deviceId: 'd' });
    await sleep(250);
    expect(runs).toEqual(['start a', 'end a']);
  });
  it('queue: the second trigger runs after the first', async () => {
    const { engine, runs } = setup();
    const w = widget([{ action: 't.slow', params: { tag: 'a' } }], 'queue');
    engine.trigger(w, 'press', { deviceId: 'd' });
    engine.trigger(w, 'press', { deviceId: 'd' });
    await sleep(350);
    expect(runs).toEqual(['start a', 'end a', 'start a', 'end a']);
  });
  it('cancel: the running sequence aborts and the new one starts', async () => {
    const { engine, runs, aborted } = setup();
    const w = widget([{ action: 't.slow', params: { tag: 'a' } }, { action: 't.fast', params: { tag: 'after' } }], 'cancel');
    engine.trigger(w, 'press', { deviceId: 'd' });
    await sleep(20);
    engine.trigger(w, 'press', { deviceId: 'd' });
    await sleep(250);
    expect(aborted).toEqual(['a']);
    expect(runs).toEqual(['start a', 'start a', 'end a', 'fast after']);
  });
  it('different triggers of one widget do not block each other', async () => {
    const { engine, runs } = setup();
    const w = widget([{ action: 't.slow', params: { tag: 'a' } }]);
    if (w.config.kind === 'button') w.config.triggers.long = [{ id: 'l', action: 't.fast', params: { tag: 'long' } }];
    engine.trigger(w, 'press', { deviceId: 'd' });
    engine.trigger(w, 'long', { deviceId: 'd' });
    await sleep(10);
    expect(runs).toContain('fast long');
  });
  it('a trigger with no steps does nothing', async () => {
    const { engine, runs, errors } = setup();
    engine.trigger(widget([]), 'release', { deviceId: 'd' });
    await sleep(10);
    expect(runs).toEqual([]); expect(errors).toEqual([]);
  });
});

describe('Engine errors', () => {
  it('a throwing step flashes error, reports it and stops the sequence', async () => {
    const { engine, runs, flashes, errors } = setup();
    engine.trigger(widget([{ action: 't.boom' }, { action: 't.fast', params: { tag: 'x' } }]), 'press', { deviceId: 'd' });
    await sleep(20);
    expect(flashes).toEqual(['w1:error']);
    expect(errors).toEqual([expect.objectContaining({ widgetId: 'w1', message: 'kaboom' })]);
    expect(runs).toEqual([]);
  });
  it('continueOnError keeps going', async () => {
    const { engine, runs } = setup();
    engine.trigger(widget([{ action: 't.boom', continueOnError: true }, { action: 't.fast', params: { tag: 'x' } }]), 'press', { deviceId: 'd' });
    await sleep(20);
    expect(runs).toEqual(['fast x']);
  });
  it('an unknown action reports "Unknown action: x" and flashes', async () => {
    const { engine, flashes, errors } = setup();
    engine.trigger(widget([{ action: 'x' }]), 'press', { deviceId: 'd' });
    await sleep(20);
    expect(errors[0].message).toBe('Unknown action: x');
    expect(flashes).toEqual(['w1:error']);
  });
  it('invalid params are rejected before run', async () => {
    const { engine, runs, errors } = setup();
    engine.trigger(widget([{ action: 't.need', params: {} }]), 'press', { deviceId: 'd' });
    await sleep(20);
    expect(runs).toEqual([]);
    expect(errors[0].message).toContain('X is required');
  });
});

describe('Engine lifecycle', () => {
  it('paused engine drops triggers and reports it', async () => {
    const { engine, runs } = setup();
    const dropped: string[] = [];
    engine.on('paused', e => dropped.push(e.deviceId ?? ''));
    engine.paused = true;
    engine.trigger(widget([{ action: 't.fast', params: { tag: 'x' } }]), 'press', { deviceId: 'd' });
    await sleep(10);
    expect(runs).toEqual([]); expect(dropped).toEqual(['d']);
  });
  it('shutdown aborts running sequences and resolves', async () => {
    const { engine, aborted } = setup();
    engine.trigger(widget([{ action: 't.slow', params: { tag: 'a' } }]), 'press', { deviceId: 'd' });
    await sleep(10);
    await engine.shutdown();
    expect(aborted).toEqual(['a']);
  });
  it('runSteps runs a list directly (used by action.test)', async () => {
    const { engine, runs } = setup();
    await engine.runSteps([{ id: 's', action: 't.fast', params: { tag: 'direct' } }], { widgetId: 'w9' });
    expect(runs).toEqual(['fast direct']);
  });
  it('runSteps rejects with the step error', async () => {
    const { engine } = setup();
    await expect(engine.runSteps([{ id: 's', action: 't.boom', params: {} }], {})).rejects.toThrow('kaboom');
  });
});

describe('Engine without listeners', () => {
  it('a failing step still flashes when nobody listens for actionError', async () => {
    const flashes: string[] = [];
    const registry = new ActionRegistry();
    const engine = new Engine(registry, { vars: { get: () => undefined, set() {} }, host: { switchProfile() {}, openFolder() {}, notify() {}, flash: (id, k) => flashes.push(`${id}:${k}`) }, log: nullLogger() });
    engine.trigger(widget([{ action: 'missing.action' }]), 'press', { deviceId: 'd' });
    await sleep(20);
    expect(flashes).toEqual(['w1:error']);
  });
});
