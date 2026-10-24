'use strict';
const $ = s => document.querySelector(s);
const ic = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const later = (ms, f) => setTimeout(f, ms);

/* Header border once the page scrolls. */
const header = $(".top");
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });

/* Hero title: each letter rises like a key coming back up. */
let n = 0;
for (const line of document.querySelectorAll('.hero-title .line')) {
  line.innerHTML = line.textContent.split(' ').map(w => `<span style="white-space:nowrap">${[...w].map(c => `<span class="ch" style="--i:${n++}">${c}</span>`).join('')}</span>`).join(' ');
}

/* Reveal section headings once, as they come into view. */
const seen = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); } }, { threshold: .25 });
for (const el of document.querySelectorAll('section:not(.hero) .h2, section:not(.hero) > .sub, .d-head .sub, .dl-title')) { el.classList.add('reveal'); seen.observe(el); }

/* ---------- The hero deck and the PC it drives ---------- */
const KEYS = [
  { id: 'play', label: 'Play', icon: 'play', bg: '#f5a524', fg: '#2a1a00' },
  { id: 'vol', label: 'Volume', icon: 'speaker-high', val: '50%' },
  { id: 'mute', label: 'Mute', icon: 'speaker-x', bg: '#33302b' },
  { id: 'mic', label: 'Mic', icon: 'microphone', bg: '#33302b' },
  { id: 'night', label: 'Night light', icon: 'moon-stars', bg: '#2b2440', fg: '#fcd34d' },
  { id: 'bt', label: 'Bluetooth', icon: 'bluetooth', bg: '#1d4ed8', fg: '#eff6ff' },
  { id: 'bright', label: 'Brightness', icon: 'monitor', fg: '#fcd34d', val: '100%' },
  { id: 'snip', label: 'Snip', icon: 'crop', bg: '#3b2a4d' },
  { id: 'calc', label: 'Calculator', icon: 'calculator', bg: '#14532d', fg: '#bbf7d0' },
  { id: 'focus', label: 'Focus', icon: 'timer', bg: '#3b1d1d', fg: '#fca5a5' },
  { id: 'off', label: 'Screen off', icon: 'eye-slash', bg: '#1a1f2e', fg: '#93c5fd' },
  { id: 'lock', label: 'Lock', icon: 'lock', bg: '#3a1d1d', fg: '#fca5a5' },
];

function keyHtml(k, i, tag = 'button') {
  const style = `--i:${i};${k.bg ? `--bg:${k.bg};` : ''}${k.fg ? `--fg:${k.fg};` : ''}`;
  return `<${tag} ${tag === 'button' ? 'type="button" ' : ''}class="key" data-id="${k.id || ''}" style="${style}">${k.val ? `<span class="val">${k.val}</span>` : ''}${ic(k.icon)}<span class="lbl">${k.label}</span></${tag}>`;
}

const deck = $('#deck'), stage = $('#stage'), screen = $('#screen');
deck.innerHTML = KEYS.map((k, i) => keyHtml(k, i)).join('');
const keyEl = id => deck.querySelector(`[data-id="${id}"]`);
const setKey = (id, { icon, label, val, lit }) => {
  const el = keyEl(id);
  if (icon) el.querySelector('use').setAttribute('href', `#i-${icon}`);
  if (label) el.querySelector('.lbl').textContent = label;
  if (val !== undefined) { let v = el.querySelector('.val'); if (!v) { v = document.createElement('span'); v.className = 'val'; el.prepend(v); } v.textContent = val; }
  if (lit !== undefined) el.classList.toggle('lit', lit);
};
new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { deck.classList.add('in'); o.disconnect(); } }).observe(deck);

const show = (sel, on = true) => $(sel).classList.toggle('show', on);
const timers = {};
const flash = (sel, ms, key = sel) => { clearTimeout(timers[key]); show(sel); timers[key] = later(ms, () => show(sel, false)); };

const S = { playing: false, vol: 50, muted: false, mic: false, night: false, bt: false, bright: 100, calc: false, focus: 0, focusOn: false, off: false };

function flyout(icon, value) {
  $('#flyout use').setAttribute('href', `#i-${icon}`);
  $('#flybar').style.width = value + '%';
  $('#flyval').textContent = value;
  flash('#flyout', 1500);
}
function trayVol() { $('#tray-vol use').setAttribute('href', `#i-${S.muted ? 'speaker-x' : 'speaker-high'}`); $('#tray-vol').classList.toggle('warn', S.muted); }

