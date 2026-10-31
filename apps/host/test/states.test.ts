import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { createFakeNative } from '../src/native/fake.ts';
import { StateWatcher, appOpen } from '../src/engine/states.ts';
import { buildDeckView } from '../src/view/deckView.ts';
import type { Clients } from '../src/server/clients.ts';

let dir: string; let store: Store;
beforeEach(async () => { dir = mkdtempSync(path.join(tmpdir(), 'tabby-states-')); store = new Store({ dir, log: nullLogger() }); await store.load(); });
afterEach(async () => { await store.flush(); rmSync(dir, { recursive: true, force: true }); });

const button = (action: string, x: number) => ({ x, y: 1, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Mute' }, config: { kind: 'button' as const, policy: 'ignore' as const, triggers: { press: [{ id: `s${x}`, action, params: { mode: 'toggle' } }] } } });

describe('stateful buttons', () => {
  it('a muted PC shows Mute as on, and only real changes are sent', async () => {
    const f = store.profiles()[0];
    const mute = store.createWidget(f.profile.rootFolderId, button('system.mute', 0));
    const plain = store.createWidget(f.profile.rootFolderId, { ...button('keyboard.hotkey', 1), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'h', action: 'keyboard.hotkey', params: { hotkey: 'Ctrl+C' } }] } } });
    const native = createFakeNative();
    const patches: { id: string; active?: boolean }[] = [];
    const clients = { patch: (id: string, p: { active?: boolean }) => patches.push({ id, ...p }), count: () => 1 } as unknown as Clients;
    const w = new StateWatcher({ store, native, clients });

    native.mute = true;
    await w.refresh();
    expect(patches).toEqual([{ id: mute.id, active: true }]);
    await w.refresh();
    expect(patches).toHaveLength(1); // unchanged: nothing sent

    const view = buildDeckView(store, f.profile.id, f.profile.rootFolderId, w.liveOf);
    const v = view.widgets.find(x => x.id === mute.id)!;
    expect(v).toMatchObject({ active: true, alt: { label: 'Unmute' } });
    expect(view.widgets.find(x => x.id === plain.id)).not.toHaveProperty('alt');

    native.mute = false;
    await w.refresh('system.mute');
    expect(patches.at(-1)).toEqual({ id: mute.id, active: false });
  });
  it('Volume + shows the volume, and greys out at 100% until it comes down', async () => {
    const f = store.profiles()[0];
    const up = store.createWidget(f.profile.rootFolderId, { ...button('system.volumeStep', 2), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'v', action: 'system.volumeStep', params: { delta: 5 } }] } } });
    const native = createFakeNative();
    const patches: { id: string }[] = [];
    const clients = { patch: (id: string, p: object) => patches.push({ id, ...p }), count: () => 1 } as unknown as Clients;
    const w = new StateWatcher({ store, native, clients });

    native.volume = 100;
    await w.refresh('volume');
    expect(patches).toEqual([{ id: up.id, value: '100%', disabled: true }]);
    expect(buildDeckView(store, f.profile.id, f.profile.rootFolderId, w.liveOf).widgets.find(x => x.id === up.id)).toMatchObject({ value: '100%', disabled: true, repeat: true });
    native.volume = 40;
    await w.refresh('volume');
    expect(patches.at(-1)).toEqual({ id: up.id, value: '40%', disabled: false });
  });
  it('brightness keys show the screens they move, and the panel key carries every screen', async () => {
    const f = store.profiles()[0], root = f.profile.rootFolderId;
    const key = (x: number, action: string, params: Record<string, unknown>) => store.createWidget(root, { ...button(action, x), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: `b${x}`, action, params }] } } });
    const all = key(2, 'display.brightnessStep', { delta: 10, screen: 'all' });
    const mon = key(3, 'display.brightnessStep', { delta: 10, screen: 'MON1' });
    const panel = key(4, 'display.brightnessPanel', {});
    const native = createFakeNative();
    native.screens[1].brightness = 100;
    const clients = { patch: () => {}, count: () => 1 } as unknown as Clients;
    const w = new StateWatcher({ store, native, clients });
    await w.refresh('screens');
    const v = buildDeckView(store, f.profile.id, root, w.liveOf).widgets;
    expect(v.find(x => x.id === all.id)).toMatchObject({ value: '60–100%', disabled: false });
    expect(v.find(x => x.id === mon.id)).toMatchObject({ value: '100%', disabled: true });
    expect(v.find(x => x.id === panel.id)).toMatchObject({ panel: 'brightness', screens: [{ id: 'LAP1', brightness: 60 }, { id: 'MON1', brightness: 100 }] });
  });
  it('the volume key shows the level, or Muted, and carries both for its panel', async () => {
    const f = store.profiles()[0], root = f.profile.rootFolderId;
    const vol = store.createWidget(root, { ...button('system.volumePanel', 2), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'vp', action: 'system.volumePanel', params: {} }] } } });
    const native = createFakeNative();
    const clients = { patch: () => {}, count: () => 1 } as unknown as Clients;
    const w = new StateWatcher({ store, native, clients });
    native.volume = 35;
    await w.refresh('sound');
    const view = () => buildDeckView(store, f.profile.id, root, w.liveOf).widgets.find(x => x.id === vol.id);
    expect(view()).toMatchObject({ panel: 'volume', value: '35%', level: 35, muted: false });
    native.mute = true;
    await w.refresh('sound');
    expect(view()).toMatchObject({ value: 'Muted', muted: true });
  });
  it('the Bluetooth key shows Off, On or the connected device, and carries the devices for its panel', async () => {
    const f = store.profiles()[0], root = f.profile.rootFolderId;
    const bt = store.createWidget(root, { ...button('system.bluetoothPanel', 2), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'bp', action: 'system.bluetoothPanel', params: {} }] } } });
    const native = createFakeNative();
    const clients = { patch: () => {}, count: () => 1 } as unknown as Clients;
    const w = new StateWatcher({ store, native, clients });
    const view = () => buildDeckView(store, f.profile.id, root, w.liveOf).widgets.find(x => x.id === bt.id);
    native.btDevices[1].connected = false;
    await w.refresh('bluetoothPanel');
    expect(view()).toMatchObject({ panel: 'bluetooth', active: true, value: 'On', alt: { bg: '#1d4ed8' } });
    expect(view()!.bluetooth!.devices.map(d => d.name)).toEqual(['Headphones', 'Mouse']);
    native.btDevices[0].connected = true;
    await w.refresh('bluetoothPanel');
    expect(view()).toMatchObject({ value: 'Headphones' });
    native.bluetooth = false;
    await w.refresh('bluetoothPanel');
    expect(view()).toMatchObject({ active: false, value: 'Off', bluetooth: { on: false, devices: [] } });
    native.system.getBluetooth = async () => { throw new Error('This PC has no Bluetooth'); };
    await w.refresh('bluetoothPanel');
    expect(view()!.bluetooth).toEqual({ available: false, on: false, devices: [] });
  });
  it('Play / Pause shows Pause while something plays', async () => {
    const f = store.profiles()[0], root = f.profile.rootFolderId;
    const play = store.createWidget(root, { ...button('keyboard.hotkey', 3), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'pp', action: 'keyboard.hotkey', params: { hotkey: 'MediaPlayPause' } }] } } });
    const native = createFakeNative();
    const w = new StateWatcher({ store, native, clients: { patch: () => {}, count: () => 1 } as unknown as Clients });
    const view = () => buildDeckView(store, f.profile.id, root, w.liveOf).widgets.find(x => x.id === play.id);
    await w.refresh('media.playPause');
    expect(view()).toMatchObject({ active: false, alt: { label: 'Pause', icon: 'pause' } });
    native.playing = true;
    await w.refresh('media.playPause');
    expect(view()).toMatchObject({ active: true });
  });
});

