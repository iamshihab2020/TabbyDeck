import type { Widget } from '@tabbydeck/shared';
import type { ActionRegistry } from './registry.ts';
import type { Native } from '../native/types.ts';
import type { Store } from '../store/store.ts';
import type { Live } from './states.ts';
import { Weather } from './weather.ts';

/** A timer or Pomodoro key's own clock. left is what remains when paused; endsAt is set while it runs. */
interface Run { left: number; endsAt: number | null; rest: boolean }

const two = (n: number) => String(n).padStart(2, '0');
/** 299000 -> "04:59"; an hour or more -> "1:05:00". */
export const clockText = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600);
  return h ? `${h}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
};

const minutes = (v: unknown, fallback: number) => Math.max(1, Math.min(600, Number(v) || fallback)) * 60_000;

/**
 * Keys whose face changes by itself: CPU, RAM, battery, temperature, the time, timers and Pomodoro. Once a second it works out what
 * each one shows and patches the keys whose text changed. Timers run here on the PC, so every deck shows the same time.
 */
export class InfoKeys {
  private runs = new Map<string, Run>();
  private shown = new Map<string, string>();
  private sample = { cpu: 0, ram: 0 };
  /** c: undefined until the first read comes back, null when the PC does not report one. */
  private temp = { c: undefined as number | null | undefined, at: -Infinity, busy: false };
  private weather: Weather;

  constructor(private d: { store: Store; native: Native; patch?: (widgetId: string, live: Live) => void; notify?: (text: string) => void; onFocus?: (kind: 'grow' | 'wilt') => void; now?: () => number; weather?: Weather }) { this.weather = d.weather ?? new Weather({ now: d.now }); }

  private now() { return this.d.now?.() ?? Date.now(); }
  private static step(w: Widget) { return w.config.kind === 'button' ? w.config.triggers.press?.[0] : undefined; }
  private static isInfo(w: Widget) { const a = InfoKeys.step(w)?.action; return a === 'info.show' || a === 'info.temperature' || a === 'timer.countdown' || a === 'timer.pomodoro'; }

  /** A timer key's length: the timer's minutes, or for Pomodoro the focus or the break. */
  private full(w: Widget, rest: boolean) {
    const p = InfoKeys.step(w)!.params;
    return InfoKeys.step(w)!.action === 'timer.pomodoro' ? (rest ? minutes(p.rest, 5) : minutes(p.focus, 25)) : minutes(p.minutes, 5);
  }
  private left(r: Run) { return r.endsAt === null ? r.left : r.endsAt - this.now(); }

  liveOf = (w: Widget): Live => {
    const s = InfoKeys.step(w);
    if (!s || !InfoKeys.isInfo(w)) return {};
    if (s.action === 'info.show') {
      if (s.params.show === 'cpu') return { big: `${this.sample.cpu}%` };
      if (s.params.show === 'ram') return { big: `${this.sample.ram}%` };
      if (s.params.show === 'battery') {
        const b = this.d.native.sysinfo.battery();
        return b ? { big: `${b.percent}%`, active: b.charging, value: b.charging ? 'Charging' : '' } : { big: '—', value: 'No battery' };
      }
      const d = new Date(this.now());
      return { big: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), look: { label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) } };
    }
    if (s.action === 'info.temperature') {
      const deg = (c: number) => s.params.unit === 'f' ? `${Math.round(c * 9 / 5 + 32)}°F` : `${Math.round(c)}°C`;
      if (s.params.source === 'cpu') {
        const c = this.cpuTemp();
        // A reading carries the key's own label: phones keep a patched label, so an earlier "Not reported" would stay.
        return c === undefined ? { big: '…' } : c === null ? { big: '—', look: { label: 'Not reported' } } : { big: deg(c), look: { label: w.look.label } };
      }
      const city = String(s.params.city ?? '');
      if (!city.trim()) return { big: '—', look: { label: 'Set a city' } };
      const r = this.weather.get(city);
      return !r ? { big: '…' } : 'error' in r ? { big: '—', look: { label: r.error } } : { big: deg(r.tempC), look: { label: r.place } };
    }
    const r = this.runs.get(w.id);
    const live: Live = { big: clockText(r ? this.left(r) : this.full(w, false)), active: !!r?.endsAt };
    if (s.action === 'timer.pomodoro') live.look = { label: r?.rest ? 'Break' : 'Focus' };
    return live;
  };

  /** The last CPU temperature, read again in the background every 10 seconds while a key shows it. */
  private cpuTemp(): number | null | undefined {
    const t = this.temp;
    if (!t.busy && this.now() - t.at > 10_000) {
      t.busy = true;
      void this.d.native.sysinfo.cpuTemp().then(c => { t.c = c; }, () => { t.c = null; }).finally(() => { t.at = this.now(); t.busy = false; });
    }
    return t.c;
  }

  /** Whether a Pomodoro key is in a focus stretch now (running, not on its break). */
  focusing(): boolean {
    for (const [id, r] of this.runs) {
      const w = this.d.store.widget(id);
      if (r.endsAt !== null && !r.rest && w && InfoKeys.step(w)?.action === 'timer.pomodoro') return true;
    }
    return false;
  }

  /** Whether a Timer key is counting down now. */
  timing(): boolean {
    for (const [id, r] of this.runs) { const w = this.d.store.widget(id); if (r.endsAt !== null && w && InfoKeys.step(w)?.action === 'timer.countdown') return true; }
    return false;
  }

  /** Start or pause a timer key. */
  toggle(w: Widget): void {
    const r = this.runs.get(w.id);
    if (!r) this.runs.set(w.id, { left: 0, endsAt: this.now() + this.full(w, false), rest: false });
    else if (r.endsAt === null) r.endsAt = this.now() + r.left;
    else { r.left = this.left(r); r.endsAt = null; }
    this.show(w);
  }
  /** Back to the start: stopped, full length, focus. Giving up a Pomodoro focus stretch part way wilts a plant. */
  reset(w: Widget): void {
    const r = this.runs.get(w.id);
    if (r && !r.rest && InfoKeys.step(w)?.action === 'timer.pomodoro' && this.left(r) > 0) this.d.onFocus?.('wilt');
    this.runs.delete(w.id); this.show(w);
  }

  private show(w: Widget) {
    const live = this.liveOf(w), text = JSON.stringify(live);
    if (this.shown.get(w.id) === text) return;
    this.shown.set(w.id, text);
    this.d.patch?.(w.id, live);
  }

  /** Finish timers that ran out, then refresh every key that shows something live. */
  tick(): void {
    this.sample = { cpu: this.d.native.sysinfo.cpuPercent(), ram: this.d.native.sysinfo.ramPercent() };
    for (const f of this.d.store.profiles()) for (const w of f.widgets) {
      if (!InfoKeys.isInfo(w)) continue;
      const r = this.runs.get(w.id);
      if (r?.endsAt !== null && r && this.left(r) <= 0) {
        const name = w.look.label || 'Timer';
        if (InfoKeys.step(w)!.action === 'timer.pomodoro') {
          r.rest = !r.rest; r.endsAt = this.now() + this.full(w, r.rest);
          if (r.rest) this.d.onFocus?.('grow');
          this.d.notify?.(r.rest ? 'Time for a break' : 'Break is over. Back to focus');
        } else { this.runs.delete(w.id); this.d.notify?.(`${name} is done`); }
      }
      this.show(w);
    }
  }

  start(intervalMs = 1000): () => void {
    const t = setInterval(() => this.tick(), intervalMs);
    t.unref?.();
    return () => clearInterval(t);
  }
}

export function registerInfo(registry: ActionRegistry, deps: { store: Store; info: InfoKeys }): void {
  const keyOf = (id: string | undefined) => {
    const w = id ? deps.store.widget(id) : undefined;
    if (!w) throw new Error('Press this key on the deck to use it');
    return w;
  };
  registry.register({
    id: 'info.show', name: 'Show PC info', group: 'Info', description: 'The key shows the CPU or memory in use, the battery, or the time, and keeps it up to date',
    schema: { show: { type: 'enum', title: 'Show', options: ['cpu', 'ram', 'battery', 'clock'], labels: ['CPU', 'Memory (RAM)', 'Battery', 'Time and date'], default: 'cpu' } },
    run: async () => {}, // the key only shows; pressing it does nothing
  });
  registry.register({
    id: 'info.temperature', name: 'Temperature', group: 'Info', description: 'The key shows the temperature outside in a city (from Open-Meteo, every 15 minutes), or how hot the PC is inside on PCs that report it',
    schema: {
      source: { type: 'enum', title: 'Show', options: ['weather', 'cpu'], labels: ['Weather outside', 'CPU'], default: 'weather' },
      city: { type: 'string', title: 'City (for weather)', default: '' },
      unit: { type: 'enum', title: 'Unit', options: ['c', 'f'], labels: ['°C', '°F'], default: 'c' },
    },
    run: async () => {}, // the key only shows; pressing it does nothing
  });
  registry.register({
    id: 'timer.countdown', name: 'Timer', group: 'Info', description: 'Press to start or pause. Every deck gets a message when the time is up. Add Reset timer to Long press to start over.',
    schema: { minutes: { type: 'number', title: 'Minutes', default: 5, min: 1, max: 600 } },
    run: async (_p, ctx) => deps.info.toggle(keyOf(ctx.widgetId)),
  });
  registry.register({
    id: 'timer.pomodoro', name: 'Pomodoro', group: 'Info', description: 'Focus, then a break, and again. Press to start or pause; each change sends a message to the decks.',
    schema: { focus: { type: 'number', title: 'Focus minutes', default: 25, min: 1, max: 180 }, rest: { type: 'number', title: 'Break minutes', default: 5, min: 1, max: 60 } },
    run: async (_p, ctx) => deps.info.toggle(keyOf(ctx.widgetId)),
  });
  registry.register({
    id: 'timer.reset', name: 'Reset timer', group: 'Info', description: 'Stops this key\'s timer or Pomodoro and sets it back to the start',
    schema: {},
    run: async (_p, ctx) => deps.info.reset(keyOf(ctx.widgetId)),
  });
}
