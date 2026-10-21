import path from 'node:path';
import { createRequire } from 'node:module';

type Koffi = typeof import('koffi');
declare const __TABBY_BUNDLE__: boolean | undefined;
// CJS (single executable) has __filename; ESM (tests, dev) has import.meta.url.
const here = typeof __filename !== 'undefined' ? __filename : import.meta.url;
let cached: Koffi | null = null;

/**
 * Load koffi. Inside the single executable, koffi's loader cannot see its own package folder, so it is pointed at
 * `<exe dir>/koffi/win32_x64/koffi.node` through process.resourcesPath (one of the roots it searches).
 */
export function loadKoffi(): Koffi {
  if (cached) return cached;
  let isSea = false;
  try { isSea = (createRequire(here)('node:sea') as { isSea(): boolean }).isSea(); } catch { /* not available */ }
  if (isSea) (process as unknown as { resourcesPath: string }).resourcesPath = path.dirname(process.execPath);
  // The exe build defines __TABBY_BUNDLE__ so esbuild sees a plain require and bundles koffi's JS into the exe.
  cached = (typeof __TABBY_BUNDLE__ !== 'undefined' ? require('koffi') : createRequire(here)('koffi')) as Koffi;
  return cached;
}
