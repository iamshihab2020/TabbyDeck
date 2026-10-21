import type { EditorCommandName, EditorState, HostToEditorMsg } from '@tabbydeck/shared';

type EventKind = Extract<HostToEditorMsg, { t: 'event' }>['kind'];
export interface ApiSnapshot { state: EditorState | null; connected: boolean }
export interface Api {
  get(): ApiSnapshot;
  subscribe(fn: (s: ApiSnapshot) => void): () => void;
  cmd<T = unknown>(name: EditorCommandName, args: unknown): Promise<T>;
  onEvent(kind: EventKind, fn: (data: unknown) => void): () => void;
  onError(fn: (error: string) => void): () => void;
  close(): void;
}

/** The editor's link to the host: one WebSocket, state snapshots in, commands out, with reconnect. */
export function createApi(opts: { url: string; WebSocket?: typeof WebSocket }): Api {
  const WS = opts.WebSocket ?? WebSocket;
  let snap: ApiSnapshot = { state: null, connected: false };
  const subs = new Set<(s: ApiSnapshot) => void>();
  const events = new Map<EventKind, Set<(d: unknown) => void>>();
  const errorSubs = new Set<(e: string) => void>();
  const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void }>();
  let ws: WebSocket | null = null;
  let seq = 0;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const set = (p: Partial<ApiSnapshot>) => { snap = { ...snap, ...p }; for (const f of subs) f(snap); };
  const fail = (e: string) => { for (const f of errorSubs) f(e); };

  const open = () => {
    const sock = new WS(opts.url);
    ws = sock;
    sock.onopen = () => set({ connected: true });
    sock.onmessage = (e: MessageEvent | { data: string }) => {
      let m: HostToEditorMsg;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.t === 'state') set({ state: m.state });
      else if (m.t === 'result') {
        const p = pending.get(m.id); if (!p) return;
        pending.delete(m.id);
        if (m.ok) p.resolve(m.data); else { fail(m.error ?? 'error'); p.reject(new Error(m.error ?? 'error')); }
      } else if (m.t === 'event') for (const f of events.get(m.kind) ?? []) f(m.data);
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      for (const p of pending.values()) p.reject(new Error('Lost the connection to TabbyDeck'));
      pending.clear();
      set({ connected: false });
      if (!closed) retry = setTimeout(open, 1500);
    };
  };
  open();

  return {
    get: () => snap,
    subscribe: fn => { subs.add(fn); return () => subs.delete(fn); },
    cmd: <T,>(name: EditorCommandName, args: unknown) => new Promise<T>((resolve, reject) => {
      if (!ws || ws.readyState !== 1) { fail('Not connected to TabbyDeck'); return reject(new Error('Not connected to TabbyDeck')); }
      const id = `c${++seq}`;
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ t: 'cmd', id, name, args }));
    }),
    onEvent: (kind, fn) => { const s = events.get(kind) ?? new Set(); s.add(fn); events.set(kind, s); return () => s.delete(fn); },
    onError: fn => { errorSubs.add(fn); return () => errorSubs.delete(fn); },
    close: () => { closed = true; clearTimeout(retry); ws?.close(); },
  };
}
