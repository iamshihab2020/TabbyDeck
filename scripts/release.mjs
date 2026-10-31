// Publishes a GitHub release from this PC: checks, builds tabbydeck.exe and the Android app, zips the exe with LICENSE and
// NOTICE, uploads both.
// usage: npm run release   (version from package.json; CHANGELOG.md needs a "## <version>" section; quit TabbyDeck first)
//        npm run release -- --dry-run   builds and zips, but does not tag or publish
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8' }).trim();

const dry = process.argv.includes('--dry-run');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;
const notes = readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8').split(/^## /m).find(s => s.startsWith(`${version} `) || s.startsWith(`${version}\n`));
if (!notes) throw new Error(`CHANGELOG.md has no "## ${version}" section`);
if (!dry && out('git', ['status', '--porcelain'])) throw new Error('Commit or stash your changes first');
run('git', ['fetch', '--tags', '--quiet', 'origin']);
if (out('git', ['tag', '--list', tag])) throw new Error(`${tag} already exists: raise the version in package.json`);
// Without the release key Gradle signs with the debug key, and phones would refuse that app as an update.
const gradleProps = path.join(homedir(), '.gradle', 'gradle.properties');
if (!existsSync(gradleProps) || !/^tabbyKeystore=/m.test(readFileSync(gradleProps, 'utf8'))) throw new Error(`The Android release key is not set in ${gradleProps}`);

run('npm', ['run', 'typecheck']);
run('npm', ['test']);
run('npm', ['run', 'package']);
const android = path.join(root, 'apps', 'android');
run(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleRelease', '--console=plain', '-q'], { cwd: android });

const stage = mkdtempSync(path.join(tmpdir(), 'tabbydeck-release-'));
const app = path.join(stage, 'TabbyDeck');
mkdirSync(app);
cpSync(path.join(root, 'out', 'TabbyDeck'), app, { recursive: true });
for (const f of ['LICENSE', 'NOTICE']) cpSync(path.join(root, f), path.join(app, f));
const zip = path.join(stage, `TabbyDeck-${version}-windows-x64.zip`);
run('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${app}' -DestinationPath '${zip}'`]);
// One name for every version, so the website can link to releases/latest/download/TabbyDeck-android.apk.
const apk = path.join(stage, 'TabbyDeck-android.apk');
cpSync(path.join(android, 'build', 'outputs', 'apk', 'release', 'TabbyDeck-release.apk'), apk);
const sums = path.join(stage, 'SHA256SUMS.txt');
writeFileSync(sums, [zip, apk].map(f => `${createHash('sha256').update(readFileSync(f)).digest('hex')} *${path.basename(f)}\n`).join(''));
const notesFile = path.join(stage, 'notes.md');
writeFileSync(notesFile, notes.split('\n').slice(1).join('\n').trim() + '\n');

if (dry) { console.log(`Dry run: ${zip} and ${apk} are ready; nothing was tagged or published.`); process.exit(0); }
run('git', ['tag', tag]);
run('git', ['push', 'origin', 'main', tag]);
// Not through cmd.exe: it would split the title at its space.
run('gh', ['release', 'create', tag, zip, apk, sums, '--title', `TabbyDeck ${version}`, '--notes-file', notesFile, '--verify-tag'], { shell: false });
console.log(`Released ${tag}`);
