// Dev-only runner: the full host with the built client, pairing approved by typing the code on stdin.
// Uses the fake native layer unless TABBY_REAL_NATIVE=1, so taps in a preview cannot shut the PC down.
// Replaced by main.ts (Task 31); the stdin approval is replaced by the editor's approval modal (Task 28).
import path from 'node:path';
import readline from 'node:readline';
import { createLogger } from '../log/logger.ts';
import { diskAssetSource } from '../assets/source.ts';
import { createHost } from '../host.ts';
import { startEditorServer } from '../server/editor.ts';

const root = process.env.TABBY_ROOT ?? process.cwd();
const dataDir = process.env.TABBY_DATA ?? path.join(root, '.data');
const log = createLogger({ dir: path.join(dataDir, 'logs'), level: 'debug', console: true });
const host = await createHost({
  dataDir, log,
  fakeNative: process.env.TABBY_REAL_NATIVE !== '1',
  lanHost: process.env.TABBY_HOST ?? '0.0.0.0',
  lanPort: Number(process.env.TABBY_PORT ?? 8191),
  clientAssets: diskAssetSource(path.join(root, 'apps/deck/dist')),
});
host.pairing.on('request', r => {
  log.info('dev', `PAIR REQUEST from ${r.name} (${r.ip}) — type the code shown on the device and press Enter`);
  // Dev-only screenshot aid: auto-approve loopback requests after a delay. Never used by the real host.
  const ms = Number(process.env.TABBY_DEV_AUTOAPPROVE_MS ?? 0);
  if (ms > 0 && r.ip === '127.0.0.1') setTimeout(() => host.pairing.approve(r.deviceId, r.code), ms);
});

readline.createInterface({ input: process.stdin }).on('line', line => {
  for (const p of host.pairing.pending()) {
    const r = host.pairing.approve(p.deviceId, line.trim());
    log.info('dev', `approve ${p.name}: ${r}`);
    if (r === 'ok') return;
  }
});
const editor = await startEditorServer(host, { port: Number(process.env.TABBY_EDITOR_PORT ?? 8192), log, assets: diskAssetSource(path.join(root, 'apps/editor/dist')), token: process.env.TABBY_EDITOR_TOKEN });
log.info('dev', `editor on ${editor.url}`);
const stop = async () => { await editor.close(); await host.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
log.info('dev', `client on http://127.0.0.1:${host.lanPort}/  data in ${dataDir}  native: ${process.env.TABBY_REAL_NATIVE === '1' ? 'REAL' : 'fake'}`);
