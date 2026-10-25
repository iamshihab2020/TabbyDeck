import type { Look, Widget } from './model.ts';

/**
 * Actions whose result is a state the PC keeps (muted, night light on). A button whose first Press step is one of
 * these shows that state: while it is on, the key takes this look and lights its status light.
 */
export const STATEFUL: Record<string, Partial<Look>> = {
  'system.mute': { label: 'Unmute', bg: '#7f1d1d', fg: '#fecaca' },
  'system.micMute': { label: 'Unmute mic', bg: '#7f1d1d', fg: '#fecaca' },
  'display.nightLight': { bg: '#b45309', fg: '#fff7ed' },
  'system.energySaver': { bg: '#166534', fg: '#dcfce7' },
  'system.bluetooth': { bg: '#1d4ed8', fg: '#eff6ff' },
  'system.dnd': { label: 'Notifications off', icon: 'bell-slash', bg: '#5b21b6', fg: '#ede9fe' },
  'system.bluetoothPanel': { bg: '#1d4ed8', fg: '#eff6ff' },
  // Every screen is off and the PC is kept awake (keys set to All screens only).
  'display.screensOff': { label: 'Screens off', bg: '#1e3a8a', fg: '#dbeafe' },
  // Play / Pause (the media key) while something plays.
  'media.playPause': { label: 'Pause', icon: 'pause' },
  // An app is using the camera.
  'meeting.camera': { bg: '#166534', fg: '#dcfce7' },
  // This key's output is the one Windows plays through.
  'audio.output': { bg: '#1d4ed8', fg: '#eff6ff' },
  // Something is playing (the key shows its title and cover either way).
  'media.nowPlaying': {},
};

/** The stateful action a button shows, if any. */
export function statefulAction(w: Pick<Widget, 'config'>): string | undefined {
  if (w.config.kind !== 'button') return undefined;
  const s = w.config.triggers.press?.[0];
  if (s?.action === 'keyboard.hotkey' && String(s.params.hotkey).toLowerCase() === 'mediaplaypause') return 'media.playPause';
  if (s?.action === 'display.screensOff' && (s.params.screen ?? 'all') !== 'all') return undefined; // one monitor: its state is not read
  return s && s.action in STATEFUL ? s.action : undefined;
}

/** Actions the tablet asks about before running ("Careful" in the editor, plus Lock). The text says what will happen. */
export function confirmText(w: Pick<Widget, 'config'>): string | undefined {
  if (w.config.kind !== 'button') return undefined;
  for (const s of w.config.triggers.press ?? []) {
    if (s.action === 'system.shutdown') return s.params.restart ? 'The PC restarts now. Unsaved work is lost.' : 'The PC turns off now. Unsaved work is lost.';
    if (s.action === 'system.sleep') return 'The PC goes to sleep. This tablet loses its connection until it wakes.';
    if (s.action === 'system.lock') return 'The PC locks. You will need your PIN or password to get back in.';
    if (s.action === 'system.run') return 'This runs a command on the PC.';
    if (s.action === 'system.kill') return 'This force-closes an app on the PC. Unsaved work in it is lost.';
    if (s.action === 'meeting.leave') return 'This leaves the call.';
    if (s.action === 'display.screensOff' && (s.params.screen ?? 'all') !== 'all') return 'This monitor turns off. Press the key again to turn it back on.';
    if (s.action === 'display.screensOff') return 'The screens turn off and the PC stays awake until you come back: any key or mouse move on the PC, or another key here, turns them on. Keep it plugged in, as it uses battery the whole time. Closing the lid still puts it to sleep.';
  }
  return undefined;
}

/** Step keys that show the PC's level (volume, brightness) as a percentage, and grey out at the end they push towards. */
const LEVELS: Record<string, string> = { 'system.volumeStep': 'volume', 'system.volume': 'volume', 'display.brightnessStep': 'screens', 'display.brightness': 'screens' };

/** Which level a button shows, which way it moves it (+1 up, -1 down, 0 sets it), and for brightness which screen. */
export function levelOf(w: Pick<Widget, 'config'>): { level: string; dir: number; screen?: string } | undefined {
  if (w.config.kind !== 'button') return undefined;
  const s = w.config.triggers.press?.[0];
  if (!s || !(s.action in LEVELS)) return undefined;
  const dir = s.action.endsWith('Step') ? Math.sign(Number(s.params.delta ?? 1)) : 0;
  return LEVELS[s.action] === 'screens' ? { level: 'screens', dir, screen: String(s.params.screen || 'all') } : { level: LEVELS[s.action], dir };
}

/**
 * What a level button shows: the percentage (a range when it moves several screens that differ), and disabled once
 * every level it moves can go no further.
 */
export function levelView(dir: number, levels: number[]): { value: string; disabled: boolean } {
  const min = Math.min(...levels), max = Math.max(...levels), lo = Math.round(min), hi = Math.round(max);
  return { value: lo === hi ? `${lo}%` : `${lo}–${hi}%`, disabled: (dir > 0 && min >= 100) || (dir < 0 && max <= 0) };
}

export type Panel = 'brightness' | 'volume' | 'bluetooth' | 'trackpad';
const PANELS: Record<string, Panel> = { 'display.brightnessPanel': 'brightness', 'system.volumePanel': 'volume', 'system.bluetoothPanel': 'bluetooth', 'mouse.trackpad': 'trackpad' };

/** Buttons that open a panel on the tablet instead of acting at once: brightness for each screen, the volume, Bluetooth, or the trackpad. */
export function panelOf(w: Pick<Widget, 'config'>): Panel | undefined {
  return w.config.kind === 'button' ? PANELS[w.config.triggers.press?.[0]?.action ?? ''] : undefined;
}
