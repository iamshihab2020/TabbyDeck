import { DEFAULT_LOOK, newProfileFile, type ProfileFile, type Step } from './model.ts';
import { newId } from './ids.ts';
import { flowLayout, snugCols } from './layout.ts';

/** An app a key opens: found on the PC by its Start menu name; id is its usual Start app id, used when it is not installed yet. */
export interface TemplateApp { names: string[]; id?: string }

type S = { action: string; params?: Record<string, unknown> };
export interface TemplateKey { label: string; icon: string; bg?: string; fg?: string; steps?: S[]; long?: S[]; app?: TemplateApp; w?: number }

/** A ready-made deck: added as its own profile, one row of keys after another. */
export interface Template { id: string; name: string; icon: string; description: string; rows: (TemplateKey | null)[][] }

const KEY = '#25221f', FG = DEFAULT_LOOK.fg;
const hk = (label: string, icon: string, hotkey: string, bg = KEY, fg = FG): TemplateKey => ({ label, icon, bg, fg, steps: [{ action: 'keyboard.hotkey', params: { hotkey } }] });
const url = (label: string, icon: string, u: string, bg = '#1e3a5f', fg = FG): TemplateKey => ({ label, icon, bg, fg, steps: [{ action: 'system.openUrl', params: { url: u } }] });
const app = (label: string, names: string[], id?: string): TemplateKey => ({ label, icon: 'app-window', app: { names, id } });
const act = (label: string, icon: string, action: string, params: Record<string, unknown> = {}, bg = KEY, fg = FG): TemplateKey => ({ label, icon, bg, fg, steps: [{ action, params }] });
const place = (label: string, icon: string, where: string) => act(label, icon, 'system.placeWindow', { window: '', place: where, wait: 0 });

