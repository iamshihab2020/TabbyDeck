// Dev-only: writes a demo deck into the dev data folder so the UI can be previewed before the editor exists.
import path from 'node:path';
import { DEFAULT_LOOK, newId, type Look, type Step } from '@tabbydeck/shared';
import { Store } from '../store/store.ts';
import { nullLogger } from '../log/logger.ts';

const root = process.env.TABBY_ROOT ?? process.cwd();
const store = new Store({ dir: process.env.TABBY_DATA ?? path.join(root, '.data'), log: nullLogger() });
await store.load();

const main = store.profiles()[0];
for (const w of [...main.widgets]) store.deleteWidget(w.id);
for (const f of main.folders.filter(f => f.parentId === main.profile.rootFolderId)) store.deleteFolder(f.id); // re-seeding must not pile up folders
store.updateProfile(main.profile.id, { cols: 10, rows: 5, gap: 10, bg: '#121110' });
const rootId = main.profile.rootFolderId;
const look = (label: string, icon: string, bg: string, fg = '#efeae3'): Look => ({ ...DEFAULT_LOOK, label, icon, bg, fg });
const step = (action: string, params: Record<string, unknown> = {}): Step => ({ id: newId(), action, params });
const button = (folderId: string, x: number, y: number, l: Look, steps: Step[], w = 1, h = 1) =>
  store.createWidget(folderId, { x, y, w, h, look: l, config: { kind: 'button', policy: 'ignore', triggers: { press: steps } } });

const media = store.createFolder(main.profile.id, rootId, 'Media');

button(rootId, 0, 0, look('Notepad', 'notepad', '#25221f'), [step('system.launch', { path: 'notepad.exe' })]);
button(rootId, 1, 0, look('Browser', 'globe', '#1e3a5f'), [step('system.openUrl', { url: 'https://www.google.com' })]);
button(rootId, 2, 0, look('Snip', 'scissors', '#3b2a4d'), [step('keyboard.hotkey', { hotkey: 'Win+Shift+S' })]);
button(rootId, 3, 0, look('Terminal', 'terminal-window', '#16302b'), [step('system.launch', { path: 'wt.exe' })]);
button(rootId, 4, 0, look('Calculator', 'calculator', '#25221f'), [step('system.launch', { path: 'calc.exe' })]);
button(rootId, 5, 0, look('Lock', 'lock', '#3a1d1d', '#fca5a5'), [step('system.lock')]);
button(rootId, 0, 1, look('Play / Pause', 'play-pause', '#f5a524', '#2a1a00'), [step('keyboard.hotkey', { hotkey: 'MediaPlayPause' })], 2, 1);
button(rootId, 2, 1, look('Previous', 'skip-back', '#25221f'), [step('keyboard.hotkey', { hotkey: 'MediaPrev' })]);
button(rootId, 3, 1, look('Next', 'skip-forward', '#25221f'), [step('keyboard.hotkey', { hotkey: 'MediaNext' })]);
button(rootId, 4, 1, look('Mute', 'speaker-x', '#262b33'), [step('system.mute', { mode: 'toggle' })]);
button(rootId, 5, 1, look('Mic', 'microphone-slash', '#262b33'), [step('system.micMute', { mode: 'toggle' })]);
button(rootId, 0, 2, look('Volume −', 'speaker-low', '#25221f'), [step('system.volumeStep', { delta: -5 })]);
button(rootId, 1, 2, look('Volume +', 'speaker-high', '#25221f'), [step('system.volumeStep', { delta: 5 })]);
store.createWidget(rootId, { x: 2, y: 2, w: 1, h: 1, look: look('Media', 'music-notes', '#2b2440'), config: { kind: 'folder', targetFolderId: media.id } });
button(rootId, 3, 2, look('Copy', 'copy', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+C' })]);
button(rootId, 4, 2, look('Paste', 'clipboard', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+V' })]);
button(rootId, 5, 2, look('Screenshot', 'camera', '#25221f'), [step('system.screenshot')]);

button(media.id, 0, 0, look('Spotify', 'spotify-logo', '#14532d', '#86efac'), [step('system.openUrl', { url: 'spotify:' })]);
button(media.id, 1, 0, look('YouTube', 'youtube-logo', '#450a0a', '#fca5a5'), [step('system.openUrl', { url: 'https://youtube.com' })]);

button(rootId, 6, 0, look('Discord', 'discord-logo', '#2b2d6e', '#c7d2fe'), [step('system.openUrl', { url: 'discord:' })]);
button(rootId, 7, 0, look('Steam', 'steam-logo', '#16233b'), [step('system.openUrl', { url: 'steam:' })]);
button(rootId, 6, 1, look('Spotify', 'spotify-logo', '#14532d', '#86efac'), [step('system.openUrl', { url: 'spotify:' })]);
button(rootId, 7, 1, look('YouTube', 'youtube-logo', '#450a0a', '#fca5a5'), [step('system.openUrl', { url: 'https://youtube.com' })]);
button(rootId, 6, 2, look('Task View', 'squares-four', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Win+Tab' })]);
button(rootId, 7, 2, look('Desktop', 'desktop', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Win+D' })]);
button(rootId, 0, 3, look('Undo', 'arrow-counter-clockwise', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+Z' })]);
button(rootId, 1, 3, look('Redo', 'arrow-clockwise', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+Y' })]);
button(rootId, 2, 3, look('Save', 'floppy-disk', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+S' })]);
button(rootId, 3, 3, look('Find', 'magnifying-glass', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+F' })]);
button(rootId, 4, 3, look('Settings', 'gear-six', '#25221f'), [step('system.openUrl', { url: 'ms-settings:' })]);
button(rootId, 5, 3, look('Sleep', 'moon', '#1e1b3a', '#c4b5fd'), [step('system.sleep')]);
button(rootId, 6, 3, look('Restart', 'arrows-clockwise', '#3a1d1d', '#fca5a5'), [step('system.shutdown', { restart: true })]);
button(rootId, 7, 3, look('Power', 'power', '#3a1d1d', '#fca5a5'), [step('system.shutdown', { restart: false })]);
button(rootId, 8, 0, look('VS Code', 'code', '#0b3d62', '#7dd3fc'), [step('system.launch', { path: '%LOCALAPPDATA%/Programs/Microsoft VS Code/Code.exe' })]);
button(rootId, 8, 1, look('Files', 'folder-open', '#3a2f12', '#fcd34d'), [step('system.launch', { path: 'explorer.exe' })]);
button(rootId, 8, 2, look('Task Manager', 'pulse', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Ctrl+Shift+Esc' })]);
button(rootId, 8, 3, look('Emoji', 'smiley', '#25221f'), [step('keyboard.hotkey', { hotkey: 'Win+.' })]);
if (store.profiles().length < 2) store.createProfile('Streaming', 5, 3);
await store.flush();
console.log('demo deck seeded');
