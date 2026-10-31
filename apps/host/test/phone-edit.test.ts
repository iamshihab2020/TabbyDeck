import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { HostMsg } from '@tabbydeck/shared';
import { createHost, type Host } from '../src/host.ts';
import { nullLogger } from '../src/log/logger.ts';

// A 1x1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let dir: string; let host: Host;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-edit-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
});
afterEach(async () => { await host.close(); rmSync(dir, { recursive: true, force: true }); });

async function pairedClient() {
  const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
  const inbox: HostMsg[] = []; const waiters: ((m: HostMsg) => void)[] = [];
  ws.on('message', d => { const m = JSON.parse(String(d)); if (m.t === 'mood') return; const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  await new Promise(r => ws.on('open', r));
  const next = (ms = 1500) => new Promise<HostMsg>((res, rej) => { const m = inbox.shift(); if (m) return res(m); const t = setTimeout(() => rej(new Error('no message')), ms); waiters.push(x => { clearTimeout(t); res(x); }); });
  ws.send(JSON.stringify({ t: 'hello', deviceId: 'dev1', name: 'Phone', clientVersion: '0.4.0', caps: { vibrate: true, wakeLock: false } }));
  const pr = await next(); if (pr.t !== 'pairRequired') throw new Error(pr.t);
  host.pairing.approve('dev1', pr.code);
  await next(); const deck = await next(); if (deck.t !== 'deck') throw new Error(deck.t);
  const send = (m: unknown) => ws.send(JSON.stringify(m));
  return { ws, next, send, view: deck.view };
}
const deckOf = (m: HostMsg) => { if (m.t !== 'deck') throw new Error(`expected deck, got ${m.t}`); return m.view; };

describe('editing keys from the phone', () => {
  it('the deck view says the device may edit and shows news, until the PC turns them off', async () => {
    const { ws, next, view } = await pairedClient();
    expect(view).toMatchObject({ edit: true, news: true, season: true });
    host.store.upsertDevice({ ...host.store.device('dev1')!, edit: false, news: false });
    host.store.updateSettings({ seasonOn: false });
    host.store.updateProfile(view.profileId, { gap: view.gap }); // any change sends the deck again
    let v = deckOf(await next()); while (v.season !== false) v = deckOf(await next());
    expect(v).toMatchObject({ edit: false, news: false, season: false });
    ws.close();
  });

  it('changes the label, icon, colour and picture, and every change reaches the store', async () => {
    const { ws, next, send, view } = await pairedClient();
    const id = view.widgets[0].id;
    send({ t: 'edit', widgetId: id, label: 'Write', icon: 'pencil', bg: '#123040', image: PNG });
    const look = deckOf(await next()).widgets[0].look;
    expect(look).toMatchObject({ label: 'Write', icon: 'pencil', bg: '#123040' });
    expect(look.image).toMatch(/^[a-f0-9]{40}\.png$/);
    expect(host.store.widget(id)!.look.image).toBe(look.image);
    send({ t: 'edit', widgetId: id, image: null, label: '' });
    const after = deckOf(await next()).widgets[0].look;
    expect(after.image).toBeUndefined(); expect(after.label).toBeUndefined();
    ws.close();
  });

  it('a Pomodoro key shows its minutes, takes new ones from the phone, and a plain key refuses minutes', async () => {
    const { ws, next, send, view } = await pairedClient();
    const root = host.store.profiles()[0].profile.rootFolderId, plain = view.widgets[0].id;
    const pom = host.store.createWidget(root, { x: 4, y: 0, w: 1, h: 1, look: { ...view.widgets[0].look, label: 'Focus' }, config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 's', action: 'timer.pomodoro', params: { focus: 25, rest: 5 } }] } } });
    expect(deckOf(await next()).widgets.find(w => w.id === pom.id)?.timer).toEqual({ focus: 25, rest: 5 });
    send({ t: 'edit', widgetId: pom.id, focus: 50, rest: 10 });
    expect(deckOf(await next()).widgets.find(w => w.id === pom.id)?.timer).toEqual({ focus: 50, rest: 10 });
    expect((host.store.widget(pom.id)!.config as { triggers: { press: { params: unknown }[] } }).triggers.press[0].params).toEqual({ focus: 50, rest: 10 });
    send({ t: 'edit', widgetId: plain, minutes: 5 });
    expect(await next()).toMatchObject({ t: 'notify', text: 'Only a Timer or Pomodoro key has minutes to set' });
    ws.close();
  });

  it('moves a key, and deletes it', async () => {
    const { ws, next, send, view } = await pairedClient();
    const id = view.widgets[0].id;
    send({ t: 'edit', widgetId: id, x: 2, y: 1 });
    expect(deckOf(await next()).widgets[0]).toMatchObject({ x: 2, y: 1 });
    send({ t: 'edit', widgetId: id, remove: true });
    expect(deckOf(await next()).widgets).toEqual([]);
    expect(host.store.widget(id)).toBeUndefined();
    ws.close();
  });

  it('a move off the grid is refused with a message, and the key stays', async () => {
    const { ws, next, send, view } = await pairedClient();
    send({ t: 'edit', widgetId: view.widgets[0].id, x: 11, y: 0 });
    expect(await next()).toMatchObject({ t: 'notify', text: 'No room there' });
    expect(host.store.widget(view.widgets[0].id)).toMatchObject({ x: 0, y: 0 });
    ws.close();
  });

  it('a device the PC does not let edit changes nothing', async () => {
    const { ws, next, send, view } = await pairedClient();
    host.store.upsertDevice({ ...host.store.device('dev1')!, edit: false });
    send({ t: 'edit', widgetId: view.widgets[0].id, remove: true });
    expect(await next()).toMatchObject({ t: 'notify', text: expect.stringMatching(/turned off/) });
    expect(host.store.widget(view.widgets[0].id)).toBeDefined();
    ws.close();
  });

  it('sets the background to a ready-made one or a photo, and refuses anything else', async () => {
    const { ws, next, send, view } = await pairedClient();
    send({ t: 'background', bg: '#0f1420' });
    expect(deckOf(await next()).bg).toBe('#0f1420');
    send({ t: 'background', image: PNG });
    expect(deckOf(await next()).bgImage).toMatch(/\.png$/);
    send({ t: 'background', image: null });
    expect(deckOf(await next()).bgImage).toBeUndefined();
    send({ t: 'background', bg: 'url(http://evil)' });
    expect(await next()).toMatchObject({ t: 'notify' });
    expect(host.store.profile(view.profileId)!.profile.bg).toBe('#0f1420');
    ws.close();
  });
});