let focusTimer;
const ACTIONS = {
  play() { S.playing = !S.playing; setKey('play', { icon: S.playing ? 'pause' : 'play', label: S.playing ? 'Pause' : 'Play' }); show('#media', S.playing); },
  vol() { S.vol = S.vol >= 100 ? 20 : S.vol + 10; S.muted = false; setKey('mute', { lit: false }); setKey('vol', { val: S.vol + '%' }); trayVol(); flyout('speaker-high', S.vol); },
  mute() { S.muted = !S.muted; setKey('mute', { lit: S.muted }); trayVol(); flyout(S.muted ? 'speaker-x' : 'speaker-high', S.muted ? 0 : S.vol); },
  mic() { S.mic = !S.mic; setKey('mic', { lit: S.mic, icon: S.mic ? 'microphone-slash' : 'microphone', label: S.mic ? 'Mic off' : 'Mic' }); $('#tray-mic use').setAttribute('href', `#i-${S.mic ? 'microphone-slash' : 'microphone'}`); $('#tray-mic').classList.toggle('warn', S.mic); },
  night() { S.night = !S.night; setKey('night', { lit: S.night }); show('#night', S.night); },
  bt() { S.bt = !S.bt; setKey('bt', { lit: S.bt, val: S.bt ? 'Headphones' : '' }); $('#tray-bt').classList.toggle('on', S.bt); if (S.bt) flash('#toast', 2600); },
  bright() { S.bright = S.bright <= 40 ? 100 : S.bright - 30; $('#dim').style.opacity = (100 - S.bright) / 100 * .75; setKey('bright', { val: S.bright + '%' }); flyout('sun-dim', S.bright); },
  snip() { show('#snip', false); requestAnimationFrame(() => flash('#snip', 1700)); },
  calc() { S.calc = !S.calc; show('#calc', S.calc); setKey('calc', { lit: S.calc }); },
  focus() {
    S.focusOn = !S.focusOn; clearInterval(focusTimer);
    if (!S.focus) S.focus = 25 * 60;
    const draw = () => setKey('focus', { val: `${Math.floor(S.focus / 60)}:${String(S.focus % 60).padStart(2, '0')}`, lit: S.focusOn });
    draw();
    if (S.focusOn) focusTimer = setInterval(() => { S.focus = Math.max(0, S.focus - 1); draw(); }, 1000);
  },
  off() { S.off = true; setKey('off', { lit: true }); show('#off'); },
  lock() { $('#confirm').hidden = false; },
};
function wake() { if (!S.off) return; S.off = false; setKey('off', { lit: false }); show('#off', false); }
screen.addEventListener('pointermove', wake);
$('#confirm').addEventListener('click', e => {
  const c = e.target.closest('button')?.dataset.c; if (!c) return;
  $('#confirm').hidden = true;
  if (c === 'yes') send(keyEl('lock'), () => { show('#lock'); later(2600, () => show('#lock', false)); });
});

