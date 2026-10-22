import type { WindowInfo } from './types.ts';

/**
 * Whether a window is the one a step names: a program file (code.exe, or just code) matches its windows, anything
 * else matches window titles that contain it. Case does not matter.
 */
export function matchesWindow(match: string, wi: WindowInfo): boolean {
  const m = match.trim().toLowerCase(); if (!m) return false;
  const exe = m.endsWith('.exe') ? m : `${m}.exe`;
  return wi.exe === exe || (!m.endsWith('.exe') && wi.title.toLowerCase().includes(m));
}
