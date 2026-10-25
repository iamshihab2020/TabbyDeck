import { useEffect, useRef, useState } from 'preact/hooks';

export interface Mood { playing: boolean; focus: boolean; meeting?: boolean; timer?: boolean }
export type Hat = 'santa' | 'party' | 'witch' | 'hard';
type Pose = 'sit' | 'walk' | 'sleep' | 'stretch';

/**
 * What the cat wears. By the date: a Santa hat from Christmas Eve to Boxing Day, a party hat on New Year's Eve and Day,
 * a witch hat in the last week of October, a scarf from December to February, sunglasses from June to August.
 * By the hour: a coffee mug before 10 am, a nightcap if it sleeps late at night. By what the PC is doing: a headset
 * in a call, headphones while music plays, glasses while focusing (over the sunglasses), a hard hat while a timer runs.
 */
export function outfitFor(now: Date, mood: Mood) {
  const m = now.getMonth(), d = now.getDate(), h = now.getHours();
  const hat: Hat | null = m === 11 && d >= 24 && d <= 26 ? 'santa' : (m === 11 && d === 31) || (m === 0 && d === 1) ? 'party'
    : m === 9 && d >= 25 ? 'witch' : mood.timer ? 'hard' : null;
  return {
    hat, scarf: m === 11 || m <= 1, headset: !!mood.meeting, headphones: mood.playing && !mood.meeting,
    glasses: mood.focus, sunglasses: !mood.focus && m >= 5 && m <= 7, mug: h >= 5 && h < 10, nightcap: !hat && (h >= 23 || h < 5),
  };
}
type Wear = ReturnType<typeof outfitFor>;

const SLEEP_AFTER = 30_000, SPEED = 260; // px a second when it runs

/**
 * The cat's width from the screen's short side: 56 px on a phone, growing to 100 px on a big tablet. From the screen,
 * not the keys, because the keys are sized around the cat's floor.
 */
export const catSize = (shortSide: number) => Math.round(Math.max(56, Math.min(100, shortSide * 0.11)));

const FUR = '#e59a43', STRIPE = '#b4651f', BELLY = '#f6d3a1', INK = '#2b1d0e', NOSE = '#e86a7a', SCARF = '#d64545';

/**
 * The deck's tabby cat. It lives on a strip under the keys, so it never covers one. It sits and swishes its tail,
 * falls asleep after a while without a touch, stretches awake at the next one, and runs to where a finger touches
 * empty space (`chase`, a page x and a counter that changes per touch). Tap it and it hops.
 */
export function Cat({ mood, chase, size, name }: { mood: Mood; chase: { x: number; n: number } | null; size: number; name: string }) {
  const WIDTH = size, HEIGHT = Math.round(size * 0.7);
  const floor = useRef<HTMLDivElement>(null);
  const [x, setX] = useState<number | null>(null);
  const [face, setFace] = useState<1 | -1>(-1);
  const [pose, setPose] = useState<Pose>('sit');
  const [dur, setDur] = useState(0);
  const [hop, setHop] = useState(0);
  const poseRef = useRef<Pose>('sit'); poseRef.current = pose;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, f: () => void) => { timers.current.push(setTimeout(f, ms)); };
  const wear = outfitFor(new Date(), mood);

  // Start near the right end of the floor.
  useEffect(() => { const w = floor.current?.clientWidth ?? 300; setX(Math.max(0, w - WIDTH - 24)); }, []);

  // Asleep after a while without a touch anywhere; the next touch wakes it with a stretch.
  useEffect(() => {
    let nap: ReturnType<typeof setTimeout>;
    const rest = () => { clearTimeout(nap); nap = setTimeout(() => { if (poseRef.current === 'sit') setPose('sleep'); }, SLEEP_AFTER); };
    const touch = () => { if (poseRef.current === 'sleep') { setPose('stretch'); later(900, () => setPose('sit')); } rest(); };
    rest();
    document.addEventListener('pointerdown', touch, true);
    return () => { clearTimeout(nap); document.removeEventListener('pointerdown', touch, true); for (const t of timers.current) clearTimeout(t); };
  }, []);

  // Run to the finger, along the floor.
  useEffect(() => {
    const el = floor.current;
    if (!chase || !el || x === null) return;
    const r = el.getBoundingClientRect();
    const to = Math.max(0, Math.min(r.width - WIDTH, chase.x - r.left - WIDTH / 2)), dist = Math.abs(to - x);
    if (dist < 10) return;
    const go = () => {
      const ms = Math.min(2600, (dist / SPEED) * 1000);
      setFace(to > x ? 1 : -1); setPose('walk'); setDur(ms); setX(to);
      later(ms, () => setPose('sit'));
    };
    if (poseRef.current === 'sleep' || poseRef.current === 'stretch') later(900, go); else go();
  }, [chase?.n]);

  return (
    <div class="cat-floor" ref={floor} style={{ height: `${HEIGHT + 4}px` }}>
      {x !== null && (
        <button type="button" class={`tb-cat ${pose}`} aria-label={`${name}, the cat`} tabIndex={-1}
          style={{ left: `${x}px`, width: `${WIDTH}px`, height: `${HEIGHT}px`, transitionDuration: `${dur}ms`, fontSize: `${Math.round(size / 5.5)}px` }}
          onPointerDown={e => { e.stopPropagation(); if (poseRef.current !== 'walk') setHop(h => h + 1); }}>
          <span key={hop} class={hop ? 'cat-body hop' : 'cat-body'} style={{ transform: `scaleX(${face})` }}>
            <svg viewBox="0 0 80 56" width={WIDTH} height={HEIGHT} aria-hidden="true">
              {pose === 'walk' ? <Walking {...wear} /> : pose === 'sleep' ? <Sleeping {...wear} /> : <Sitting {...wear} />}
            </svg>
          </span>
          {pose === 'sleep' && <span class="cat-z" aria-hidden="true">z</span>}
          {hop > 0 && <span key={`h${hop}`} class="cat-heart" aria-hidden="true">{name} ♥</span>}
        </button>
      )}
    </div>
  );
}