/* A press: the key goes down, a packet crosses the Wi-Fi, then the PC reacts. */
function send(from, then) {
  if (calm) return then();
  const sr = stage.getBoundingClientRect(), a = from.getBoundingClientRect(), b = screen.getBoundingClientRect();
  const p = document.createElement('span'); p.className = 'packet';
  p.style.setProperty('--c', getComputedStyle(from).getPropertyValue('--bg').trim() === '' || from.dataset.id === 'play' ? '#f5a524' : getComputedStyle(from).color);
  stage.append(p);
  const x0 = a.left + a.width / 2 - sr.left, y0 = a.top + a.height / 2 - sr.top, x1 = b.left + b.width / 2 - sr.left, y1 = b.top + b.height / 2 - sr.top;
  p.animate([{ transform: `translate(${x0}px,${y0}px) scale(.4)` }, { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 40}px) scale(1)`, offset: .5 }, { transform: `translate(${x1}px,${y1}px) scale(.3)`, opacity: .2 }],
    { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { p.remove(); then(); };
}
function press(el) {
  el.classList.add('down');
  const r = document.createElement('span'); r.className = 'ripple'; el.append(r); later(600, () => r.remove());
  later(150, () => el.classList.remove('down'));
  const id = el.dataset.id;
  if (id !== 'off' && id !== 'lock') send(el, () => { wake(); ACTIONS[id](); });
  else if (id === 'lock') { wake(); ACTIONS.lock(); }
  else send(el, ACTIONS.off);
}

/* It presses a few keys by itself until you press one. */
let demo = !calm, demoIdx = 0;
const finger = document.createElement('span'); finger.className = 'finger'; stage.append(finger);
const SCRIPT = ['play', 'vol', 'night', 'bt', 'calc', 'snip', 'mute', 'calc', 'night', 'mute', 'bright', 'bright', 'bright', 'focus'];
let onScreen = true;
new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }, { threshold: .4 }).observe(stage);
function stopDemo() { if (!demo) return; demo = false; finger.style.opacity = 0; $('#hint').style.opacity = 0; }
deck.addEventListener('pointerdown', stopDemo);
deck.addEventListener('keydown', stopDemo);
deck.addEventListener('click', e => { const k = e.target.closest('.key'); if (k) press(k); });
function demoStep() {
  if (!demo) return;
  if (!onScreen || document.hidden || !$('#confirm').hidden) return later(1200, demoStep);
  const el = keyEl(SCRIPT[demoIdx++ % SCRIPT.length]);
  const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  finger.style.opacity = 1; finger.style.left = (r.left + r.width / 2 - sr.left) + 'px'; finger.style.top = (r.top + r.height / 2 - sr.top) + 'px';
  later(750, () => { if (!demo) return; finger.classList.add('tap'); press(el); later(160, () => finger.classList.remove('tap')); later(1500, demoStep); });
}
if (demo) later(2400, demoStep);

/* The tablet leans toward the pointer a little. */
if (!calm && matchMedia('(min-width: 961px)').matches) {
  const tablet = $('.tablet');
  stage.addEventListener('pointermove', e => { const r = stage.getBoundingClientRect(); tablet.style.setProperty('--ry', `${8 + ((e.clientX - r.left) / r.width - .5) * -10}deg`); tablet.style.setProperty('--rx', `${4 + ((e.clientY - r.top) / r.height - .5) * -6}deg`); });
  stage.addEventListener('pointerleave', () => { tablet.style.removeProperty('--ry'); tablet.style.removeProperty('--rx'); });
}

const clock = () => { const t = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); $('#clock').textContent = t; $('#lockclock').textContent = t; };
clock(); setInterval(clock, 15000);

/* ---------- Features: the big key becomes each one ---------- */
const FEATURES = [
  ['play', 'Play', '#f5a524', '#2a1a00', 'Music and video', 'Play, pause and skip in any app. A Now playing key shows the song with its cover: tap to pause, hold to skip.'],
  ['speaker-high', 'Volume', '#25221f', '#f1e9dd', 'A volume mixer in your hand', 'A slider for the whole PC and one for each app with sound, like Spotify, Discord or a game. Pick your speakers or headphones, or switch in one tap.'],
  ['monitor', 'Brightness', '#25221f', '#fcd34d', 'Every screen, even external monitors', 'A brightness slider for each screen, night light, and a Screen off key that darkens the screens while long jobs keep running.'],
  ['microphone-slash', 'Mute', '#33302b', '#f1e9dd', 'Mute in whichever call you are in', 'Mute, camera, raise hand and leave in Teams, Zoom, Google Meet, a Slack huddle or Discord. TabbyDeck finds the call by the app using your microphone.'],
  ['cursor-click', 'Trackpad', '#1e3a5f', '#bfdbfe', 'A trackpad and keyboard for the couch', 'One finger moves the pointer, a tap clicks, two fingers scroll. A box types on the PC.'],
  ['app-window', 'Open apps', '#14532d', '#bbf7d0', 'Your apps, with their real icons', 'Add any installed app from the list on your PC. One key can open a whole set, wait for them, then put each window in its place.'],
  ['keyboard', 'Shortcut', '#3b2a4d', '#e9d5ff', 'Any shortcut, typing and clicks', 'Any key combination, text, mouse clicks and scrolling. Snip, Task View, emoji, and snap the window in front to half the screen.'],
  ['squares-four', 'Follow apps', '#25221f', '#f5a524', 'Decks that follow your apps', 'Give a deck its apps, and your phone switches to it while one of them is in front, then back when you leave.'],
  ['cpu', 'CPU 12%', '#1e293b', '#93c5fd', 'Keys that show what is happening', 'Mute, Mic, Night light and Do not disturb light up while they are on. Info keys show CPU, memory, battery or the time.'],
  ['timer', '24:59', '#3b1d1d', '#fca5a5', 'Timers and Pomodoro', 'Press to start or pause, hold to reset. Every phone gets a message when the time is up or the break starts.'],
  ['bluetooth', 'Bluetooth', '#1d4ed8', '#eff6ff', 'Headphones, connected from the couch', 'Turn Bluetooth on or off and connect your paired headphones or speakers.'],
  ['power', 'Shut down', '#a30000', '#fecaca', 'Sleep, lock and shut down', 'Each one asks first, so a stray tap never turns your PC off.'],
];
$('#flist').innerHTML = FEATURES.map(([icon, , bg, fg, h, p], i) => `<li data-i="${i}"><span class="mini" style="--bg:${bg};--fg:${fg};--lip:color-mix(in srgb,${bg} 50%,#000)">${ic(icon)}</span><h3>${h}</h3><p>${p}</p></li>`).join('');
const big = $('#bigkey');
let bigAt = 0;
function setBig(i) {
  if (i === bigAt) return; bigAt = i;
  const [icon, label, bg, fg] = FEATURES[i];
  big.classList.add('swap');
  later(calm ? 0 : 170, () => {
    big.style.setProperty('--bg', bg); big.style.setProperty('--fg', fg); big.style.setProperty('--lip', `color-mix(in srgb, ${bg} 50%, #000)`);
    big.innerHTML = `${ic(icon)}<span>${label}</span>`;
    big.classList.remove('swap');
  });
}
const items = [...document.querySelectorAll('#flist li')];
items[0].classList.add('active');
const featureObs = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) { for (const li of items) li.classList.toggle('active', li === e.target); setBig(+e.target.dataset.i); }
}, { rootMargin: '-45% 0px -45% 0px' });
items.forEach(li => featureObs.observe(li));

