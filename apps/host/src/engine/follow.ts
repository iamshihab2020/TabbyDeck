import type { ProfileFile } from '@tabbydeck/shared';
import type { Native } from '../native/types.ts';
import type { Clients } from '../server/clients.ts';
import type { Store } from '../store/store.ts';

// Windows' own surfaces, which come to the front for a moment (Start, search, the lock screen): the deck stays put.
const SHELL = new Set(['searchhost.exe', 'searchapp.exe', 'startmenuexperiencehost.exe', 'shellexperiencehost.exe', 'lockapp.exe', 'tabbydeck.exe', 'tabbydeck-tray.exe']);

/** The profile that lists this program, by its file name (code.exe). The first one in the profile list wins. */
export function profileForApp(profiles: ProfileFile[], exe: string): string | null {
  const e = exe.toLowerCase();
  return profiles.find(f => f.profile.apps?.some(a => a.toLowerCase() === e))?.profile.id ?? null;
}

/**
 * Watches the app in front and moves following devices to its profile, and back when another app comes forward.
 * Windows with no title (the taskbar) and TabbyDeck's own editor are ignored, so using them changes nothing.
 */
export function startAppFollower(d: { store: Store; native: Native; clients: Clients; intervalMs?: number }): () => void {
  let last: string | null | undefined;
  const tick = () => {
    if (d.clients.count() === 0 || !d.store.profiles().some(f => f.profile.apps?.length)) return;
    let fg;
    try { fg = d.native.system.foregroundWindow(); } catch { return; }
    if (!fg || !fg.exe || !fg.title || SHELL.has(fg.exe) || /^TabbyDeck\b/.test(fg.title)) return;
    const p = profileForApp(d.store.profiles(), fg.exe);
    if (p !== last) { last = p; d.clients.followApp(p); }
  };
  const t = setInterval(tick, d.intervalMs ?? 700);
  // A device that connects now joins in at once.
  const onConnect = () => { last = undefined; tick(); };
  d.clients.on('deviceConnected', onConnect);
  return () => { clearInterval(t); d.clients.off('deviceConnected', onConnect); };
}