const Ear = ({ d, inner }: { d: string; inner: string }) => <><path d={d} fill={FUR} /><path d={inner} fill="#f2b5a0" /></>;
const Whiskers = ({ cx, cy }: { cx: number; cy: number }) => (
  <g stroke={INK} stroke-width="0.7" stroke-linecap="round" opacity="0.55">
    <path d={`M${cx - 4} ${cy} l-7 -1.5 M${cx - 4} ${cy + 1.5} l-7 1.5 M${cx + 4} ${cy} l7 -1.5 M${cx + 4} ${cy + 1.5} l7 1.5`} />
  </g>
);

// Hats and the headset are drawn once, for the sitting cat's head (centre 40, 19); the other poses move and shrink them.
function HatOn({ hat }: { hat: Hat }) {
  if (hat === 'santa') return <g><path d="M29 10 Q40 -6 56 -2 L51 10z" fill="#d93636" /><rect x="27.5" y="7" width="25" height="5.5" rx="2.7" fill="#f8f4ec" /><circle cx="56.5" cy="-2.5" r="3" fill="#f8f4ec" /></g>;
  if (hat === 'party') return <g><path d="M33.5 9.5 L40 -10 L46.5 9.5z" fill="#7c5cff" /><path d="M35.7 3 L44.3 3 M37.6 -3 L42.4 -3" stroke="#fcd34d" stroke-width="2" /><circle cx="40" cy="-10.5" r="2.6" fill="#fcd34d" /></g>;
  if (hat === 'witch') return <g><ellipse cx="40" cy="8.5" rx="16" ry="3.2" fill="#2a2233" /><path d="M31.5 8.5 L46 -12 L48.5 8.5z" fill="#2a2233" /><rect x="31.8" y="4.5" width="16.5" height="3" fill="#8b5cf6" /></g>;
  return <g><path d="M28.5 11.5 a11.5 9.5 0 0 1 23 0z" fill="#f5c518" /><rect x="25.5" y="10" width="29" height="3.2" rx="1.6" fill="#e0b000" /><rect x="38.6" y="3" width="2.8" height="7" rx="1" fill="#e0b000" /></g>;
}
const Headset = () => (
  <g><path d="M28 19 C28 4 52 4 52 19" stroke="#2f2f35" stroke-width="3" fill="none" stroke-linecap="round" /><rect x="25" y="16" width="5.5" height="9" rx="2.5" fill="#3a3a42" /><rect x="49.5" y="16" width="5.5" height="9" rx="2.5" fill="#3a3a42" />
    <path d="M27.5 24 Q28 29 35 27.5" stroke="#2f2f35" stroke-width="1.6" fill="none" stroke-linecap="round" /><circle cx="35.5" cy="27.4" r="1.7" fill="#f87171" /></g>
);
const Sunglasses = () => <g fill="#141414"><rect x="31.3" y="16.2" width="8.2" height="5.4" rx="2.2" /><rect x="40.5" y="16.2" width="8.2" height="5.4" rx="2.2" /><path d="M39.3 17.6 h1.4" stroke="#141414" stroke-width="1.2" /><path d="M33 17.4 h2.4" stroke="#fff" stroke-width="0.8" opacity="0.5" /></g>;
const Mug = () => (
  <g><path class="cat-steam" d="M54.5 36 q-1.5 -2.5 0 -5 M57.5 36 q-1.5 -2.5 0 -5" stroke="#cbd5e1" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.7" />
    <rect x="51" y="38" width="9.5" height="11" rx="2" fill="#f4efe6" /><path d="M60.5 41 q4 0.5 0 5" stroke="#f4efe6" stroke-width="1.8" fill="none" /><rect x="51" y="41" width="9.5" height="2.2" fill="#d96b3b" /></g>
);
// Move a sitting-head drawing onto another pose's head: centre (40, 19) to (cx, cy), scaled.
const onHead = (cx: number, cy: number, k: number) => `translate(${cx - 40 * k} ${cy - 19 * k}) scale(${k})`;