/* ---------- Ready-made decks ---------- */
const K = '#25221f', B = '#1e3a5f';
const k = (label, icon, bg, fg) => ({ label, icon, bg, fg });
const DECKS = [
  { name: 'Developer', icon: 'code', desc: 'Your editor, terminal and Git; the VS Code keys for search, run and debug; windows, CPU and a focus timer.', keys: [
    k('VS Code', 'code', B, '#bfdbfe'), k('Terminal', 'terminal-window'), k('GitHub Desktop', 'github-logo'), k('Docker', 'package', B, '#bfdbfe'), k('Postman', 'paper-plane-tilt', '#431407', '#fdba74'), k('GitHub', 'github-logo'), k('Claude', 'asterisk', '#3a2317', '#f4a97f'), k('localhost', 'globe', B),
    k('Commands', 'command', B), k('Go to file', 'file-code'), k('Search all', 'magnifying-glass'), k('Terminal', 'terminal-window'), k('Comment', 'chat-text'), k('Format', 'text-align-left'), k('Rename', 'pencil-simple'), k('Definition', 'arrow-square-out'),
    k('Run', 'play', '#14532d', '#86efac'), k('Stop', 'stop', '#7f1d1d', '#fecaca'), k('Step over', 'arrow-bend-down-right'), k('Step into', 'arrow-down'), k('Save', 'floppy-disk'), k('Undo', 'arrow-counter-clockwise'), k('Redo', 'arrow-clockwise'), k('DevTools', 'bug'),
    k('Left half', 'sidebar'), k('Right half', 'columns'), k('Other screen', 'arrow-square-out'), k('Task Manager', 'pulse'), k('CPU 12%', 'cpu', '#1e293b', '#93c5fd'), k('Memory 41%', 'memory', '#1e293b', '#c4b5fd'), k('Focus', 'timer', '#3b1d1d', '#fca5a5'), k('Do not disturb', 'bell', '#2b2440', '#c4b5fd')] },
  { name: 'Office', icon: 'briefcase', desc: 'Mail, Teams and Office apps; meeting keys for whichever call you are in; copy, paste and window keys; Do not disturb and a focus timer.', keys: [
    k('Outlook', 'microsoft-outlook-logo', B, '#bfdbfe'), k('Teams', 'microsoft-teams-logo', '#2b2440', '#c4b5fd'), k('Word', 'microsoft-word-logo', B, '#bfdbfe'), k('Excel', 'microsoft-excel-logo', '#14532d', '#bbf7d0'), k('PowerPoint', 'microsoft-powerpoint-logo', '#431407', '#fdba74'), k('OneNote', 'notebook', '#3b2a4d', '#e9d5ff'), k('Slack', 'slack-logo'), k('Zoom', 'video-camera', B, '#bfdbfe'),
    k('Mute', 'microphone-slash', '#33302b'), k('Camera', 'video-camera', '#33302b'), k('Raise hand', 'hand', '#3a2f12', '#fcd34d'), k('Leave', 'phone-slash', '#7f1d1d', '#fecaca'), k('Do not disturb', 'bell', '#2b2440', '#c4b5fd'), k('Volume', 'speaker-high'), k('Clock', 'clock', '#1c1917', '#fde68a'), k('Focus', 'timer', '#3b1d1d', '#fca5a5'),
    k('Copy', 'copy'), k('Paste', 'clipboard'), k('Cut', 'scissors'), k('Undo', 'arrow-counter-clockwise'), k('Redo', 'arrow-clockwise'), k('Find', 'magnifying-glass'), k('Save', 'floppy-disk'), k('Print', 'printer'),
    k('Snip', 'crop', '#3b2a4d'), k('Left half', 'sidebar'), k('Right half', 'columns'), k('Other screen', 'arrow-square-out'), k('Desktop', 'desktop'), k('Clipboard', 'clipboard-text'), k('Emoji', 'smiley', K, '#fcd34d'), k('Lock', 'lock', '#3a1d1d', '#fca5a5')] },
  { name: 'Streamer', icon: 'broadcast', desc: 'OBS, chat and music; scene, stream and record keys; mic, sound and live stats.', keys: [
    k('OBS Studio', 'record', '#3b1d1d', '#fca5a5'), k('Discord', 'discord-logo', '#2b2440', '#c4b5fd'), k('Spotify', 'spotify-logo', '#14532d', '#86efac'), k('Streamlabs', 'broadcast'), k('Twitch', 'twitch-logo', '#3b1f63', '#d8b4fe'), k('YouTube Studio', 'youtube-logo', '#450a0a', '#fca5a5'), k('Game Bar', 'game-controller'), k('Save clip', 'film-strip'),
    k('Scene 1', 'number-circle-one', B), k('Scene 2', 'number-circle-two', B), k('Scene 3', 'number-circle-three', B), k('Scene 4', 'number-circle-four', B), k('Go live', 'broadcast', '#7f1d1d', '#fecaca'), k('Record', 'record', '#7f1d1d', '#fecaca'), k('Mic', 'microphone-slash', '#33302b'), k('Mute', 'speaker-x', '#33302b'),
    k('Volume', 'speaker-high'), k('Now playing', 'music-notes', '#1f1b2e', '#e9d5ff'), k('Previous', 'skip-back'), k('Play', 'play', '#f5a524', '#2a1a00'), k('Next', 'skip-forward'), k('Output', 'headphones'), k('Do not disturb', 'bell', '#2b2440', '#c4b5fd'), k('Brightness', 'monitor', K, '#fcd34d'),
    k('CPU 34%', 'cpu', '#1e293b', '#93c5fd'), k('Memory 58%', 'memory', '#1e293b', '#c4b5fd'), k('Clock', 'clock', '#1c1917', '#fde68a'), k('Break timer', 'hourglass-medium', '#1c2b22', '#86efac'), null, null, null, null] },
  { name: 'Music', icon: 'music-notes', desc: 'Your music apps, what is playing with its cover, play and skip, volume, outputs and Bluetooth headphones.', keys: [
    k('Spotify', 'spotify-logo', '#14532d', '#86efac'), k('Apple Music', 'apple-logo', '#450a0a', '#fca5a5'), k('YouTube Music', 'youtube-logo', '#450a0a', '#fca5a5'), k('Media Player', 'play', B), k('VLC', 'film-strip', '#431407', '#fdba74'), k('SoundCloud', 'cloud', '#431407', '#fdba74'), k('Tidal', 'waveform'), k('Deezer', 'equalizer', '#3b2a4d', '#e9d5ff'),
    k('Now playing', 'music-notes', '#1f1b2e', '#e9d5ff'), k('Previous', 'skip-back'), k('Play', 'play', '#f5a524', '#2a1a00'), k('Next', 'skip-forward'), k('Stop', 'stop'), k('Mute', 'speaker-x', '#33302b'), k('Volume −', 'speaker-low'), k('Volume +', 'speaker-high'),
    k('Volume', 'speaker-high'), k('Output', 'headphones'), k('Bluetooth', 'bluetooth', '#1e293b', '#93c5fd'), k('Do not disturb', 'bell', '#2b2440', '#c4b5fd'), k('Night light', 'moon-stars', '#2b2440', '#fcd34d'), k('Clock', 'clock', '#1c1917', '#fde68a'), k('Sleep timer', 'hourglass-medium', '#1c2b22', '#86efac'), null] },
];
const tabs = $('#tabs'), grid = $('#dgrid');
tabs.innerHTML = DECKS.map((d, i) => `<button type="button" class="tab" role="tab" aria-selected="${i === 0}" data-i="${i}">${ic(d.icon)}${d.name}</button>`).join('');
let deckAt = -1, swapping = false;
function drawDeck(i, animate) {
  const d = DECKS[i];
  $('#ddesc').textContent = d.desc;
  grid.innerHTML = d.keys.map((key, j) => key ? keyHtml(key, j, 'div') : `<div class="key gap" style="--i:${j}"></div>`).join('');
  if (animate) for (const el of grid.children) el.classList.add('flip-in');
  deckAt = i;
}
function pickDeck(i) {
  if (i === deckAt || swapping) return;
  for (const t of tabs.children) t.setAttribute('aria-selected', String(+t.dataset.i === i));
  if (calm) return drawDeck(i, false);
  swapping = true;
  for (const el of grid.children) el.classList.add('flip-out');
  later(280 + grid.children.length * 12, () => { drawDeck(i, true); swapping = false; });
}
tabs.addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) pickDeck(+t.dataset.i); });
tabs.addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = (deckAt + (e.key === 'ArrowRight' ? 1 : DECKS.length - 1)) % DECKS.length; pickDeck(i); tabs.children[i].focus();
});
drawDeck(0, false);
new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { o.disconnect(); if (!calm) for (const el of grid.children) el.classList.add('flip-in'); } }, { threshold: .3 }).observe(grid);

