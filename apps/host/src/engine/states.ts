import { createHash } from 'node:crypto';
import { levelOf, levelView, panelOf, statefulAction, type AppSound, type AudioOutput, type Bluetooth, type Look, type Screen, type Widget } from '@tabbydeck/shared';
import type { Store } from '../store/store.ts';
import type { Native, WindowInfo } from '../native/types.ts';
import { matchesWindow } from '../native/match.ts';
import { expandEnv } from '../integrations/system.ts';
import type { Clients } from '../server/clients.ts';

/** What a key shows of the PC's live state: on or off, a level with the key greyed out at its end, or the screens. */
export interface Live {
  active?: boolean; running?: boolean; value?: string; disabled?: boolean; screens?: Screen[]; level?: number; muted?: boolean; bluetooth?: Bluetooth;
  apps?: AppSound[]; outputs?: AudioOutput[]; big?: string;
  /** Replaces parts of the key's own look while the state lasts (Now playing shows the title and cover). */
  look?: Partial<Look>;
}

// The state each panel shows: the screens for brightness, level and mute for volume.
const PANEL_STATE: Record<string, string> = { brightness: 'screens', volume: 'sound', bluetooth: 'bluetoothPanel' };

// Keys whose first step reads a richer state than on or off.
const LIVE_STATE: Record<string, string> = { 'media.nowPlaying': 'nowPlaying', 'audio.output': 'outputs', 'system.launch': 'windows', 'system.focus': 'windows' };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Whether the app a key opens (system.launch) or switches to (system.focus) has a window open. A program path matches
 * its program file; a Start app (shell:AppsFolder\<id>) matches by its Start name: the program file (GitHub Desktop is
 * githubdesktop.exe) or the end of the title ("… - Visual Studio Code"). Files, folders and links never count.
 */
export function appOpen(action: string, params: Record<string, unknown>, windows: WindowInfo[], appName: (id: string) => string | undefined = () => undefined): boolean {
  // Program Manager is the desktop itself, always there under explorer.exe.
  const open = windows.filter(w => !(w.exe === 'explorer.exe' && w.title === 'Program Manager'));
  if (action === 'system.focus') return open.some(w => matchesWindow(String(params.title ?? ''), w));
  const p = expandEnv(String(params.path ?? '').trim()), app = /^shell:AppsFolder\\(.+)$/i.exec(p);
  const exeIn = (s: string) => /\.exe$/i.test(s) ? s.split(/[\\/]/).pop()!.toLowerCase() : '';
  if (!app) { const exe = exeIn(p); return !!exe && open.some(w => w.exe === exe); }
  const exe = exeIn(app[1]); if (exe) return open.some(w => w.exe === exe); // {known folder}\path\app.exe
  const name = appName(app[1]), title = name?.toLowerCase();
  const ids = [name && norm(name), norm(app[1].split('!')[0].split('_')[0].split('.').pop() ?? '')].filter(Boolean);
  return open.some(w => ids.includes(norm(w.exe.replace(/\.exe$/, ''))) || (!!title && w.title.replace(/[​-‍]/g, '').toLowerCase().endsWith(title)));
}

type Sound = { level: number; muted: boolean; apps: AppSound[]; outputs: AudioOutput[] };
type Track = { track: { title: string; artist: string; playing: boolean; art?: string } | null };
type State = boolean | number | Screen[] | Sound | Bluetooth | Track | { outputs: AudioOutput[] } | { running: string[] };

/** The cover art of what is playing, served to the decks at /assets/u/<id>. */
export interface Art { id: string; type: string; data: Buffer }
const ART_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp' };
export const ART_ID = /^np-[0-9a-f]{12}\.(png|jpg|gif|webp|bmp)$/;

/** "FxSound Speakers (FxSound Audio Enhancer)" -> "FxSound Speakers": the driver's name in brackets does not fit on a key. */
export const shortOutputName = (name: string) => name.replace(/\s+\(.*\)\s*$/, '') || name;

/**
 * Keeps stateful buttons (Mute, Night light, Volume +, ...) showing the PC's real state. Reads only the states the
 * decks use, only while a device is connected, plus once right after such a button is pressed; changes go out as patches.
 */
export class StateWatcher {
  private state = new Map<string, State>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private readonly read: Record<string, () => Promise<State>>;
  /** The newest cover art, kept until the track changes. */
  art: Art | null = null;
  private artFor = '';

