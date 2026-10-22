import type { ActionRegistry } from '../engine/registry.ts';
import type { Native } from '../native/types.ts';
import { parseHotkey } from '../native/win/keys.ts';
import { pause } from './windows.ts';

type Control = 'mic' | 'camera' | 'hand' | 'leave';

interface MeetingApp {
  name: string;
  /** Tried in order: the call's own window first, then the app. */
  windows: string[];
  /** How the app shows up among the apps using the microphone: a program file, or the start of a Store package name. */
  uses: string[];
  /** The app's own shortcuts. A control the app has no shortcut for is left out. */
  keys: Partial<Record<Control, string>>;
  confirmLeave?: string;
}

const BROWSERS = ['chrome.exe', 'msedge.exe', 'brave.exe', 'firefox.exe', 'opera.exe', 'vivaldi.exe', 'arc.exe'];

/**
 * Google Meet runs in a browser tab titled "Meet - <code>"; closing that tab is how Meet is left by keyboard.
 * Slack's Ctrl+Shift+H starts a huddle as well as leaving one, and Slack and Discord have no camera shortcut.
 */
export const MEETING_APPS: Record<string, MeetingApp> = {
  teams: { name: 'Microsoft Teams', windows: ['ms-teams.exe', 'teams.exe', 'Microsoft Teams'], uses: ['ms-teams.exe', 'teams.exe', 'msteams_'], keys: { mic: 'Ctrl+Shift+M', camera: 'Ctrl+Shift+O', hand: 'Ctrl+Shift+K', leave: 'Ctrl+Shift+H' } },
  zoom: { name: 'Zoom', windows: ['Zoom Meeting', 'zoom.exe'], uses: ['zoom.exe'], keys: { mic: 'Alt+A', camera: 'Alt+V', hand: 'Alt+Y', leave: 'Alt+Q' }, confirmLeave: 'Enter' },
  meet: { name: 'Google Meet', windows: ['Meet - '], uses: BROWSERS, keys: { mic: 'Ctrl+D', camera: 'Ctrl+E', hand: 'Ctrl+Alt+H', leave: 'Ctrl+W' } },
  slack: { name: 'Slack huddle', windows: ['slack.exe'], uses: ['slack.exe', 'com.tinyspeck.slackdesktop'], keys: { mic: 'Ctrl+Shift+Space', leave: 'Ctrl+Shift+H' } },
  discord: { name: 'Discord', windows: ['discord.exe'], uses: ['discord.exe', 'discord'], keys: { mic: 'Ctrl+Shift+M' } },
};

const AUTO = 'auto';
// Windows that only exist during a call, for when nothing is using the microphone (muted at the PC, say).
const CALL_WINDOWS: [string, string][] = [['zoom', 'Zoom Meeting'], ['meet', 'Meet - ']];

const APP_FIELD = {
  type: 'enum' as const, title: 'Meeting app', default: AUTO,
  options: [AUTO, ...Object.keys(MEETING_APPS)], labels: ['The app you are in a call with', ...Object.values(MEETING_APPS).map(a => a.name)],
};

/** The meeting app that is using the microphone, preferring a real call app over a browser. */
export function appUsingMic(users: string[]): string | null {
  const hit = (id: string) => users.some(u => MEETING_APPS[id].uses.some(m => u === m || u.startsWith(m)));
  return Object.keys(MEETING_APPS).filter(id => id !== 'meet').find(hit) ?? (hit('meet') ? 'meet' : null);
}

function press(n: Native, combo: string) {
  const r = parseHotkey(combo); if (!r.ok) throw new Error(r.error);
  const down: number[] = [];
  try { for (const vk of r.keys) { n.input.keyDown(vk); down.push(vk); } } finally { for (const vk of down.reverse()) n.input.keyUp(vk); }
}

export function registerMeeting(registry: ActionRegistry, deps: { native: Native }): void {
  const n = deps.native;
  const find = async (choice: string): Promise<string> => {
    if (choice !== AUTO) return choice;
    const byMic = appUsingMic(await n.system.micUsers());
    if (byMic) return byMic;
    for (const [id, w] of CALL_WINDOWS) if (n.system.windows().some(x => x.title.includes(w))) return id;
    throw new Error('No call found. Join a call first, or choose the meeting app in this key.');
  };
  const def = (control: Control, name: string, description: string) => registry.register({
    id: `meeting.${control}`, name, group: 'Meetings', description, schema: { app: APP_FIELD },
    run: async (p, ctx) => {
      const id = await find(String(p.app ?? AUTO)), app = MEETING_APPS[id];
      if (!app) throw new Error('Choose a meeting app');
      const keys = app.keys[control];
      if (!keys) throw new Error(`${app.name} has no shortcut for this`);
      let found = false;
      for (const w of app.windows) if (await n.system.focusWindow(w)) { found = true; break; }
      if (!found) throw new Error(id === 'meet' ? 'Open the Google Meet tab first' : `${app.name} is not open`);
      await pause(150, ctx.signal); // let Windows finish moving the focus before the keys go
      press(n, keys);
      if (control === 'leave' && app.confirmLeave) { await pause(400, ctx.signal); press(n, app.confirmLeave); }
    },
  });
  def('mic', 'Meeting: mute', 'Mute or unmute yourself in the call. The Mute microphone action mutes it for every app at once.');
  def('camera', 'Meeting: camera', 'Turn your camera on or off (Teams, Zoom and Google Meet). The key lights while any app uses the camera.');
  def('hand', 'Meeting: raise hand', 'Raise or lower your hand (Teams, Zoom and Google Meet)');
  def('leave', 'Meeting: leave', 'Leave the call');
}
