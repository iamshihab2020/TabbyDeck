import { promises as fs } from 'node:fs';
import type { z } from 'zod';
import type { Logger } from '../log/logger.ts';

const chains = new Map<string, Promise<void>>();

/** Write JSON to path.tmp then rename over path; writes to the same path are serialised. */
export function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  const prev = chains.get(path) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const tmp = `${path}.tmp`;
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, path);
  });
  chains.set(path, next);
  void next.finally(() => { if (chains.get(path) === next) chains.delete(path); }).catch(() => {});
  return next;
}

/** Read and validate JSON; a missing file returns the fallback, a corrupt one is moved aside first. */
export async function readJsonOr<T>(path: string, schema: z.ZodType<T>, fallback: () => T, log: Logger): Promise<{ value: T; created: boolean }> {
  let text: string;
  try { text = await fs.readFile(path, 'utf8'); } catch { return { value: fallback(), created: true }; }
  try {
    return { value: schema.parse(JSON.parse(text)), created: false };
  } catch (e) {
    const aside = `${path}.corrupt-${Date.now()}`;
    await fs.rename(path, aside).catch(() => {});
    log.warn('store', 'corrupt file moved aside', { path, aside, error: String(e).slice(0, 200) });
    return { value: fallback(), created: true };
  }
}
