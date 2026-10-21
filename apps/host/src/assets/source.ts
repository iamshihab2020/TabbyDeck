import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export interface AssetSource {
  read(relPath: string): Buffer | undefined;
  contentType(relPath: string): string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gif': 'image/gif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4',
};
export const contentTypeOf = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';

/** Normalise a URL path to a relative asset path, or undefined if it tries to leave the root. */
export function safeRel(urlPath: string): string | undefined {
  let p: string;
  try { p = decodeURIComponent(urlPath); } catch { return undefined; }
  if (p.includes('\0')) return undefined;
  const slashed = p.replace(/\\/g, '/');
  if (slashed.split('/').includes('..')) return undefined;
  return path.posix.normalize('/' + slashed).slice(1);
}

export function diskAssetSource(dir: string): AssetSource {
  const root = path.resolve(dir);
  return {
    read(rel) {
      const p = path.resolve(root, rel);
      if (p !== root && !p.startsWith(root + path.sep)) return undefined;
      try { if (!statSync(p).isFile()) return undefined; return readFileSync(p); } catch { return undefined; }
    },
    contentType: contentTypeOf,
  };
}

/** Assets embedded in the single executable under `<prefix>/<rel>`. */
export function seaAssetSource(prefix: string): AssetSource {
  const sea = createRequire(import.meta.url ?? __filename)('node:sea') as typeof import('node:sea');
  const keys = new Set(sea.getAssetKeys());
  return {
    read(rel) {
      const key = `${prefix}/${rel}`;
      return keys.has(key) ? Buffer.from(sea.getRawAsset(key) as ArrayBuffer) : undefined;
    },
    contentType: contentTypeOf,
  };
}
