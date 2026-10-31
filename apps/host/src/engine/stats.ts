import { EventEmitter } from 'node:events';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { StatsSummary, Widget } from '@tabbydeck/shared';
import type { BadgeId } from '@tabbydeck/shared/badges';
import type { Native } from '../native/types.ts';

/** One day: presses per key (by widget id), and seconds each app was in front (by program file). */
interface Day { presses: Record<string, number>; apps: Record<string, number>; badges?: BadgeId[]; dnd?: number; plants?: number; wilted?: number }
interface File { version: 1; labels: Record<string, string>; days: Record<string, Day> }

const KEEP_DAYS = 60, SPEED_RUN = 50, ZEN_SECONDS = 2 * 3600;

/** Local calendar day, as YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const NAMES: Record<string, string> = {
  code: 'VS Code', msedge: 'Edge', chrome: 'Chrome', brave: 'Brave', firefox: 'Firefox', warp: 'Warp', slack: 'Slack', explorer: 'File Explorer',
  'ms-teams': 'Teams', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint', outlook: 'Outlook', olk: 'Outlook', onenote: 'OneNote', zed: 'Zed',
  githubdesktop: 'GitHub Desktop', spotify: 'Spotify', discord: 'Discord', windowsterminal: 'Terminal', obs64: 'OBS Studio', fpilot: 'File Pilot',
  notepad: 'Notepad', calculatorapp: 'Calculator', zoom: 'Zoom', figma: 'Figma', obsidian: 'Obsidian', arc: 'Arc', vlc: 'VLC',
};
/** "code.exe" -> "VS Code"; others lose ".exe" and get a capital: "hubstaffclient.exe" -> "Hubstaffclient". */
export const appName = (exe: string) => {
  const base = exe.replace(/\.exe$/i, '').toLowerCase();
  return NAMES[base] ?? base.charAt(0).toUpperCase() + base.slice(1);
};

/** Add up the last `days` days ending today: presses per day, keys and apps by use, and the busiest day. */
export function summarize(file: File, now: Date, days: number): StatsSummary {
  const list: StatsSummary['days'] = [], keys = new Map<string, number>(), apps = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i), day = file.days[dayKey(d)];
    let presses = 0;
    for (const [id, n] of Object.entries(day?.presses ?? {})) { presses += n; keys.set(id, (keys.get(id) ?? 0) + n); }
    for (const [exe, s] of Object.entries(day?.apps ?? {})) { const name = appName(exe); apps.set(name, (apps.get(name) ?? 0) + s); }
    list.push({ date: dayKey(d), presses });
  }
  const badges: StatsSummary['badges'] = [];
  for (const d of [...list].reverse()) for (const id of file.days[d.date]?.badges ?? []) badges.push({ id, date: d.date });
  const busiest = list.reduce<StatsSummary['days'][number] | null>((b, d) => (d.presses > (b?.presses ?? 0) ? d : b), null);
  return {
    days: list, total: list.reduce((n, d) => n + d.presses, 0), busiest,
    keys: [...keys].map(([id, n]) => ({ id, label: file.labels[id] || 'A key', n })).sort((a, b) => b.n - a.n),
    apps: [...apps].map(([app, s]) => ({ app, minutes: Math.round(s / 60) })).filter(a => a.minutes > 0).sort((a, b) => b.minutes - a.minutes),
    badges,
    garden: list.map(d => ({ date: d.date, plants: file.days[d.date]?.plants ?? 0, wilted: file.days[d.date]?.wilted ?? 0 })),
  };
}

/**
 * How the deck is used, kept on this PC only (stats.json in the data folder): which keys are pressed each day, and
 * which app is in front, sampled every few seconds. Days older than KEEP_DAYS are dropped.
 */
export class Stats extends EventEmitter<{ badge: [id: BadgeId] }> {
  private file: File = { version: 1, labels: {}, days: {} };
  private dirty = false;
  private readonly at: string;
  private recent: number[] = []; // times of the last presses, for Speed run

