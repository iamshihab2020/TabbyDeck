import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { registerSystem } from '../src/integrations/system.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { nullLogger } from '../src/log/logger.ts';
import { PowerShellHost } from '../src/native/win/ps.ts';
import { profilesFromLocalState } from '../src/native/win/browsers.ts';

let native: ReturnType<typeof createFakeNative>; let registry: ActionRegistry; let ctx: ActionContext;
beforeEach(() => {
  native = createFakeNative(); registry = new ActionRegistry(); registerSystem(registry, { native });
  ctx = { signal: new AbortController().signal, vars: { get: () => undefined, set() {} }, host: { switchProfile() {}, openFolder() {}, notify() {}, flash() {} }, log: nullLogger() };
});
const run = (id: string, p: Record<string, unknown> = {}) => registry.get(id)!.run(p, ctx);

describe('system actions call the native layer', () => {
  it('launch splits args', async () => {
    await run('system.launch', { path: 'notepad.exe', args: 'a.txt  "b c.txt"' });
    expect(native.calls).toEqual([{ method: 'launch', args: ['notepad.exe', ['a.txt', 'b c.txt']] }]);
  });
  it('launch expands %VARIABLES% in the path and leaves unknown ones alone', async () => {
    process.env.TABBY_TEST_DIR = 'C:/Apps';
    await run('system.launch', { path: '%TABBY_TEST_DIR%/Code.exe' });
    await run('system.launch', { path: '%NOT_A_TABBY_VAR%/x.exe' });
    expect(native.calls.map(c => c.args[0])).toEqual(['C:/Apps/Code.exe', '%NOT_A_TABBY_VAR%/x.exe']);
  });
  it('openUrl accepts http(s) and app links, rejects others', async () => {
    await run('system.openUrl', { url: 'https://example.com' });
    await run('system.openUrl', { url: 'spotify:playlist:1' });
    expect(native.calls.map(c => c.args[0])).toEqual(['https://example.com', 'spotify:playlist:1']);
    await expect(run('system.openUrl', { url: 'javascript:alert(1)' })).rejects.toThrow(/not allowed/);
    await expect(run('system.openUrl', { url: 'file:///C:/x.exe' })).rejects.toThrow(/not allowed/);
  });
  it('openUrl turns the retired snip links into the current ones', async () => {
    await run('system.openUrl', { url: 'ms-screenclip:?clippingMode=Window' });
    await run('system.openUrl', { url: 'ms-screenclip:' });
    await run('system.openUrl', { url: 'ms-screenclip://capture/image?freeform' });
    expect(native.calls.map(c => c.args[0])).toEqual(['ms-screenclip://capture/image?window', 'ms-screenclip://capture/image?rectangle', 'ms-screenclip://capture/image?freeform']);
  });
  it('browser opens a profile of this PC, on a website if given, and nothing else', async () => {
    await run('system.browser', { profile: 'chrome:Profile 5' });
    await run('system.browser', { profile: 'chrome:Default', url: 'https://github.com' });
    expect(native.calls).toEqual([
      { method: 'launch', args: ['C:/Chrome/chrome.exe', ['--profile-directory=Profile 5']] },
      { method: 'launch', args: ['C:/Chrome/chrome.exe', ['--profile-directory=Default', 'https://github.com']] },
    ]);
    await expect(run('system.browser', { profile: 'chrome:Profile 9' })).rejects.toThrow(/not on this PC/);
    await expect(run('system.browser', { profile: 'chrome:Default', url: '--disable-web-security' })).rejects.toThrow(/http/);
  });
  it('reads browser profiles from Local State, skipping odd folder names', () => {
    expect(profilesFromLocalState({ profile: { info_cache: { Default: { name: 'Personal' }, 'Profile 5': { name: 'Work' }, '../x': { name: 'Bad' }, 'Profile 6': {} } } }))
      .toEqual([['Default', 'Personal'], ['Profile 5', 'Work']]);
    expect(profilesFromLocalState(null)).toEqual([]);
    expect(profilesFromLocalState({ profile: {} })).toEqual([]);
  });
  it('run reports a non-zero exit code as an error', async () => {
    native.system.run = async () => ({ code: 2, out: 'boom' });
    await expect(run('system.run', { command: 'exit 2' })).rejects.toThrow(/exited with code 2/);
  });
  it('kill reports when nothing was running', async () => {
    native.system.kill = async () => 0;
    await expect(run('system.kill', { process: 'nope.exe' })).rejects.toThrow(/not running/);
  });
  it('focus fails when no window matches', async () => {
    native.system.focusWindow = async () => false;
    await expect(run('system.focus', { title: 'zzz' })).rejects.toThrow(/No window/);
  });
  it('power, clipboard and screenshot actions', async () => {
    await run('system.lock'); await run('system.sleep'); await run('system.shutdown', { restart: true });
    await run('system.clipboard', { text: 'hi' }); await run('system.screenshot');
    expect(native.calls.map(c => c.method)).toEqual(['lock', 'sleep', 'shutdown', 'clipboardSet', 'screenshotToClipboard']);
    expect(native.calls[2].args).toEqual([true]);
  });
  it('marks dangerous actions', () => {
    const danger = registry.list().filter(a => a.danger).map(a => a.id).sort();
    expect(danger).toEqual(['system.kill', 'system.run', 'system.shutdown', 'system.sleep']);
  });
});

describe.runIf(process.platform === 'win32')('PowerShellHost', () => {
  const ps = new PowerShellHost();
  afterAll(() => ps.dispose());
  it('evaluates and returns output', async () => {
    expect(await ps.call('1+1')).toBe('2');
  }, 40000);
  it('keeps concurrent calls in order', async () => {
    const [a, b] = await Promise.all([ps.call("'first'"), ps.call("'second'")]);
    expect([a, b]).toEqual(['first', 'second']);
  }, 20000);
  it('handles multi-line scripts', async () => {
    expect(await ps.call("$x = 2\n$y = 3\n$x * $y")).toBe('6');
  }, 20000);
  it('rejects with the PowerShell error message', async () => {
    await expect(ps.call("throw 'nope'")).rejects.toThrow('nope');
  }, 20000);
  it('times out, then recovers with a fresh process', async () => {
    await expect(ps.call('Start-Sleep 10', 300)).rejects.toThrow(/timeout/);
    expect(await ps.call("'back'")).toBe('back');
  }, 30000);
});
