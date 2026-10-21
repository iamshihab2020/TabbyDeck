import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DEFAULT_LOOK, type HostMsg, type Widget } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { Pairing } from '../src/auth/pairing.ts';
import { Sessions } from '../src/auth/sessions.ts';
import { Clients } from '../src/server/clients.ts';
import { attachWs, startHttp, type HttpHandle } from '../src/server/http.ts';

let dir: string; let store: Store; let pairing: Pairing; let sessions: Sessions; let clients: Clients; let h: HttpHandle;
const presses: { widgetId: string; kind: string; deviceId: string }[] = [];

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-cs-'));
  store = new Store({ dir, log: nullLogger() }); await store.load();
  sessions = new Sessions(store);
  pairing = new Pairing({ store, sessions, log: nullLogger() });
  presses.length = 0;
  clients = new Clients({ store, pairing, sessions, log: nullLogger(), onPress: (s, w, kind) => presses.push({ widgetId: w.id, kind, deviceId: s.deviceId! }) });
  h = await startHttp({ host: '127.0.0.1', port: 0, routes: [], log: nullLogger() });
  attachWs(h.server, '/ws', (sock, req) => clients.handle(sock, req));
});
afterEach(async () => { clients.closeAll(); pairing.dispose(); await h.close(); await store.flush(); rmSync(dir, { recursive: true, force: true }); });

/** A test client that queues every host message. */
async function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws`);
  const inbox: HostMsg[] = [];
  const waiters: ((m: HostMsg) => void)[] = [];
  let closed: { code: number } | null = null;
  ws.on('message', d => { const m = JSON.parse(String(d)) as HostMsg; const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  ws.on('close', code => { closed = { code }; });
  await new Promise(r => ws.on('open', r));
  return {
    ws,
    send: (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    next: (ms = 1000) => new Promise<HostMsg>((res, rej) => { const m = inbox.shift(); if (m) return res(m); const t = setTimeout(() => rej(new Error('no message')), ms); waiters.push(x => { clearTimeout(t); res(x); }); }),
    closed: () => closed,
    waitClose: () => new Promise<number>(r => { if (closed) return r(closed.code); ws.on('close', c => r(c)); }),
  };
}
const hello = (deviceId: string, token?: string) => ({ t: 'hello', deviceId, name: 'Phone', clientVersion: '0.1.0', caps: { vibrate: true, wakeLock: false }, ...(token ? { token } : {}) });

async function paired() {
  const c = await client();
  c.send(hello('dev1'));
  const pr = await c.next(); if (pr.t !== 'pairRequired') throw new Error('expected pairRequired');
  expect(pairing.approve('dev1', pr.code)).toBe('ok');
  const w = await c.next(); if (w.t !== 'welcome') throw new Error('expected welcome');
  const d = await c.next(); if (d.t !== 'deck') throw new Error('expected deck');
  return { c, token: w.token, deck: d };
}

describe('client sessions', () => {
  it('an unapproved device gets pairRequired with a 6-digit code', async () => {
    const c = await client();
    c.send(hello('dev1'));
    const m = await c.next();
    expect(m.t).toBe('pairRequired');
    if (m.t === 'pairRequired') expect(m.code).toMatch(/^\d{6}$/);
  });

  it('after approval the socket receives welcome then the deck with the Notepad widget', async () => {
    const { deck } = await paired();
    if (deck.t === 'deck') expect(deck.view.widgets.map(w => w.look.label)).toEqual(['Notepad']);
  });

  it('a second connection with the token is welcomed without pairing', async () => {
    const { token } = await paired();
    const c2 = await client();
    c2.send(hello('dev1', token));
    expect((await c2.next()).t).toBe('welcome');
    expect((await c2.next()).t).toBe('deck');
  });

  it('press on a button reaches the engine callback with the device id', async () => {
    const { c, deck } = await paired();
    if (deck.t !== 'deck') return;
    c.send({ t: 'press', widgetId: deck.view.widgets[0].id, kind: 'press' });
    await new Promise(r => setTimeout(r, 50));
    expect(presses).toEqual([{ widgetId: deck.view.widgets[0].id, kind: 'press', deviceId: 'dev1' }]);
  });

  it('press on a folder widget navigates; open null returns to the root', async () => {
    const f = store.profiles()[0];
    const sub = store.createFolder(f.profile.id, f.profile.rootFolderId, 'Media');
    const link: Widget = store.createWidget(f.profile.rootFolderId, { x: 1, y: 0, w: 1, h: 1, look: DEFAULT_LOOK, config: { kind: 'folder', targetFolderId: sub.id } });
    const { c } = await paired();
    c.send({ t: 'press', widgetId: link.id, kind: 'press' });
    const d = await c.next();
    expect(d.t === 'deck' && d.view.path.length).toBe(2);
    expect(presses).toHaveLength(0);
    c.send({ t: 'open', folderId: null });
    const back = await c.next();
    expect(back.t === 'deck' && back.view.path.length).toBe(1);
  });

  it('profile switches to another profile at its root; an unknown id pushes nothing', async () => {
    const other = store.createProfile('Streaming', 4, 3);
    const { c } = await paired();
    c.send({ t: 'profile', profileId: other.id });
    const d = await c.next();
    expect(d.t === 'deck' && d.view.profileName).toBe('Streaming');
    c.send({ t: 'profile', profileId: 'nope' });
    await expect(c.next(200)).rejects.toThrow();
  });

  it('a malformed message closes the socket with 1003', async () => {
    const c = await client();
    c.send('{ not json');
    expect(await c.waitClose()).toBe(1003);
  });

  it('a store change pushes a fresh deck within 50 ms', async () => {
    const { c, deck } = await paired();
    if (deck.t !== 'deck') return;
    const t0 = Date.now();
    store.updateWidget(deck.view.widgets[0].id, { look: { ...deck.view.widgets[0].look, label: 'Edited' } });
    const d = await c.next();
    expect(Date.now() - t0).toBeLessThan(50);
    expect(d.t === 'deck' && d.view.widgets[0].look.label).toBe('Edited');
  });

  it('a blocked device receives blocked and the socket closes', async () => {
    store.upsertDevice({ id: 'bad', name: 'x', approved: false, blocked: true, lastSeen: 'x', createdAt: 'x' });
    const c = await client();
    c.send(hello('bad'));
    expect((await c.next()).t).toBe('blocked');
    await c.waitClose();
  });

  it('presses before pairing are ignored', async () => {
    const c = await client();
    c.send(hello('dev1')); await c.next();
    c.send({ t: 'press', widgetId: store.profiles()[0].widgets[0].id, kind: 'press' });
    await new Promise(r => setTimeout(r, 50));
    expect(presses).toHaveLength(0);
  });

  it('blocking a connected device sends blocked and closes it', async () => {
    const { c } = await paired();
    store.upsertDevice({ ...store.device('dev1')!, blocked: true });
    expect((await c.next()).t).toBe('blocked');
    await c.waitClose();
  });

  it('denial is delivered to the waiting client', async () => {
    const c = await client();
    c.send(hello('dev1')); await c.next();
    pairing.deny('dev1');
    expect((await c.next()).t).toBe('denied');
  });

  it('ping gets pong', async () => {
    const { c } = await paired();
    c.send({ t: 'ping', sent: 123 });
    const m = await c.next();
    expect(m).toMatchObject({ t: 'pong', sent: 123 });
  });

  it('reports connected devices', async () => {
    await paired();
    expect(clients.connected()).toEqual([expect.objectContaining({ deviceId: 'dev1', folderId: store.profiles()[0].profile.rootFolderId })]);
  });
});
