import type { KV } from './device.ts';

const KEY = 'tabbydeck.newsSeen';

/**
 * Whether this device has yet to read what is new in `version`. A device that was not paired when the page opened
 * (a first install or a new pairing) never sees it: the version is taken as read. Each device keeps its own.
 */
export function newsUnread(kv: KV, version: string, paired: boolean): boolean {
  try {
    const seen = kv.getItem(KEY);
    if (seen === version) return false;
    if (seen === null && !paired) { kv.setItem(KEY, version); return false; }
    return true;
  } catch { return false; }
}

export function markNewsRead(kv: KV, version: string): void {
  try { kv.setItem(KEY, version); } catch { /* private mode: asks again next time */ }
}
