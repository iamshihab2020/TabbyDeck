import { DEFAULT_LOOK, newProfileFile, type Look, type ProfileFile, type Step } from './model.ts';
import { newId } from './ids.ts';

type P = Record<string, unknown>;
type S = [action: string, params?: P];
/** One key: its look, what a press does (one action, or several steps in order), and optionally what a long press does. */
type Key = [label: string, icon: string, bg: string, fg: string, action: string | S[], params?: P, long?: S];
type Rows = { department: string; keys: Key[] }[];
const FG = DEFAULT_LOOK.fg, KEY = '#25221f', CL = '#2a1d17', CLF = '#f4a97f';
const enter: S = ['keyboard.hotkey', { hotkey: 'Enter' }];
const say = (text: string): S[] => [['keyboard.type', { text }], enter];
/** A key that opens a Start app by its usual id. On a fresh install the host finds it by id or by the key's name and gives the key the app's icon; on a PC without it the key is left off the deck. */
const app = (label: string, id: string, icon: string): Key => [label, icon, KEY, FG, 'system.launch', { path: `shell:AppsFolder\\${id}`, args: '' }];
const VSCODE = 'Microsoft.VisualStudioCode', GITHUB = 'com.squirrel.GitHubDesktop.GitHubDesktop', SLACK = 'com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack', WARP = 'dev.warp.Warp';

/**
 * The deck a fresh install starts with: one department per row, sound on top, apps, info, editing, windows, and power
 * along the bottom with Shut down in the corner. Apps the PC does not have are left off.
 */
