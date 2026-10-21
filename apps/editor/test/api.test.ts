import { describe, expect, it } from 'vitest';
import { createApi } from '../src/api.ts';
import type { EditorState } from '@tabbydeck/shared';

class FakeWS {
  static last: FakeWS;
  sent: { id: string; name: string; args: unknown }[] = [];
  readyState = 0;
  onopen?: () => void; onmessage?: (e: { data: string }) => void; onclose?: () => void;
  constructor(public url: string) { FakeWS.last = this; }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
  open() { this.readyState = 1; this.onopen?.(); }
  recv(m: unknown) { this.onmessage?.({ data: JSON.stringify(m) }); }
}

const state = { profiles: [], devices: [], connected: [], pending: [], catalogue: [], assets: [], log: [], version: '0.1.0', paused: false } as unknown as EditorState;

describe('editor api', () => {
  const make = () => createApi({ url: 'ws://h/editor-ws?token=t', WebSocket: FakeWS as unknown as typeof WebSocket });

  it('connects to the given url and publishes state', () => {
    const api = make();
    const seen: (EditorState | null)[] = [];
    api.subscribe(s => seen.push(s.state));
    FakeWS.last.open();
    FakeWS.last.recv({ t: 'state', state });
    expect(FakeWS.last.url).toBe('ws://h/editor-ws?token=t');
    expect(seen.at(-1)).toEqual(state);
    expect(api.get().connected).toBe(true);
  });

  it('cmd resolves with data on ok', async () => {
    const api = make(); FakeWS.last.open();
    const p = api.cmd('widget.duplicate', { id: 'w' });
    const sent = FakeWS.last.sent[0];
    expect(sent).toMatchObject({ t: 'cmd', name: 'widget.duplicate', args: { id: 'w' } });
    FakeWS.last.recv({ t: 'result', id: sent.id, ok: true, data: { id: 'w2' } });
    await expect(p).resolves.toEqual({ id: 'w2' });
  });

  it('cmd rejects with the error code on failure and reports it', async () => {
    const api = make(); FakeWS.last.open();
    const errors: string[] = [];
    api.onError(e => errors.push(e));
    const p = api.cmd('widget.update', { id: 'ghost', patch: {} });
    FakeWS.last.recv({ t: 'result', id: FakeWS.last.sent[0].id, ok: false, error: 'not_found' });
    await expect(p).rejects.toThrow('not_found');
    expect(errors).toEqual(['not_found']);
  });

  it('pending commands reject when the socket closes, and connected goes false', async () => {
    const api = make(); FakeWS.last.open();
    const p = api.cmd('profile.create', { name: 'x', cols: 1, rows: 1 });
    FakeWS.last.close();
    await expect(p).rejects.toThrow(/connection/i);
    expect(api.get().connected).toBe(false);
  });

  it('passes events to listeners', () => {
    const api = make(); FakeWS.last.open();
    const got: unknown[] = [];
    api.onEvent('pairRequest', d => got.push(d));
    FakeWS.last.recv({ t: 'event', kind: 'pairRequest', data: { deviceId: 'd' } });
    FakeWS.last.recv({ t: 'event', kind: 'log', data: {} });
    expect(got).toEqual([{ deviceId: 'd' }]);
  });
});
