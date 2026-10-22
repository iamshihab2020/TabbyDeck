import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { DEFAULT_LOOK, type HostMsg, type Widget } from '@tabbydeck/shared';
import { createHost, type Host } from '../src/host.ts';
import { nullLogger } from '../src/log/logger.ts';
import { createFakeNative, type FakeNative } from '../src/native/fake.ts';
import { matchesWindow } from '../src/native/match.ts';
import { placeRect } from '../src/native/win/windows.ts';
import { ActionRegistry, type ActionContext } from '../src/engine/registry.ts';
import { registerBuiltins } from '../src/integrations/index.ts';
import { validateParams } from '../src/engine/params.ts';
import { HeldKeys } from '../src/native/win/held.ts';
import { StateWatcher, shortOutputName } from '../src/engine/states.ts';
import { profileForApp } from '../src/engine/follow.ts';
import { appUsingMic } from '../src/integrations/meeting.ts';
import { buildDeckView } from '../src/view/deckView.ts';
import type { Clients } from '../src/server/clients.ts';

let dir: string; let host: Host;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-flow-'));
  host = await createHost({ dataDir: dir, log: nullLogger(), fakeNative: true, lanHost: '127.0.0.1', lanPort: 0 });
});
afterEach(async () => { vi.useRealTimers(); await host.close(); rmSync(dir, { recursive: true, force: true }); });

const native = () => host.native as FakeNative;
const button = (action: string, params: Record<string, unknown> = {}, x = 1): Omit<Widget, 'id' | 'folderId'> =>
  ({ x, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Key' }, config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: `s${x}`, action, params }] } } });

function actions() {
  const r = new ActionRegistry(); const n = createFakeNative();
  registerBuiltins(r, { native: n, held: new HeldKeys(dir, n.input), store: host.store });
  const ctx = (signal = new AbortController().signal) => ({ signal } as unknown as ActionContext);
  const run = (id: string, params: Record<string, unknown> = {}, signal?: AbortSignal) => r.get(id)!.run(params, ctx(signal));
  return { n, run };
}

async function phone(id = 'dev1') {
  const ws = new WebSocket(`ws://127.0.0.1:${host.lanPort}/ws`);
  const inbox: HostMsg[] = []; const waiters: ((m: HostMsg) => void)[] = [];
  ws.on('message', d => { const m = JSON.parse(String(d)); const w = waiters.shift(); if (w) w(m); else inbox.push(m); });
  await new Promise(r => ws.on('open', r));
  const next = (ms = 2000) => new Promise<HostMsg>((res, rej) => {
    const m = inbox.shift(); if (m) return res(m);
    const w = (x: HostMsg) => { clearTimeout(t); res(x); };
    const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); rej(new Error('no message')); }, ms); // a timed-out wait must not eat the next message
    waiters.push(w);
  });
  const nextDeck = async (ms?: number) => { for (;;) { const m = await next(ms); if (m.t === 'deck') return m.view; } };
  ws.send(JSON.stringify({ t: 'hello', deviceId: id, name: 'Phone', clientVersion: '0.1.0', caps: { vibrate: true, wakeLock: false } }));
  const pr = await next(); if (pr.t !== 'pairRequired') throw new Error(pr.t);
  host.pairing.approve(id, pr.code);
  await next();
  return { ws, next, nextDeck, deck: await nextDeck() };
}

describe('the action list', () => {
  it('every field of every action is a type the host can check', () => {
    const r = new ActionRegistry(); const n = createFakeNative();
    registerBuiltins(r, { native: n, held: new HeldKeys(dir, n.input), store: host.store });
    for (const def of r.list()) for (const [key, f] of Object.entries(def.schema)) {
      const sample = f.type === 'number' ? (f.default ?? f.min ?? 1) : f.type === 'boolean' ? true : f.type === 'enum' ? f.options![0] : 'x';
      const res = validateParams({ [key]: f }, { [key]: sample });
      expect(res.ok ? '' : `${def.id}.${key}: ${res.error}`).toBe('');
    }
  });
});

