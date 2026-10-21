import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHost, type Host } from '../src/host.ts';
import { startEditorServer, type EditorServer } from '../src/server/editor.ts';
import { dispatchCommand } from '../src/server/commands.ts';
import { nullLogger } from '../src/log/logger.ts';

let dir: string; let host: Host; let ed: EditorServer; let blocker: net.Server;
const freePort = () => new Promise<number>(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => r(p)); }); });
const ctx = () => ({ host, log: nullLogger(), onPausedChange() {} });

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-set-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
  ed = await startEditorServer(host, { port: 0, log: nullLogger() });
});
afterEach(async () => { await new Promise(r => blocker ? blocker.close(r) : r(null)); await ed.close(); await host.close(); rmSync(dir, { recursive: true, force: true }); });

describe('applying network settings', () => {
  it('a busy port fails with port_in_use and the old server keeps serving', async () => {
    const busy = await freePort();
    blocker = net.createServer().listen(busy, '0.0.0.0'); // another app holding the port on all interfaces, as real servers do
    await new Promise(r => blocker.once('listening', r));
    const old = host.lanPort;
    const r = await dispatchCommand('settings.update', { patch: { port: busy } }, ctx());
    expect(r).toEqual({ ok: false, error: 'port_in_use' });
    expect(host.lanPort).toBe(old);
    expect(host.store.settings().port).not.toBe(busy);
    expect((await fetch(`http://127.0.0.1:${old}/assets/u/none.png`)).status).toBe(404);
  });

  it('a free port moves the phone-facing server there and saves the setting', async () => {
    const p = await freePort();
    const old = host.lanPort;
    const r = await dispatchCommand('settings.update', { patch: { port: p } }, ctx());
    expect(r.ok).toBe(true);
    expect(host.lanPort).toBe(p);
    expect(host.store.settings().port).toBe(p);
    expect((await fetch(`http://127.0.0.1:${p}/assets/u/none.png`)).status).toBe(404);
    await expect(fetch(`http://127.0.0.1:${old}/`)).rejects.toThrow();
  });

  it('other settings change without touching the server', async () => {
    const old = host.lanPort;
    expect((await dispatchCommand('settings.update', { patch: { theme: 'light' } }, ctx())).ok).toBe(true);
    expect(host.lanPort).toBe(old);
  });
});
