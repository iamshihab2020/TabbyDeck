import type { Native } from './types.ts';
import { createFakeNative } from './fake.ts';

export type { Native } from './types.ts';

/** Windows native layer, or the recording fake (tests, e2e, non-Windows dev). Windows is the only supported host. */
export async function createNative(opts: { fake?: boolean; dataDir: string; echo?: (line: string) => void }): Promise<Native> {
  if (opts.fake || process.env.TABBY_FAKE_NATIVE === '1' || process.platform !== 'win32') return createFakeNative({ echo: opts.echo });
  const { createWinNative } = await import('./win/index.ts');
  return createWinNative({ dataDir: opts.dataDir });
}