/* ---------- Screenshots drift at different speeds as you scroll ---------- */
const shots = [['.shot.s-tab', 40], ['.shot.s-ph', -60], ['.shot.s-bt', 40]].map(([s, d]) => [$(s), d]);
const real = $('.real');
function drift() {
  const r = real.getBoundingClientRect(), t = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
  if (Math.abs(t) < 1.5) for (const [el, d] of shots) el.style.transform = `translateY(${(t * d).toFixed(1)}px)`;
}
if (!calm) { addEventListener('scroll', () => requestAnimationFrame(drift), { passive: true }); drift(); }

/* ---------- Setup: the line between steps draws, and the code types itself ---------- */
const steps = $('.steps'), pair = $('#pair');
new IntersectionObserver((es, o) => {
  if (!es[0].isIntersecting) return; o.disconnect(); steps.classList.add('in');
  const code = '481207';
  [...pair.children].forEach((s, i) => later((calm ? 0 : 900) + i * (calm ? 0 : 220), () => { s.textContent = code[i]; s.classList.add('typed'); }));
  later(calm ? 0 : 900 + 6 * 220 + 300, () => pair.classList.add('ok'));
}, { threshold: .4 }).observe(steps);
seen.observe($('.private'));

/* ---------- The cat ---------- */
const FUR = '#e59a43', STRIPE = '#b4651f', BELLY = '#f6d3a1', INK = '#2b1d0e', NOSE = '#e86a7a';
const now = new Date(), mo = now.getMonth(), day = now.getDate();
const hat = mo === 11 && day >= 24 && day <= 26 ? '<g><path d="M29 10 Q40 -6 56 -2 L51 10z" fill="#d93636"/><rect x="27.5" y="7" width="25" height="5.5" rx="2.7" fill="#f8f4ec"/><circle cx="56.5" cy="-2.5" r="3" fill="#f8f4ec"/></g>'
  : (mo === 11 && day === 31) || (mo === 0 && day === 1) ? '<g><path d="M33.5 9.5 L40 -10 L46.5 9.5z" fill="#7c5cff"/><circle cx="40" cy="-10.5" r="2.6" fill="#fcd34d"/></g>'
  : mo === 9 && day >= 25 ? '<g><ellipse cx="40" cy="8.5" rx="16" ry="3.2" fill="#2a2233"/><path d="M31.5 8.5 L46 -12 L48.5 8.5z" fill="#2a2233"/><rect x="31.8" y="4.5" width="16.5" height="3" fill="#8b5cf6"/></g>' : '';
