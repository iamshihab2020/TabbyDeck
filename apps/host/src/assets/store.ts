import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Store } from '../store/store.ts';
import type { Route } from '../server/http.ts';
import { contentTypeOf } from './source.ts';

export class AssetError extends Error { constructor(public code: 'too_large' | 'bad_type' | 'not_found') { super(code); } }

const MAX_BYTES = 1024 * 1024;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const ID = /^[a-f0-9]{40}\.(png|jpg|gif|webp|svg)$/;

/** Uploaded button images, stored by content hash in <data>/assets. */
export class AssetStore {
  constructor(private store: Store) {}

  async save(_name: string, dataUrl: string): Promise<{ id: string }> {
    const m = /^data:([a-z+/.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    const ext = m ? TYPES[m[1]] : undefined;
    if (!m || !ext) throw new AssetError('bad_type');
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > MAX_BYTES) throw new AssetError('too_large');
    const id = `${createHash('sha1').update(bytes).digest('hex')}.${ext}`;
    const file = path.join(this.store.assetsDir, id);
    if (!existsSync(file)) writeFileSync(file, bytes);
    return { id };
  }

  list(): { id: string; name: string }[] {
    try { return readdirSync(this.store.assetsDir).filter(f => ID.test(f)).map(id => ({ id, name: id })); } catch { return []; }
  }

  read(id: string): Buffer | undefined {
    if (!ID.test(id)) return undefined;
    try { return readFileSync(path.join(this.store.assetsDir, id)); } catch { return undefined; }
  }

  /** Delete an image and clear it from every button and background that showed it. */
  delete(id: string): void {
    if (!ID.test(id)) throw new AssetError('not_found');
    rmSync(path.join(this.store.assetsDir, id), { force: true });
    for (const f of this.store.profiles()) if (f.profile.bgImage === id) this.store.updateProfile(f.profile.id, { bgImage: undefined });
    for (const f of this.store.profiles()) for (const w of f.widgets) {
      if (w.look.image === id) { const { image: _i, ...look } = w.look; this.store.updateWidget(w.id, { look }); }
    }
  }
}

/** GET /assets/u/<id>. User files are served with a sandboxing CSP, so even an SVG cannot run script. */
export function assetRoute(assets: AssetStore): Route {
  return {
    method: 'GET', path: /^\/assets\/u\/([^/]+)$/,
    handler(_req, res, m) {
      let id = '';
      try { id = decodeURIComponent(m![1]); } catch { /* bad escape */ }
      const body = assets.read(id);
      if (!body) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, {
        'content-type': contentTypeOf(id), 'cache-control': 'public, max-age=31536000, immutable',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox", 'x-content-type-options': 'nosniff',
      });
      res.end(body);
    },
  };
}