const cpu = act('CPU', 'cpu', 'info.show', { show: 'cpu' }, '#1e293b', '#93c5fd');
const ram = act('Memory', 'memory', 'info.show', { show: 'ram' }, '#1e293b', '#c4b5fd');
const clock = act('Clock', 'clock', 'info.show', { show: 'clock' }, '#1c1917', '#fde68a');
const pomodoro: TemplateKey = { ...act('Focus', 'timer', 'timer.pomodoro', { focus: 25, rest: 5 }, '#3b1d1d', '#fca5a5'), long: [{ action: 'timer.reset' }] };
const timer = (min: number, label = 'Timer'): TemplateKey => ({ ...act(label, 'hourglass-medium', 'timer.countdown', { minutes: min }, '#1c2b22', '#86efac'), long: [{ action: 'timer.reset' }] });
const dnd = act('Do not disturb', 'bell', 'system.dnd', { mode: 'toggle' }, '#2b2440', '#c4b5fd');
const mic = act('Mic', 'microphone-slash', 'system.micMute', { mode: 'toggle' }, '#33302b');
const mute = act('Mute', 'speaker-x', 'system.mute', { mode: 'toggle' }, '#33302b');
const volume = act('Volume', 'speaker-high', 'system.volumePanel');
const play = hk('Play', 'play', 'MediaPlayPause', '#f5a524', '#2a1a00');
const spotify = app('Spotify', ['Spotify'], 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify');
const slack = app('Slack', ['Slack'], 'com.tinyspeck.slackdesktop_8yrtsj140pw4g!Slack');
const meeting = (label: string, icon: string, control: string, bg = '#33302b', fg = FG) => act(label, icon, `meeting.${control}`, { app: 'auto' }, bg, fg);

export const TEMPLATES: Template[] = [
  {
    id: 'developer', name: 'Developer', icon: 'code', description: 'Your editor, terminal and Git; the VS Code keys for search, run and debug; windows, CPU and a focus timer.',
    rows: [
      [app('VS Code', ['Visual Studio Code'], 'Microsoft.VisualStudioCode'), app('Terminal', ['Terminal', 'Windows Terminal'], 'Microsoft.WindowsTerminal_8wekyb3d8bbwe!App'),
        app('GitHub Desktop', ['GitHub Desktop'], 'com.squirrel.GitHubDesktop.GitHubDesktop'), app('Docker', ['Docker Desktop'], 'Docker.DockerForWindows.Settings'),
        app('Postman', ['Postman'], 'com.squirrel.Postman.Postman'), url('GitHub', 'github-logo', 'https://github.com', KEY), url('Claude', 'asterisk', 'https://claude.ai', '#3a2317', '#f4a97f'),
        url('localhost', 'globe', 'http://localhost:3000')],
      [hk('Commands', 'command', 'Ctrl+Shift+P', '#1e3a5f'), hk('Go to file', 'file-code', 'Ctrl+P'), hk('Search all', 'magnifying-glass', 'Ctrl+Shift+F'), hk('Terminal', 'terminal-window', 'Ctrl+`'),
        hk('Comment', 'chat-text', 'Ctrl+/'), hk('Format', 'text-align-left', 'Shift+Alt+F'), hk('Rename', 'pencil-simple', 'F2'), hk('Definition', 'arrow-square-out', 'F12')],
      [hk('Run', 'play', 'F5', '#14532d', '#86efac'), hk('Stop', 'stop', 'Shift+F5', '#7f1d1d', '#fecaca'), hk('Step over', 'arrow-bend-down-right', 'F10'), hk('Step into', 'arrow-down', 'F11'),
        hk('Save', 'floppy-disk', 'Ctrl+S'), hk('Undo', 'arrow-counter-clockwise', 'Ctrl+Z'), hk('Redo', 'arrow-clockwise', 'Ctrl+Y'), hk('DevTools', 'bug', 'Ctrl+Shift+I')],
      [place('Left half', 'sidebar', 'left'), place('Right half', 'columns', 'right'), place('Other screen', 'arrow-square-out', 'next-screen'), hk('Task Manager', 'pulse', 'Ctrl+Shift+Esc'),
        cpu, ram, pomodoro, dnd],
    ],
  },
  {
    id: 'office', name: 'Office', icon: 'briefcase', description: 'Mail, Teams and Office apps; meeting keys for whichever call you are in; copy, paste and window keys; Do not disturb and a focus timer.',
    rows: [
      [app('Outlook', ['Outlook', 'Outlook (classic)'], 'Microsoft.OutlookForWindows_8wekyb3d8bbwe!Microsoft.OutlookforWindows'), app('Teams', ['Microsoft Teams'], 'MSTeams_8wekyb3d8bbwe!MSTeams'),
        app('Word', ['Word'], 'Microsoft.Office.WINWORD.EXE.15'), app('Excel', ['Excel'], 'Microsoft.Office.EXCEL.EXE.15'), app('PowerPoint', ['PowerPoint'], 'Microsoft.Office.POWERPNT.EXE.15'),
        app('OneNote', ['OneNote'], 'Microsoft.Office.ONENOTE.EXE.15'), slack, app('Zoom', ['Zoom Workplace', 'Zoom'])],
      [meeting('Mute', 'microphone-slash', 'mic'), meeting('Camera', 'video-camera', 'camera'), meeting('Raise hand', 'hand', 'hand', '#3a2f12', '#fcd34d'), meeting('Leave', 'phone-slash', 'leave', '#7f1d1d', '#fecaca'),
        dnd, volume, clock, pomodoro, url('Calendar', 'calendar', 'https://outlook.office.com/calendar')],
      [hk('Copy', 'copy', 'Ctrl+C'), hk('Paste', 'clipboard', 'Ctrl+V'), hk('Cut', 'scissors', 'Ctrl+X'), hk('Undo', 'arrow-counter-clockwise', 'Ctrl+Z'),
        hk('Redo', 'arrow-clockwise', 'Ctrl+Y'), hk('Find', 'magnifying-glass', 'Ctrl+F'), hk('Save', 'floppy-disk', 'Ctrl+S'), hk('Print', 'printer', 'Ctrl+P')],
      [hk('Snip', 'crop', 'Win+Shift+S', '#3b2a4d'), place('Left half', 'sidebar', 'left'), place('Right half', 'columns', 'right'), place('Other screen', 'arrow-square-out', 'next-screen'),
        hk('Desktop', 'desktop', 'Win+D'), hk('Clipboard', 'clipboard-text', 'Win+V'), hk('Emoji', 'smiley', 'Win+.', KEY, '#fcd34d'), act('Lock', 'lock', 'system.lock', {}, '#3a1d1d', '#fca5a5')],
    ],
  },
  {
    id: 'streamer', name: 'Streamer', icon: 'broadcast', description: 'OBS, chat and music; scene, stream and record keys (set the same keys in OBS under Settings, Hotkeys); mic, sound and live stats.',
    rows: [
      [app('OBS Studio', ['OBS Studio'], '{6D809377-6AF0-444B-8957-A3773F02200E}\\obs-studio\\bin\\64bit\\obs64.exe'), app('Discord', ['Discord'], 'com.squirrel.Discord.Discord'), spotify,
        app('Streamlabs', ['Streamlabs Desktop', 'Streamlabs OBS']), url('Twitch', 'twitch-logo', 'https://dashboard.twitch.tv', '#3b1f63', '#d8b4fe'),
        url('YouTube Studio', 'youtube-logo', 'https://studio.youtube.com', '#450a0a', '#fca5a5'), hk('Game Bar', 'game-controller', 'Win+G'), hk('Save clip', 'film-strip', 'Win+Alt+G')],
      [hk('Scene 1', 'number-circle-one', 'Ctrl+Shift+F1', '#1e3a5f'), hk('Scene 2', 'number-circle-two', 'Ctrl+Shift+F2', '#1e3a5f'), hk('Scene 3', 'number-circle-three', 'Ctrl+Shift+F3', '#1e3a5f'),
        hk('Scene 4', 'number-circle-four', 'Ctrl+Shift+F4', '#1e3a5f'), hk('Go live', 'broadcast', 'Ctrl+Shift+F5', '#7f1d1d', '#fecaca'), hk('Record', 'record', 'Ctrl+Shift+F6', '#7f1d1d', '#fecaca'), mic, mute],
      [volume, { ...act('Now playing', 'music-notes', 'media.nowPlaying', {}, '#1f1b2e', '#e9d5ff'), long: [{ action: 'keyboard.hotkey', params: { hotkey: 'MediaNext' } }] },
        hk('Previous', 'skip-back', 'MediaPrev'), play, hk('Next', 'skip-forward', 'MediaNext'), act('Output', 'headphones', 'audio.output', { output: '' }), dnd, act('Brightness', 'monitor', 'display.brightnessPanel', {}, KEY, '#fcd34d')],
      [cpu, ram, clock, timer(5, 'Break timer'), null, null, null, null],
    ],
  },
  {
    id: 'music', name: 'Music', icon: 'music-notes', description: 'Your music apps, what is playing with its cover, play and skip, volume, outputs and Bluetooth headphones.',
    rows: [
      [spotify, app('Apple Music', ['Apple Music'], 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App'), url('YouTube Music', 'youtube-logo', 'https://music.youtube.com', '#450a0a', '#fca5a5'),
        app('Media Player', ['Media Player'], 'Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic'), app('VLC', ['VLC media player'], '{6D809377-6AF0-444B-8957-A3773F02200E}\\VideoLAN\\VLC\\vlc.exe'),
        url('SoundCloud', 'cloud', 'https://soundcloud.com', '#431407', '#fdba74'), app('Tidal', ['TIDAL']), app('Deezer', ['Deezer'])],
      [{ ...act('Now playing', 'music-notes', 'media.nowPlaying', {}, '#1f1b2e', '#e9d5ff'), long: [{ action: 'keyboard.hotkey', params: { hotkey: 'MediaNext' } }], w: 2 },
        hk('Previous', 'skip-back', 'MediaPrev'), play, hk('Next', 'skip-forward', 'MediaNext'), hk('Stop', 'stop', 'MediaStop'), mute],
      [act('Volume −', 'speaker-low', 'system.volumeStep', { delta: -5 }), volume, act('Volume +', 'speaker-high', 'system.volumeStep', { delta: 5 }), act('Output', 'headphones', 'audio.output', { output: '' }),
        act('Bluetooth', 'bluetooth', 'system.bluetoothPanel', {}, '#1e293b', '#93c5fd'), dnd, act('Night light', 'moon-stars', 'display.nightLight', { mode: 'toggle' }, '#2b2440', '#fcd34d'), clock, timer(30, 'Sleep timer')],
    ],
  },
];

/** Where the PC has an app a key needs: the path that opens it, its icon, and whether it is installed now. null leaves the key out. */
export type AppResolver = (a: TemplateApp) => { path: string; image?: string; here?: boolean } | null;

/**
 * The template as a new profile, sized to its keys: the keys keep their order, and the grid gets as many columns as
 * fills its rows with the apps this PC has. Keys for apps the resolver has no path for are left out; apps not
 * installed yet go last, so the space the decks keep for them is at the end.
 */
export function templateProfileFile(t: Template, resolve: AppResolver, order = 0): ProfileFile {
  const keys = t.rows.flat().filter((k): k is TemplateKey => !!k && (!k.app || !!resolve(k.app)));
  const later = (k: TemplateKey) => !!k.app && resolve(k.app)!.here === false;
  const ordered = [...keys.filter(k => !later(k)), ...keys.filter(later)];
  const cells = (list: TemplateKey[]) => list.reduce((n, k) => n + (k.w ?? 1), 0);
  const cols = snugCols(cells(keys.filter(k => !later(k))));
  const flowed = flowLayout(ordered.map((k, i) => ({ k, x: 0, y: i, w: Math.min(k.w ?? 1, cols), h: 1 })), cols);
  const f = newProfileFile(t.name, cols, flowed.rows, order);
  f.profile.gap = 16;
  const steps = (list: S[]): Step[] => list.map(s => ({ id: newId(), action: s.action, params: s.params ?? {} }));
  for (const { k, x, y, w } of flowed.widgets) {
    const found = k.app ? resolve(k.app) : null;
    const look = { ...DEFAULT_LOOK, label: k.label, icon: k.icon, bg: k.bg ?? KEY, fg: k.fg ?? FG, ...(found?.image ? { image: found.image, imageFit: 'icon' as const } : {}) };
    const press = found ? [{ id: newId(), action: 'system.launch', params: { path: found.path, args: '' } }] : steps(k.steps ?? []);
    f.widgets.push({ id: newId(), folderId: f.profile.rootFolderId, x, y, w, h: 1, look, config: { kind: 'button', policy: 'ignore', triggers: { press, ...(k.long ? { long: steps(k.long) } : {}) } } });
  }
  return f;
}