export const STARTER_ROWS: Rows = [
  { department: 'Sound', keys: [
    ['Play', 'play', '#14532d', FG, 'keyboard.hotkey', { hotkey: 'MediaPlayPause' }],
    ['Volume', 'speaker-high', KEY, FG, 'system.volumePanel'],
    ['Mute', 'speaker-x', '#33302b', FG, 'system.mute', { mode: 'toggle' }],
    ['Mic', 'microphone-slash', '#33302b', FG, 'system.micMute', { mode: 'toggle' }],
    ['Output', 'headphones', KEY, FG, 'audio.output', { output: '' }],
    ['Bluetooth', 'bluetooth', '#1e293b', '#93c5fd', 'system.bluetoothPanel'],
    ['Brightness', 'monitor', KEY, '#fcd34d', 'display.brightnessPanel'],
    ['Do not disturb', 'bell', '#2b2440', '#c4b5fd', 'system.dnd', { mode: 'toggle' }],
  ] },
  { department: 'Apps', keys: [
    app('VS Code', VSCODE, 'code'),
    app('GitHub Desktop', GITHUB, 'git-branch'),
    app('Slack', SLACK, 'slack-logo'),
    app('Warp', WARP, 'terminal'),
    app('File Pilot', 'FPilot.exe', 'folder-open'),
    app('Word', 'Microsoft.Office.WINWORD.EXE.15', 'file-text'),
    ['Mail', 'envelope', '#1e3a5f', FG, 'system.openUrl', { url: 'https://mail.google.com' }],
    app('Calculator', 'Microsoft.WindowsCalculator_8wekyb3d8bbwe!App', 'calculator'),
  ] },
  { department: 'Browsers & info', keys: [
    app('Google Chrome', 'Chrome', 'globe'),
    app('Brave', 'Brave', 'globe'),
    app('Copilot', 'Microsoft.MicrosoftOfficeHub_8wekyb3d8bbwe!Microsoft.MicrosoftOfficeHub', 'sparkle'),
    ['Settings', 'gear-six', KEY, FG, 'system.openUrl', { url: 'ms-settings:' }],
    ['Snip', 'crop', '#3b2a4d', FG, 'keyboard.hotkey', { hotkey: 'Win+Shift+S' }],
    ['CPU temp', 'thermometer-hot', '#3b1d1d', '#fca5a5', 'info.temperature', { source: 'cpu', city: '', unit: 'c' }],
    ['CPU', 'cpu', '#1e293b', '#93c5fd', 'info.show', { show: 'cpu' }],
    ['Memory', 'memory', '#1e293b', '#c4b5fd', 'info.show', { show: 'ram' }],
  ] },
  { department: 'Editing', keys: [
    ['Select all', 'selection', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+A' }],
    ['Copy', 'copy', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+C' }],
    ['Paste', 'clipboard', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+V' }],
    ['Clipboard', 'clipboard-text', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+V' }],
    ['Find', 'magnifying-glass', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+F' }],
    ['Weather', 'cloud-sun', '#1e3a5f', '#fde68a', 'info.temperature', { source: 'weather', city: '', unit: 'c' }],
    ['Clock', 'clock', '#1c1917', '#fde68a', 'info.show', { show: 'clock' }],
    ['Focus', 'timer', '#3b1d1d', '#fca5a5', 'timer.pomodoro', { focus: 25, rest: 5 }, ['timer.reset']],
  ] },
  { department: 'Windows', keys: [
    ['Switch app', 'browsers', KEY, FG, 'system.switchApp'],
    ['Task View', 'squares-four', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+Tab' }],
    ['Desktop', 'desktop', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+D' }],
    ['Left half', 'sidebar', KEY, FG, 'system.placeWindow', { window: '', place: 'left', wait: 0 }],
    ['Right half', 'columns', KEY, FG, 'system.placeWindow', { window: '', place: 'right', wait: 0 }],
    ['Max / Min', 'corners-out', KEY, FG, 'system.placeWindow', { window: '', place: 'maximize', wait: 0 }, ['system.placeWindow', { window: '', place: 'minimize', wait: 0 }]],
    ['Other screen', 'arrow-square-out', KEY, FG, 'system.placeWindow', { window: '', place: 'next-screen', wait: 0 }],
    ['Trackpad', 'cursor', '#1e3a5f', FG, 'mouse.trackpad'],
  ] },
  { department: 'Screens & power', keys: [
    ['Night light', 'moon-stars', '#2b2440', '#fcd34d', 'display.nightLight', { mode: 'toggle' }],
    ['Extend', 'columns', '#1e3a5f', FG, 'display.project', { mode: 'extend' }],
    ['Duplicate', 'copy-simple', '#14532d', FG, 'display.project', { mode: 'duplicate' }],
    ['Task Manager', 'pulse', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+Esc' }],
    ['Screen off', 'eye-slash', '#1a1f2e', '#93c5fd', 'display.screensOff', { screen: 'all' }, ['display.screensOff', { screen: 'all' }]],
    ['Sleep', 'moon', '#1e1b3a', '#c4b5fd', 'system.sleep'],
    ['Lock', 'lock', '#bc7401', FG, 'system.lock'],
    ['Shut down', 'power', '#a80000', FG, 'system.shutdown', { restart: false }],
  ] },
];

/** The second deck a fresh install gets: coding apps, Claude Code in the terminal, and editor shortcuts. */
export const WORK_ROWS: Rows = [
  { department: 'Apps', keys: [
    app('Visual Studio Code', VSCODE, 'code'),
    app('GitHub Desktop', GITHUB, 'git-branch'),
    app('Warp', WARP, 'terminal'),
    ['GitHub', 'github-logo', KEY, FG, 'system.openUrl', { url: 'https://github.com/pulls' }],
    app('Google Chrome', 'Chrome', 'globe'),
    app('Slack', SLACK, 'slack-logo'),
    app('Hubstaff', '{6D809377-6AF0-444B-8957-A3773F02200E}\\Hubstaff\\HubstaffClient.exe', 'clock'),
    app('Claude', 'Chrome._crx_fmpnlaolkdacoja.UserData.Profile1', 'asterisk'),
  ] },
  { department: 'Claude Code', keys: [
    ['VS Code + Claude', 'code', '#3a2317', CLF, [['system.launch', { path: '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe' }], ['deck.wait', { seconds: 5 }], ['keyboard.hotkey', { hotkey: 'Ctrl+Shift+`' }], ['deck.wait', { seconds: 2 }], ...say('claude')]],
    ['Warp + Claude', 'terminal', '#3a2317', CLF, [['system.launch', { path: `shell:AppsFolder\\${WARP}`, args: '' }], ['deck.wait', { seconds: 3 }], ...say('claude')]],
    ['Resume', 'arrows-counter-clockwise', '#3a2317', CLF, say('claude --resume')],
    ['Continue', 'caret-double-right', CL, CLF, say('continue')],
    ['Mode', 'sliders-horizontal', CL, CLF, 'keyboard.hotkey', { hotkey: 'Shift+Tab' }],
    ['Compact', 'arrows-in', CL, CLF, say('/compact')],
    ['Usage', 'gauge', CL, CLF, say('/usage')],
    ['Paste image', 'image', CL, CLF, 'keyboard.hotkey', { hotkey: 'Alt+V' }],
  ] },
  { department: 'Claude Code', keys: [
    ['Model', 'robot', CL, CLF, say('/model')],
    ['Opus', 'sparkle', CL, CLF, say('/model opus')],
    ['Sonnet', 'lightning', CL, CLF, say('/model sonnet')],
    ['Effort', 'brain', CL, CLF, say('/effort')],
    ['Review', 'checks', CL, CLF, say('/review')],
    ['Clear', 'eraser', CL, CLF, say('/clear')],
    ['Stop', 'hand', '#7f1d1d', '#fecaca', 'keyboard.hotkey', { hotkey: 'Esc' }],
    ['Yes / Enter', 'check', '#14532d', '#bbf7d0', 'keyboard.hotkey', { hotkey: 'Enter' }],
  ] },
  { department: 'Editor', keys: [
    ['Copy', 'copy', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+C' }],
    ['Paste', 'clipboard', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+V' }],
    ['Clipboard', 'clipboard-text', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+V' }],
    ['Hard reload', 'arrows-clockwise', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+R' }],
    ['Go to file', 'file-code', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+P' }],
    ['Search all', 'magnifying-glass', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+F' }],
    ['Commands', 'command', '#1e3a5f', FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+P' }],
    ['VS Code terminal', 'terminal-window', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+`' }],
  ] },
  { department: 'Snips & info', keys: [
    ['Task Manager', 'pulse', KEY, FG, 'keyboard.hotkey', { hotkey: 'Ctrl+Shift+Esc' }],
    ['Snip area', 'selection', '#3b2a4d', FG, 'system.openUrl', { url: 'ms-screenclip://capture/image?rectangle' }],
    ['Snip window', 'app-window', '#3b2a4d', FG, 'system.openUrl', { url: 'ms-screenclip://capture/image?window' }],
    ['Clock', 'clock', '#1c1917', '#fde68a', 'info.show', { show: 'clock' }],
    ['Weather', 'cloud-sun', '#1e3a5f', '#fde68a', 'info.temperature', { source: 'weather', city: '', unit: 'c' }],
    ['CPU', 'cpu', '#1e293b', '#93c5fd', 'info.show', { show: 'cpu' }],
    ['CPU temp', 'thermometer-hot', '#3b1d1d', '#fca5a5', 'info.temperature', { source: 'cpu', city: '', unit: 'c' }],
    ['Memory', 'memory', '#1e293b', '#c4b5fd', 'info.show', { show: 'ram' }],
  ] },
  { department: 'Windows', keys: [
    ['Switch app', 'browsers', KEY, FG, 'system.switchApp'],
    ['Left half', 'sidebar', KEY, FG, 'system.placeWindow', { window: '', place: 'left', wait: 0 }],
    ['Right half', 'columns', KEY, FG, 'system.placeWindow', { window: '', place: 'right', wait: 0 }],
    ['Other screen', 'arrow-square-out', KEY, FG, 'system.placeWindow', { window: '', place: 'next-screen', wait: 0 }],
    ['Max / Min', 'corners-out', KEY, FG, 'system.placeWindow', { window: '', place: 'maximize', wait: 0 }, ['system.placeWindow', { window: '', place: 'minimize', wait: 0 }]],
    ['Desktop', 'desktop', KEY, FG, 'keyboard.hotkey', { hotkey: 'Win+D' }],
    ['Mic', 'microphone-slash', '#33302b', FG, 'system.micMute', { mode: 'toggle' }],
    ['Do not disturb', 'bell', '#2b2440', '#c4b5fd', 'system.dnd', { mode: 'toggle' }],
  ] },
];

const step = ([action, params]: S): Step => ({ id: newId(), action, params: params ?? {} });

function deck(name: string, rows: Rows, order: number, gap: number, tiles: ProfileFile['profile']['tiles']): ProfileFile {
  const f = newProfileFile(name, Math.max(...rows.map(r => r.keys.length)), rows.length, order);
  f.profile.gap = gap;
  f.profile.bg = '#0f1420';
  f.profile.tiles = tiles;
  rows.forEach((row, y) => row.keys.forEach(([label, icon, bg, fg, action, params, long], x) => {
    const look: Look = { ...DEFAULT_LOOK, label, icon, bg, fg };
    const press = typeof action === 'string' ? [step([action, params])] : action.map(step);
    f.widgets.push({ id: newId(), folderId: f.profile.rootFolderId, x, y, w: 1, h: 1, look, config: { kind: 'button', policy: 'ignore', triggers: long ? { press, long: [step(long)] } : { press } } });
  }));
  return f;
}

/** An 8 x 6 "Main" profile laid out from STARTER_ROWS. */
export const starterProfileFile = (): ProfileFile => deck('Main', STARTER_ROWS, 0, 10, 'sunken');
/** An 8 x 6 "Work" profile laid out from WORK_ROWS. */
export const workProfileFile = (): ProfileFile => deck('Work', WORK_ROWS, 1, 8, 'sunken');
/** Everything a fresh install starts with, Main first. */
export const starterProfileFiles = (): ProfileFile[] => [starterProfileFile(), workProfileFile()];
