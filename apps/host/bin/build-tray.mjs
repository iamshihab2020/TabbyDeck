// Compiles native-src/tray.cs to bin/out/tabbydeck-tray.exe with Windows' in-box C# compiler (no Visual Studio needed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const csc = path.join(process.env.WINDIR ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
const out = path.join(here, 'out', 'tabbydeck-tray.exe');
mkdirSync(path.dirname(out), { recursive: true });
const icon = path.join(here, 'out', 'tabbydeck.ico');
execFileSync(csc, ['-nologo', '-optimize', '-target:winexe', '-platform:x86', '-r:System.Web.Extensions.dll', ...(existsSync(icon) ? [`-win32icon:${icon}`] : []), `-out:${out}`, path.join(here, '..', 'native-src', 'tray.cs')], { stdio: 'inherit' });
console.log(`built ${out}`);