function Sitting({ scarf, headphones, glasses, hat, headset, sunglasses, mug }: Wear) {
  return (
    <g>
      <path class="cat-tail" d="M52 47 C67 47 70 32 62 26" stroke={FUR} stroke-width="6" stroke-linecap="round" fill="none" />
      <ellipse cx="40" cy="39" rx="15" ry="13.5" fill={FUR} />
      <ellipse cx="40" cy="43" rx="8" ry="8.5" fill={BELLY} />
      <g stroke={STRIPE} stroke-width="2.4" stroke-linecap="round" fill="none">
        <path d="M27 33 q4 2 7 0 M26.5 39 q4 2 7 0 M46 33 q3 2 7 0 M46.5 39 q3 2 7 0" />
      </g>
      <ellipse cx="34" cy="51.5" rx="4.5" ry="3" fill={FUR} /><ellipse cx="46" cy="51.5" rx="4.5" ry="3" fill={FUR} />
      {scarf && <g><path d="M29 28 q11 6 22 0 v4.5 q-11 6 -22 0z" fill={SCARF} /><rect x="43" y="31" width="5" height="11" rx="1.5" fill={SCARF} /></g>}
      <g class="cat-head">
        <Ear d="M31 14 L33 2 L40 10z" inner="M33 11 L34.2 5.5 L37.5 9.5z" />
        <Ear d="M49 14 L47 2 L40 10z" inner="M47 11 L45.8 5.5 L42.5 9.5z" />
        <circle cx="40" cy="19" r="11" fill={FUR} />
        <path d="M36.5 9.5 v4 M40 9 v5 M43.5 9.5 v4" stroke={STRIPE} stroke-width="1.8" stroke-linecap="round" />
        <g class="cat-eyes" fill={INK}><ellipse cx="35.5" cy="19" rx="1.8" ry="2.4" /><ellipse cx="44.5" cy="19" rx="1.8" ry="2.4" /></g>
        <path d="M38.6 23 h2.8 l-1.4 1.6z" fill={NOSE} />
        <path d="M40 24.6 q-1.6 1.8 -3 0.6 M40 24.6 q1.6 1.8 3 0.6" stroke={INK} stroke-width="0.8" fill="none" stroke-linecap="round" />
        <Whiskers cx={40} cy={23.5} />
        {glasses && <g fill="rgba(255,255,255,0.18)" stroke="#1b1b1b" stroke-width="1.3"><circle cx="35.5" cy="19" r="3.8" /><circle cx="44.5" cy="19" r="3.8" /><path d="M39.3 19 h1.4" /></g>}
        {headphones && <g><path d="M28 19 C28 4 52 4 52 19" stroke="#2f2f35" stroke-width="3" fill="none" stroke-linecap="round" /><rect x="25" y="16" width="5.5" height="9" rx="2.5" fill="#3a3a42" /><rect x="49.5" y="16" width="5.5" height="9" rx="2.5" fill="#3a3a42" /><rect x="25.8" y="18" width="1.6" height="5" rx="0.8" fill="#f5a524" /><rect x="52.6" y="18" width="1.6" height="5" rx="0.8" fill="#f5a524" /></g>}
        {sunglasses && <Sunglasses />}
        {headset && <Headset />}
        {hat && <HatOn hat={hat} />}
      </g>
      {mug && <Mug />}
    </g>
  );
}

