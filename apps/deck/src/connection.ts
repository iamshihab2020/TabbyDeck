import type { ClientMsg, DeckView, HostMsg } from '@tabbydeck/shared';
import { adopt, loadDevice, type KV } from './device.ts';

export type ConnState = 'connecting' | 'pairing' | 'open' | 'closed' | 'denied' | 'blocked' | 'timeout';

export interface Handlers {
  onState(s: ConnState): void;
  onDeck(v: DeckView): void;
  onPatch(m: Extract<HostMsg, { t: 'patch' }>): void;
  onNotify(m: Extract<HostMsg, { t: 'notify' }>): void;
  onPairRequired(code: string): void;
  onMood?(m: Extract<HostMsg, { t: 'mood' }>): void;
  onStats?(m: Extract<HostMsg, { t: 'stats' }>): void;
  onBadge?(m: Extract<HostMsg, { t: 'badge' }>): void;
}
export interface Deps { WebSocket: typeof WebSocket; caps: { vibrate: boolean; wakeLock: boolean }; version: string }
export interface Connection { send(m: ClientMsg): void; close(): void; retry(): void; rehello(): void; readonly state: ConnState }

const BACKOFF = [1000, 2000, 4000, 8000];
const TERMINAL: ConnState[] = ['denied', 'blocked', 'timeout'];

export function createConnection(url: string, kv: KV, h: Handlers, deps: Deps): Connection {
  let ws: WebSocket | null = null;
  let state: ConnState = 'connecting';
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const set = (s: ConnState) => { state = s; h.onState(s); };
  const raw = (m: ClientMsg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  const hello = () => {
    const d = loadDevice(kv);
    raw({ t: 'hello', deviceId: d.id, name: d.name, ...(d.token ? { token: d.token } : {}), clientVersion: deps.version, caps: deps.caps });
  };

  const open = () => {
    clearTimeout(retryTimer);
    set('connecting');
    const sock = new deps.WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      hello();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => raw({ t: 'ping', sent: Date.now() }), 5000);
    };
    sock.onmessage = (e: MessageEvent | { data: string }) => {
      let m: HostMsg;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      switch (m.t) {
        case 'pairRequired': set('pairing'); h.onPairRequired(m.code); break;
        case 'welcome': adopt(kv, m); attempt = 0; set('open'); break;
        case 'denied': case 'blocked': case 'timeout': stopped = true; set(m.t); break;
        case 'deck': attempt = 0; if (state !== 'open') set('open'); h.onDeck(m.view); break;
        case 'patch': h.onPatch(m); break;
        case 'notify': h.onNotify(m); break;
        case 'mood': h.onMood?.(m); break;
        case 'stats': h.onStats?.(m); break;
        case 'badge': h.onBadge?.(m); break;
        default: break;
      }
    };
    sock.onclose = () => {
      clearInterval(pingTimer);
      if (ws !== sock) return;
      ws = null;
      if (stopped) return;
      set('closed');
      const delay = BACKOFF[Math.min(attempt, BACKOFF.length - 1)];
      attempt++;
      retryTimer = setTimeout(open, delay);
    };
    sock.onerror = () => { /* onclose follows */ };
  };

  open();
  return {
    send: raw,
    close: () => { stopped = true; clearTimeout(retryTimer); clearInterval(pingTimer); const s = ws; ws = null; s?.close(); },
    retry: () => { stopped = false; attempt = 0; const s = ws; ws = null; s?.close(); open(); },
    rehello: hello,
    get state() { return state; },
  };
}

export const isTerminal = (s: ConnState) => TERMINAL.indexOf(s) >= 0;
