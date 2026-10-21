import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adopt, defaultDeviceName, loadDevice, saveDevice, type KV } from '../src/device.ts';
import { createConnection, type ConnState } from '../src/connection.ts';

const memory = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};

describe('device identity', () => {
  it('creates and persists an id and a name', () => {
    const kv = memory();
    const d = loadDevice(kv, 'Mozilla/5.0 (Linux; Android 9; SM-T510) Chrome/90 Safari/537.36');
    expect(d.id).toMatch(/^[a-z0-9]{16}$/);
    expect(d.name).toBe('Android tablet');
    expect(loadDevice(kv).id).toBe(d.id);
  });
  it('adopt replaces id, token and name', () => {
    const kv = memory();
    loadDevice(kv);
    adopt(kv, { deviceId: 'newid', token: 'tok', name: 'Kitchen tablet' });
    expect(loadDevice(kv)).toMatchObject({ id: 'newid', token: 'tok', name: 'Kitchen tablet' });
  });
  it('names devices from the user agent', () => {
    expect(defaultDeviceName('Mozilla/5.0 (Linux; Android 10; Pixel 4) Mobile Safari')).toBe('Android phone');
    expect(defaultDeviceName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Windows PC');
    expect(defaultDeviceName('curl/8')).toBe('Browser');
  });
  it('survives a corrupt stored value', () => {
    const kv = memory();
    kv.setItem('tabbydeck.device', '{oops');
    expect(loadDevice(kv).id).toMatch(/^[a-z0-9]{16}$/);
  });
  it('saveDevice writes through', () => {
    const kv = memory();
    saveDevice(kv, { id: 'abc', name: 'n' });
    expect(JSON.parse(kv.data['tabbydeck.device'])).toEqual({ id: 'abc', name: 'n' });
  });
});

class FakeWS {
  static last: FakeWS;
  static all: FakeWS[] = [];
  sent: unknown[] = [];
  readyState = 0;
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void; onerror?: () => void;
  constructor(public url: string) { FakeWS.last = this; FakeWS.all.push(this); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

describe('connection', () => {
  let kv: ReturnType<typeof memory>;
  let states: ConnState[];
  beforeEach(() => { vi.useFakeTimers(); FakeWS.all = []; kv = memory(); states = []; });
  afterEach(() => vi.useRealTimers());

  const connect = (extra: Record<string, unknown> = {}) => createConnection('ws://h/ws', kv, {
    onState: s => states.push(s), onDeck: () => {}, onPatch: () => {}, onNotify: () => {}, onPairRequired: () => {}, ...extra,
  }, { WebSocket: FakeWS as unknown as typeof WebSocket, caps: { vibrate: true, wakeLock: false }, version: '0.1.0' });

  it('sends hello with the stored token on open', () => {
    saveDevice(kv, { id: 'dev1', name: 'Phone', token: 'tok' });
    connect();
    FakeWS.last.open();
    expect(FakeWS.last.sent[0]).toEqual({ t: 'hello', deviceId: 'dev1', name: 'Phone', token: 'tok', clientVersion: '0.1.0', caps: { vibrate: true, wakeLock: false } });
  });

  it('pairRequired moves to pairing and reports the code', () => {
    const codes: string[] = [];
    connect({ onPairRequired: (c: string) => codes.push(c) });
    FakeWS.last.open();
    FakeWS.last.recv({ t: 'pairRequired', code: '123456' });
    expect(states[states.length - 1]).toBe('pairing');
    expect(codes).toEqual(['123456']);
  });

  it('welcome adopts the identity and opens', () => {
    connect();
    FakeWS.last.open();
    FakeWS.last.recv({ t: 'welcome', deviceId: 'srv1', token: 'tok2', name: 'Phone' });
    expect(states[states.length - 1]).toBe('open');
    expect(loadDevice(kv)).toMatchObject({ id: 'srv1', token: 'tok2' });
  });

  it('reconnects with backoff 1, 2, 4, 8, 8 s', () => {
    connect();
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = FakeWS.all.length;
      FakeWS.last.close();
      let waited = 0;
      while (FakeWS.all.length === before && waited < 20_000) { vi.advanceTimersByTime(100); waited += 100; }
      delays.push(waited);
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 8000]);
  });

  it('backoff resets after a successful open', () => {
    connect();
    FakeWS.last.close(); vi.advanceTimersByTime(1000);
    FakeWS.last.close(); vi.advanceTimersByTime(2000);
    FakeWS.last.open(); FakeWS.last.recv({ t: 'welcome', deviceId: 'd', token: 't', name: 'n' });
    const before = FakeWS.all.length;
    FakeWS.last.close(); vi.advanceTimersByTime(1000);
    expect(FakeWS.all.length).toBe(before + 1);
  });

  it('denied stops reconnecting until retry()', () => {
    const c = connect();
    FakeWS.last.open();
    FakeWS.last.recv({ t: 'denied' });
    expect(states[states.length - 1]).toBe('denied');
    const before = FakeWS.all.length;
    FakeWS.last.close();
    vi.advanceTimersByTime(30_000);
    expect(FakeWS.all.length).toBe(before);
    c.retry();
    expect(FakeWS.all.length).toBe(before + 1);
  });

  it('blocked and timeout are terminal states too', () => {
    connect(); FakeWS.last.open(); FakeWS.last.recv({ t: 'blocked' });
    expect(states[states.length - 1]).toBe('blocked');
    connect(); FakeWS.last.open(); FakeWS.last.recv({ t: 'timeout' });
    expect(states[states.length - 1]).toBe('timeout');
  });

  it('pings every 5 s while open and ignores malformed messages', () => {
    connect(); FakeWS.last.open();
    FakeWS.last.onmessage?.({ data: 'not json' });
    vi.advanceTimersByTime(5000);
    expect(FakeWS.last.sent.some(m => (m as { t: string }).t === 'ping')).toBe(true);
  });

  it('send while not open does not throw', () => {
    const c = connect();
    expect(() => c.send({ t: 'press', widgetId: 'w', kind: 'press' })).not.toThrow();
  });
});
