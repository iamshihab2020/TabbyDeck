import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { HostMsg } from '@tabbydeck/shared';
import { createHost, type Host } from '../src/host.ts';
import { nullLogger } from '../src/log/logger.ts';
import type { FakeNative } from '../src/native/fake.ts';

let dir: string; let host: Host;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-host-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
});
afterEach(async () => { await host.close(); rmSync(dir, { recursive: true, force: true }); });

async function pairedClient() {
  const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
  const inbox: HostMsg[] = []; const waiters: ((m: HostMsg) => void)[] = [];
  ws.on('message', d => { const m = JSON.parse(String(d)); const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  await new Promise(r => ws.on('open', r));
  const next = (ms = 1500) => new Promise<HostMsg>((res, rej) => { const m = inbox.shift(); if (m) return res(m); const t = setTimeout(() => rej(new Error('no message')), ms); waiters.push(x => { clearTimeout(t); res(x); }); });
  ws.send(JSON.stringify({ t: 'hello', deviceId: 'dev1', name: 'Phone', clientVersion: '0.1.0', caps: { vibrate: true, wakeLock: false } }));
  const pr = await next(); if (pr.t !== 'pairRequired') throw new Error(pr.t);
  host.pairing.approve('dev1', pr.code);
  await next(); const deck = await next(); if (deck.t !== 'deck') throw new Error(deck.t);
  return { ws, next, deck };
}

describe('press to action', () => {
  it('pressing the Notepad tile launches notepad.exe within 50 ms', async () => {
    const { ws, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    const native = host.native as FakeNative;
    const t0 = Date.now();
    ws.send(JSON.stringify({ t: 'press', widgetId: deck.view.widgets[0].id, kind: 'press' }));
    while (!native.calls.some(c => c.method === 'launch') && Date.now() - t0 < 1000) await new Promise(r => setTimeout(r, 2));
    expect(Date.now() - t0).toBeLessThan(50);
    expect(native.calls).toContainEqual({ method: 'launch', args: ['notepad.exe', []] });
    ws.close();
  });

  it('a failing action flashes the tile red on the device', async () => {
    const { ws, next, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    const w = host.store.profiles()[0].widgets[0];
    host.store.updateWidget(w.id, { config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 's1', action: 'nope.missing', params: {} }] } } });
    await next(); // fresh deck after the edit
    ws.send(JSON.stringify({ t: 'press', widgetId: w.id, kind: 'press' }));
    expect(await next()).toMatchObject({ t: 'patch', widgetId: w.id, flash: 'error' });
    ws.close();
  });

  it('deck.notify reaches the pressing device', async () => {
    const { ws, next } = await pairedClient();
    const w = host.store.profiles()[0].widgets[0];
    host.store.updateWidget(w.id, { config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 's1', action: 'deck.notify', params: { text: 'Hello' } }] } } });
    await next();
    ws.send(JSON.stringify({ t: 'press', widgetId: w.id, kind: 'press' }));
    expect(await next()).toMatchObject({ t: 'notify', text: 'Hello', vibrate: true });
    ws.close();
  });

  it('a paused host tells the device instead of running the action', async () => {
    const { ws, next, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    host.engine.paused = true;
    ws.send(JSON.stringify({ t: 'press', widgetId: deck.view.widgets[0].id, kind: 'press' }));
    expect(await next()).toMatchObject({ t: 'notify', text: 'TabbyDeck is paused' });
    expect((host.native as FakeNative).calls.some(c => c.method === 'launch')).toBe(false);
    ws.close();
  });

  it('the brightness panel sets one screen, and only a deck with the panel key can', async () => {
    const { ws, next, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    const native = host.native as FakeNative;
    const plain = deck.view.widgets[0].id;
    ws.send(JSON.stringify({ t: 'brightness', widgetId: plain, screen: 'MON1', percent: 30 }));
    await new Promise(r => setTimeout(r, 100));
    expect(native.screens[1].brightness).toBe(80); // the Notepad key is not a panel: ignored

    const w = host.store.profiles()[0].widgets[0];
    host.store.updateWidget(w.id, { config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'p', action: 'display.brightnessPanel', params: {} }] } } });
    const fresh = await next();
    expect(fresh.t === 'deck' && fresh.view.widgets[0]).toMatchObject({ panel: 'brightness' });
    for (const pct of [10, 20, 30]) ws.send(JSON.stringify({ t: 'brightness', widgetId: w.id, screen: 'MON1', percent: pct }));
    const t0 = Date.now();
    while (native.screens[1].brightness !== 30 && Date.now() - t0 < 1000) await new Promise(r => setTimeout(r, 5));
    expect(native.screens.map(s => s.brightness)).toEqual([60, 30]);
    ws.close();
  });
  it('the volume panel sets the volume and mute, and only a deck with the Volume key can', async () => {
    const { ws, next, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    const native = host.native as FakeNative;
    ws.send(JSON.stringify({ t: 'volume', widgetId: deck.view.widgets[0].id, percent: 10 }));
    await new Promise(r => setTimeout(r, 100));
    expect(native.volume).toBe(50); // the Notepad key is not the volume panel: ignored
    const w = host.store.profiles()[0].widgets[0];
    host.store.updateWidget(w.id, { config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'v', action: 'system.volumePanel', params: {} }] } } });
    await next();
    for (const pct of [60, 70, 80]) ws.send(JSON.stringify({ t: 'volume', widgetId: w.id, percent: pct }));
    ws.send(JSON.stringify({ t: 'volume', widgetId: w.id, mute: true }));
    const t0 = Date.now();
    while ((native.volume !== 80 || !native.mute) && Date.now() - t0 < 1000) await new Promise(r => setTimeout(r, 5));
    expect([native.volume, native.mute]).toEqual([80, true]);
    ws.close();
  });
  it('the Bluetooth panel turns Bluetooth off and connects headphones, only from a deck with the Bluetooth key', async () => {
    const { ws, next, deck } = await pairedClient();
    if (deck.t !== 'deck') return;
    const native = host.native as FakeNative;
    ws.send(JSON.stringify({ t: 'bluetooth', widgetId: deck.view.widgets[0].id, power: false }));
    await new Promise(r => setTimeout(r, 100));
    expect(native.bluetooth).toBe(true); // the Notepad key is not the Bluetooth panel: ignored
    const w = host.store.profiles()[0].widgets[0];
    host.store.updateWidget(w.id, { config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'b', action: 'system.bluetoothPanel', params: {} }] } } });
    await next();
    ws.send(JSON.stringify({ t: 'bluetooth', widgetId: w.id, device: '00aa11bb22cc', connect: true }));
    const t0 = Date.now();
    while (!native.btDevices[0].connected && Date.now() - t0 < 1000) await new Promise(r => setTimeout(r, 5));
    expect(native.btDevices[0].connected).toBe(true);
    ws.send(JSON.stringify({ t: 'bluetooth', widgetId: w.id, device: '00dd33ee44ff', connect: true })); // a mouse: Windows connects it
    let m; do m = await next(); while (m.t !== 'notify');
    expect(m).toMatchObject({ t: 'notify', text: 'Windows connects this device by itself when it is switched on' });
    ws.send(JSON.stringify({ t: 'bluetooth', widgetId: w.id, power: false }));
    const t1 = Date.now();
    while (native.bluetooth && Date.now() - t1 < 1000) await new Promise(r => setTimeout(r, 5));
    expect(native.bluetooth).toBe(false);
    ws.close();
  });
});
