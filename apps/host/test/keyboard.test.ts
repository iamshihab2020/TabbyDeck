import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatHotkey, parseHotkey, VK } from '../src/native/win/keys.ts';
import { HeldKeys, releaseAllOnStart } from '../src/native/win/held.ts';
import { registerKeyboard } from '../src/integrations/keyboard.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { nullLogger } from '../src/log/logger.ts';

describe('parseHotkey', () => {
  it('parses ctrl+shift+s', () => {
    expect(parseHotkey('ctrl+shift+s')).toEqual({ ok: true, keys: [0x11, 0x10, 0x53] });
  });
  it('accepts Win+Shift+S, aliases and spaces', () => {
    expect(parseHotkey('Win+Shift+S')).toEqual({ ok: true, keys: [0x5b, 0x10, 0x53] });
    expect(parseHotkey('Super + Shift + s')).toEqual({ ok: true, keys: [0x5b, 0x10, 0x53] });
    expect(parseHotkey('Control+C').ok).toBe(true);
    expect(parseHotkey('Cmd+Tab')).toEqual({ ok: true, keys: [0x5b, 0x09] });
  });
  it('knows function, media and navigation keys', () => {
    expect(parseHotkey('F13')).toEqual({ ok: true, keys: [0x7c] });
    expect(parseHotkey('MediaPlayPause')).toEqual({ ok: true, keys: [0xb3] });
    expect(parseHotkey('Alt+F4')).toEqual({ ok: true, keys: [0x12, 0x73] });
    expect(parseHotkey('Ctrl+PageDown')).toEqual({ ok: true, keys: [0x11, 0x22] });
  });
  it('refuses Ctrl+Alt+Del', () => {
    const r = parseHotkey('Ctrl+Alt+Del');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Ctrl+Alt+Del cannot be sent by software');
    expect(parseHotkey('ctrl+alt+delete').ok).toBe(false);
  });
  it('rejects an unknown key with its name in the message', () => {
    const r = parseHotkey('Ctrl+Banana');
    expect(!r.ok && r.error).toContain('Banana');
  });
  it('rejects empty and duplicate keys', () => {
    expect(parseHotkey('').ok).toBe(false);
    expect(parseHotkey('Ctrl+Ctrl').ok).toBe(false);
  });
  it('formats back', () => {
    const r = parseHotkey('ctrl+c');
    expect(r.ok && formatHotkey(r.keys)).toBe('Ctrl+C');
    const r2 = parseHotkey('win+shift+s');
    expect(r2.ok && formatHotkey(r2.keys)).toBe('Win+Shift+S');
  });
  it('VK table covers digits and letters', () => {
    expect(VK['A']).toBe(0x41); expect(VK['0']).toBe(0x30); expect(VK['Z']).toBe(0x5a);
  });
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-kb-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup() {
  const native = createFakeNative();
  const held = new HeldKeys(dir, native.input);
  const registry = new ActionRegistry();
  registerKeyboard(registry, { input: native.input, held });
  const ctx = { signal: new AbortController().signal, vars: { get: () => undefined, set() {} }, host: { switchProfile() {}, openFolder() {}, notify() {}, flash() {} }, log: nullLogger() } as ActionContext;
  const run = (id: string, params: Record<string, unknown>) => registry.get(id)!.run(params, ctx);
  return { native, held, run };
}
const keyCalls = (n: ReturnType<typeof createFakeNative>) => n.calls.filter(c => c.method === 'keyDown' || c.method === 'keyUp').map(c => `${c.method === 'keyDown' ? 'd' : 'u'}${(c.args[0] as number).toString(16)}`);

describe('keyboard actions', () => {
  it('hotkey presses down in order and releases in reverse', async () => {
    const { native, run } = setup();
    await run('keyboard.hotkey', { hotkey: 'Ctrl+Shift+S' });
    expect(keyCalls(native)).toEqual(['d11', 'd10', 'd53', 'u53', 'u10', 'u11']);
  });
  it('if a keyDown throws, the keys already down are still released', async () => {
    const { native, run } = setup();
    const real = native.input.keyDown;
    let n = 0;
    native.input.keyDown = vk => { if (++n === 3) throw new Error('SendInput failed'); real(vk); };
    await expect(run('keyboard.hotkey', { hotkey: 'Ctrl+Shift+S' })).rejects.toThrow('SendInput failed');
    expect(keyCalls(native)).toEqual(['d11', 'd10', 'u10', 'u11']);
  });
  it('hotkey with an invalid combination throws without pressing anything', async () => {
    const { native, run } = setup();
    await expect(run('keyboard.hotkey', { hotkey: 'Ctrl+Alt+Del' })).rejects.toThrow(/cannot be sent/);
    expect(keyCalls(native)).toEqual([]);
  });
  it('type sends text', async () => {
    const { native, run } = setup();
    await run('keyboard.type', { text: 'héllo' });
    expect(native.calls).toContainEqual({ method: 'typeText', args: ['héllo'] });
  });
  it('hold writes held.json and release clears it', async () => {
    const { native, run } = setup();
    await run('keyboard.hold', { hotkey: 'Shift' });
    expect(JSON.parse(readFileSync(path.join(dir, 'held.json'), 'utf8'))).toEqual([0x10]);
    await run('keyboard.release', { hotkey: 'Shift' });
    expect(existsSync(path.join(dir, 'held.json')) ? JSON.parse(readFileSync(path.join(dir, 'held.json'), 'utf8')) : []).toEqual([]);
    expect(keyCalls(native)).toEqual(['d10', 'u10']);
  });
});

describe('releaseAllOnStart', () => {
  it('releases keys left in held.json plus the four modifiers, then deletes the file', () => {
    writeFileSync(path.join(dir, 'held.json'), JSON.stringify([0x41]));
    const native = createFakeNative();
    releaseAllOnStart(native.input, dir);
    expect(keyCalls(native)).toEqual(['u41', 'u10', 'u11', 'u12', 'u5b']);
    expect(existsSync(path.join(dir, 'held.json'))).toBe(false);
  });
  it('is a no-op when there is no file', () => {
    const native = createFakeNative();
    releaseAllOnStart(native.input, dir);
    expect(keyCalls(native)).toEqual([]);
  });
});
