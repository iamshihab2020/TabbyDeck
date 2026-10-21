import { execFile } from 'node:child_process';

const RUN = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const reg = (args: string[]) => new Promise<boolean>(r => execFile('reg.exe', args, { windowsHide: true }, err => r(!err)));

/** Start TabbyDeck (in the tray only) when the user signs in to Windows. */
export async function setAutoStart(on: boolean, o: { key?: string; exe?: string } = {}): Promise<void> {
  const key = o.key ?? RUN;
  await reg(['delete', key, '/v', 'Tabby', '/f']); // the entry from before the rename to TabbyDeck
  if (!on) { await reg(['delete', key, '/v', 'TabbyDeck', '/f']); return; } // fails harmlessly when already absent
  if (!await reg(['add', key, '/v', 'TabbyDeck', '/t', 'REG_SZ', '/d', `"${o.exe ?? process.execPath}" --tray-only`, '/f'])) throw new Error('reg add failed');
}

export const isAutoStart = (o: { key?: string } = {}) => reg(['query', o.key ?? RUN, '/v', 'TabbyDeck']);
