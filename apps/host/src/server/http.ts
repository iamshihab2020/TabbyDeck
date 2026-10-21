import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Logger } from '../log/logger.ts';
import { safeRel, type AssetSource } from '../assets/source.ts';

export interface Route {
  method: 'GET' | 'POST';
  path: string | RegExp;
  handler(req: IncomingMessage, res: ServerResponse, params: RegExpMatchArray | null): void | Promise<void>;
}
export interface HttpHandle { server: http.Server; port: number; close(): Promise<void> }

const send = (res: ServerResponse, status: number, body = '') => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' }); res.end(body); };

/** Servers created with loopbackOnly: requests and upgrades must carry a loopback Host (and Origin, if any). */
const loopbackGuards = new WeakMap<http.Server, (req: IncomingMessage) => boolean>();

export function startHttp(opts: { host: string; port: number; routes: Route[]; log: Logger; loopbackOnly?: boolean }): Promise<HttpHandle> {
  const server = http.createServer(async (req, res) => {
    try {
      if (opts.loopbackOnly && !loopbackGuards.get(server)!(req)) return send(res, 403, 'forbidden');
      const url = new URL(req.url ?? '/', 'http://local');
      for (const r of opts.routes) {
        if (r.method !== req.method) continue;
        const m = typeof r.path === 'string' ? (url.pathname === r.path || r.path === '/' ? [url.pathname] as unknown as RegExpMatchArray : null) : url.pathname.match(r.path);
        if (m) return await r.handler(req, res, m);
      }
      send(res, 404, 'not found');
    } catch (e) {
      opts.log.error('http', 'handler failed', { url: req.url, error: String(e) });
      if (!res.headersSent) send(res, 500, 'error'); else res.end();
    }
  });
  server.on('clientError', (_e, sock) => sock.destroy());
  if (opts.loopbackOnly) {
    loopbackGuards.set(server, req => {
      const port = (server.address() as AddressInfo).port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host ?? '')) return false;
      const origin = req.headers.origin;
      return origin === undefined || hosts.some(h => origin === `http://${h}`);
    });
  }
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port, opts.host, () => {
      server.off('error', reject);
      resolve({
        server, port: (server.address() as AddressInfo).port,
        // Terminate WebSocket clients first, then idle HTTP connections, then stop listening. Racing these
        // tore down sockets that were already closing, which intermittently crashed Node on Windows (0xC0000409).
        close: async () => {
          for (const wss of wsServers.get(server) ?? []) { for (const c of wss.clients) c.terminate(); await new Promise<void>(r => wss.close(() => r())); }
          await new Promise<void>(r => { server.close(() => r()); server.closeIdleConnections?.(); });
        },
      });
    });
  });
}

/** Static files from `source`; unknown non-asset paths fall back to index.html (single-page app). */
export function serveStatic(source: AssetSource, mountPath: string): Route {
  const prefix = mountPath.endsWith('/') ? mountPath : mountPath + '/';
  return {
    method: 'GET', path: '/',
    handler(req, res) {
      const pathname = new URL(req.url ?? '/', 'http://local').pathname;
      if (!pathname.startsWith(prefix) && pathname + '/' !== prefix) return send(res, 404, 'not found');
      const rel = safeRel(pathname.slice(prefix.length));
      if (rel === undefined) return send(res, 400, 'bad path');
      const isAsset = /\.[a-z0-9]+$/i.test(rel);
      const target = rel === '' || !isAsset ? 'index.html' : rel;
      const body = source.read(target);
      if (!body) return send(res, 404, 'not found');
      res.writeHead(200, { 'content-type': source.contentType(target), 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      res.end(body);
    },
  };
}

const wsPaths = new WeakMap<http.Server, Set<string>>();
const wsServers = new WeakMap<http.Server, WebSocketServer[]>();

/** Accept WebSocket upgrades on `wsPath` only; `check` may veto with 401. Unknown paths get 400. */
export function attachWs(server: http.Server, wsPath: string, onConnection: (socket: WebSocket, req: IncomingMessage) => void, check?: (req: IncomingMessage) => boolean, maxPayload = 4 * 1024 * 1024): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload });
  wsServers.set(server, [...(wsServers.get(server) ?? []), wss]);
  const paths = wsPaths.get(server) ?? new Set<string>();
  wsPaths.set(server, paths);
  const owner = paths.size === 0; // the first attachWs on a server answers unknown paths
  paths.add(wsPath);
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url ?? '/', 'http://local').pathname;
    if (pathname !== wsPath) {
      if (owner && !paths.has(pathname)) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }
    const guard = loopbackGuards.get(server);
    if (guard && !guard(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    if (check && !check(req)) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, ws => onConnection(ws, req));
  });
  return wss;
}
