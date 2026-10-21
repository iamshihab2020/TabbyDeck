// Builds the portable TabbyDeck folder: out/TabbyDeck/{tabbydeck.exe, tabbydeck-tray.exe, koffi/win32_x64/koffi.node}.
// tabbydeck.exe is a Node single executable with the client and editor embedded. Run after the client and editor builds.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, openSync, readSync, writeSync, closeSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { writeIco } from './icon.mjs';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.join(here, '..'), repo = path.join(core, '..', '..');
const work = path.join(here, 'out'), dist = path.join(repo, 'out', 'TabbyDeck');
const version = JSON.parse(readFileSync(path.join(core, 'package.json'), 'utf8')).version;
const step = m => console.log(`- ${m}`);

for (const app of ['deck', 'editor']) {
  if (!existsSync(path.join(repo, 'apps', app, 'dist', 'index.html'))) throw new Error(`Build ${app} first (npm run build)`);
}
mkdirSync(work, { recursive: true });
// Empty the folder rather than delete it: a file manager showing it would block removing the folder itself.
if (existsSync(dist)) for (const f of readdirSync(dist)) rmSync(path.join(dist, f), { recursive: true, force: true });
mkdirSync(path.join(dist, 'koffi', 'win32_x64'), { recursive: true });

step('icon');
const ico = path.join(work, 'tabbydeck.ico');
writeIco(ico);

step('tray helper');
execFileSync(process.execPath, [path.join(here, 'build-tray.mjs')], { stdio: 'inherit' });
copyFileSync(path.join(work, 'tabbydeck-tray.exe'), path.join(dist, 'tabbydeck-tray.exe'));

step('bundle');
const bundle = path.join(work, 'tabbydeck.cjs');
await build({
  entryPoints: [path.join(core, 'src', 'cli.ts')], bundle: true, platform: 'node', format: 'cjs', target: 'node24', outfile: bundle,
  external: ['@koromix/*'], define: { __TABBY_BUNDLE__: 'true' }, logLevel: 'warning',
  logOverride: { 'empty-import-meta': 'silent' }, // both uses fall back to __filename in the exe
});

step('embed apps');
const assets = {};
for (const app of ['deck', 'editor']) {
  const root = path.join(repo, 'apps', app, 'dist');
  const walk = dir => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else assets[`${app}/${path.relative(root, p).split(path.sep).join('/')}`] = p; } };
  walk(root);
}
const blob = path.join(work, 'sea-prep.blob');
const seaConfig = path.join(work, 'sea-config.json');
writeFileSync(seaConfig, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false, useSnapshot: false, assets }, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

step('tabbydeck.exe');
const exe = path.join(dist, 'tabbydeck.exe');
copyFileSync(process.execPath, exe);
await require('rcedit')(exe, {
  icon: ico,
  'file-version': version, 'product-version': version,
  'version-string': { ProductName: 'TabbyDeck', FileDescription: 'TabbyDeck', CompanyName: 'TabbyDeck', LegalCopyright: 'MIT licence', OriginalFilename: 'tabbydeck.exe', InternalName: 'tabbydeck' },
});
await require('postject').inject(exe, 'NODE_SEA_BLOB', readFileSync(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
setGuiSubsystem(exe);

step('koffi');
copyFileSync(path.join(repo, 'node_modules', '@koromix', 'koffi-win32-x64', 'win32_x64', 'koffi.node'), path.join(dist, 'koffi', 'win32_x64', 'koffi.node'));

step('read me and firewall helper');
for (const f of readdirSync(path.join(core, 'ship'))) {
  // Windows tools want CRLF; the repo stores LF.
  writeFileSync(path.join(dist, f), readFileSync(path.join(core, 'ship', f), 'utf8').replace(/\r?\n/g, '\r\n'));
}

const mb = f => (statSync(f).size / 1048576).toFixed(1);
console.log(`built ${dist}\n  tabbydeck.exe ${mb(exe)} MB, tabbydeck-tray.exe ${mb(path.join(dist, 'tabbydeck-tray.exe'))} MB`);

/** node.exe is a console program; flip the PE header to the Windows GUI subsystem so no console window opens. */
function setGuiSubsystem(file) {
  const fd = openSync(file, 'r+');
  try {
    const b = Buffer.alloc(4);
    readSync(fd, b, 0, 4, 0x3c);
    const pe = b.readUInt32LE(0);
    readSync(fd, b, 0, 4, pe);
    if (b.readUInt32LE(0) !== 0x4550) throw new Error('not a PE file');
    const at = pe + 24 + 68; // optional header Subsystem field
    const s = Buffer.alloc(2); s.writeUInt16LE(2); // IMAGE_SUBSYSTEM_WINDOWS_GUI
    writeSync(fd, s, 0, 2, at);
  } finally { closeSync(fd); }
}
