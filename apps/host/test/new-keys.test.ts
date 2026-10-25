import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DEFAULT_LOOK, ProfileFileSchema, type HostMsg, type Widget } from '@tabbydeck/shared';
import { TEMPLATES, templateProfileFile } from '@tabbydeck/shared/templates';
import { fits, snugCols } from '@tabbydeck/shared/layout';
import { createHost, type Host } from '../src/host.ts';
import { nullLogger } from '../src/log/logger.ts';
import type { FakeNative } from '../src/native/fake.ts';
import { validateParams } from '../src/engine/params.ts';
import { InfoKeys, clockText } from '../src/engine/info.ts';
import { Installed, needOf } from '../src/engine/installed.ts';
import { buildDeckView } from '../src/view/deckView.ts';
import { dispatchCommand } from '../src/server/commands.ts';

let dir: string; let host: Host;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-keys-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
});
afterEach(async () => { await host.close(); rmSync(dir, { recursive: true, force: true }); });

const native = () => host.native as FakeNative;
const button = (action: string, params: Record<string, unknown> = {}, x = 1): Omit<Widget, 'id' | 'folderId'> =>
  ({ x, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Key' }, config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: `s${x}`, action, params }] } } });
const root = () => host.store.profiles()[0].profile.rootFolderId;

describe('ready-made decks', () => {
  it('every key calls a real action with valid parameters, and the keys fit their grid', () => {
    for (const t of TEMPLATES) {
      const f = ProfileFileSchema.parse(templateProfileFile(t, a => ({ path: `shell:AppsFolder\\${a.id ?? a.names[0]}` })));
      for (const w of f.widgets) {
        expect(fits(f.widgets.filter(o => o !== w), f.profile.cols, f.profile.rows, w), `${t.id} ${w.look.label}`).toBe(true);
        if (w.config.kind !== 'button') continue;
        for (const s of [...(w.config.triggers.press ?? []), ...(w.config.triggers.long ?? [])]) {
          const def = host.registry.get(s.action);
          expect(def, `${t.id} ${w.look.label}: ${s.action}`).toBeDefined();
          const r = validateParams(def!.schema, s.params);
          expect(r.ok ? '' : `${t.id} ${w.look.label}: ${r.error}`).toBe('');
        }
      }
    }
  });
  it('adds a deck as a profile: installed apps by name with their icon, missing ones by their usual id or not at all', async () => {
    native().system.listApps = async () => [{ id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', name: 'Calculator' }, { id: 'MyCode', name: 'Visual Studio Code' }];
    const r = await dispatchCommand('profile.template', { id: 'developer' }, { host, log: nullLogger(), onPausedChange: () => {} });
    expect(r.ok).toBe(true);
    const f = host.store.profile((r as { data: { id: string } }).data.id)!;
    expect(f.profile.name).toBe('Developer');
    const path = (label: string) => f.widgets.map(x => x.look.label === label && x.config.kind === 'button' ? x.config.triggers.press![0].params.path : undefined).find(Boolean);
    expect(path('VS Code')).toBe('shell:AppsFolder\\MyCode');
    expect(f.widgets.find(x => x.look.label === 'VS Code')!.look.image).toMatch(/\.png$/);
    expect(path('Terminal')).toBe('shell:AppsFolder\\Microsoft.WindowsTerminal_8wekyb3d8bbwe!App'); // not here: its usual id
    // Sized to the keys this PC can use (36: VS Code and the keys that need no app) in 6 x 6; the four apps not installed come last, on a seventh row.
    const order = [...f.widgets].sort((a, b) => a.y - b.y || a.x - b.x).map(w => w.look.label);
    expect([f.profile.cols, f.profile.rows, f.widgets.length]).toEqual([6, 7, 40]);
    expect(order.slice(0, 2)).toEqual(['VS Code', 'GitHub']);
    expect(order.slice(-4)).toEqual(['Terminal', 'GitHub Desktop', 'Docker', 'Postman']); // the app, not the Ctrl+` key
    const music = await dispatchCommand('profile.template', { id: 'music' }, { host, log: nullLogger(), onPausedChange: () => {} });
    expect(host.store.profile((music as { data: { id: string } }).data.id)!.widgets.some(w => w.look.label === 'Tidal')).toBe(false); // no id to wait for
    expect((await dispatchCommand('profile.template', { id: 'nope' }, { host, log: nullLogger(), onPausedChange: () => {} })).ok).toBe(false);
  });
});

describe('keys for apps this PC does not have', () => {
  it('a deck needs only as many columns as fill its rows', () => {
    expect([25, 8, 32, 20, 31, 3, 33, 64].map(n => snugCols(n))).toEqual([5, 4, 8, 5, 8, 3, 7, 8]);
  });
  it('works out what a step needs', () => {
    expect(needOf('system.launch', { path: 'shell:AppsFolder\\Spotify!App' })).toEqual({ app: 'spotify!app' });
    expect(needOf('system.launch', { path: 'notepad.exe' })).toBeNull();
    expect(needOf('system.launch', { path: 'C:\\nowhere\\x.exe' })).toEqual({ file: 'C:\\nowhere\\x.exe' });
    expect(needOf('system.openUrl', { url: 'spotify:' })).toEqual({ scheme: 'spotify' });
    expect(needOf('system.openUrl', { url: 'https://x.com' })).toBeNull();
    expect(needOf('system.openUrl', { url: 'ms-settings:' })).toBeNull();
  });
  it('are left off the deck, unless another app on the same key is here', async () => {
    const calc = host.store.createWidget(root(), button('system.launch', { path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' }, 1));
    const spotify = host.store.createWidget(root(), button('system.launch', { path: 'shell:AppsFolder\\SpotifyAB.SpotifyMusic!Spotify' }, 2));
    const link = host.store.createWidget(root(), button('system.openUrl', { url: 'missingapp:' }, 3));
    const both = host.store.createWidget(root(), { ...button('system.launch', { path: 'shell:AppsFolder\\Gone!App' }, 4), config: { kind: 'button', policy: 'ignore', triggers: { press: [
      { id: 'a', action: 'system.launch', params: { path: 'shell:AppsFolder\\Gone!App' } }, { id: 'b', action: 'system.launch', params: { path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' } }] } } });
    const inst = new Installed({ store: host.store, native: host.native });
    let changed: string[] = []; inst.on('change', ids => { changed = ids; });
    expect(inst.missing(spotify)).toBe(false); // not looked yet: everything shows
    await inst.refresh();
    expect([calc, spotify, link, both].map(inst.missing)).toEqual([false, true, true, false]);
    expect(changed).toEqual([host.store.profiles()[0].profile.id]);
    const view = buildDeckView(host.store, host.store.profiles()[0].profile.id, root(), undefined, inst.missing);
    expect(view.widgets.map(w => w.id)).not.toContain(spotify.id);
    expect(view.widgets.find(w => w.id === link.id)).toBeUndefined();
    expect(view.widgets.find(w => w.id === both.id)).toMatchObject({ x: 2, y: 0 }); // closed up into the gaps
    native().system.listApps = async () => [{ id: 'SpotifyAB.SpotifyMusic!Spotify', name: 'Spotify' }]; // installed later
    await inst.refresh();
    expect(inst.missing(spotify)).toBe(false);
  });
});

describe('live info keys and timers', () => {
  it('shows CPU, memory, battery and the time', () => {
    const info = new InfoKeys({ store: host.store, native: host.native });
    info.tick();
    const show = (what: string) => info.liveOf({ ...button('info.show', { show: what }), id: 'w', folderId: root() });
    expect(show('cpu').big).toBe('12%');
    expect(show('ram').big).toBe('40%');
    expect(show('battery')).toMatchObject({ big: '—', value: 'No battery' });
    native().batteryLevel = { percent: 81, charging: true };
    expect(show('battery')).toMatchObject({ big: '81%', active: true, value: 'Charging' });
    expect(show('clock').big).toMatch(/\d/);
  });
  it('a timer starts, pauses, finishes with a message and starts over; Pomodoro moves to the break', () => {
    let now = 0; const sent: string[] = [], patches: { id: string; big?: string }[] = [];
    const t = host.store.createWidget(root(), button('timer.countdown', { minutes: 2 }, 1));
    const p = host.store.createWidget(root(), button('timer.pomodoro', { focus: 25, rest: 5 }, 2));
    const info = new InfoKeys({ store: host.store, native: host.native, now: () => now, notify: s => sent.push(s), patch: (id, l) => patches.push({ id, big: l.big }) });
    expect(info.liveOf(t)).toMatchObject({ big: '02:00', active: false });
    info.toggle(t); now = 30_000; info.tick();
    expect(info.liveOf(t)).toMatchObject({ big: '01:30', active: true });
    info.toggle(t); now = 100_000; info.tick();
    expect(info.liveOf(t).big).toBe('01:30'); // paused
    info.toggle(t); now = 200_000; info.tick();
    expect(sent).toEqual(['Key is done']);
    expect(info.liveOf(t)).toMatchObject({ big: '02:00', active: false });
    info.toggle(p); now += 25 * 60_000; info.tick();
    expect(sent[1]).toBe('Time for a break');
    expect(info.liveOf(p)).toMatchObject({ big: '05:00', active: true, look: { label: 'Break' } });
    info.reset(p);
    expect(info.liveOf(p)).toMatchObject({ big: '25:00', active: false, look: { label: 'Focus' } });
    expect(patches.some(x => x.id === t.id && x.big === '01:30')).toBe(true);
    expect([clockText(61_000), clockText(3_600_000)]).toEqual(['01:01', '1:00:00']);
  });
  it('knows when a Pomodoro is in a focus stretch, not on its break or paused', () => {
    let now = 0;
    const p = host.store.createWidget(root(), button('timer.pomodoro', { focus: 1, rest: 1 }, 3));
    const t = host.store.createWidget(root(), button('timer.countdown', { minutes: 1 }, 4));
    const info = new InfoKeys({ store: host.store, native: host.native, now: () => now });
    info.toggle(t); expect(info.focusing()).toBe(false); // a plain timer is not focus
    info.toggle(p); expect(info.focusing()).toBe(true);
    now = 61_000; info.tick(); expect(info.focusing()).toBe(false); // on its break
    now = 122_000; info.tick(); expect(info.focusing()).toBe(true); // focusing again
    info.toggle(p); expect(info.focusing()).toBe(false); // paused
  });
  it('Do not disturb switches and shows its state', async () => {
    await host.registry.get('system.dnd')!.run({ mode: 'toggle' }, {} as never);
    expect(native().dnd).toBe(true);
    await host.registry.get('system.dnd')!.run({ mode: 'on' }, {} as never);
    expect(native().calls.filter(c => c.method === 'setDnd')).toHaveLength(2);
  });
});

describe('keys with a hold action', () => {
  it('are marked for the deck, so holding does only the hold action', () => {
    const plain = host.store.createWidget(root(), button('system.placeWindow', { window: '', place: 'maximize', wait: 0 }, 1));
    const held = host.store.createWidget(root(), { ...button('system.placeWindow', { window: '', place: 'maximize', wait: 0 }, 2), config: { kind: 'button', policy: 'ignore', triggers: {
      press: [{ id: 'p', action: 'system.placeWindow', params: { window: '', place: 'maximize', wait: 0 } }], long: [{ id: 'l', action: 'system.placeWindow', params: { window: '', place: 'minimize', wait: 0 } }] } } });
    const view = buildDeckView(host.store, host.store.profiles()[0].profile.id, root());
    expect(view.widgets.find(w => w.id === plain.id)?.hold).toBeUndefined();
    expect(view.widgets.find(w => w.id === held.id)?.hold).toBe(true);
  });
  it('the window in front is placed once, so a minimize cannot reach a second window', async () => {
    const n = native();
    n.front = { title: 'x', exe: 'code.exe' };
    await host.registry.get('system.placeWindow')!.run({ window: '', place: 'minimize', wait: 0 }, { signal: new AbortController().signal } as never);
    await new Promise(r => setTimeout(r, 500));
    expect(n.calls.filter(c => c.method === 'placeWindow')).toEqual([{ method: 'placeWindow', args: ['', 'minimize'] }]);
  });
});

describe('trackpad', () => {
  it('moves, clicks, scrolls and types, only from a deck with the trackpad key', async () => {
    const pad = host.store.createWidget(root(), button('mouse.trackpad', {}, 1));
    const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
    const inbox: HostMsg[] = [];
    ws.on('message', d => inbox.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r));
    const wait = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise(r => setTimeout(r, 5)); };
    ws.send(JSON.stringify({ t: 'hello', deviceId: 'pad1', name: 'Phone', clientVersion: '0.1.0', caps: { vibrate: true, wakeLock: false } }));
    await wait(() => inbox.some(m => m.t === 'pairRequired'));
    const pr = inbox.find(m => m.t === 'pairRequired') as Extract<HostMsg, { t: 'pairRequired' }>;
    host.pairing.approve('pad1', pr.code);
    await wait(() => inbox.some(m => m.t === 'deck'));
    const other = host.store.profiles()[0].widgets.find(w => w.id !== pad.id)!;
    ws.send(JSON.stringify({ t: 'pointer', widgetId: other.id, dx: 5, dy: 5 }));
    for (const m of [{ dx: 10, dy: -4 }, { button: 'left' }, { button: 'left', down: true }, { scroll: 1.5 }, { text: 'hi' }, { key: 'Enter' }]) ws.send(JSON.stringify({ t: 'pointer', widgetId: pad.id, ...m }));
    const calls = () => native().calls.filter(c => ['mouseMove', 'mouseButton', 'scroll', 'typeText', 'keyDown'].includes(c.method));
    await wait(() => calls().length >= 6);
    expect(calls().map(c => [c.method, ...c.args])).toEqual([
      ['mouseMove', 10, -4, false], ['mouseButton', 'left', true], ['mouseButton', 'left', false], ['mouseButton', 'left', true],
      ['scroll', 1.5, 0], ['typeText', 'hi'], ['keyDown', 0x0d],
    ]);
    ws.close();
  });
});

describe('phone cannot connect', () => {
  it('reports the network, the firewall, VPNs and whether any phone reached this PC', async () => {
    const ctx = { host, log: nullLogger(), onPausedChange: () => {} };
    expect(await dispatchCommand('network.check', {}, ctx)).toMatchObject({ ok: true, data: { network: 'Home Wi-Fi', firewall: 'allowed', vpn: [], lastVisit: null } });
    native().firewall = 'blocked';
    expect(await dispatchCommand('network.check', {}, ctx)).toMatchObject({ ok: true, data: { firewall: 'blocked' } });
  });
});

describe('key styles', () => {
  it('a profile keeps its key style and the decks get it', async () => {
    const f = host.store.profiles()[0];
    expect((await dispatchCommand('profile.update', { id: f.profile.id, patch: { tiles: 'glass' } }, { host, log: nullLogger(), onPausedChange: () => {} })).ok).toBe(true);
    expect(buildDeckView(host.store, f.profile.id, f.profile.rootFolderId).tiles).toBe('glass');
    expect((await dispatchCommand('profile.update', { id: f.profile.id, patch: { tiles: 'shiny' } }, { host, log: nullLogger(), onPausedChange: () => {} })).ok).toBe(false);
  });
});

describe('text passed to PowerShell', () => {
  it('cannot end its quotes early, with straight or curly quotes', async () => {
    const { psQuote } = await import('../src/native/win/ps.ts');
    expect(psQuote("it's")).toBe("'it''s'");
    expect(psQuote('a\u2019b\u2018c\u201ad\u201be')).toBe("'a\u2019\u2019b\u2018\u2018c\u201a\u201ad\u201b\u201be'");
    expect(psQuote('x\0y')).toBe("'xy'");
  });
  it('a phone cannot send an app name with quotes in it', async () => {
    const { ClientMsgSchema } = await import('@tabbydeck/shared');
    expect(ClientMsgSchema.safeParse({ t: 'volume', widgetId: 'w', app: 'chrome', percent: 10 }).success).toBe(true);
    expect(ClientMsgSchema.safeParse({ t: 'volume', widgetId: 'w', app: "x\u2019; Stop-Computer; \u2019", percent: 10 }).success).toBe(false);
  });
});

describe('the cat and the stats, from the PC', () => {
  it('the cat is set on the PC and every connected deck follows; the phone can ask for its week', async () => {
    const f = host.store.profiles()[0];
    expect(buildDeckView(host.store, f.profile.id, f.profile.rootFolderId).cat).toEqual({ on: true, name: 'Tabby' });
    const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
    const inbox: HostMsg[] = [];
    ws.on('message', d => inbox.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r));
    const wait = async (ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await new Promise(r => setTimeout(r, 5)); };
    ws.send(JSON.stringify({ t: 'hello', deviceId: 'cat1', name: 'Phone', clientVersion: '0.3.0', caps: { vibrate: true, wakeLock: false } }));
    await wait(() => inbox.some(m => m.t === 'pairRequired'));
    host.pairing.approve('cat1', (inbox.find(m => m.t === 'pairRequired') as Extract<HostMsg, { t: 'pairRequired' }>).code);
    await wait(() => inbox.some(m => m.t === 'deck'));
    expect((await dispatchCommand('settings.update', { patch: { catOn: false, catName: 'Mochi' } }, { host, log: nullLogger(), onPausedChange: () => {} })).ok).toBe(true);
    await wait(() => inbox.some(m => m.t === 'deck' && m.view.cat?.name === 'Mochi'));
    expect(inbox.filter(m => m.t === 'deck').at(-1)).toMatchObject({ view: { cat: { on: false, name: 'Mochi' } } });
    host.stats.press(f.widgets[0]);
    ws.send(JSON.stringify({ t: 'stats' }));
    await wait(() => inbox.some(m => m.t === 'stats'));
    expect(inbox.find(m => m.t === 'stats')).toMatchObject({ summary: { total: 1, keys: [{ n: 1 }] } });
    expect(await dispatchCommand('stats.get', { days: 30 }, { host, log: nullLogger(), onPausedChange: () => {} })).toMatchObject({ ok: true, data: { total: 1 } });
    ws.close();
  });
});
