// Bundles a dev entry with esbuild and runs it. usage: node apps/host/bin/dev.mjs [entry] [args for the entry]
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const entry = process.argv[2] ?? path.join(here, '..', 'src', 'dev', 'serve.ts');
const outfile = path.join(here, 'out', 'dev.mjs');
await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node24', outfile, external: ['koffi', '@koromix/*'], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" }, logLevel: 'warning' });
const child = spawn(process.execPath, [outfile, ...process.argv.slice(3)], { stdio: 'inherit', env: { ...process.env, TABBY_ROOT: path.join(here, '..', '..', '..') } });
child.on('exit', c => process.exit(c ?? 0));