describe('windows', () => {
  it('a step names a window by its program file or by text in its title', () => {
    const code = { title: 'main.ts - Visual Studio Code', exe: 'code.exe' };
    expect(matchesWindow('code.exe', code)).toBe(true);
    expect(matchesWindow('Code', code)).toBe(true); // the program without .exe
    expect(matchesWindow('visual studio', code)).toBe(true);
    expect(matchesWindow('slack', code)).toBe(false);
    expect(matchesWindow('studio.exe', code)).toBe(false); // a file name is not searched for in titles
    expect(matchesWindow('  ', code)).toBe(false);
  });
  it('halves split the screen without the taskbar', () => {
    const work = { left: 0, top: 0, right: 1920, bottom: 1032 };
    expect(placeRect(work, 'left')).toEqual({ left: 0, top: 0, right: 960, bottom: 1032 });
    expect(placeRect(work, 'right')).toEqual({ left: 960, top: 0, right: 1920, bottom: 1032 });
    expect(placeRect({ left: -1920, top: 60, right: 0, bottom: 1080 }, 'bottom')).toEqual({ left: -1920, top: 570, right: 0, bottom: 1080 });
  });
  it('Move window waits for an app that is still opening, then places it', async () => {
    const { n, run } = actions();
    n.open = [];
    setTimeout(() => n.open.push({ title: 'Slack | general', exe: 'slack.exe' }), 300);
    await run('system.placeWindow', { window: 'slack.exe', place: 'right', wait: 5 });
    expect(n.calls.filter(c => c.method === 'placeWindow').at(-1)?.args).toEqual(['slack.exe', 'right']);
  });
  it('Move window gives up with a clear message, and stops at once when the button is cancelled', async () => {
    const { run } = actions();
    await expect(run('system.placeWindow', { window: 'nothing.exe', place: 'left', wait: 0 })).rejects.toThrow('No window matches "nothing.exe"');
    const stop = new AbortController();
    const t0 = Date.now();
    const p = run('system.placeWindow', { window: 'nothing.exe', place: 'left', wait: 30 }, stop.signal);
    setTimeout(() => stop.abort(), 100);
    await expect(p).rejects.toThrow('Cancelled');
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('with no window named, Move window moves the window in front', async () => {
    const { n, run } = actions();
    n.front = { title: 'Notes', exe: 'notepad.exe' };
    await run('system.placeWindow', { place: 'next-screen', wait: 0 });
    expect(n.calls.at(-1)).toEqual({ method: 'placeWindow', args: ['', 'next-screen'] });
    expect(n.calls.filter(c => c.method === 'placeWindow' && c.args[1] === 'next-screen')).toHaveLength(1); // once: twice would come back
    await run('system.switchApp');
    expect(n.calls.at(-1)).toEqual({ method: 'switchApp', args: [] });
    n.open = [n.open[0]];
    await expect(run('system.switchApp')).rejects.toThrow('No other app is open');
    n.front = null;
    await expect(run('system.placeWindow', { place: 'left', wait: 0 })).rejects.toThrow('No window is in front');
  });
  it('Wait pauses the steps for its seconds', async () => {
    const { run } = actions();
    const t0 = Date.now();
    await run('deck.wait', { seconds: 0.2 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
  });
});

describe('sound outputs and the mixer', () => {
  it('Switch sound output goes to a chosen output, or to the next one each press', async () => {
    const { n, run } = actions();
    await run('audio.output', { output: 'hp' });
    expect(n.outputs.find(o => o.isDefault)?.id).toBe('hp');
    await run('audio.output', {});
    expect(n.outputs.find(o => o.isDefault)?.id).toBe('spk'); // wraps around
    await expect(run('audio.output', { output: 'gone' })).rejects.toThrow('not connected');
    n.outputs = n.outputs.slice(0, 1);
    await expect(run('audio.output', {})).rejects.toThrow('only one sound output');
  });
  it('an output key lights while its output plays; a next-output key shows the current one', async () => {
    const f = host.store.profiles()[0];
    const hp = host.store.createWidget(f.profile.rootFolderId, button('audio.output', { output: 'hp' }, 1));
    const cycle = host.store.createWidget(f.profile.rootFolderId, button('audio.output', {}, 2));
    const n = createFakeNative();
    const w = new StateWatcher({ store: host.store, native: n, clients: { patch: () => {}, count: () => 1 } as unknown as Clients });
    n.outputs[0].name = 'Speakers (Realtek(R) Audio)';
    await w.refresh('outputs');
    expect(w.liveOf(host.store.widget(hp.id)!)).toEqual({ active: false });
    expect(w.liveOf(host.store.widget(cycle.id)!)).toEqual({ value: 'Speakers' });
    expect(shortOutputName('FxSound Speakers (FxSound Audio Enhancer)')).toBe('FxSound Speakers');
  });
  it('the volume panel lists each app and the outputs, and sets one app or the output from the phone', async () => {
    const f = host.store.profiles()[0];
    host.store.createWidget(f.profile.rootFolderId, button('system.volumePanel', {}, 1));
    const { ws, deck, next } = await phone();
    const key = deck.widgets.find(x => x.panel === 'volume');
    let live: HostMsg | undefined;
    while (!(live?.t === 'patch' && live.apps)) live = await next(); // read once the phone is connected
    expect(live).toMatchObject({ apps: [{ id: 'spotify', name: 'Spotify' }, { id: 'chrome' }], outputs: [{ id: 'spk', isDefault: true }, { id: 'hp' }] });

    ws.send(JSON.stringify({ t: 'volume', widgetId: key!.id, app: 'spotify', percent: 30 }));
    ws.send(JSON.stringify({ t: 'volume', widgetId: key!.id, app: 'spotify', mute: true }));
    ws.send(JSON.stringify({ t: 'volume', widgetId: key!.id, output: 'hp' }));
    const n = native();
    for (let i = 0; i < 100 && !(n.apps[0].level === 30 && n.apps[0].muted && n.outputs[1].isDefault); i++) await new Promise(r => setTimeout(r, 10));
    expect(n.apps.find(a => a.id === 'spotify')).toMatchObject({ level: 30, muted: true });
    expect(n.volume).toBe(50); // the PC's own volume is untouched
    expect(n.outputs.find(o => o.isDefault)?.id).toBe('hp');
    ws.close();
  });
});

describe('now playing', () => {
  it('the key shows the title, the artist and the cover, and its own look when nothing plays', async () => {
    const f = host.store.profiles()[0];
    const np = host.store.createWidget(f.profile.rootFolderId, { ...button('media.nowPlaying', {}, 1), look: { ...DEFAULT_LOOK, label: 'Now playing', icon: 'music-notes' } });
    const n = createFakeNative();
    const w = new StateWatcher({ store: host.store, native: n, clients: { patch: () => {}, count: () => 1 } as unknown as Clients });
    await w.refresh('nowPlaying');
    expect(w.liveOf(host.store.widget(np.id)!)).toEqual({ active: false, value: '', look: { label: 'Now playing', image: '' } });

    n.track = { title: 'Midnight City', artist: 'M83', playing: true };
    await w.refresh('nowPlaying');
    const live = w.liveOf(host.store.widget(np.id)!);
    expect(live).toMatchObject({ active: true, value: 'M83', look: { label: 'Midnight City' } });
    expect(live.look!.image).toMatch(/^np-[0-9a-f]{12}\.png$/);
    expect(w.art?.id).toBe(live.look!.image);
    // The deck view merges the live look into the key's own.
    const v = buildDeckView(host.store, f.profile.id, f.profile.rootFolderId, w.liveOf).widgets.find(x => x.id === np.id)!;
    expect(v.look).toMatchObject({ label: 'Midnight City', icon: 'music-notes', image: live.look!.image });
  });
  it('the cover is served to the decks, and only the current one', async () => {
    native().track = { title: 'Song', artist: 'Band', playing: true };
    const f = host.store.profiles()[0];
    const np = host.store.createWidget(f.profile.rootFolderId, button('media.nowPlaying', {}, 1));
    const { ws, next } = await phone();
    let image = '';
    while (!image) { const m = await next(); if (m.t === 'patch' && m.widgetId === np.id && m.look?.image) image = m.look.image; }
    const res = await fetch(`http://127.0.0.1:${host.lanPort}/assets/u/${image}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect((await fetch(`http://127.0.0.1:${host.lanPort}/assets/u/np-000000000000.png`)).status).toBe(404);
    ws.close();
  });
  it('pressing it sends the play / pause media key', async () => {
    const { n, run } = actions();
    await run('media.nowPlaying');
    expect(n.calls.map(c => [c.method, ...c.args])).toEqual([['keyDown', 0xb3], ['keyUp', 0xb3]]);
  });
});

describe('meeting keys', () => {
  it('a meeting key brings the app forward and presses its own shortcut', async () => {
    const { n, run } = actions();
    n.open = [{ title: 'Meeting | Microsoft Teams', exe: 'ms-teams.exe' }];
    await run('meeting.camera', { app: 'teams' });
    expect(n.calls[0]).toEqual({ method: 'focusWindow', args: ['ms-teams.exe'] });
    // Ctrl+Shift+O down in order, up in reverse
    expect(n.calls.slice(1).map(c => `${c.method}:${c.args[0]}`)).toEqual(['keyDown:17', 'keyDown:16', 'keyDown:79', 'keyUp:79', 'keyUp:16', 'keyUp:17']);
  });
  it('Zoom asks before leaving, so its key confirms; an app that is not open gives a clear message', async () => {
    const { n, run } = actions();
    n.open = [{ title: 'Zoom Meeting', exe: 'zoom.exe' }];
    await run('meeting.leave', { app: 'zoom' });
    expect(n.calls.filter(c => c.method === 'keyDown').map(c => c.args[0])).toEqual([0x12, 0x51, 0x0d]); // Alt+Q, then Enter
    n.open = [];
    await expect(run('meeting.hand', { app: 'meet' })).rejects.toThrow('Open the Google Meet tab first');
  });
  it('"the app you are in a call with" finds the app using the microphone, and says what an app cannot do', async () => {
    const { n, run } = actions();
    n.open = [{ title: 'Slack', exe: 'slack.exe' }, { title: 'Microsoft Teams', exe: 'ms-teams.exe' }];
    n.mic = ['com.tinyspeck.slackdesktop_8yrtsj140pw4g', 'nvcontainer.exe'];
    await run('meeting.mic', { app: 'auto' });
    expect(n.calls[0]).toEqual({ method: 'focusWindow', args: ['slack.exe'] });
    expect(n.calls.filter(c => c.method === 'keyDown').map(c => c.args[0])).toEqual([0x11, 0x10, 0x20]); // Ctrl+Shift+Space
    await expect(run('meeting.camera', { app: 'auto' })).rejects.toThrow('Slack huddle has no shortcut for this');
    n.mic = []; n.open = [{ title: 'Zoom Meeting', exe: 'zoom.exe' }];
    await run('meeting.camera', {}); // auto is the default; a call window counts when nothing has the microphone
    expect(n.calls.at(-4)).toEqual({ method: 'keyDown', args: [0x12] });
    n.open = [];
    await expect(run('meeting.camera', { app: 'auto' })).rejects.toThrow('No call found');
  });
  it('prefers a call app over a browser that also has the microphone', () => {
    expect(appUsingMic(['chrome.exe', 'zoom.exe'])).toBe('zoom');
    expect(appUsingMic(['msteams_8wekyb3d8bbwe'])).toBe('teams');
    expect(appUsingMic(['msedge.exe'])).toBe('meet');
    expect(appUsingMic(['obs64.exe'])).toBeNull();
  });
  it('the camera key lights while an app uses the camera, and Leave asks on the phone first', async () => {
    const f = host.store.profiles()[0];
    const cam = host.store.createWidget(f.profile.rootFolderId, button('meeting.camera', { app: 'zoom' }, 1));
    const leave = host.store.createWidget(f.profile.rootFolderId, button('meeting.leave', { app: 'zoom' }, 2));
    const n = createFakeNative();
    const w = new StateWatcher({ store: host.store, native: n, clients: { patch: () => {}, count: () => 1 } as unknown as Clients });
    n.camera = true;
    await w.refresh('meeting.camera');
    const view = buildDeckView(host.store, f.profile.id, f.profile.rootFolderId, w.liveOf).widgets;
    expect(view.find(x => x.id === cam.id)).toMatchObject({ active: true, alt: { bg: '#166534' } });
    expect(view.find(x => x.id === leave.id)?.confirm).toBe('This leaves the call.');
  });
});

describe('decks that follow the app in front', () => {
  it('finds the profile that lists a program', () => {
    const files = host.store.profiles();
    host.store.updateProfile(files[0].profile.id, { apps: ['code.exe'] });
    expect(profileForApp(host.store.profiles(), 'Code.EXE')).toBe(files[0].profile.id);
    expect(profileForApp(host.store.profiles(), 'slack.exe')).toBeNull();
  });
  it('switches the phone to the app\'s profile and back, keeps a hand-picked profile, and skips a device that opted out', async () => {
    const main = host.store.profiles()[0].profile.id;
    const code = host.store.createProfile('VS Code', 5, 3).id;
    host.store.updateProfile(code, { apps: ['code.exe'] });
    const { ws, nextDeck } = await phone();
    const n = native();

    n.front = { title: 'main.ts - Visual Studio Code', exe: 'code.exe' };
    expect((await nextDeck()).profileId).toBe(code);
    n.front = { title: '', exe: 'explorer.exe' }; // the taskbar: no title, ignored
    n.front = { title: 'Inbox - Mail', exe: 'olk.exe' };
    expect((await nextDeck()).profileId).toBe(main);

    // A profile chosen on the phone is not taken back when the app goes.
    n.front = { title: 'main.ts - Visual Studio Code', exe: 'code.exe' };
    expect((await nextDeck()).profileId).toBe(code);
    ws.send(JSON.stringify({ t: 'profile', profileId: code }));
    await nextDeck();
    n.front = { title: 'Inbox - Mail', exe: 'olk.exe' };
    await expect(nextDeck(900)).rejects.toThrow('no message');

    host.store.upsertDevice({ ...host.store.device('dev1')!, followApps: false });
    ws.send(JSON.stringify({ t: 'profile', profileId: main }));
    await nextDeck();
    n.front = { title: 'main.ts - Visual Studio Code', exe: 'code.exe' };
    await expect(nextDeck(900)).rejects.toThrow('no message');
    ws.close();
  }, 15000);
});