  constructor(private d: { store: Store; native: Native; clients: Clients; intervalMs?: number; appName?: (id: string) => string | undefined }) {
    const n = d.native;
    this.state.set('windows', { running: [] }); // until the first look, no app is open: keys show plain and nothing is sent
    this.read = {
      'system.mute': () => n.audio.getMute(),
      'system.micMute': () => n.audio.getMicMute(),
      'display.nightLight': () => n.display.getNightLight(),
      'system.energySaver': () => n.system.getEnergySaver(),
      'system.bluetooth': () => n.system.getBluetooth(),
      'media.playPause': () => n.system.mediaPlaying(),
      'system.dnd': () => n.system.getDnd(),
      'display.screensOff': async () => n.display.screensDark(),
      'meeting.camera': () => n.system.cameraInUse(),
      nowPlaying: async () => {
        const t = await n.system.nowPlaying();
        if (!t) return { track: null };
        // Players often send the cover a moment after the title, so a track without art asks again next time.
        const key = `${t.title}
${t.artist}`;
        if (key !== this.artFor || !this.art) {
          if (key !== this.artFor) this.art = null;
          this.artFor = key;
          const a = await n.system.nowPlayingArt().catch(() => null);
          if (a && ART_EXT[a.type]) this.art = { id: `np-${createHash('sha1').update(a.data).digest('hex').slice(0, 12)}.${ART_EXT[a.type]}`, ...a };
        }
        return { track: { ...t, ...(this.art ? { art: this.art.id } : {}) } };
      },
      outputs: async () => ({ outputs: await n.audio.outputs() }),
      // Kept as the ids of the app keys whose app is open, so a window title changing sends nothing.
      windows: async () => {
        const open = n.system.windows(), running: string[] = [];
        for (const f of d.store.profiles()) for (const w of f.widgets) {
          const s = w.config.kind === 'button' ? w.config.triggers.press?.[0] : undefined;
          if (s && LIVE_STATE[s.action] === 'windows' && appOpen(s.action, s.params, open, d.appName)) running.push(w.id);
        }
        return { running: running.sort() };
      },
      bluetoothPanel: async () => {
        let on: boolean;
        try { on = await n.system.getBluetooth(); } catch { return { available: false, on: false, devices: [] }; } // no Bluetooth here
        return { available: true, on, devices: on ? await n.system.bluetoothDevices() : [] };
      },
      volume: () => n.audio.getVolume(),
      screens: () => n.display.screens(),
      sound: async () => ({
        level: Math.round(await n.audio.getVolume()), muted: await n.audio.getMute(),
        apps: await n.audio.apps().catch(() => []), outputs: await n.audio.outputs().catch(() => []),
      }),
    };
  }

  private static key(w: Widget): string | undefined {
    const first = w.config.kind === 'button' ? w.config.triggers.press?.[0]?.action ?? '' : '';
    return PANEL_STATE[panelOf(w) ?? ''] ?? LIVE_STATE[first] ?? statefulAction(w) ?? levelOf(w)?.level;
  }

  liveOf = (w: Widget): Live => {
    const k = StateWatcher.key(w), v = k === undefined ? undefined : this.state.get(k);
    if (typeof v === 'boolean') return { active: v };
    if (v && typeof v === 'object' && 'running' in v) return { running: v.running.includes(w.id) };
    if (typeof v === 'number') return levelView(levelOf(w)!.dir, [v]);
    if (v && typeof v === 'object' && 'track' in v) {
      const t = v.track;
      if (t) return { active: t.playing, value: t.artist, look: { label: t.title, image: t.art ?? '' } };
      return { active: false, value: '', look: { label: w.look.label ?? '', image: w.look.image ?? '' } }; // nothing playing: the key's own look
    }
    if (v && typeof v === 'object' && 'outputs' in v && !('level' in v)) {
      const cur = v.outputs.find(o => o.isDefault), want = w.config.kind === 'button' ? String(w.config.triggers.press?.[0]?.params.output ?? '') : '';
      return want ? { active: cur?.id === want } : { value: cur ? shortOutputName(cur.name) : '' };
    }
    if (v && typeof v === 'object' && 'devices' in v) {
      const on = v.devices.find(d => d.connected);
      return { bluetooth: v, active: v.on, value: !v.available ? undefined : !v.on ? 'Off' : on ? on.name : 'On' };
    }
    if (v && typeof v === 'object' && 'level' in v) { const o = v as Sound; return { value: o.muted ? 'Muted' : `${o.level}%`, level: o.level, muted: o.muted, apps: o.apps, outputs: o.outputs }; }
    if (Array.isArray(v)) {
      if (panelOf(w)) return { screens: v };
      const l = levelOf(w)!, moved = v.filter(s => l.screen === 'all' || s.id === l.screen);
      return moved.length ? levelView(l.dir, moved.map(s => s.brightness)) : {};
    }
    return {};
  };

  /** Re-read one state (or every state in use) and patch the buttons whose state changed. */
  async refresh(only?: string): Promise<void> {
    const used = new Set<string>();
    for (const f of this.d.store.profiles()) for (const w of f.widgets) { const k = StateWatcher.key(w); if (k) used.add(k); }
    for (const k of only ? [only] : used) {
      let v: State;
      try { v = await this.read[k](); } catch { continue; } // unreadable here (e.g. no microphone): leave the key plain
      if (JSON.stringify(this.state.get(k)) === JSON.stringify(v)) continue;
      this.state.set(k, v);
      for (const f of this.d.store.profiles()) for (const w of f.widgets) if (StateWatcher.key(w) === k) this.d.clients.patch(w.id, this.liveOf(w));
    }
  }

  /** A press may have changed the state; look again once the action has had a moment to run. */
  afterPress(w: Widget): void {
    const k = StateWatcher.key(w);
    if (k) setTimeout(() => void this.refresh(k), levelOf(w) ? 120 : 300);
  }

  start(): () => void {
    const tick = async () => {
      if (this.d.clients.count() > 0) await this.refresh();
      if (!this.stopped) this.timer = setTimeout(tick, this.d.intervalMs ?? 3000);
    };
    void tick();
    return () => { this.stopped = true; clearTimeout(this.timer); };
  }
}
