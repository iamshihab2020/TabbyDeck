import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_LOOK } from '@tabbydeck/shared';
import { Store } from '../src/store/store.ts';
import { nullLogger } from '../src/log/logger.ts';
import { AssetStore, AssetError, assetRoute } from '../src/assets/store.ts';
import { startHttp, type HttpHandle } from '../src/server/http.ts';

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let dir: string; let store: Store; let assets: AssetStore;
beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tabby-assets-'));
  store = new Store({ dir, log: nullLogger() }); await store.load();
  assets = new AssetStore(store);
});
afterEach(async () => { await store.flush(); rmSync(dir, { recursive: true, force: true }); });
const code = async (p: Promise<unknown>) => { try { await p; return 'no error'; } catch (e) { return (e as AssetError).code; } };

describe('AssetStore', () => {
  it('stores an upload under its content hash and lists it', async () => {
    const a = await assets.save('logo.png', PNG_1PX);
    expect(a.id).toMatch(/^[a-f0-9]{40}\.png$/);
    expect(existsSync(path.join(store.assetsDir, a.id))).toBe(true);
    expect(assets.list()).toEqual([{ id: a.id, name: a.id }]);
  });
  it('the same upload twice returns the same id', async () => {
    expect((await assets.save('a.png', PNG_1PX)).id).toBe((await assets.save('b.png', PNG_1PX)).id);
  });
  it('rejects anything over 1 MB with too_large', async () => {
    const big = 'data:image/png;base64,' + Buffer.alloc(1024 * 1024 + 10).toString('base64');
    expect(await code(assets.save('big.png', big))).toBe('too_large');
  });
  it('rejects types other than png, jpeg, gif, webp and svg', async () => {
    expect(await code(assets.save('x.html', 'data:text/html;base64,PGgxPg=='))).toBe('bad_type');
    expect(await code(assets.save('x', 'not a data url'))).toBe('bad_type');
  });
  it('delete removes the file and clears look.image on buttons that used it', async () => {
    const a = await assets.save('logo.png', PNG_1PX);
    const w = store.profiles()[0].widgets[0];
    store.updateWidget(w.id, { look: { ...DEFAULT_LOOK, image: a.id, label: 'X' } });
    assets.delete(a.id);
    expect(existsSync(path.join(store.assetsDir, a.id))).toBe(false);
    expect(store.widget(w.id)?.look.image).toBeUndefined();
  });
  it('refuses ids that are not asset names', () => {
    expect(() => assets.delete('../settings.json')).toThrow();
  });
});

describe('asset route', () => {
  let h: HttpHandle;
  afterEach(async () => { await h?.close(); });
  it('serves uploads with a long cache and a sandboxing CSP, 404s unknown ids', async () => {
    const a = await assets.save('logo.png', PNG_1PX);
    h = await startHttp({ host: '127.0.0.1', port: 0, routes: [assetRoute(assets)], log: nullLogger() });
    const r = await fetch(`http://127.0.0.1:${h.port}/assets/u/${a.id}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toMatch(/max-age=31536000/);
    expect(r.headers.get('content-security-policy')).toMatch(/sandbox/);
    expect((await fetch(`http://127.0.0.1:${h.port}/assets/u/${'0'.repeat(40)}.png`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${h.port}/assets/u/..%2fsettings.json`)).status).toBe(404);
  });
});
