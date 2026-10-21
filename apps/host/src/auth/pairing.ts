import { EventEmitter } from 'node:events';
import { randomInt } from 'node:crypto';
import { newId } from '@tabbydeck/shared';
import type { Logger } from '../log/logger.ts';
import type { Store } from '../store/store.ts';
import type { Sessions } from './sessions.ts';

export interface PendingPairing { deviceId: string; name: string; ip: string; since: string }
interface Entry extends PendingPairing { code: string; wrong: number; timer: NodeJS.Timeout }
interface PairingEvents {
  request: [PendingPairing & { code: string }];
  approved: [{ deviceId: string; token: string }];
  denied: [{ deviceId: string }];
  timeout: [{ deviceId: string }];
}

const MAX_WRONG = 3;
const DENIALS_TO_BLOCK = 3;

export class Pairing extends EventEmitter<PairingEvents> {
  private entries = new Map<string, Entry>();
  private denials = new Map<string, number>();
  private store: Store; private sessions: Sessions; private log: Logger; private timeoutMs: number;

  constructor(opts: { store: Store; sessions: Sessions; log: Logger; timeoutMs?: number }) {
    super();
    this.store = opts.store; this.sessions = opts.sessions; this.log = opts.log; this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  request(deviceId: string, name: string, ip: string): { code: string } {
    this.clear(deviceId);
    const now = new Date().toISOString();
    const d = this.store.device(deviceId);
    this.store.upsertDevice(d ? { ...d, name, lastSeen: now } : { id: deviceId, name, approved: false, blocked: false, lastSeen: now, createdAt: now });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const timer = setTimeout(() => { this.clear(deviceId); this.emit('timeout', { deviceId }); }, this.timeoutMs);
    timer.unref?.();
    const entry: Entry = { deviceId, name, ip, since: now, code, wrong: 0, timer };
    this.entries.set(deviceId, entry);
    this.log.info('pairing', 'pair request', { deviceId, name, ip });
    this.emit('request', { deviceId, name, ip, since: now, code });
    return { code };
  }

  approve(deviceId: string, code: string): 'ok' | 'wrong_code' | 'not_pending' {
    const e = this.entries.get(deviceId);
    if (!e) return 'not_pending';
    if (code.trim() !== e.code) {
      e.wrong++;
      this.log.warn('pairing', 'wrong code', { deviceId, tries: e.wrong });
      if (e.wrong >= MAX_WRONG) this.deny(deviceId);
      return 'wrong_code';
    }
    this.clear(deviceId);
    const d = this.store.device(deviceId)!;
    this.store.upsertDevice({ ...d, approved: true, blocked: false });
    this.denials.delete(deviceId);
    const token = this.sessions.issue(deviceId);
    this.log.info('pairing', 'approved', { deviceId });
    this.emit('approved', { deviceId, token });
    return 'ok';
  }

  deny(deviceId: string): void {
    this.clear(deviceId);
    const n = (this.denials.get(deviceId) ?? 0) + 1;
    this.denials.set(deviceId, n);
    const d = this.store.device(deviceId);
    if (d && n >= DENIALS_TO_BLOCK) { this.store.upsertDevice({ ...d, blocked: true }); this.log.warn('pairing', 'blocked after repeated denials', { deviceId }); }
    this.emit('denied', { deviceId });
  }

  pending(): PendingPairing[] { return [...this.entries.values()].map(({ deviceId, name, ip, since }) => ({ deviceId, name, ip, since })); }
  isPending(deviceId: string) { return this.entries.has(deviceId); }

  private clear(deviceId: string) { const e = this.entries.get(deviceId); if (e) { clearTimeout(e.timer); this.entries.delete(deviceId); } }
  dispose() { for (const id of [...this.entries.keys()]) this.clear(id); }
}

export type HelloResult = { kind: 'welcome'; deviceId: string } | { kind: 'pair'; deviceId: string } | { kind: 'blocked' };

/**
 * Decide what a hello means. A known approved device id with a token that does not verify is treated
 * as a different browser that copied the id: it pairs under a fresh id and the original is untouched.
 */
export function resolveHello(store: Store, sessions: Sessions, hello: { deviceId: string; token?: string }): HelloResult {
  const d = store.device(hello.deviceId);
  if (d?.blocked) return { kind: 'blocked' };
  if (d?.approved) return sessions.verify(d.id, hello.token) ? { kind: 'welcome', deviceId: d.id } : { kind: 'pair', deviceId: newId() };
  return { kind: 'pair', deviceId: hello.deviceId };
}

/** Fixed-window counter per key. */
export class RateLimiter {
  private hits = new Map<string, { n: number; start: number }>();
  constructor(private limit: number, private windowMs: number) {}
  allow(key: string): boolean {
    const now = Date.now();
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) { this.hits.set(key, { n: 1, start: now }); return true; }
    h.n++;
    return h.n <= this.limit;
  }
}
