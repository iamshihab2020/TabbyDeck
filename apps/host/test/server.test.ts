import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { diskAssetSource } from '../src/assets/source.ts';
import { attachWs, serveStatic, startHttp, type HttpHandle } from '../src/server/http.ts';
import { nullLogger } from '../src/log/logger.ts';

let dir: string; let h: HttpHandle; let base: string;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-srv-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<html>index</html>');
  writeFileSync(path.join(dir, 'assets', 'app.js'), 'console.log(1)');
  h = await startHttp({ host: '127.0.0.1', port: 0, routes: [serveStatic(diskAssetSource(dir), '/')], log: nullLogger() });
  base = `http://127.0.0.1:${h.port}`;
});
afterEach(async () => { await h.close(); rmSync(dir, { recursive: true, force: true }); });

describe('static serving', () => {
  it('serves index.html for / and for a deep link', async () => {
    for (const p of ['/', '/deep/link']) {
      const r = await fetch(base + p);
      expect(r.status).toBe(200);
      expect(await r.text()).toBe('<html>index</html>');
      expect(r.headers.get('cache-control')).toBe('no-cache');
    }
  });
  it('404s a missing file under /assets/', async () => {
    expect((await fetch(base + '/assets/missing.js')).status).toBe(404);
  });
  it('serves .js as text/javascript', async () => {
    const r = await fetch(base + '/assets/app.js');
    expect(r.headers.get('content-type')).toMatch(/^text\/javascript/);
  });
  it('rejects path traversal', async () => {
    const r = await fetch(base + '/assets/..%2f..%2fetc');
    expect([400, 404]).toContain(r.status);
  });
});

describe('attachWs', () => {
  it('accepts an upgrade on its path and rejects others', async () => {
    attachWs(h.server, '/ws', sock => sock.send('hi'));
    const msg = await new Promise<string>((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${h.port}/ws`); ws.on('message', d => { res(String(d)); ws.close(); }); ws.on('error', rej); });
    expect(msg).toBe('hi');
    const err = await new Promise<string>(res => { const ws = new WebSocket(`ws://127.0.0.1:${h.port}/other`); ws.on('error', e => res(String(e.message))); ws.on('open', () => res('opened')); });
    expect(err).toMatch(/400/);
  });
  it('can veto an upgrade with a check callback (401)', async () => {
    attachWs(h.server, '/editor-ws', () => {}, req => new URL(req.url!, 'http://x').searchParams.get('token') === 'good');
    const bad = await new Promise<string>(res => { const ws = new WebSocket(`ws://127.0.0.1:${h.port}/editor-ws?token=bad`); ws.on('error', e => res(e.message)); ws.on('open', () => res('opened')); });
    expect(bad).toMatch(/401/);
    const good = await new Promise<string>(res => { const ws = new WebSocket(`ws://127.0.0.1:${h.port}/editor-ws?token=good`); ws.on('open', () => { res('opened'); ws.close(); }); ws.on('error', e => res(e.message)); });
    expect(good).toBe('opened');
  });
});

describe('loopback host guard', () => {
  it('returns 403 for a foreign Host header', async () => {
    const g = await startHttp({ host: '127.0.0.1', port: 0, routes: [serveStatic(diskAssetSource(dir), '/')], log: nullLogger(), loopbackOnly: true });
    const { request } = await import('node:http');
    const status = await new Promise<number>(res => { const r = request({ host: '127.0.0.1', port: g.port, path: '/', headers: { Host: 'evil.example' } }, x => res(x.statusCode!)); r.end(); });
    expect(status).toBe(403);
    expect((await fetch(`http://127.0.0.1:${g.port}/`)).status).toBe(200);
    expect((await fetch(`http://localhost:${g.port}/`).catch(() => ({ status: 200 }))).status).toBe(200);
    await g.close();
  });
});

describe('attachWs with two paths on one server', () => {
  it('routes each path and still rejects an unknown one', async () => {
    attachWs(h.server, '/a', s => s.send('a'));
    attachWs(h.server, '/b', s => s.send('b'));
    const get = (p: string) => new Promise<string>(res => { const ws = new WebSocket(`ws://127.0.0.1:${h.port}${p}`); ws.on('message', d => { res(String(d)); ws.close(); }); ws.on('error', e => res(e.message)); });
    expect(await get('/a')).toBe('a');
    expect(await get('/b')).toBe('b');
    expect(await get('/zzz')).toMatch(/400/);
  });
});

describe('loopback guard on WebSocket upgrades', () => {
  it('rejects a foreign Host or a foreign Origin, accepts its own origin', async () => {
    const g = await startHttp({ host: '127.0.0.1', port: 0, routes: [], log: nullLogger(), loopbackOnly: true });
    attachWs(g.server, '/editor-ws', s => s.send('ok'));
    const open = (headers: Record<string, string>) => new Promise<string>(res => {
      const ws = new WebSocket(`ws://127.0.0.1:${g.port}/editor-ws`, { headers });
      ws.on('message', d => { res(String(d)); ws.close(); }); ws.on('error', e => res(e.message));
    });
    expect(await open({ Host: 'evil.example' })).toMatch(/403/);
    expect(await open({ Origin: 'http://evil.example' })).toMatch(/403/);
    expect(await open({ Origin: `http://127.0.0.1:${g.port}` })).toBe('ok');
    expect(await open({ Origin: `http://localhost:${g.port}` })).toBe('ok');
    await g.close();
  });
});
