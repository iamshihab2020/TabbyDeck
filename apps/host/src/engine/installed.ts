import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { Widget } from '@tabbydeck/shared';
import type { Native } from '../native/types.ts';
import type { Store } from '../store/store.ts';
import { expandEnv } from '../integrations/system.ts';

/** What a step needs on this PC: a Start app, a file, or an app for a link scheme (spotify:). */
type Need = { app: string } | { file: string } | { scheme: string };

// Schemes Windows itself handles, never left out.
const BUILT_IN = /^(https?|file|mailto|ms-[a-z0-9-]+|shell)$/i;

export function needOf(action: string, params: Record<string, unknown>): Need | null {
  if (action === 'system.launch') {
    const p = expandEnv(String(params.path ?? '').trim());
    const app = /^shell:AppsFolder\\(.+)$/i.exec(p);
    if (app) return { app: app[1].toLowerCase() };
    return /^[a-z]:\\/i.test(p) ? { file: p } : null; // a bare name (notepad.exe) is found on PATH when it runs
  }
  if (action === 'system.openUrl') {
    const s = /^([a-z][a-z0-9+.-]*):/i.exec(String(params.url ?? '').trim());
    return s && !BUILT_IN.test(s[1]) ? { scheme: s[1].toLowerCase() } : null;
  }
  return null;
}

/**
 * Keys that open an app this PC does not have (Spotify on a PC without it) are left off the decks. A key that opens
 * several apps stays while any one of them is here. Until the first look at the PC's apps, every key shows.
 */
export class Installed extends EventEmitter<{ change: [profileIds: string[]] }> {
  private apps: Map<string, string> | null = null;
  private schemes = new Map<string, boolean>();
  private gone = new Set<string>();

  constructor(private d: { store: Store; native: Native }) { super(); }

  missing = (w: Widget): boolean => this.gone.has(w.id);
  /** The Start menu name of an app (GitHub Desktop), once the PC's apps have been read. */
  nameOf = (id: string): string | undefined => this.apps?.get(id.toLowerCase());
  missingIds(): string[] { return [...this.gone]; }

  private has(n: Need): boolean {
    if ('app' in n) return !this.apps || this.apps.has(n.app);
    if ('file' in n) return existsSync(n.file);
    return this.schemes.get(n.scheme) !== false;
  }

  /** Look at the PC's apps again and redraw the decks whose keys came or went. */
  async refresh(): Promise<void> {
    try { this.apps = new Map((await this.d.native.system.listApps()).map(a => [a.id.toLowerCase(), a.name])); } catch { return; } // cannot tell: keep what we had
    const needs = new Map<string, Need[]>();
    for (const f of this.d.store.profiles()) for (const w of f.widgets) {
      if (w.config.kind !== 'button') continue;
      const list = (w.config.triggers.press ?? []).map(s => needOf(s.action, s.params)).filter((n): n is Need => !!n);
      if (list.length) needs.set(w.id, list);
    }
    for (const list of needs.values()) for (const n of list) {
      if ('scheme' in n && !this.schemes.has(n.scheme)) this.schemes.set(n.scheme, await this.d.native.system.hasUrlHandler(n.scheme).catch(() => true));
    }
    const gone = new Set([...needs].filter(([, list]) => !list.some(n => this.has(n))).map(([id]) => id));
    const changed = new Set<string>();
    for (const id of new Set([...gone, ...this.gone])) {
      if (gone.has(id) !== this.gone.has(id)) { const w = this.d.store.widget(id); const p = w && this.d.store.folder(w.folderId)?.profileId; if (p) changed.add(p); }
    }
    this.gone = gone;
    if (changed.size) this.emit('change', [...changed]);
  }

  /** Look now, again every few minutes (apps get installed), and shortly after the decks change. */
  start(everyMs = 3 * 60_000): () => void {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const later = () => { clearTimeout(soon); soon = setTimeout(() => void this.refresh(), 2000); soon.unref?.(); };
    this.d.store.on('profile', later);
    void this.refresh();
    const t = setInterval(() => { this.schemes.clear(); void this.refresh(); }, everyMs);
    t.unref?.();
    return () => { clearInterval(t); clearTimeout(soon); this.d.store.off('profile', later); };
  }
}
