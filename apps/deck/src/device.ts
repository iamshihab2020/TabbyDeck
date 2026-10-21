import { newId } from '@tabbydeck/shared/ids';

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
export interface StoredDevice { id: string; name: string; token?: string }

const KEY = 'tabbydeck.device';

export function defaultDeviceName(ua: string): string {
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  return 'Browser';
}

/** Reads the stored device, creating one (with a fresh id and a name from the user agent) when missing or corrupt. */
export function loadDevice(kv: KV, ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): StoredDevice {
  try {
    const raw = kv.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as StoredDevice;
      if (d && typeof d.id === 'string' && typeof d.name === 'string') return d;
    }
  } catch { /* corrupt or unavailable: start fresh */ }
  const d: StoredDevice = { id: newId(), name: defaultDeviceName(ua) };
  saveDevice(kv, d);
  return d;
}

export function saveDevice(kv: KV, d: StoredDevice): void {
  try { kv.setItem(KEY, JSON.stringify(d)); } catch { /* private mode: identity lasts for this page only */ }
}

export function adopt(kv: KV, welcome: { deviceId: string; token: string; name: string }): StoredDevice {
  const d = { id: welcome.deviceId, token: welcome.token, name: welcome.name };
  saveDevice(kv, d);
  return d;
}

/** localStorage when it works, otherwise an in-memory stand-in. */
export function browserKV(): KV {
  try { const k = '__tb'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch {
    const m: Record<string, string> = {};
    return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } };
  }
}
