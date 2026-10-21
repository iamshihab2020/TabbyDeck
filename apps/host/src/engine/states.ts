import { levelOf, levelView, panelOf, statefulAction, type Bluetooth, type Screen, type Widget } from '@tabbydeck/shared';
import type { Store } from '../store/store.ts';
import type { Native } from '../native/types.ts';
import type { Clients } from '../server/clients.ts';

/** What a key shows of the PC's live state: on or off, a level with the key greyed out at its end, or the screens. */
export interface Live { active?: boolean; value?: string; disabled?: boolean; screens?: Screen[]; level?: number; muted?: boolean; bluetooth?: Bluetooth }

// The state each panel shows: the screens for brightness, level and mute for volume.
const PANEL_STATE: Record<string, string> = { brightness: 'screens', volume: 'sound', bluetooth: 'bluetoothPanel' };

type Sound = { level: number; muted: boolean };
type State = boolean | number | Screen[] | Sound | Bluetooth;

/**
 * Keeps stateful buttons (Mute, Night light, Volume +, ...) showing the PC's real state. Reads only the states the
 * decks use, only while a device is connected, plus once right after such a button is pressed; changes go out as patches.
 */
export class StateWatcher {
  private state = new Map<string, State>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private readonly read: Record<string, () => Promise<State>>;

  constructor(private d: { store: Store; native: Native; clients: Clients; intervalMs?: number }) {
    const n = d.native;
    this.read = {
      'system.mute': () => n.audio.getMute(),
      'system.micMute': () => n.audio.getMicMute(),
      'display.nightLight': () => n.display.getNightLight(),
      'system.energySaver': () => n.system.getEnergySaver(),
      'system.bluetooth': () => n.system.getBluetooth(),
      'media.playPause': () => n.system.mediaPlaying(),
      bluetoothPanel: async () => {
        let on: boolean;
        try { on = await n.system.getBluetooth(); } catch { return { available: false, on: false, devices: [] }; } // no Bluetooth here
        return { available: true, on, devices: on ? await n.system.bluetoothDevices() : [] };
      },
      volume: () => n.audio.getVolume(),
      screens: () => n.display.screens(),
      sound: async () => ({ level: Math.round(await n.audio.getVolume()), muted: await n.audio.getMute() }),
    };
  }

  private static key(w: Widget): string | undefined { return PANEL_STATE[panelOf(w) ?? ''] ?? statefulAction(w) ?? levelOf(w)?.level; }

  liveOf = (w: Widget): Live => {
    const k = StateWatcher.key(w), v = k === undefined ? undefined : this.state.get(k);
    if (typeof v === 'boolean') return { active: v };
    if (typeof v === 'number') return levelView(levelOf(w)!.dir, [v]);
    if (v && typeof v === 'object' && 'devices' in v) {
      const on = v.devices.find(d => d.connected);
      return { bluetooth: v, active: v.on, value: !v.available ? undefined : !v.on ? 'Off' : on ? on.name : 'On' };
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) return { value: v.muted ? 'Muted' : `${v.level}%`, level: v.level, muted: v.muted };
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