const ear = (d, inner) => `<path d="${d}" fill="${FUR}"/><path d="${inner}" fill="#f2b5a0"/>`;
const whisk = (cx, cy) => `<path d="M${cx - 4} ${cy} l-7 -1.5 M${cx - 4} ${cy + 1.5} l-7 1.5 M${cx + 4} ${cy} l7 -1.5 M${cx + 4} ${cy + 1.5} l7 1.5" stroke="${INK}" stroke-width=".7" stroke-linecap="round" opacity=".55"/>`;
const SIT = `<path class="tail" d="M52 47 C67 47 70 32 62 26" stroke="${FUR}" stroke-width="6" stroke-linecap="round" fill="none"/><ellipse cx="40" cy="39" rx="15" ry="13.5" fill="${FUR}"/><ellipse cx="40" cy="43" rx="8" ry="8.5" fill="${BELLY}"/>
  <path d="M27 33 q4 2 7 0 M26.5 39 q4 2 7 0 M46 33 q3 2 7 0 M46.5 39 q3 2 7 0" stroke="${STRIPE}" stroke-width="2.4" stroke-linecap="round" fill="none"/><ellipse cx="34" cy="51.5" rx="4.5" ry="3" fill="${FUR}"/><ellipse cx="46" cy="51.5" rx="4.5" ry="3" fill="${FUR}"/>
  ${ear('M31 14 L33 2 L40 10z', 'M33 11 L34.2 5.5 L37.5 9.5z')}${ear('M49 14 L47 2 L40 10z', 'M47 11 L45.8 5.5 L42.5 9.5z')}<circle cx="40" cy="19" r="11" fill="${FUR}"/>
  <path d="M36.5 9.5 v4 M40 9 v5 M43.5 9.5 v4" stroke="${STRIPE}" stroke-width="1.8" stroke-linecap="round"/><g fill="${INK}"><ellipse cx="35.5" cy="19" rx="1.8" ry="2.4"/><ellipse cx="44.5" cy="19" rx="1.8" ry="2.4"/></g>
  <path d="M38.6 23 h2.8 l-1.4 1.6z" fill="${NOSE}"/><path d="M40 24.6 q-1.6 1.8 -3 .6 M40 24.6 q1.6 1.8 3 .6" stroke="${INK}" stroke-width=".8" fill="none" stroke-linecap="round"/>${whisk(40, 23.5)}${hat}`;
