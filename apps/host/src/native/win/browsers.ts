import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserProfile } from '@tabbydeck/shared';

type Found = BrowserProfile & { exe: string; dir: string };

// Where each browser keeps its profiles (under %LOCALAPPDATA%) and where its program is installed, most usual first.
const BROWSERS = [
  { key: 'chrome', name: 'Chrome', data: 'Google\\Chrome\\User Data', exe: [['ProgramFiles', 'Google\\Chrome\\Application\\chrome.exe'], ['ProgramFiles(x86)', 'Google\\Chrome\\Application\\chrome.exe'], ['LOCALAPPDATA', 'Google\\Chrome\\Application\\chrome.exe']] },
  { key: 'edge', name: 'Edge', data: 'Microsoft\\Edge\\User Data', exe: [['ProgramFiles(x86)', 'Microsoft\\Edge\\Application\\msedge.exe'], ['ProgramFiles', 'Microsoft\\Edge\\Application\\msedge.exe']] },
  { key: 'brave', name: 'Brave', data: 'BraveSoftware\\Brave-Browser\\User Data', exe: [['ProgramFiles', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'], ['LOCALAPPDATA', 'BraveSoftware\\Brave-Browser\\Application\\brave.exe']] },
] as const;

/** The profiles a browser's "Local State" file lists, as [folder, name], in the order the browser keeps them. */
export function profilesFromLocalState(json: unknown): [string, string][] {
  const cache = (json as { profile?: { info_cache?: Record<string, { name?: unknown }> } } | null)?.profile?.info_cache;
  if (!cache || typeof cache !== 'object') return [];
  return Object.entries(cache).filter(([dir, p]) => /^[\w .-]{1,64}$/.test(dir) && typeof p?.name === 'string').map(([dir, p]) => [dir, String(p.name)]);
}

export async function browserProfiles(env: NodeJS.ProcessEnv = process.env): Promise<Found[]> {
  const out: Found[] = [];
  for (const b of BROWSERS) {
    const exe = b.exe.map(([root, rel]) => env[root] && path.join(env[root]!, rel)).find(p => p && existsSync(p));
    if (!exe || !env.LOCALAPPDATA) continue;
    let state: unknown;
    try { state = JSON.parse(readFileSync(path.join(env.LOCALAPPDATA, b.data, 'Local State'), 'utf8')); } catch { continue; }
    for (const [dir, name] of profilesFromLocalState(state)) out.push({ id: `${b.key}:${dir}`, browser: b.name, name, exe, dir });
  }
  return out;
}
