import type { BtDevice } from '@tabbydeck/shared';
import { matchesWindow } from './match.ts';
import type { AppSound, AudioOutput, Native, NowPlaying, ScreenInfo, WindowInfo } from './types.ts';

// A 1x1 transparent PNG, standing in for an app icon.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export interface FakeNative extends Native { calls: { method: string; args: unknown[] }[]; volume: number; mute: boolean; micMute: boolean; screens: ScreenInfo[]; nightLight: boolean; energySaver: boolean; bluetooth: boolean; btDevices: BtDevice[]; playing: boolean;
  outputs: AudioOutput[]; apps: AppSound[]; open: WindowInfo[]; front: WindowInfo | null; track: NowPlaying | null; camera: boolean; mic: string[]; dnd: boolean; firewall: 'allowed' | 'blocked' | 'missing' | 'unknown'; batteryLevel: { percent: number; charging: boolean } | null }

/** Records every call; used by tests and by `--fake-native` runs (e2e, CI). */
export function createFakeNative(opts: { echo?: (line: string) => void } = {}): FakeNative {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = (method: string, ...args: unknown[]) => { calls.push({ method, args }); opts.echo?.(`fake ${method} ${args.map(a => JSON.stringify(a)).join(' ')}`); };
  const n: FakeNative = {
    calls, volume: 50, mute: false, micMute: false, screens: [{ id: 'LAP1', name: 'Laptop screen', brightness: 60 }, { id: 'MON1', name: 'Monitor', brightness: 80 }], nightLight: false, energySaver: false, bluetooth: true, playing: false,
    outputs: [{ id: 'spk', name: 'Speakers', isDefault: true }, { id: 'hp', name: 'Headphones', isDefault: false }],
    apps: [{ id: 'spotify', name: 'Spotify', level: 80, muted: false }, { id: 'chrome', name: 'Google Chrome', level: 100, muted: false }],
    open: [{ title: 'main.ts - Visual Studio Code', exe: 'code.exe' }, { title: 'Spotify Premium', exe: 'spotify.exe' }],
    front: null, track: null, camera: false, mic: [], dnd: false, firewall: 'allowed', batteryLevel: null,
    btDevices: [{ id: '00aa11bb22cc', name: 'Headphones', audio: true, connected: false }, { id: '00dd33ee44ff', name: 'Mouse', audio: false, connected: true }],
    input: {
      keyDown: vk => rec('keyDown', vk), keyUp: vk => rec('keyUp', vk), typeText: t => rec('typeText', t),
      mouseMove: (x, y, a) => rec('mouseMove', x, y, a), mouseButton: (b, d) => rec('mouseButton', b, d),
      scroll: (dy, dx) => rec('scroll', dy, dx), screenSize: () => ({ w: 1920, h: 1080 }),
    },
    system: {
      launch: async (p, a) => rec('launch', p, a), openUrl: async u => rec('openUrl', u),
      run: async (c, t) => { rec('run', c, t); return { code: 0, out: '' }; },
      kill: async p => { rec('kill', p); return 1; }, focusWindow: async t => { rec('focusWindow', t); return n.open.some(w => matchesWindow(t, w)); },
      switchApp: async () => { rec('switchApp'); return n.open.length > 1; },
      windows: () => n.open.map(w => ({ ...w })), foregroundWindow: () => n.front && { ...n.front },
      placeWindow: (m, p) => { rec('placeWindow', m, p); return m.trim() ? n.open.some(w => matchesWindow(m, w)) : !!n.front; },
      nowPlaying: async () => n.track && { ...n.track }, nowPlayingArt: async () => n.track ? { type: 'image/png', data: Buffer.from(TINY_PNG, 'base64') } : null,
      cameraInUse: async () => n.camera, micUsers: async () => [...n.mic],
      activeWindowTitle: () => 'Fake Window', lock: async () => rec('lock'), sleep: async () => rec('sleep'),
      shutdown: async r => rec('shutdown', r), clipboardSet: async t => rec('clipboardSet', t), screenshotToClipboard: async () => rec('screenshotToClipboard'),
      listApps: async () => [{ id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', name: 'Calculator' }, { id: 'C:\Apps\Pilot.exe', name: 'File Pilot' }],
      hasUrlHandler: async s => s !== 'missingapp',
      networkCheck: async () => ({ network: 'Home Wi-Fi', category: 'Private', firewall: n.firewall, vpn: [] }),
      appIcon: async () => Buffer.from(TINY_PNG, 'base64'),
      getBluetooth: async () => n.bluetooth, setBluetooth: async on => { rec('setBluetooth', on); n.bluetooth = on; },
      bluetoothDevices: async () => n.btDevices.map(d => ({ ...d })),
      connectBluetooth: async (id, on) => {
        rec('connectBluetooth', id, on);
        const d = n.btDevices.find(x => x.id === id);
        if (!d || !d.audio) throw new Error('Windows connects this device by itself when it is switched on');
        d.connected = on;
      },
      mediaPlaying: async () => n.playing,
      getEnergySaver: async () => n.energySaver, setEnergySaver: async on => { rec('setEnergySaver', on); n.energySaver = on; },
      getDnd: async () => n.dnd, setDnd: async on => { rec('setDnd', on); n.dnd = on; },
    },
    audio: {
      getVolume: async () => n.volume, setVolume: async p => { rec('setVolume', p); n.volume = p; },
      getMute: async () => n.mute, setMute: async on => { rec('setMute', on); n.mute = on; },
      getMicMute: async () => n.micMute, setMicMute: async on => { rec('setMicMute', on); n.micMute = on; },
      outputs: async () => n.outputs.map(o => ({ ...o })),
      setOutput: async id => { rec('setOutput', id); if (!n.outputs.some(o => o.id === id)) throw new Error('That sound output is not connected'); for (const o of n.outputs) o.isDefault = o.id === id; },
      apps: async () => n.apps.map(a => ({ ...a })),
      setApp: async (id, c) => {
        rec('setApp', id, c);
        const a = n.apps.find(x => x.id === id); if (!a) throw new Error('That app has closed its sound');
        if (c.percent !== undefined) a.level = c.percent;
        if (c.mute !== undefined) a.muted = c.mute;
      },
    },
    display: {
      screens: async () => n.screens.map(s => ({ ...s })),
      setScreenBrightness: async (id, p) => { rec('setScreenBrightness', id, p); const s = n.screens.find(x => x.id === id); if (!s) throw new Error('That screen is not connected'); s.brightness = p; },
      getNightLight: async () => n.nightLight, setNightLight: async on => { rec('setNightLight', on); n.nightLight = on; },
      project: async m => rec('project', m),
    },
    sysinfo: { cpuPercent: () => 12, ramPercent: () => 40, battery: () => n.batteryLevel && { ...n.batteryLevel } },
    dispose: async () => {},
  };
  return n;
}
