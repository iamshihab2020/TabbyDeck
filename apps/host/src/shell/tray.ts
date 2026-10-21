import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import readline from 'node:readline';
import type { Logger } from '../log/logger.ts';

export interface TrayState { paused: boolean; pending: boolean }
export interface Tray { state(s: TrayState): void; balloon(title: string, text: string): void; close(): void }

/**
 * Runs tabbydeck-tray.exe (native-src/tray.cs) and speaks JSON lines with it. If the helper dies it is restarted
 * once; after that TabbyDeck keeps running without a tray icon.
 */
export function startTray(o: { exe: string; log: Logger; onClick(id: string): void; /** tabbydeck.exe, so the editor window pins as TabbyDeck */ relaunch?: string }): Tray {
  let child: ChildProcess | null = null;
  let restarts = 0, closed = false, last: TrayState | null = null;
  const send = (m: unknown) => { if (child?.stdin?.writable) child.stdin.write(JSON.stringify(m) + '\n'); };
  const start = () => {
    if (!existsSync(o.exe)) { o.log.warn('tray', 'tray helper missing, running without a tray icon', { exe: o.exe }); return; }
    const c = spawn(o.exe, o.relaunch ? [o.relaunch] : [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    child = c;
    c.stdin.on('error', () => {});
    c.on('error', e => o.log.warn('tray', 'tray helper failed', { error: e.message }));
    readline.createInterface({ input: c.stdout }).on('line', line => {
      try { const m = JSON.parse(line) as { click?: unknown }; if (typeof m.click === 'string') o.onClick(m.click); } catch { /* not a message */ }
    });
    c.on('exit', code => {
      if (closed || child !== c) return;
      child = null;
      if (restarts++ >= 1) { o.log.warn('tray', 'tray helper stopped again, running without a tray icon', { code }); return; }
      o.log.warn('tray', 'tray helper stopped, restarting it', { code });
      start();
      if (last) send({ state: last });
    });
  };
  start();
  return {
    state(s) { last = s; send({ state: s }); },
    balloon(title, text) { send({ balloon: { title, text } }); },
    close() { closed = true; send({ quit: true }); child?.stdin?.end(); child = null; },
  };
}