const WALK = `<path d="M19 31 C9 27 9 15 15 11" stroke="${FUR}" stroke-width="5.5" stroke-linecap="round" fill="none"/><g fill="${FUR}"><rect class="leg-a" x="23" y="36" width="4.5" height="15" rx="2.2"/><rect class="leg-b" x="29" y="36" width="4.5" height="15" rx="2.2"/><rect class="leg-b" x="43" y="36" width="4.5" height="15" rx="2.2"/><rect class="leg-a" x="49" y="36" width="4.5" height="15" rx="2.2"/></g>
  <ellipse cx="37" cy="34" rx="19" ry="9.5" fill="${FUR}"/><path d="M28 26.5 q1 5 0 9 M35 25.5 q1 5 0 10 M42 26 q1 5 0 9" stroke="${STRIPE}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  ${ear('M51 18 L53 7 L59 14z', 'M53 15 L54 10 L57 13.5z')}${ear('M65 18 L64 7 L58.5 13.5z', 'M63.5 15 L62.8 10 L60 13.5z')}<circle cx="58" cy="23" r="9.5" fill="${FUR}"/><g fill="${INK}"><ellipse cx="55" cy="22.5" rx="1.6" ry="2.1"/><ellipse cx="62" cy="22.5" rx="1.6" ry="2.1"/></g><path d="M57.2 26 h2.6 l-1.3 1.5z" fill="${NOSE}"/>${whisk(58.5, 26.5)}`;
const SLEEP = `<g class="breath"><path d="M18 47 C12 55 38 57 50 52" stroke="${FUR}" stroke-width="5.5" stroke-linecap="round" fill="none"/><ellipse cx="38" cy="44" rx="21" ry="10" fill="${FUR}"/><path d="M27 37 q1 4 0 8 M34 35.5 q1 5 0 9 M41 36 q1 4 0 8" stroke="${STRIPE}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  ${ear('M50 37 L52 28 L57 34z', 'M51.8 35 L52.8 31 L55.5 34z')}${ear('M63 37 L62.5 28 L58 34z', 'M61.5 35 L61.3 31 L59 34z')}<circle cx="57" cy="42" r="8.5" fill="${FUR}"/><path d="M52.5 42 q2 1.6 4 0 M58.5 42 q2 1.6 4 0" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round"/><path d="M56.4 45.4 h2.4 l-1.2 1.3z" fill="${NOSE}"/></g>`;
const cat = $('#cat'), floor = $('#floor');
let face = -1, catPose = '', nap, walkEnd;
function pose(p) {
  if (p === catPose) return; catPose = p;
  cat.innerHTML = `<svg viewBox="0 0 80 56" style="transform:scaleX(${p === 'walk' ? face : -1})">${p === 'walk' ? WALK : p === 'sleep' ? SLEEP : SIT}</svg>${p === 'sleep' ? '<span class="zz">z</span>' : ''}`;
}
const rest = () => { clearTimeout(nap); nap = later(9000, () => { if (catPose === 'sit') pose('sleep'); }); };
pose('sit'); rest();
function chase(x) {
  const r = floor.getBoundingClientRect(), w = cat.offsetWidth, from = cat.offsetLeft;
  const to = Math.max(0, Math.min(r.width - w, x - r.left - w / 2)), dist = Math.abs(to - from);
  if (dist < 14) return;
  const ms = calm ? 0 : Math.min(2600, dist / 260 * 1000);
  face = to > from ? -1 : 1; catPose = ''; pose('walk');
  cat.style.transitionDuration = ms + 'ms'; cat.style.left = to + 'px';
  clearTimeout(walkEnd); walkEnd = later(ms, () => { pose('sit'); rest(); });
}
$('.foot').addEventListener('pointermove', e => { if (catPose === 'sleep') { pose('sit'); } chase(e.clientX); rest(); });

