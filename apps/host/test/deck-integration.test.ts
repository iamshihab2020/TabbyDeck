import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { ActionRegistry, type ActionContext, type HostApi } from '../src/engine/registry.ts';
import { Vars, startSysInfoPoller } from '../src/engine/vars.ts';
import { registerDeck } from '../src/integrations/deck.ts';
import { registerBuiltins } from '../src/integrations/index.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { HeldKeys } from '../src/native/win/held.ts';
import { validateParams } from '../src/engine/params.ts';

let dir: string; let store: Store; let vars: Vars; let calls: string[]; let host: HostApi; let ctx: ActionContext; let registry: ActionRegistry;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-deck-'));
  store = new Store({ dir, log: nullLogger() }); await store.load();
  vars = new Vars(store);
  calls = [];
  host = {
    switchProfile: (d, p) => calls.push(`switch ${d} ${p}`), openFolder: (d, f) => calls.push(`open ${d} ${f}`),
    notify: (d, t, v) => calls.push(`notify ${d} ${t} ${v}`), flash: (w, k) => calls.push(`flash ${w} ${k}`),
  };
  registry = new ActionRegistry();
  registerDeck(registry, { store });
  ctx = { deviceId: 'dev1', widgetId: 'w1', signal: new AbortController().signal, vars, host, log: nullLogger() };
});
afterEach(async () => { vi.useRealTimers(); await store.flush(); rmSync(dir, { recursive: true, force: true }); });
// Apply schema defaults and validation exactly as the engine does before running a step.
const run = (id: string, p: Record<string, unknown> = {}) => {
  const def = registry.get(id)!;
  const v = validateParams(def.schema, p);
  if (!v.ok) throw new Error(v.error);
  return def.run(v.value, ctx);
};

describe('deck actions', () => {
  it('switchProfile targets the pressing device', async () => {
    const p = store.createProfile('Streaming', 4, 3);
    await run('deck.switchProfile', { profile: p.id });
    expect(calls).toEqual([`switch dev1 ${p.id}`]);
  });
  it('switchProfile with an unknown profile fails', async () => {
    await expect(run('deck.switchProfile', { profile: 'nope' })).rejects.toThrow(/profile/i);
  });
  it('openFolder and back', async () => {
    const f = store.profiles()[0];
    const sub = store.createFolder(f.profile.id, f.profile.rootFolderId, 'Sub');
    await run('deck.openFolder', { folder: sub.id });
    await run('deck.back');
    expect(calls).toEqual([`open dev1 ${sub.id}`, 'open dev1 null']);
  });
  it('actions that target a device fail cleanly when run with no device (e.g. from a test button)', async () => {
    ctx = { ...ctx, deviceId: undefined };
    await expect(run('deck.back')).rejects.toThrow(/device/);
  });
  it('setVar stores numbers and booleans by their text', async () => {
    await run('deck.setVar', { variable: 'count', value: '3' });
    await run('deck.setVar', { variable: 'live', value: 'true' });
    await run('deck.setVar', { variable: 'name', value: 'hello' });
    expect(vars.get('count')?.value).toBe(3);
    expect(vars.get('live')?.value).toBe(true);
    expect(vars.get('name')?.value).toBe('hello');
  });
  it('incVar on a missing variable creates it as 1, and adds by', async () => {
    await run('deck.incVar', { variable: 'n' });
    expect(vars.get('n')).toMatchObject({ type: 'number', value: 1 });
    await run('deck.incVar', { variable: 'n', by: 5 });
    expect(vars.get('n')?.value).toBe(6);
  });
  it('toggleVar flips a boolean (missing counts as false)', async () => {
    await run('deck.toggleVar', { variable: 'b' });
    expect(vars.get('b')?.value).toBe(true);
    await run('deck.toggleVar', { variable: 'b' });
    expect(vars.get('b')?.value).toBe(false);
  });
  it('notify and vibrate reach the device', async () => {
    await run('deck.notify', { text: 'Hi' });
    await run('deck.vibrate');
    expect(calls).toEqual(['notify dev1 Hi true', 'notify dev1  true']);
  });
});

describe('Vars', () => {
  it('emits change with the keys that changed', () => {
    const seen: string[][] = [];
    vars.on('change', k => seen.push(k));
    vars.set('a', 1, 'test');
    expect(seen).toEqual([['a']]);
    expect(vars.get('a')).toMatchObject({ value: 1, source: 'test' });
  });
});

describe('system info poller', () => {
  it('writes system variables every 2 s while clients are connected and stops when none are', () => {
    vi.useFakeTimers();
    const native = createFakeNative();
    let connected = 1;
    const stop = startSysInfoPoller(native, vars, () => connected);
    vi.advanceTimersByTime(2100);
    expect(vars.get('system.cpu')?.value).toBe(12);
    expect(vars.get('system.ram')?.value).toBe(40);
    expect(vars.get('system.activeWindow')?.value).toBe('Fake Window');
    vars.set('system.cpu', -1, 'test');
    connected = 0;
    vi.advanceTimersByTime(4000);
    expect(vars.get('system.cpu')?.value).toBe(-1);
    stop();
  });
});

describe('registerBuiltins', () => {
  it('registers keyboard, mouse, system, audio, display and deck actions in that group order', () => {
    const r = new ActionRegistry();
    const native = createFakeNative();
    registerBuiltins(r, { native, held: new HeldKeys(dir, native.input), store });
    const groups = [...new Set(r.list().map(a => a.group))];
    expect(groups).toEqual(['Keyboard', 'Mouse', 'System', 'Audio', 'Display', 'Deck']);
    expect(r.get('keyboard.hotkey')).toBeDefined();
    expect(r.get('deck.switchProfile')).toBeDefined();
  });
});