  constructor(private d: { dir: string; native: Native; now?: () => Date; sampleMs?: number }) {
    super();
    this.at = path.join(d.dir, 'stats.json');
    try {
      const f = JSON.parse(readFileSync(this.at, 'utf8')) as File;
      if (f?.version === 1 && f.days && f.labels) this.file = f;
    } catch { /* no stats yet, or a damaged file: start again */ }
  }

  private now() { return this.d.now?.() ?? new Date(); }
  private today(): Day { const k = dayKey(this.now()); return (this.file.days[k] ??= { presses: {}, apps: {} }); }

  press(w: Widget): void {
    const t = this.today();
    t.presses[w.id] = (t.presses[w.id] ?? 0) + 1;
    if (w.look.label) this.file.labels[w.id] = w.look.label; // the label at the time, so a deleted key keeps its name
    this.dirty = true;
    const now = this.now(), h = now.getHours(), ms = now.getTime();
    if (h >= 2 && h < 5) this.earn('night-owl');
    if (h >= 5 && h < 7) this.earn('early-bird');
    this.recent.push(ms);
    while (this.recent.length && ms - this.recent[0] > 60_000) this.recent.shift();
    if (this.recent.length >= SPEED_RUN) this.earn('speed-run');
  }

  /** Earn a badge once a day; the host tells the decks. */
  private earn(id: BadgeId): void {
    const t = this.today();
    if (t.badges?.includes(id)) return;
    (t.badges ??= []).push(id);
    this.dirty = true;
    this.emit('badge', id);
  }

  /** A Pomodoro focus stretch ran to the end (a plant grows in the garden) or was given up (one wilts). */
  focus(kind: 'grow' | 'wilt'): void {
    const t = this.today();
    if (kind === 'grow') t.plants = (t.plants ?? 0) + 1; else t.wilted = (t.wilted ?? 0) + 1;
    this.dirty = true;
  }
  /** Today's garden, for the decks. */
  garden(): { plants: number; wilted: number } { const t = this.file.days[dayKey(this.now())]; return { plants: t?.plants ?? 0, wilted: t?.wilted ?? 0 }; }

  /** Count time with Do not disturb on; two hours in a day earns Zen. */
  async sampleDnd(): Promise<void> {
    if (!(await this.d.native.system.getDnd().catch(() => false))) return;
    const t = this.today();
    t.dnd = (t.dnd ?? 0) + Math.round((this.d.sampleMs ?? 15_000) / 1000);
    this.dirty = true;
    if (t.dnd >= ZEN_SECONDS) this.earn('zen');
  }

  /** Count the app in front for one sample period. TabbyDeck itself does not count. */
  sample(): void {
    const exe = this.d.native.system.foregroundWindow()?.exe;
    if (!exe || /^tabbydeck/i.test(exe)) return;
    const t = this.today();
    t.apps[exe] = (t.apps[exe] ?? 0) + Math.round((this.d.sampleMs ?? 15_000) / 1000);
    this.dirty = true;
  }

  summary(days = 7): StatsSummary { return summarize(this.file, this.now(), days); }

  flush(): void {
    if (!this.dirty) return;
    const oldest = dayKey(new Date(this.now().getTime() - KEEP_DAYS * 86_400_000));
    for (const k of Object.keys(this.file.days)) if (k < oldest) delete this.file.days[k];
    try { writeFileSync(`${this.at}.tmp`, JSON.stringify(this.file)); renameSync(`${this.at}.tmp`, this.at); this.dirty = false; } catch { /* try again next time */ }
  }

  start(): () => void {
    const sample = setInterval(() => { this.sample(); void this.sampleDnd(); }, this.d.sampleMs ?? 15_000);
    const save = setInterval(() => this.flush(), 60_000);
    sample.unref?.(); save.unref?.();
    return () => { clearInterval(sample); clearInterval(save); this.flush(); };
  }
}
