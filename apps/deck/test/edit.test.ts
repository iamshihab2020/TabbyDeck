import { describe, expect, it } from 'vitest';
import { clampOffset, coverScale, outSize, sourceRect } from '../src/photo.ts';
import { hasPumpkin, seasonFor } from '../src/season.ts';
import { markNewsRead, newsUnread } from '../src/news.ts';
import { loadSound, saveSound } from '../src/sound.ts';
import type { KV } from '../src/device.ts';

const memKV = (): KV => { const m: Record<string, string> = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; } }; };

describe('cropping a photo for a key', () => {
  const img = { w: 400, h: 200 }, frame = { w: 100, h: 100 };
  it('zoom 1 covers the frame with the short side', () => expect(coverScale(img, frame, 1)).toBe(0.5));
  it('the picture can never leave a gap in the frame', () => {
    expect(clampOffset(20, 20, img, 0.5, frame)).toEqual({ x: 0, y: 0 });
    expect(clampOffset(-500, -50, img, 0.5, frame)).toEqual({ x: -100, y: 0 });
  });
  it('the frame shows the matching part of the image', () => {
    expect(sourceRect({ x: -50, y: -20 }, 0.5, frame)).toEqual({ x: 100, y: 40, w: 200, h: 200 });
  });
  it('the output keeps the shape, is capped, and is never upscaled', () => {
    expect(outSize({ w: 2000, h: 1000 }, 512)).toEqual({ w: 512, h: 256 });
    expect(outSize({ w: 200, h: 100 }, 512)).toEqual({ w: 200, h: 100 });
  });
});

describe('seasonal touches', () => {
  it('snow all December, pumpkins in the last week of October, nothing otherwise', () => {
    expect(seasonFor(new Date(2026, 11, 1))).toBe('snow');
    expect(seasonFor(new Date(2026, 11, 31))).toBe('snow');
    expect(seasonFor(new Date(2026, 9, 25))).toBe('pumpkin');
    expect(seasonFor(new Date(2026, 9, 24))).toBeNull();
    expect(seasonFor(new Date(2026, 6, 4))).toBeNull();
  });
  it('pumpkins land on the same keys each time, about one in four', () => {
    const ids = Array.from({ length: 400 }, (_, i) => `key-${i}`);
    const n = ids.filter(hasPumpkin).length;
    expect(n).toBeGreaterThan(60); expect(n).toBeLessThan(140);
    expect(ids.filter(hasPumpkin)).toEqual(ids.filter(hasPumpkin));
  });
});

describe('what is new, on a device', () => {
  it('a device that was paired before sees it once per version', () => {
    const kv = memKV();
    expect(newsUnread(kv, '0.4.0', true)).toBe(true);
    markNewsRead(kv, '0.4.0');
    expect(newsUnread(kv, '0.4.0', true)).toBe(false);
    expect(newsUnread(kv, '0.5.0', true)).toBe(true);
  });
  it('a first install or new pairing never sees it, and not later either', () => {
    const kv = memKV();
    expect(newsUnread(kv, '0.4.0', false)).toBe(false);
    expect(newsUnread(kv, '0.4.0', true)).toBe(false);
  });
});

describe('key sound setting', () => {
  it('is silent until chosen, and keeps a choice', () => {
    const kv = memKV();
    expect(loadSound(kv)).toBe('off');
    saveSound(kv, 'clack'); expect(loadSound(kv)).toBe('clack');
    kv.setItem('tabbydeck.sound', 'loud'); expect(loadSound(kv)).toBe('off');
  });
});
