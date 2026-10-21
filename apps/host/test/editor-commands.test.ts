import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DEFAULT_LOOK, type EditorState, type HostToEditorMsg } from '@tabbydeck/shared';
import { createHost, type Host } from '../src/host.ts';
import { startEditorServer, type EditorServer } from '../src/server/editor.ts';
import { nullLogger } from '../src/log/logger.ts';
import type { FakeNative } from '../src/native/fake.ts';

let dir: string; let host: Host; let ed: EditorServer;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-ed-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
  ed = await startEditorServer(host, { port: 0, log: nullLogger() });
});
afterEach(async () => { await ed.close(); await host.close(); rmSync(dir, { recursive: true, force: true }); });

async function editor(token = ed.token) {
  const ws = new WebSocket(`ws://127.0.0.1:${ed.port}/editor-ws?token=${token}`, { headers: { Origin: `http://127.0.0.1:${ed.port}` } });
  const inbox: HostToEditorMsg[] = []; const waiters: ((m: HostToEditorMsg) => void)[] = [];
  ws.on('message', d => { const m = JSON.parse(String(d)); const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  const next = (ms = 1500) => new Promise<HostToEditorMsg>((res, rej) => {
    const m = inbox.shift(); if (m) return res(m);
    const w = (x: HostToEditorMsg) => { clearTimeout(t); res(x); };
    // a timed-out wait must remove itself, or it would swallow the next message
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('no message')); }, ms);
    waiters.push(w);
  });
  let n = 0;
  /** Send a command and wait for its result, skipping state pushes and events in between. */
  const cmd = async (name: string, args: unknown) => {
    const id = `c${++n}`;
    ws.send(JSON.stringify({ t: 'cmd', id, name, args }));
    for (;;) { const m = await next(); if (m.t === 'result' && m.id === id) return m; }
  };
  const latestState = async () => { let s: EditorState | null = null; for (;;) { try { const m = await next(120); if (m.t === 'state') s = m.state; } catch { return s; } } };
  return { ws, next, cmd, latestState };
}

describe('editor transport', () => {
  it('rejects an upgrade without the token (401)', async () => {
    await expect(editor('wrong')).rejects.toThrow(/401/);
  });
  it('serves the editor page only with the token', async () => {
    expect((await fetch(`http://127.0.0.1:${ed.port}/`)).status).toBe(401);
  });
  it('sends a full state first, with the default profile and the action catalogue', async () => {
    const e = await editor();
    const m = await e.next();
    expect(m.t).toBe('state');
    if (m.t !== 'state') return;
    expect(m.state.profiles[0].profile.name).toBe('Main');
    expect(m.state.catalogue.map(a => a.id)).toContain('keyboard.hotkey');
    expect(m.state.settings.port).toBe(8191);
    expect(m.state.paused).toBe(false);
    expect(Array.isArray(m.state.connect.urls)).toBe(true);
    e.ws.close();
  });
});

