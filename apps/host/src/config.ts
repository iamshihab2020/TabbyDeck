import path from 'node:path';

export interface Config {
  dataDir: string;
  fakeNative: boolean;
  /** Override the saved ports (tests, side-by-side runs). */
  port?: number;
  editorPort?: number;
  tray: boolean;
  window: boolean;
  /** Started by Windows at sign-in: stay in the tray, do not open the editor. */
  trayOnly: boolean;
}

function port(v: string | undefined, flag: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`${flag} needs a port number`);
  return n;
}

export function parseArgs(argv: string[]): Config {
  const c: Config = {
    dataDir: path.join(process.env.APPDATA ?? path.join(process.env.HOME ?? '', '.config'), 'tabbydeck'),
    fakeNative: false, tray: true, window: true, trayOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--data-dir' && argv[i + 1]) c.dataDir = argv[++i];
    else if (a === '--fake-native') c.fakeNative = true;
    else if (a === '--port') c.port = port(argv[++i], a);
    else if (a === '--editor-port') c.editorPort = port(argv[++i], a);
    else if (a === '--no-tray') c.tray = false;
    else if (a === '--no-window') c.window = false;
    else if (a === '--tray-only') c.trayOnly = true;
  }
  return c;
}
