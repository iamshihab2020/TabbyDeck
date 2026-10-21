// Builds src/icons/sprite.svg and src/icons/names.json from a curated subset of Phosphor Icons (MIT), Bold weight.
// A curated list keeps the phone bundle small: the full set is ~1500 icons per weight.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEIGHT = 'bold';
const here = path.dirname(fileURLToPath(import.meta.url));
// The package exports no package.json; resolve its main entry and walk up to the package root.
const main = createRequire(import.meta.url).resolve('@phosphor-icons/core');
const pkg = main.slice(0, main.lastIndexOf('@phosphor-icons') + '@phosphor-icons/core'.length);
const iconsDir = path.join(pkg, 'assets', WEIGHT);
const out = path.join(here, '..', 'src', 'icons');

const WANT = `
question folder folder-open folder-plus folder-simple folders arrow-left arrow-right arrow-up arrow-down caret-left caret-right caret-up caret-down caret-double-left caret-double-right
play pause stop record skip-back skip-forward rewind fast-forward repeat repeat-once shuffle play-pause music-note music-notes music-notes-simple vinyl-record radio playlist queue
speaker-none speaker-low speaker-high speaker-x speaker-slash speaker-simple-high speaker-simple-low speaker-simple-x microphone microphone-slash headphones headset waveform equalizer
video-camera video-camera-slash camera camera-slash webcam webcam-slash monitor monitor-play columns television television-simple screencast presentation presentation-chart broadcast
keyboard mouse mouse-simple cursor cursor-click hand-pointing command option backspace arrow-elbow-down-left text-t text-aa clipboard clipboard-text copy copy-simple scissors arrow-counter-clockwise arrow-clockwise floppy-disk magnifying-glass
app-window browser browsers squares-four grid-four grid-nine layout sidebar terminal terminal-window code code-block brackets-curly file-code git-branch git-commit git-pull-request git-merge bug database hard-drives cloud cpu memory hard-drive graphics-card
globe globe-simple link link-simple arrow-square-out envelope chat-circle chat-text paper-plane-tilt tray calendar calendar-blank clock timer alarm hourglass hourglass-medium watch
power lock lock-open lock-key key shield shield-check sign-out sign-in arrows-clockwise arrows-counter-clockwise gear gear-six sliders sliders-horizontal wrench hammer toolbox
sun sun-dim moon moon-stars leaf lightbulb lightbulb-filament lamp flame lightning lightning-slash plug plugs-connected battery-full battery-high battery-low battery-charging wifi-high wifi-slash bluetooth cell-signal-full
house house-simple couch bed door door-open thermometer thermometer-hot fan snowflake drop umbrella cloud-rain cloud-sun wind
game-controller joystick trophy sword target crosshair dice-five puzzle-piece rocket rocket-launch ghost alien
youtube-logo twitch-logo discord-logo spotify-logo github-logo gitlab-logo google-chrome-logo figma-logo slack-logo x-logo facebook-logo instagram-logo linkedin-logo steam-logo windows-logo android-logo apple-logo telegram-logo whatsapp-logo reddit-logo tiktok-logo microsoft-teams-logo microsoft-word-logo microsoft-excel-logo microsoft-powerpoint-logo microsoft-outlook-logo notion-logo trello-logo dropbox-logo google-drive-logo amazon-logo paypal-logo openai-logo
film-strip film-slate image images image-square scan aperture selection
heart heart-break star thumbs-up thumbs-down smiley smiley-sad smiley-wink confetti gift bell bell-slash bell-ringing megaphone flag bookmark tag
check checks x plus minus plus-circle minus-circle check-circle x-circle warning-circle warning info prohibit
eye eye-slash hand arrows-out-cardinal arrows-out arrows-in corners-out corners-in magnifying-glass-plus magnifying-glass-minus crop
pen pencil pencil-simple highlighter paint-brush palette eyedropper eraser
file file-text files file-plus download-simple upload-simple share share-network printer archive package box-arrow-down trash
user users user-plus user-minus address-book phone phone-slash phone-call device-mobile device-tablet laptop desktop desktop-tower
shopping-cart credit-card wallet currency-dollar currency-eur coins piggy-bank receipt
car bicycle bus train airplane boat map-trifold map-pin navigation-arrow compass
coffee pizza fork-knife beer-bottle wine calculator notepad note note-pencil
book book-open notebook graduation-cap books brain
chart-line chart-bar chart-pie pulse gauge trend-up trend-down
stack hash at asterisk percent infinity sigma
sparkle magic-wand robot
`.split(/\s+/).filter(Boolean);

const names = [];
const missing = [];
const symbols = [];
for (const n of [...new Set(WANT)]) {
  const file = WEIGHT === 'regular' ? `${n}.svg` : `${n}-${WEIGHT}.svg`;
  const f = path.join(iconsDir, file);
  if (!existsSync(f)) { missing.push(n); continue; }
  const svg = readFileSync(f, 'utf8');
  // One decimal is visually lossless on a 256-unit grid and trims the sprite noticeably.
  const inner = svg.replace(/\d+\.\d{2,}/g, m => String(Math.round(Number(m) * 10) / 10)).replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s+/g, ' ').trim();
  symbols.push(`<symbol id="i-${n}" viewBox="0 0 256 256">${inner}</symbol>`);
  names.push(n);
}
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'sprite.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" fill="currentColor"><!-- Phosphor Icons (${WEIGHT}), MIT licence, phosphoricons.com -->${symbols.join('')}</svg>\n`);
writeFileSync(path.join(out, 'names.json'), JSON.stringify(names) + '\n');
console.log(`icons: ${names.length} of ${new Set(WANT).size} requested (${WEIGHT})`);
if (missing.length) console.log(`not in Phosphor: ${missing.join(' ')}`);
