import { DEFAULT_LOOK, newProfileFile, type Look, type ProfileFile, type Step } from './model.ts';
import { newId } from './ids.ts';

type Key = [label: string, icon: string, bg: string, fg: string, action: string, params?: Record<string, unknown>];
const FG = DEFAULT_LOOK.fg, KEY = '#25221f';

/**
 * The deck a fresh install starts with: one department per row, sound and screen on top, Shut down alone in the corner.
 * Only what every Windows PC has; people add their own apps from Apps on this PC.
 */
export const STARTER_ROWS: { department: string; keys: Key[] }[] = [
  { department: 'Sound & screen', keys: [
    ['Play', 'play', '#f5a524', '#2a1a00', 'keyboard.hotkey', { hotkey: 'MediaPlayPause' }],
    ['Volume', 'speaker-high', KEY, FG, 'system.volumePanel'],
    ['Mute', 'speaker-x', '#33302b', FG, 'system.mute', { mode: 'toggle' }],
    ['Mic', 'microphone-slash', '#33302b', FG, 'system.micMute', { mode: 'toggle' }],
    ['Brightness', 'monitor', KEY, '#fcd34d', 'display.brightnessPanel'],
    ['Night light', 'moon-stars', '#2b2440', '#fcd34d', 'display.nightLight', { mode: 'toggle' }],
    ['Bluetooth', 'bluetooth', '#1e293b', '#93c5fd', 'system.bluetoothPanel'],
  ] },
  { department: 'Media & windows', keys: [
    ['Previous', 'skip-back', KEY, FG, 'keyboard.hotkey', { hotkey: 'MediaPrev' }],
    ['Next', 'skip-forward', KEY, FG, 'keyboard.hotkey', { hotkey: 'MediaNext' }],
    ['Task View', 'squares-four', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+Tab' }],
    ['Desktop', 'desktop', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+D' }],
    ['Search', 'magnifying-glass', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+S' }],
    ['File Explorer', 'folder-open', '#3a2f12', '#fcd34d', 'system.launch', { path: 'explorer.exe' }],
    ['Settings', 'gear-six', KEY, FG, 'system.openUrl', { url: 'ms-settings:' }],
  ] },
  { department: 'Editing', keys: [
    ['Copy', 'copy', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+C' }],
    ['Paste', 'clipboard', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+V' }],
    ['Cut', 'scissors', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+X' }],
    ['Undo', 'arrow-counter-clockwise', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Z' }],
    ['Redo', 'arrow-clockwise', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Y' }],
    ['Select all', 'selection', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+A' }],
    ['Clipboard', 'clipboard-text', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+V' }],
  ] },
  { department: 'Capture & screens', keys: [
    ['Snip', 'crop', '#3b2a4d', FG, 'keyboard.hotkey', { hotkey: 'Win+Shift+S' }],
    ['Screenshot', 'camera', KEY, FG, 'system.screenshot'],
    ['Emoji', 'smiley', KEY, '#fcd34d', 'keyboard.hotkey', { hotkey: 'Win+.' }],
    ['Extend', 'columns', '#1e3a5f', FG, 'display.project', { mode: 'extend' }],
    ['Duplicate', 'copy-simple', '#1e3a5f', FG, 'display.project', { mode: 'duplicate' }],
    ['PC screen only', 'monitor', '#1e3a5f', FG, 'display.project', { mode: 'pc-only' }],
    ['Second screen', 'monitor-play', '#1e3a5f', FG, 'display.project', { mode: 'second-only' }],
  ] },
  { department: 'Apps & power', keys: [
    ['Browser', 'globe', '#1e3a5f', FG, 'system.openUrl', { url: 'https://www.google.com' }],
    ['Calculator', 'calculator', '#14532d', FG, 'system.launch', { path: 'calc.exe' }],
    ['Notepad', 'notepad', KEY, FG, 'system.launch', { path: 'notepad.exe' }],
    ['Task Manager', 'pulse', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+Esc' }],
    ['Sleep', 'moon', '#2b2440', '#c4b5fd', 'system.sleep'],
    ['Lock', 'lock', '#f5a524', '#2a1a00', 'system.lock'],
    ['Shut down', 'power', '#a80000', FG, 'system.shutdown', { restart: false }],
  ] },
];

/** A 7 x 5 "Main" profile laid out from STARTER_ROWS. */
export function starterProfileFile(): ProfileFile {
  const f = newProfileFile('Main', 7, STARTER_ROWS.length);
  f.profile.gap = 16;
  STARTER_ROWS.forEach((row, y) => row.keys.forEach(([label, icon, bg, fg, action, params], x) => {
    const look: Look = { ...DEFAULT_LOOK, label, icon, bg, fg };
    const step: Step = { id: newId(), action, params: params ?? {} };
    f.widgets.push({ id: newId(), folderId: f.profile.rootFolderId, x, y, w: 1, h: 1, look, config: { kind: 'button', policy: 'ignore', triggers: { press: [step] } } });
  }));
  return f;
}
