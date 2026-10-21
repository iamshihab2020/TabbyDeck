import type { BtDevice } from '@tabbydeck/shared';
import type { Native, ScreenInfo } from './types.ts';

// A 1x1 transparent PNG, standing in for an app icon.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export interface FakeNative extends Native { calls: { method: string; args: unknown[] }[]; volume: number; mute: boolean; micMute: boolean; screens: ScreenInfo[]; nightLight: boolean; energySaver: boolean; bluetooth: boolean; btDevices: BtDevice[]; playing: boolean }

/** Records every call; used by tests and by `--fake-native` runs (e2e, CI). */
export function createFakeNative(opts: { echo?: (line: string) => void } = {}): FakeNative {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = (method: string, ...args: unknown[]) => { calls.push({ method, args }); opts.echo?.(`fake ${method} ${args.map(a => JSON.stringify(a)).join(' ')}`); };
  const n: FakeNative = {
    calls, volume: 50, mute: false, micMute: false, screens: [{ id: 'LAP1', name: 'Laptop screen', brightness: 60 }, { id: 'MON1', name: 'Monitor', brightness: 80 }], nightLight: false, energySaver: false, bluetooth: true, playing: false,
    btDevices: [{ id: '00aa11bb22cc', name: 'Headphones', audio: true, connected: false }, { id: '00dd33ee44ff', name: 'Mouse', audio: false, connected: true }],
    input: {
      keyDown: vk => rec('keyDown', vk), keyUp: vk => rec('keyUp', vk), typeText: t => rec('typeText', t),
      mouseMove: (x, y, a) => rec('mouseMove', x, y, a), mouseButton: (b, d) => rec('mouseButton', b, d),
      scroll: (dy, dx) => rec('scroll', dy, dx), screenSize: () => ({ w: 1920, h: 1080 }),
    },
    system: {
      launch: async (p, a) => rec('launch', p, a), openUrl: async u => rec('openUrl', u),
      run: async (c, t) => { rec('run', c, t); return { code: 0, out: '' }; },
      kill: async p => { rec('kill', p); return 1; }, focusWindow: async t => { rec('focusWindow', t); return true; },
      activeWindowTitle: () => 'Fake Window', lock: async () => rec('lock'), sleep: async () => rec('sleep'),
      shutdown: async r => rec('shutdown', r), clipboardSet: async t => rec('clipboardSet', t), screenshotToClipboard: async () => rec('screenshotToClipboard'),
      listApps: async () => [{ id: 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', name: 'Calculator' }, { id: 'C:\Apps\Pilot.exe', name: 'File Pilot' }],
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
    },
    audio: {
      getVolume: async () => n.volume, setVolume: async p => { rec('setVolume', p); n.volume = p; },
      getMute: async () => n.mute, setMute: async on => { rec('setMute', on); n.mute = on; },
      getMicMute: async () => n.micMute, setMicMute: async on => { rec('setMicMute', on); n.micMute = on; },
    },
    display: {
      screens: async () => n.screens.map(s => ({ ...s })),
      setScreenBrightness: async (id, p) => { rec('setScreenBrightness', id, p); const s = n.screens.find(x => x.id === id); if (!s) throw new Error('That screen is not connected'); s.brightness = p; },
      getNightLight: async () => n.nightLight, setNightLight: async on => { rec('setNightLight', on); n.nightLight = on; },
      project: async m => rec('project', m),
    },
    sysinfo: { cpuPercent: () => 12, ramPercent: () => 40, batteryPercent: () => null },
    dispose: async () => {},
  };
  return n;
}
