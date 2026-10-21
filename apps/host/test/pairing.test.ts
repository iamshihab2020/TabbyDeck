import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { Pairing, RateLimiter, resolveHello } from '../src/auth/pairing.ts';
import { Sessions } from '../src/auth/sessions.ts';

let dir: string; let store: Store; let sessions: Sessions; let pairing: Pairing;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-pair-'));
  store = new Store({ dir, log: nullLogger() }); await store.load();
  sessions = new Sessions(store);
  pairing = new Pairing({ store, sessions, log: nullLogger() });
});
afterEach(async () => { vi.useRealTimers(); pairing.dispose(); await store.flush(); rmSync(dir, { recursive: true, force: true }); });

describe('Pairing', () => {
  it('issues a 6-digit code and creates an unapproved device', () => {
    const { code } = pairing.request('dev1', 'Phone', '192.168.1.5');
    expect(code).toMatch(/^\d{6}$/);
    expect(store.device('dev1')).toMatchObject({ name: 'Phone', approved: false, blocked: false });
    expect(pairing.pending()).toEqual([expect.objectContaining({ deviceId: 'dev1', name: 'Phone', ip: '192.168.1.5' })]);
  });

  it('approve with the right code approves the device and issues a token that verifies', () => {
    const approved: { deviceId: string; token: string }[] = [];
    pairing.on('approved', e => approved.push(e));
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    expect(pairing.approve('dev1', code)).toBe('ok');
    expect(store.device('dev1')?.approved).toBe(true);
    expect(approved).toHaveLength(1);
    expect(sessions.verify('dev1', approved[0].token)).toBe(true);
    expect(sessions.verify('dev1', 'wrong')).toBe(false);
    expect(pairing.pending()).toHaveLength(0);
  });

  it('three wrong codes deny the request', () => {
    const denied: string[] = [];
    pairing.on('denied', e => denied.push(e.deviceId));
    pairing.request('dev1', 'Phone', 'ip');
    expect(pairing.approve('dev1', '000000x')).toBe('wrong_code');
    expect(pairing.approve('dev1', 'bad')).toBe('wrong_code');
    expect(pairing.approve('dev1', 'nope')).toBe('wrong_code');
    expect(denied).toEqual(['dev1']);
    expect(pairing.approve('dev1', 'anything')).toBe('not_pending');
  });

  it('times out after 60 s', () => {
    vi.useFakeTimers();
    const timeouts: string[] = [];
    pairing.on('timeout', e => timeouts.push(e.deviceId));
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    vi.advanceTimersByTime(60_001);
    expect(timeouts).toEqual(['dev1']);
    expect(pairing.approve('dev1', code)).toBe('not_pending');
  });

  it('a new request replaces the old code', () => {
    const a = pairing.request('dev1', 'Phone', 'ip').code;
    let b = pairing.request('dev1', 'Phone', 'ip').code;
    while (b === a) b = pairing.request('dev1', 'Phone', 'ip').code;
    expect(pairing.approve('dev1', a)).toBe('wrong_code');
    expect(pairing.pending()).toHaveLength(1);
  });

  it('three denials block the device', () => {
    for (let i = 0; i < 3; i++) { pairing.request('dev1', 'Phone', 'ip'); pairing.deny('dev1'); }
    expect(store.device('dev1')?.blocked).toBe(true);
  });
});

describe('resolveHello', () => {
  it('approved device with a valid token is welcomed', () => {
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    let token = '';
    pairing.on('approved', e => { token = e.token; });
    pairing.approve('dev1', code);
    expect(resolveHello(store, sessions, { deviceId: 'dev1', token })).toEqual({ kind: 'welcome', deviceId: 'dev1' });
  });

  it('known device id with a stale token pairs as a new device and leaves the old one alone', () => {
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    pairing.approve('dev1', code);
    const r = resolveHello(store, sessions, { deviceId: 'dev1', token: 'stale' });
    expect(r.kind).toBe('pair');
    if (r.kind === 'pair') expect(r.deviceId).not.toBe('dev1');
    expect(store.device('dev1')?.approved).toBe(true);
  });

  it('known approved device id with no token also pairs as a new device', () => {
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    pairing.approve('dev1', code);
    const r = resolveHello(store, sessions, { deviceId: 'dev1' });
    expect(r.kind === 'pair' && r.deviceId !== 'dev1').toBe(true);
  });

  it('unknown or unapproved device pairs under its own id', () => {
    expect(resolveHello(store, sessions, { deviceId: 'fresh' })).toEqual({ kind: 'pair', deviceId: 'fresh' });
  });

  it('blocked device is blocked', () => {
    store.upsertDevice({ id: 'bad', name: 'x', approved: false, blocked: true, lastSeen: 'x', createdAt: 'x' });
    expect(resolveHello(store, sessions, { deviceId: 'bad' })).toEqual({ kind: 'blocked' });
  });

  it('a revoked token no longer welcomes', () => {
    const { code } = pairing.request('dev1', 'Phone', 'ip');
    let token = ''; pairing.on('approved', e => { token = e.token; });
    pairing.approve('dev1', code);
    sessions.revoke('dev1');
    expect(resolveHello(store, sessions, { deviceId: 'dev1', token }).kind).toBe('pair');
  });
});

describe('RateLimiter', () => {
  it('allows 10 per window and rejects the 11th, then recovers', () => {
    vi.useFakeTimers();
    const r = new RateLimiter(10, 60_000);
    for (let i = 0; i < 10; i++) expect(r.allow('ip')).toBe(true);
    expect(r.allow('ip')).toBe(false);
    expect(r.allow('other')).toBe(true);
    vi.advanceTimersByTime(60_001);
    expect(r.allow('ip')).toBe(true);
  });
});
