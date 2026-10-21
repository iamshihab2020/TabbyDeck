import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from '../log/logger.ts';

function edgePath(): Promise<string | undefined> {
  const fallback = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe');
  return new Promise(r => execFile('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe', '/ve'], { windowsHide: true }, (err, out) => {
    const found = err ? undefined : /REG_SZ\s+(.+)/.exec(out)?.[1].trim();
    r(found && existsSync(found) ? found : existsSync(fallback) ? fallback : undefined);
  }));
}

/** Open the editor as its own window (Edge app mode), or in the default browser when Edge is missing. */
export async function openEditorWindow(url: string, log: Logger): Promise<void> {
  const edge = await edgePath();
  const profile = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), 'tabbydeck', 'edge-profile');
  const child = edge
    ? spawn(edge, [`--app=${url}`, '--window-size=1280,860', `--user-data-dir=${profile}`, '--no-first-run'], { detached: true, stdio: 'ignore' })
    : spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' });
  child.on('error', e => log.warn('shell', 'could not open the editor window', { error: e.message })); // the url holds the token, so it is not logged
  child.unref();
}
