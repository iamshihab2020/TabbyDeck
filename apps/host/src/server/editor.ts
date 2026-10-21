import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { WebSocket } from 'ws';
import { EditorMsgSchema, type EditorState, type HostToEditorMsg } from '@tabbydeck/shared';
import type { Host } from '../host.ts';
import type { Logger } from '../log/logger.ts';
import type { AssetSource } from '../assets/source.ts';
import { safeRel } from '../assets/source.ts';
import { attachWs, startHttp, type Route } from './http.ts';
import { dispatchCommand } from './commands.ts';
import { assetRoute } from '../assets/store.ts';
import { connectUrls, listLanInterfaces, sortInterfaces } from './net.ts';

export const VERSION = '0.1.0';

export interface EditorServer { port: number; token: string; url: string; close(): Promise<void> }

function tokenOk(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

function buildState(host: Host, log: Logger): EditorState {
  const ifaces = listLanInterfaces();
  const assets = host.assets.list();
  return {
    profiles: host.store.profiles(),
    devices: host.store.devices().map(({ tokenHash: _t, ...d }) => d),
    connected: host.clients.connected(),
    pending: host.pairing.pending(),
    settings: host.store.settings(),
    catalogue: host.registry.list(),
    connect: { urls: connectUrls(host.store.settings(), host.lanPort, ifaces), interfaces: sortInterfaces(ifaces) },
    assets,
    log: log.tail(200),
    version: VERSION,
    paused: host.engine.paused,
  };
}

/**
 * The editor's server on 127.0.0.1 only. The page and the WebSocket require the per-launch token, and the
 * loopback guard rejects foreign Host and Origin headers, so other web pages cannot drive the host.
 */
export async function startEditorServer(host: Host, opts: { port: number; log: Logger; assets?: AssetSource; token?: string }): Promise<EditorServer> {
  const token = opts.token ?? randomBytes(32).toString('base64url');
  const sockets = new Set<WebSocket>();
  const send = (s: WebSocket, m: HostToEditorMsg) => { if (s.readyState === 1) s.send(JSON.stringify(m)); };
  const broadcast = (m: HostToEditorMsg) => { for (const s of sockets) send(s, m); };

  let timer: NodeJS.Timeout | null = null;
  const pushState = () => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; if (sockets.size) broadcast({ t: 'state', state: buildState(host, opts.log) }); }, 30);
  };

  const page: Route = {
    method: 'GET', path: '/',
    handler(req, res) {
      const url = new URL(req.url ?? '/', 'http://local');
      const rel = safeRel(url.pathname.slice(1));
      if (rel === undefined) { res.writeHead(400); res.end(); return; }
      const isAsset = /\.[a-z0-9]+$/i.test(rel) && rel !== 'index.html';
      if (!isAsset && !tokenOk(token, url.searchParams.get('token'))) { res.writeHead(401, { 'content-type': 'text/plain' }); res.end('Open TabbyDeck from its tray icon.'); return; }
      const body = opts.assets?.read(isAsset ? rel : 'index.html');
      if (!body) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': opts.assets!.contentType(isAsset ? rel : 'index.html'), 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
      res.end(body);
    },
  };
  const http = await startHttp({ host: '127.0.0.1', port: opts.port, routes: [assetRoute(host.assets), page], log: opts.log, loopbackOnly: true });
  attachWs(http.server, '/editor-ws', sock => {
    sockets.add(sock);
    send(sock, { t: 'state', state: buildState(host, opts.log) });
    sock.on('message', async data => {
      let msg;
      try { msg = EditorMsgSchema.safeParse(JSON.parse(String(data))); } catch { msg = null; }
      if (!msg?.success) return send(sock, { t: 'result', id: '', ok: false, error: 'invalid' });
      const r = await dispatchCommand(msg.data.name, msg.data.args, { host, log: opts.log, onPausedChange: pushState });
      send(sock, { t: 'result', id: msg.data.id, ...r });
      pushState();
    });
    sock.on('close', () => sockets.delete(sock));
    sock.on('error', () => {});
  }, req => tokenOk(token, new URL(req.url ?? '/', 'http://local').searchParams.get('token')), 8 * 1024 * 1024);

  // Live updates: anything the editor shows.
  const s = host.store;
  const offs: (() => void)[] = [];
  const on = <E extends string>(em: { on(e: E, f: (...a: never[]) => void): unknown; off(e: E, f: (...a: never[]) => void): unknown }, e: E, f: (...a: never[]) => void) => { em.on(e, f); offs.push(() => em.off(e, f)); };
  for (const e of ['profile', 'profileDeleted', 'devices', 'settings'] as const) on(s as never, e, pushState);
  for (const e of ['approved', 'denied', 'timeout'] as const) on(host.pairing as never, e, pushState);
  on(host.pairing as never, 'request', ((r: { deviceId: string; name: string; ip: string }) => { broadcast({ t: 'event', kind: 'pairRequest', data: { deviceId: r.deviceId, name: r.name, ip: r.ip } }); pushState(); }) as never);
  for (const e of ['deviceConnected', 'deviceDisconnected'] as const) on(host.clients as never, e, ((d: unknown) => { broadcast({ t: 'event', kind: e, data: d }); pushState(); }) as never);
  on(host.engine as never, 'pauseChange', pushState);
  on(host.engine as never, 'actionError', ((d: unknown) => broadcast({ t: 'event', kind: 'actionError', data: d })) as never);
  offs.push(opts.log.on(line => broadcast({ t: 'event', kind: 'log', data: line })));

  return {
    port: http.port, token, url: `http://127.0.0.1:${http.port}/?token=${token}`,
    async close() { if (timer) clearTimeout(timer); for (const off of offs) off(); for (const x of sockets) x.close(); await http.close(); },
  };
}
