/** Ready-made buttons offered when adding to an empty cell. Each one is checked against the real action list in core's tests. */
export interface Preset {
  id: string;
  group: string;
  label: string;
  icon: string;
  bg: string;
  fg?: string;
  steps: { action: string; params?: Record<string, unknown> }[];
}

const KEY = '#25221f';
const hotkey = (hotkey: string) => [{ action: 'keyboard.hotkey', params: { hotkey } }];
const launch = (path: string) => [{ action: 'system.launch', params: { path } }];
const url = (u: string) => [{ action: 'system.openUrl', params: { url: u } }];

export const PRESETS: Preset[] = [
  { id: 'play-pause', group: 'Media', label: 'Play', icon: 'play', bg: '#f5a524', fg: '#2a1a00', steps: hotkey('MediaPlayPause') },
  { id: 'previous', group: 'Media', label: 'Previous', icon: 'skip-back', bg: KEY, steps: hotkey('MediaPrev') },
  { id: 'next', group: 'Media', label: 'Next', icon: 'skip-forward', bg: KEY, steps: hotkey('MediaNext') },
  { id: 'stop', group: 'Media', label: 'Stop', icon: 'stop', bg: KEY, steps: hotkey('MediaStop') },

  { id: 'mute', group: 'Sound', label: 'Mute', icon: 'speaker-x', bg: '#33302b', steps: [{ action: 'system.mute', params: { mode: 'toggle' } }] },
  { id: 'volume-down', group: 'Sound', label: 'Volume −', icon: 'speaker-low', bg: KEY, steps: [{ action: 'system.volumeStep', params: { delta: -5 } }] },
  { id: 'volume-up', group: 'Sound', label: 'Volume +', icon: 'speaker-high', bg: KEY, steps: [{ action: 'system.volumeStep', params: { delta: 5 } }] },
  { id: 'volume-panel', group: 'Sound', label: 'Volume', icon: 'speaker-high', bg: KEY, steps: [{ action: 'system.volumePanel', params: {} }] },
  { id: 'mic', group: 'Sound', label: 'Mic', icon: 'microphone-slash', bg: '#33302b', steps: [{ action: 'system.micMute', params: { mode: 'toggle' } }] },

  { id: 'brightness-down', group: 'Display', label: 'Brightness −', icon: 'sun-dim', bg: KEY, steps: [{ action: 'display.brightnessStep', params: { delta: -10 } }] },
  { id: 'brightness-panel', group: 'Display', label: 'Brightness', icon: 'monitor', bg: KEY, fg: '#fcd34d', steps: [{ action: 'display.brightnessPanel', params: {} }] },
  { id: 'brightness-up', group: 'Display', label: 'Brightness +', icon: 'sun', bg: KEY, fg: '#fcd34d', steps: [{ action: 'display.brightnessStep', params: { delta: 10 } }] },
  { id: 'energy-saver', group: 'Display', label: 'Power saver', icon: 'leaf', bg: '#16302b', fg: '#86efac', steps: [{ action: 'system.energySaver', params: { mode: 'toggle' } }] },
  { id: 'bluetooth', group: 'Windows', label: 'Bluetooth', icon: 'bluetooth', bg: '#1e293b', fg: '#93c5fd', steps: [{ action: 'system.bluetoothPanel', params: {} }] },
  { id: 'night-light', group: 'Display', label: 'Night light', icon: 'moon-stars', bg: '#2b2440', fg: '#fcd34d', steps: [{ action: 'display.nightLight', params: { mode: 'toggle' } }] },

  { id: 'screens-extend', group: 'Display', label: 'Extend', icon: 'columns', bg: '#1e3a5f', steps: [{ action: 'display.project', params: { mode: 'extend' } }] },
  { id: 'screens-duplicate', group: 'Display', label: 'Duplicate', icon: 'copy-simple', bg: '#1e3a5f', steps: [{ action: 'display.project', params: { mode: 'duplicate' } }] },
  { id: 'screens-pc-only', group: 'Display', label: 'PC screen only', icon: 'laptop', bg: KEY, steps: [{ action: 'display.project', params: { mode: 'pc-only' } }] },
  { id: 'screens-second-only', group: 'Display', label: 'Second screen', icon: 'monitor', bg: KEY, steps: [{ action: 'display.project', params: { mode: 'second-only' } }] },

  { id: 'explorer', group: 'Windows', label: 'Files', icon: 'folder-open', bg: '#3a2f12', fg: '#fcd34d', steps: launch('explorer.exe') },
  { id: 'task-manager', group: 'Windows', label: 'Task Manager', icon: 'pulse', bg: KEY, steps: hotkey('Ctrl+Shift+Esc') },
  { id: 'settings', group: 'Windows', label: 'Settings', icon: 'gear-six', bg: KEY, steps: url('ms-settings:') },

  // Start-menu apps open by their app id through Explorer; Copilot's id is the same on every Windows 11 PC.
  { id: 'claude', group: 'AI', label: 'Claude', icon: 'asterisk', bg: '#3a2317', fg: '#f4a97f', steps: url('https://claude.ai') },

  { id: 'browser', group: 'Web',label: 'Browser', icon: 'globe', bg: '#1e3a5f', steps: url('https://www.google.com') },
  { id: 'youtube', group: 'Web', label: 'YouTube', icon: 'youtube-logo', bg: '#450a0a', fg: '#fca5a5', steps: url('https://www.youtube.com') },
  { id: 'gmail', group: 'Web', label: 'Mail', icon: 'envelope', bg: '#1e3a5f', steps: url('https://mail.google.com') },
  { id: 'github', group: 'Web', label: 'GitHub', icon: 'github-logo', bg: '#25221f', steps: url('https://github.com') },
  { id: 'spotify', group: 'Web', label: 'Spotify', icon: 'spotify-logo', bg: '#14532d', fg: '#86efac', steps: url('spotify:') },
  { id: 'discord', group: 'Web', label: 'Discord', icon: 'discord-logo', bg: '#2b2d6e', fg: '#c7d2fe', steps: url('discord:') },
  { id: 'steam', group: 'Web', label: 'Steam', icon: 'steam-logo', bg: '#16233b', steps: url('steam:') },

  { id: 'copy', group: 'Editing', label: 'Copy', icon: 'copy', bg: KEY, steps: hotkey('Ctrl+C') },
  { id: 'paste', group: 'Editing', label: 'Paste', icon: 'clipboard', bg: KEY, steps: hotkey('Ctrl+V') },
  { id: 'cut', group: 'Editing', label: 'Cut', icon: 'scissors', bg: KEY, steps: hotkey('Ctrl+X') },
  { id: 'undo', group: 'Editing', label: 'Undo', icon: 'arrow-counter-clockwise', bg: KEY, steps: hotkey('Ctrl+Z') },
  { id: 'redo', group: 'Editing', label: 'Redo', icon: 'arrow-clockwise', bg: KEY, steps: hotkey('Ctrl+Y') },
  { id: 'save', group: 'Editing', label: 'Save', icon: 'floppy-disk', bg: KEY, steps: hotkey('Ctrl+S') },
  { id: 'find', group: 'Editing', label: 'Find', icon: 'magnifying-glass', bg: KEY, steps: hotkey('Ctrl+F') },
  { id: 'select-all', group: 'Editing', label: 'Select all', icon: 'selection', bg: KEY, steps: hotkey('Ctrl+A') },
  { id: 'new-tab', group: 'Editing', label: 'New tab', icon: 'app-window', bg: KEY, steps: hotkey('Ctrl+T') },
  { id: 'close-tab', group: 'Editing', label: 'Close tab', icon: 'x-circle', bg: KEY, steps: hotkey('Ctrl+W') },

  { id: 'snip', group: 'Windows', label: 'Snip', icon: 'crop', bg: '#3b2a4d', steps: hotkey('Win+Shift+S') },
  { id: 'screenshot', group: 'Windows', label: 'Screenshot', icon: 'camera', bg: KEY, steps: [{ action: 'system.screenshot' }] },
  { id: 'desktop', group: 'Windows', label: 'Desktop', icon: 'desktop', bg: KEY, steps: hotkey('Win+D') },
  { id: 'task-view', group: 'Windows', label: 'Task View', icon: 'squares-four', bg: KEY, steps: hotkey('Win+Tab') },
  { id: 'switch-app', group: 'Windows', label: 'Switch app', icon: 'browsers', bg: KEY, steps: hotkey('Alt+Tab') },
  { id: 'clipboard-history', group: 'Windows', label: 'Clipboard', icon: 'clipboard-text', bg: KEY, steps: hotkey('Win+V') },
  { id: 'emoji', group: 'Windows', label: 'Emoji', icon: 'smiley', bg: KEY, steps: hotkey('Win+.') },
  { id: 'lock', group: 'Windows', label: 'Lock', icon: 'lock', bg: '#3a1d1d', fg: '#fca5a5', steps: [{ action: 'system.lock' }] },

  { id: 'sleep', group: 'Power', label: 'Sleep', icon: 'moon', bg: '#1e1b3a', fg: '#c4b5fd', steps: [{ action: 'system.sleep' }] },
  { id: 'restart', group: 'Power', label: 'Restart', icon: 'arrows-clockwise', bg: '#3a1d1d', fg: '#fca5a5', steps: [{ action: 'system.shutdown', params: { restart: true } }] },
  { id: 'shutdown', group: 'Power', label: 'Shut down', icon: 'power', bg: '#3a1d1d', fg: '#fca5a5', steps: [{ action: 'system.shutdown', params: { restart: false } }] },
];
