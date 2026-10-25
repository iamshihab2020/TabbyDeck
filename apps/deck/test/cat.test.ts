import { describe, expect, it } from 'vitest';
import { outfitFor } from '../src/screens/Cat.tsx';

const calm = { playing: false, focus: false };

describe('the cat', () => {
  it('wears a scarf from December to February only', () => {
    expect([0, 1, 2, 5, 10, 11].map(m => outfitFor(new Date(2026, m, 15), calm).scarf)).toEqual([true, true, false, false, false, true]);
  });
  it('wears headphones while music plays, a headset in a call, glasses while focusing and a hard hat while a timer runs', () => {
    const april = new Date(2026, 3, 1, 14);
    expect(outfitFor(april, calm)).toMatchObject({ hat: null, headphones: false, headset: false, glasses: false, sunglasses: false, mug: false, nightcap: false });
    expect(outfitFor(april, { playing: true, focus: true, timer: true })).toMatchObject({ headphones: true, glasses: true, hat: 'hard' });
    expect(outfitFor(april, { playing: true, focus: false, meeting: true })).toMatchObject({ headset: true, headphones: false }); // the call wins
  });
  it('dresses for the date and the hour', () => {
    const at = (m: number, d: number, h = 14) => outfitFor(new Date(2026, m, d, h), calm);
    expect([at(11, 24).hat, at(11, 26).hat, at(11, 27).hat, at(11, 31).hat, at(0, 1).hat, at(9, 25).hat, at(9, 24).hat]).toEqual(['santa', 'santa', null, 'party', 'party', 'witch', null]);
    expect(outfitFor(new Date(2026, 11, 24), { playing: false, focus: false, timer: true }).hat).toBe('santa'); // the holiday hat wins
    expect([at(5, 1).sunglasses, at(7, 31).sunglasses, at(8, 1).sunglasses]).toEqual([true, true, false]);
    expect(outfitFor(new Date(2026, 6, 1), { playing: false, focus: true }).sunglasses).toBe(false); // focus glasses instead
    expect([at(3, 1, 7).mug, at(3, 1, 10).mug, at(3, 1, 23).nightcap, at(3, 1, 3).nightcap, at(3, 1, 22).nightcap, at(11, 25, 23).nightcap]).toEqual([true, false, true, true, false, false]);
  });
});

describe('the cat size', () => {
  it('follows the keys, from phone size to tablet size', async () => {
    const { catSize } = await import('../src/screens/Cat.tsx');
    expect([360, 412, 600, 800, 1200].map(catSize)).toEqual([56, 56, 66, 88, 100]); // phones, small and big tablets
  });
});

