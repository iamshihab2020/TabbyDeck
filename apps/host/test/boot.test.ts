import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, type Booted } from '../src/main.ts';
import { parseArgs } from '../src/config.ts';
import { isAutoStart, setAutoStart } from '../src/shell/autostart.ts';

const dirs: string[] = []; const running: Extract<Booted, { kind: 'running' }>[] = [];
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), 'tabby-boot-')); dirs.push(d); return d; };
afterEach(async () => { for (const b of running.splice(0)) await b.stop(); for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('parseArgs', () => {
  it('reads data dir, fake native, ports and tray flags', () => {
    expect(parseArgs(['--data-dir', 'C:/x', '--fake-native', '--port', '9000', '--editor-port', '9001', '--no-tray', '--no-window', '--tray-only'])).toEqual({
      dataDir: 'C:/x', fakeNative: true, port: 9000, editorPort: 9001, tray: false, window: false, trayOnly: true,
    });
  });
  it('defaults the data dir to %APPDATA%/tabbydeck', () => {
    expect(parseArgs([]).dataDir).toBe(path.join(process.env.APPDATA ?? path.join(process.env.HOME ?? '', '.config'), 'tabbydeck'));
  });
});

describe('boot', () => {
  it('starts both servers, and both answer', async () => {
    const dataDir = tmp();
    const b = await boot({ dataDir, fakeNative: true, port: 0, editorPort: 0, tray: false, window: false, trayOnly: false });
    if (b.kind !== 'running') throw new Error(b.kind);
    running.push(b);
    expect((await fetch(`http://127.0.0.1:${b.host.lanPort}/assets/u/none.png`)).status).toBe(404);
    expect((await fetch(`http://127.0.0.1:${b.editor.port}/`)).status).toBe(401); // up and guarded; the page itself needs a built editor
    expect(existsSync(path.join(dataDir, 'tabby.lock'))).toBe(true);
    expect(b.host.store.profiles()[0].widgets).toHaveLength(35); // a fresh install starts with the starter deck
  });

  it('a second start with the same data dir asks the first to open its window and stops', async () => {
    const dataDir = tmp();
    const first = await boot({ dataDir, fakeNative: true, port: 0, editorPort: 0, tray: false, window: false, trayOnly: false });
    if (first.kind !== 'running') throw new Error(first.kind);
    running.push(first);
    let opened = 0;
    first.onOpenRequest(() => opened++);
    const second = await boot({ dataDir, fakeNative: true, port: 0, editorPort: 0, tray: false, window: false, trayOnly: false });
    expect(second.kind).toBe('second-instance');
    for (let i = 0; i < 50 && !opened; i++) await new Promise(r => setTimeout(r, 40));
    expect(opened).toBe(1);
  });

  it('a stale lock from a crashed run does not block start', async () => {
    const dataDir = tmp();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(dataDir, 'tabby.lock'), '999999');
    const b = await boot({ dataDir, fakeNative: true, port: 0, editorPort: 0, tray: false, window: false, trayOnly: false });
    expect(b.kind).toBe('running');
    if (b.kind === 'running') running.push(b);
  });
});

describe.runIf(process.platform === 'win32')('auto-start', () => {
  const key = 'HKCU\\Software\\TabbyTest\\Run';
  afterEach(async () => { await setAutoStart(false, { key }); });
  it('writes and removes the Run entry with the exe path', async () => {
    await setAutoStart(true, { key, exe: 'C:\\Program Files\\TabbyDeck\\tabbydeck.exe' });
    expect(await isAutoStart({ key })).toBe(true);
    await setAutoStart(false, { key });
    expect(await isAutoStart({ key })).toBe(false);
  });
  it('replaces the entry saved before the rename to TabbyDeck', async () => {
    const { execFileSync } = await import('node:child_process');
    const legacy = () => { try { execFileSync('reg.exe', ['query', key, '/v', 'Tabby'], { stdio: 'ignore' }); return true; } catch { return false; } };
    execFileSync('reg.exe', ['add', key, '/v', 'Tabby', '/t', 'REG_SZ', '/d', 'old', '/f'], { stdio: 'ignore' });
    await setAutoStart(true, { key, exe: 'C:\\TabbyDeck\\tabbydeck.exe' });
    expect(legacy()).toBe(false);
    expect(await isAutoStart({ key })).toBe(true);
  });
});
