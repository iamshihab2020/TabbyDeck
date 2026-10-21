import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from '../store/store.ts';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/** Per-device session tokens; only the sha256 is stored on the device record. */
export class Sessions {
  constructor(private store: Store) {}

  issue(deviceId: string): string {
    const d = this.store.device(deviceId);
    if (!d) throw new Error(`unknown device ${deviceId}`);
    const token = randomBytes(32).toString('base64url');
    this.store.upsertDevice({ ...d, tokenHash: hash(token) });
    return token;
  }

  verify(deviceId: string, token: string | undefined): boolean {
    const d = this.store.device(deviceId);
    if (!d?.tokenHash || !token) return false;
    const a = Buffer.from(d.tokenHash, 'hex');
    const b = Buffer.from(hash(token), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  revoke(deviceId: string): void {
    const d = this.store.device(deviceId);
    if (d) { const { tokenHash: _t, ...rest } = d; this.store.upsertDevice(rest); }
  }
}