describe('app keys show when their app is open', () => {
  const win = (exe: string, title: string) => ({ exe, title });
  it('matches program paths, Start apps by name, and window switches', () => {
    const open = [win('code.exe', 'states.ts - Tabby - Visual Studio Code'), win('githubdesktop.exe', 'GitHub Desktop'), win('explorer.exe', 'Program Manager')];
    const names: Record<string, string> = { 'microsoft.visualstudiocode': 'Visual Studio Code', 'com.squirrel.githubdesktop.githubdesktop': 'GitHub Desktop' };
    const nameOf = (id: string) => names[id.toLowerCase()];
    expect(appOpen('system.launch', { path: 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe' }, open)).toBe(true);
    expect(appOpen('system.launch', { path: 'shell:AppsFolder\\Microsoft.VisualStudioCode' }, open, nameOf)).toBe(true); // by title
    expect(appOpen('system.launch', { path: 'shell:AppsFolder\\com.squirrel.GitHubDesktop.GitHubDesktop' }, open)).toBe(true); // by id, before names are read
    expect(appOpen('system.launch', { path: 'shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify' }, open, () => 'Spotify')).toBe(false);
    expect(appOpen('system.launch', { path: 'explorer.exe' }, open)).toBe(false); // the desktop is not an open window
    expect(appOpen('system.launch', { path: 'C:\\notes\\todo.txt' }, open)).toBe(false);
    expect(appOpen('system.focus', { title: 'code' }, open)).toBe(true);
  });
  it('lights the key when the app opens and turns it off when it closes', async () => {
    const f = store.profiles()[0];
    const code = store.createWidget(f.profile.rootFolderId, { ...button('system.launch', 2), config: { kind: 'button', policy: 'ignore', triggers: { press: [{ id: 'l', action: 'system.launch', params: { path: 'code.exe' } }] } } });
    const native = createFakeNative();
    const patches: { id: string; running?: boolean }[] = [];
    const clients = { patch: (id: string, p: { running?: boolean }) => patches.push({ id, ...p }), count: () => 1 } as unknown as Clients;
    native.open = [];
    const w = new StateWatcher({ store, native, clients });
    await w.refresh('windows');
    expect(patches).toEqual([]); // nothing open: nothing sent
    native.open.push({ exe: 'code.exe', title: 'a - Visual Studio Code' });
    await w.refresh('windows');
    native.open[0].title = 'b - Visual Studio Code';
    await w.refresh('windows');
    expect(patches.filter(p => p.id === code.id)).toEqual([{ id: code.id, running: true }]); // a title change sends nothing
    expect(buildDeckView(store, f.profile.id, f.profile.rootFolderId, w.liveOf).widgets.find(x => x.id === code.id)).toMatchObject({ running: true });
    native.open.length = 0;
    await w.refresh('windows');
    expect(patches.at(-1)).toEqual({ id: code.id, running: false });
  });
});
