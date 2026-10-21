import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isSea } from 'node:sea';
import { starterProfileFile } from '@tabbydeck/shared';
import { parseArgs, type Config } from './config.ts';
import { createLogger } from './log/logger.ts';
import { diskAssetSource, seaAssetSource, type AssetSource } from './assets/source.ts';
import { createHost, type Host } from './host.ts';
import { startEditorServer, type EditorServer } from './server/editor.ts';
import { startTray, type Tray } from './shell/tray.ts';
import { openEditorWindow } from './shell/editorWindow.ts';
import { setAutoStart } from './shell/autostart.ts';

export type Booted =
  | { kind: 'running'; host: Host; editor: EditorServer; stop(): Promise<void>; onOpenRequest(fn: () => void): void }
  | { kind: 'second-instance' };

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** Take the data folder's lock, or report that a running TabbyDeck holds it. */
function takeLock(file: string): boolean {
  try { const fd = openSync(file, 'wx'); writeFileSync(fd, String(process.pid)); closeSync(fd); return true; } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  }
  // shortcut: a reused pid from a crashed run blocks start until that process ends; check the process name if it bites
  const pid = Number(readFileSync(file, 'utf8'));
  if (pid && alive(pid)) return false;
  writeFileSync(file, String(process.pid)); // stale lock left by a crash
  return true;
}

const root = () => process.env.TABBY_ROOT ?? process.cwd();
const appAssets = (name: 'deck' | 'editor'): AssetSource => isSea() ? seaAssetSource(name) : diskAssetSource(path.join(root(), 'apps', name, 'dist'));
const trayExe = () => isSea() ? path.join(path.dirname(process.execPath), 'tabbydeck-tray.exe') : path.join(root(), 'apps', 'host', 'bin', 'out', 'tabbydeck-tray.exe');

/** Start TabbyDeck: host, editor server, tray, editor window. A second start hands over to the running one. */
export async function boot(cfg: Config): Promise<Booted> {
  mkdirSync(cfg.dataDir, { recursive: true });
  const lockFile = path.join(cfg.dataDir, 'tabby.lock'), flag = path.join(cfg.dataDir, 'open.flag');
  if (!takeLock(lockFile)) { writeFileSync(flag, ''); return { kind: 'second-instance' }; }
  try { unlinkSync(flag); } catch { /* none */ }

  const log = createLogger({ dir: path.join(cfg.dataDir, 'logs'), level: 'info' });
  let host: Host | undefined, editor: EditorServer;
  try {
    host = await createHost({ dataDir: cfg.dataDir, log, fakeNative: cfg.fakeNative, lanPort: cfg.port, clientAssets: appAssets('deck'), firstRun: starterProfileFile });
    editor = await startEditorServer(host, { port: cfg.editorPort ?? host.store.settings().editorPort, log, assets: appAssets('editor') });
  } catch (e) {
    log.error('main', 'TabbyDeck could not start', { error: String(e) });
    await host?.close();
    try { unlinkSync(lockFile); } catch { /* gone */ }
    throw e;
  }
  const h = host;

  const openWindow = (page?: string) => { if (cfg.window) void openEditorWindow(editor.url + (page ? `#${page}` : ''), log); };
  const openers: (() => void)[] = [() => openWindow()];
  const poll = setInterval(() => {
    if (!existsSync(flag)) return;
    try { unlinkSync(flag); } catch { /* raced */ }
    for (const f of openers) f();
  }, 300);
  poll.unref();

  let tray: Tray | null = null;
  const syncTray = () => tray?.state({ paused: h.engine.paused, pending: h.pairing.pending().length > 0 });
  if (cfg.tray) {
    tray = startTray({
      exe: trayExe(), log, relaunch: isSea() ? process.execPath : undefined,
      onClick(id) {
        if (id === 'open') openWindow();
        else if (id === 'devices' || id === 'balloon') openWindow('devices');
        else if (id === 'pause') h.engine.paused = !h.engine.paused;
        else if (id === 'quit') void stop().then(() => process.exit(0));
      },
    });
    h.engine.on('pauseChange', syncTray);
    for (const e of ['request', 'approved', 'denied', 'timeout'] as const) h.pairing.on(e, syncTray);
    h.pairing.on('request', r => tray?.balloon('TabbyDeck', `${r.name} wants to connect. Click to approve it.`));
  }

  // Until a phone or tablet is connected, the tray says so now and then; clicking it opens Devices.
  const remind = () => { if (!h.store.devices().some(d => d.approved && !d.blocked)) tray?.balloon('Connect your phone or tablet', 'Open TabbyDeck and scan the code to use your deck. Click here to start.'); };
  const firstReminder = setTimeout(remind, 20_000), reminders = setInterval(remind, 30 * 60_000);
  firstReminder.unref(); reminders.unref();

  // Auto-start only means something for the installed tabbydeck.exe; in development execPath is node.exe.
  const syncAutoStart = () => {
    if (isSea()) setAutoStart(h.store.settings().autoStart).catch(e => log.warn('shell', 'could not change auto-start', { error: String(e) }));
  };
  syncAutoStart();
  h.store.on('settings', syncAutoStart);

  let stopping: Promise<void> | null = null;
  const stop = () => stopping ??= (async () => {
    clearInterval(poll); clearTimeout(firstReminder); clearInterval(reminders);
    tray?.close();
    await editor.close();
    await h.close();
    try { unlinkSync(lockFile); } catch { /* gone */ }
  })();

  if (!cfg.trayOnly && h.store.settings().openEditorOnStart) openWindow();
  log.info('main', 'TabbyDeck started', { phonePort: h.lanPort, editorPort: editor.port, dataDir: cfg.dataDir });
  return { kind: 'running', host: h, editor, stop, onOpenRequest: fn => { openers.push(fn); } };
}

export async function run(argv: string[]): Promise<void> {
  const b = await boot(parseArgs(argv));
  if (b.kind !== 'running') return; // the running TabbyDeck opens its window
  const quit = () => void b.stop().then(() => process.exit(0));
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}