/* ---------- The latest version, from GitHub ---------- */
fetch('https://api.github.com/repos/iamshihab2020/TabbyDeck/releases/latest').then(r => r.ok ? r.json() : null).then(j => {
  if (j && /^v?\d+\.\d+\.\d+$/.test(j.tag_name)) for (const el of document.querySelectorAll('[data-version]')) el.textContent = `Version ${j.tag_name.replace(/^v/, '')}`;
}).catch(() => {});

/* ---------- Key styles: switch, or watch it go through all six ---------- */
const STYLES = [
  ['keycap', 'Keycap', 'A keyboard key: a lit top edge and a lip underneath. It goes down when you press it.'],
  ['sunken', 'Sunken', 'Set into the panel like a dashboard switch. A press goes deeper.'],
  ['soft', 'Soft', 'Soft-touch rubber lit from the top left. It sits out of the surface and presses into it.'],
  ['glass', 'Glass', 'Tinted acrylic with a bright top edge, and colour that shows through.'],
  ['pad', 'Pad', 'A drum-machine pad with a strip of backlight in the key’s colour. A press lights it all.'],
  ['outline', 'Outline', 'Clear keys drawn with a line in the key’s colour, for busy decks.'],
];
const ST_KEYS = [KEYS[0], KEYS[4], KEYS[5], KEYS[7], KEYS[8], KEYS[9], KEYS[2], KEYS[11]];
const rgb = hex => { const h = (hex || '#25221f').slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', '); };
const stDeck = $('#stdeck'), stPick = $('#stpick');
stDeck.innerHTML = ST_KEYS.map((k, i) => keyHtml(k, i, 'div')).join('');
[...stDeck.children].forEach((el, i) => { el.style.setProperty('--key-rgb', rgb(ST_KEYS[i].bg)); el.style.setProperty('--fg-rgb', rgb(ST_KEYS[i].fg || '#f1e9dd')); });
stPick.innerHTML = STYLES.map(([id, name], i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-s="${id}">${name}</button>`).join('');
let stAt = 0, stAuto = !calm, stTimer, stOn = false;
function pickStyle(i) {
  stAt = i; const [id, , desc] = STYLES[i];
  stDeck.className = `st-deck ks-${id}`;
  for (const b of stPick.children) b.setAttribute('aria-checked', String(b.dataset.s === id));
  $('#stdesc').textContent = desc;
  // Press two keys so each style shows how it moves.
  if (!calm) [0, 3].forEach((n, j) => later(500 + j * 260, () => { const k = stDeck.children[n]; k.classList.add('down'); later(240, () => k.classList.remove('down')); }));
}
stPick.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; stAuto = false; clearTimeout(stTimer); pickStyle(STYLES.findIndex(s => s[0] === b.dataset.s)); });
const stCycle = () => { if (!stAuto) return; if (stOn) pickStyle((stAt + 1) % STYLES.length); stTimer = later(2800, stCycle); };
new IntersectionObserver(es => { stOn = es[0].isIntersecting; }, { threshold: .4 }).observe(stDeck);
pickStyle(0); stTimer = later(2800, stCycle);

/* ---------- Stats: the bars grow and the count runs up when they come into view ---------- */
const board = $('#sxboard');
new IntersectionObserver((es, o) => {
  if (!es[0].isIntersecting) return; o.disconnect(); board.classList.add('in');
  for (const el of board.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count, t0 = performance.now(), dur = calm ? 0 : 1400;
    const tick = t => { const p = dur ? Math.min(1, (t - t0) / dur) : 1; el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-GB'); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
}, { threshold: .25 }).observe(board);