describe('editor commands', () => {
  it('widget.update on an unknown id fails with not_found and keeps the socket open (Review Focus 4)', async () => {
    const e = await editor(); await e.next();
    const r = await e.cmd('widget.update', { id: 'ghost', patch: { x: 1 } });
    expect(r).toMatchObject({ ok: false, error: 'not_found' });
    const r2 = await e.cmd('profile.create', { name: 'Still alive', cols: 3, rows: 2 });
    expect(r2.ok).toBe(true);
    e.ws.close();
  });
  it('rejects malformed arguments with invalid', async () => {
    const e = await editor(); await e.next();
    expect(await e.cmd('widget.move', { id: 'x', x: 'left' })).toMatchObject({ ok: false, error: 'invalid' });
    e.ws.close();
  });
  it('lists the apps on the PC and hands out their icons as PNG data', async () => {
    const e = await editor(); await e.next();
    const list = await e.cmd('apps.list', {});
    expect(list).toMatchObject({ ok: true, data: [{ name: 'Calculator' }, { name: 'File Pilot' }] });
    const icon = await e.cmd('apps.icon', { id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' });
    expect(icon).toMatchObject({ ok: true, data: { dataUrl: expect.stringMatching(/^data:image\/png;base64,/) } });
    e.ws.close();
  });
  it('creates, moves, duplicates and deletes a widget, pushing state after each', async () => {
    const e = await editor(); await e.next();
    const root = host.store.profiles()[0].profile.rootFolderId;
    const created = await e.cmd('widget.create', { folderId: root, widget: { x: 1, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'New' }, config: { kind: 'button', policy: 'ignore', triggers: {} } } });
    expect(created.ok).toBe(true);
    const id = (created.data as { id: string }).id;
    expect((await e.cmd('widget.move', { id, x: 2, y: 1, w: 2, h: 1 })).ok).toBe(true);
    expect(host.store.widget(id)).toMatchObject({ x: 2, y: 1, w: 2 });
    expect((await e.cmd('widget.move', { id, x: 4, y: 0, w: 2, h: 1 }))).toMatchObject({ ok: false, error: 'out_of_grid' });
    const dup = await e.cmd('widget.duplicate', { id });
    expect(dup.ok).toBe(true);
    expect((await e.cmd('widget.delete', { id })).ok).toBe(true);
    const s = await e.latestState();
    expect(s?.profiles[0].widgets.find(w => w.id === id)).toBeUndefined();
    e.ws.close();
  });
  it('profile and folder commands', async () => {
    const e = await editor(); await e.next();
    const p = await e.cmd('profile.create', { name: 'Streaming', cols: 4, rows: 3 });
    const pid = (p.data as { id: string }).id;
    expect((await e.cmd('profile.update', { id: pid, patch: { name: 'Stream', cols: 6 } })).ok).toBe(true);
    const f = await e.cmd('folder.create', { profileId: pid, parentId: host.store.profile(pid)!.profile.rootFolderId, name: 'Scenes' });
    const fid = (f.data as { id: string }).id;
    expect((await e.cmd('folder.update', { id: fid, name: 'OBS' })).ok).toBe(true);
    expect(host.store.folder(fid)?.name).toBe('OBS');
    expect((await e.cmd('folder.delete', { id: fid })).ok).toBe(true);
    expect((await e.cmd('profile.reorder', { ids: [pid, host.store.profiles()[0].profile.id] })).ok).toBe(true);
    expect((await e.cmd('profile.delete', { id: pid })).ok).toBe(true);
    expect(await e.cmd('profile.delete', { id: host.store.profiles()[0].profile.id })).toMatchObject({ ok: false, error: 'last_profile' });
    e.ws.close();
  });
  it('device.approve with the right code approves the pairing device', async () => {
    const e = await editor(); await e.next();
    const { code } = host.pairing.request('dev9', 'Tablet', '192.168.1.9');
    expect(await e.cmd('device.approve', { deviceId: 'dev9', code: '000000' === code ? '111111' : '000000' })).toMatchObject({ ok: false, error: 'wrong_code' });
    expect((await e.cmd('device.approve', { deviceId: 'dev9', code })).ok).toBe(true);
    const s = await e.latestState();
    expect(s?.devices.find(d => d.id === 'dev9')?.approved).toBe(true);
    e.ws.close();
  });
  it('device rename, profile assignment, block, unblock and forget', async () => {
    const e = await editor(); await e.next();
    host.pairing.approve('dev9', host.pairing.request('dev9', 'Tablet', 'ip').code);
    const pid = host.store.profiles()[0].profile.id;
    expect((await e.cmd('device.update', { id: 'dev9', name: 'Desk tablet', profileId: pid })).ok).toBe(true);
    expect(host.store.device('dev9')).toMatchObject({ name: 'Desk tablet', profileId: pid });
    await e.cmd('device.block', { id: 'dev9' }); expect(host.store.device('dev9')?.blocked).toBe(true);
    await e.cmd('device.unblock', { id: 'dev9' }); expect(host.store.device('dev9')?.blocked).toBe(false);
    await e.cmd('device.forget', { id: 'dev9' }); expect(host.store.device('dev9')).toBeUndefined();
    e.ws.close();
  });
  it('action.test runs one step on the host', async () => {
    const e = await editor(); await e.next();
    const r = await e.cmd('action.test', { step: { id: 's', action: 'system.launch', params: { path: 'calc.exe' } } });
    expect(r.ok).toBe(true);
    expect((host.native as FakeNative).calls).toContainEqual({ method: 'launch', args: ['calc.exe', []] });
    expect(await e.cmd('action.test', { step: { id: 's', action: 'nope', params: {} } })).toMatchObject({ ok: false, error: 'Unknown action: nope' });
    e.ws.close();
  });
  it('settings.update validates', async () => {
    const e = await editor(); await e.next();
    expect((await e.cmd('settings.update', { patch: { theme: 'light' } })).ok).toBe(true);
    expect(host.store.settings().theme).toBe('light');
    expect(await e.cmd('settings.update', { patch: { theme: 'neon' } })).toMatchObject({ ok: false, error: 'invalid' });
    e.ws.close();
  });
  it('pause toggles the engine and shows in state', async () => {
    const e = await editor(); await e.next();
    expect((await e.cmd('host.pause', { paused: true })).ok).toBe(true);
    expect(host.engine.paused).toBe(true);
    expect((await e.latestState())?.paused).toBe(true);
    e.ws.close();
  });
  it('a pair request is pushed as an event', async () => {
    const e = await editor(); await e.next();
    host.pairing.request('dev7', 'Phone', '10.0.0.7');
    for (;;) { const m = await e.next(); if (m.t === 'event') { expect(m).toMatchObject({ kind: 'pairRequest', data: { deviceId: 'dev7', name: 'Phone' } }); break; } }
    e.ws.close();
  });
});

describe('asset commands', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  it('upload returns an id that appears in state and is served to the editor', async () => {
    const e = await editor(); await e.next();
    const r = await e.cmd('asset.upload', { name: 'logo.png', dataUrl: PNG });
    expect(r.ok).toBe(true);
    const id = (r.data as { id: string }).id;
    expect((await e.latestState())?.assets.map(a => a.id)).toContain(id);
    expect((await fetch(`http://127.0.0.1:${ed.port}/assets/u/${id}`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${host.lanPort}/assets/u/${id}`)).status).toBe(200);
    expect(await e.cmd('asset.upload', { name: 'x', dataUrl: 'data:text/html;base64,AA==' })).toMatchObject({ ok: false, error: 'bad_type' });
    expect((await e.cmd('asset.delete', { id })).ok).toBe(true);
    e.ws.close();
  });
});

describe('backup commands', () => {
  it('export then import replace through the editor', async () => {
    const e = await editor(); await e.next();
    const ex = await e.cmd('export', {});
    expect(ex.ok).toBe(true);
    expect((ex.data as { format: string }).format).toBe('tabbydeck-export');
    const im = await e.cmd('import', { data: ex.data, mode: 'merge' });
    expect(im).toMatchObject({ ok: true, data: { profiles: 1 } });
    expect(host.store.profiles()).toHaveLength(2);
    expect(await e.cmd('import', { data: { nope: true }, mode: 'replace' })).toMatchObject({ ok: false, error: 'This file is not a TabbyDeck backup' });
    e.ws.close();
  });
});