function Walking({ scarf, headphones, glasses, hat, headset, sunglasses }: Wear) {
  return (
    <g>
      <path d="M19 31 C9 27 9 15 15 11" stroke={FUR} stroke-width="5.5" stroke-linecap="round" fill="none" />
      <g fill={FUR}>
        <rect class="cat-leg a" x="23" y="36" width="4.5" height="15" rx="2.2" />
        <rect class="cat-leg b" x="29" y="36" width="4.5" height="15" rx="2.2" />
        <rect class="cat-leg b" x="43" y="36" width="4.5" height="15" rx="2.2" />
        <rect class="cat-leg a" x="49" y="36" width="4.5" height="15" rx="2.2" />
      </g>
      <ellipse cx="37" cy="34" rx="19" ry="9.5" fill={FUR} />
      <g stroke={STRIPE} stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M28 26.5 q1 5 0 9 M35 25.5 q1 5 0 10 M42 26 q1 5 0 9" /></g>
      {scarf && <g><path d="M49 25 q4 7 10 9 l-1.5 4 q-7 -2 -11.5 -9z" fill={SCARF} /><rect x="50" y="32" width="4.5" height="10" rx="1.5" fill={SCARF} /></g>}
      <Ear d="M51 18 L53 7 L59 14z" inner="M53 15 L54 10 L57 13.5z" />
      <Ear d="M65 18 L64 7 L58.5 13.5z" inner="M63.5 15 L62.8 10 L60 13.5z" />
      <circle cx="58" cy="23" r="9.5" fill={FUR} />
      <g fill={INK}><ellipse cx="55" cy="22.5" rx="1.6" ry="2.1" /><ellipse cx="62" cy="22.5" rx="1.6" ry="2.1" /></g>
      <path d="M57.2 26 h2.6 l-1.3 1.5z" fill={NOSE} />
      <Whiskers cx={58.5} cy={26.5} />
      {glasses && <g fill="rgba(255,255,255,0.18)" stroke="#1b1b1b" stroke-width="1.2"><circle cx="55" cy="22.5" r="3.3" /><circle cx="62" cy="22.5" r="3.3" /><path d="M58.3 22.5 h0.4" /></g>}
      {headphones && <g><path d="M48 22 C48 9 68 9 68 22" stroke="#2f2f35" stroke-width="2.8" fill="none" stroke-linecap="round" /><rect x="45.5" y="19" width="5" height="8.5" rx="2.4" fill="#3a3a42" /><rect x="65.5" y="19" width="5" height="8.5" rx="2.4" fill="#3a3a42" /></g>}
      {(sunglasses || headset || hat) && <g transform={onHead(58.5, 23, 0.86)}>{sunglasses && <Sunglasses />}{headset && <Headset />}{hat && <HatOn hat={hat} />}</g>}
    </g>
  );
}

function Sleeping({ scarf, hat, nightcap }: Wear) {
  return (
    <g class="cat-breath">
      <path d="M18 47 C12 55 38 57 50 52" stroke={FUR} stroke-width="5.5" stroke-linecap="round" fill="none" />
      <ellipse cx="38" cy="44" rx="21" ry="10" fill={FUR} />
      <g stroke={STRIPE} stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M27 37 q1 4 0 8 M34 35.5 q1 5 0 9 M41 36 q1 4 0 8" /></g>
      {scarf && <path d="M47 38 q4 6 10 7 l-1 3.5 q-7 -1 -11 -7z" fill={SCARF} />}
      <Ear d="M50 37 L52 28 L57 34z" inner="M51.8 35 L52.8 31 L55.5 34z" />
      <Ear d="M63 37 L62.5 28 L58 34z" inner="M61.5 35 L61.3 31 L59 34z" />
      <circle cx="57" cy="42" r="8.5" fill={FUR} />
      <path d="M52.5 42 q2 1.6 4 0 M58.5 42 q2 1.6 4 0" stroke={INK} stroke-width="1.1" fill="none" stroke-linecap="round" />
      <path d="M56.4 45.4 h2.4 l-1.2 1.3z" fill={NOSE} />
      {hat && <g transform={onHead(57, 42, 0.78)}><HatOn hat={hat} /></g>}
      {nightcap && <g><path d="M49 37.5 Q55 31 64 34 Q70 30 74 24 Q70 33 64.5 38z" fill="#3b5bdb" /><path d="M58 33.4 l2 3.6 M64.5 32.6 l1.4 3.4" stroke="#93c5fd" stroke-width="1.4" /><circle cx="74.5" cy="23.5" r="2.6" fill="#f8f4ec" /></g>}
    </g>
  );
}
