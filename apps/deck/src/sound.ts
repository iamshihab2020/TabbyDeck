import type { KV } from './device.ts';

/** Key sounds, chosen in the deck's settings. Made on the phone with Web Audio, so there are no sound files. */
export const SOUNDS = ['off', 'click', 'clack', 'pop'] as const;
export type KeySound = (typeof SOUNDS)[number];
export const SOUND_NAMES: Record<KeySound, string> = { off: 'Silent', click: 'Soft click', clack: 'Keyboard', pop: 'Pop' };

const KEY = 'tabbydeck.sound';

export function loadSound(kv: KV): KeySound {
  try { const v = kv.getItem(KEY) as KeySound | null; return v && SOUNDS.includes(v) ? v : 'off'; } catch { return 'off'; }
}
export function saveSound(kv: KV, s: KeySound): void {
  try { kv.setItem(KEY, s); } catch { /* private mode: lasts for this page only */ }
}

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let noise: AudioBuffer | null = null;

function audio(): Ctx | null {
  if (!ctx) {
    const A = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume(); // iOS starts it suspended until a touch
  return ctx;
}

/** A short burst of filtered noise: the body of a click. */
function burst(c: Ctx, at: number, freq: number, type: BiquadFilterType, gain: number, len: number) {
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noise; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + len);
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(at); src.stop(at + len + 0.01);
}

/** Play a key sound now: quiet, and over in under 60 ms so fast presses never queue up behind it. */
export function playSound(s: KeySound): void {
  if (s === 'off') return;
  const c = audio(); if (!c) return;
  const t = c.currentTime;
  if (s === 'click') burst(c, t, 3200, 'highpass', 0.18, 0.018);
  else if (s === 'clack') { burst(c, t, 1800, 'bandpass', 0.35, 0.025); burst(c, t + 0.028, 900, 'lowpass', 0.25, 0.03); }
  else {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.05);
    g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.07);
  }
}

/** What the deck plays when a timer or Pomodoro stretch runs out, chosen in the deck's settings; Chime unless changed. */
export const ALARMS = ['chime', 'bell', 'off'] as const;
export type Alarm = (typeof ALARMS)[number];
export const ALARM_NAMES: Record<Alarm, string> = { chime: 'Chime', bell: 'Bell', off: 'Off' };
const ALARM_KEY = 'tabbydeck.alarm';

export function loadAlarm(kv: KV): Alarm {
  try { const v = kv.getItem(ALARM_KEY) as Alarm | null; return v && ALARMS.includes(v) ? v : 'chime'; } catch { return 'chime'; }
}
export function saveAlarm(kv: KV, a: Alarm): void {
  try { kv.setItem(ALARM_KEY, a); } catch { /* private mode: lasts for this page only */ }
}

function tone(c: Ctx, at: number, freq: number, gain: number, len: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + len + 0.02);
}

/** Ring for a finished timer, about three seconds: a rising three-note chime three times, or a bell struck three times. */
export function playAlarm(a: Alarm): void {
  if (a === 'off') return;
  const c = audio(); if (!c) return;
  const t = c.currentTime + 0.05;
  for (let r = 0; r < 3; r++) {
    const at = t + r * 1.1;
    if (a === 'chime') [1047, 1319, 1568].forEach((f, i) => tone(c, at + i * 0.16, f, 0.25, 0.7));
    else { tone(c, at, 660, 0.3, 1.0); tone(c, at, 1320 * 1.005, 0.12, 0.6); tone(c, at, 1980, 0.06, 0.35); } // a bell's partials
  }
}

/** iOS keeps Web Audio silent until a touch starts it, so the first touch on the deck does, ready for an alarm later. */
export function unlockAudio(): void { audio(); }
