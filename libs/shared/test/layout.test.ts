import { describe, expect, it } from 'vitest';
import { fits, firstFreeCell, flowLayout, planReflow } from '../src/index.ts';

const at = (id: string, x: number, y: number, w = 1, h = 1) => ({ id, x, y, w, h });

describe('fits', () => {
  it('detects overlap with another widget', () => {
    expect(fits([at('a', 0, 0, 2, 1)], 5, 3, { x: 1, y: 0, w: 1, h: 1 })).toBe(false);
  });
  it('accepts the last cell of the grid', () => {
    expect(fits([], 5, 3, { x: 4, y: 2, w: 1, h: 1 })).toBe(true);
  });
  it('rejects a 2x2 at 4,2 on a 5x3 grid', () => {
    expect(fits([], 5, 3, { x: 4, y: 2, w: 2, h: 2 })).toBe(false);
  });
  it('ignores the widget being moved', () => {
    expect(fits([at('a', 0, 0)], 5, 3, { id: 'a', x: 0, y: 0, w: 1, h: 1 })).toBe(true);
  });
  it('rejects negative coordinates', () => {
    expect(fits([], 5, 3, { x: -1, y: 0, w: 1, h: 1 })).toBe(false);
  });
});

describe('firstFreeCell', () => {
  it('returns 1,0 when 0,0 is taken', () => {
    expect(firstFreeCell([at('a', 0, 0)], 5, 3, 1, 1)).toEqual({ x: 1, y: 0 });
  });
  it('returns null when the grid is full', () => {
    const all = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) all.push(at(`${x}${y}`, x, y));
    expect(firstFreeCell(all, 5, 3, 1, 1)).toBeNull();
  });
  it('finds room for a 2x2 below a full first row', () => {
    const row = [0, 1, 2, 3, 4].map(x => at(`r${x}`, x, 0));
    expect(firstFreeCell(row, 5, 3, 2, 2)).toEqual({ x: 0, y: 1 });
  });
});

describe('planReflow (drop on a taken cell, home-screen style)', () => {
  const one = (id: string, x: number, y: number) => ({ id, x, y, w: 1, h: 1 });
  const apply = (ws: { id: string; x: number; y: number; w: number; h: number }[], moves: { id: string; x: number; y: number }[]) =>
    Object.fromEntries(ws.map(w => { const m = moves.find(v => v.id === w.id); return [w.id, m ? `${m.x},${m.y}` : `${w.x},${w.y}`]; }));

  it('a free target is a plain move', () => {
    expect(planReflow([one('a', 0, 0)], 'a', 2, 1, 3, 2)).toEqual([{ id: 'a', x: 2, y: 1 }]);
  });
  it('moving backwards shifts the keys in between forwards, into the dragged key\'s old cell', () => {
    // a b c / d · ·   drag d onto a  ->  d a b / c · ·
    const ws = [one('a', 0, 0), one('b', 1, 0), one('c', 2, 0), one('d', 0, 1)];
    expect(apply(ws, planReflow(ws, 'd', 0, 0, 3, 2)!)).toEqual({ d: '0,0', a: '1,0', b: '2,0', c: '0,1' });
  });
  it('moving forwards shifts the keys in between backwards', () => {
    // a b c d  drag a onto c  ->  b c a d
    const ws = [one('a', 0, 0), one('b', 1, 0), one('c', 2, 0), one('d', 3, 0)];
    expect(apply(ws, planReflow(ws, 'a', 2, 0, 4, 1)!)).toEqual({ b: '0,0', c: '1,0', a: '2,0', d: '3,0' });
  });
  it('the shift stops at the nearest gap, leaving keys beyond it alone', () => {
    // a · b c  drag c onto a  ->  c a b ·
    const ws = [one('a', 0, 0), one('b', 2, 0), one('c', 3, 0)];
    expect(apply(ws, planReflow(ws, 'c', 0, 0, 4, 1)!)).toEqual({ c: '0,0', a: '1,0', b: '2,0' });
  });
  it('keys flow around a wide key, which stays put', () => {
    // a [WW] b / c d e   drag e onto a  ->  e [WW] a / b c d
    const ws = [one('a', 0, 0), { id: 'W', x: 1, y: 0, w: 2, h: 1 }, one('b', 3, 0), one('c', 0, 1), one('d', 1, 1), one('e', 2, 1)];
    expect(apply(ws, planReflow(ws, 'e', 0, 0, 4, 2)!)).toEqual({ e: '0,0', W: '1,0', a: '3,0', b: '0,1', c: '1,1', d: '2,1' });
  });
  it('a wide key swaps with a key group of the same size, and refuses anything else', () => {
    const ws = [{ id: 'W', x: 0, y: 0, w: 2, h: 1 }, { id: 'V', x: 2, y: 0, w: 2, h: 1 }];
    expect(apply(ws, planReflow(ws, 'W', 2, 0, 4, 1)!)).toEqual({ W: '2,0', V: '0,0' });
    expect(planReflow([{ id: 'W', x: 0, y: 0, w: 2, h: 1 }, one('a', 2, 0), one('b', 3, 0)], 'W', 2, 0, 4, 1)).toBeNull();
  });
  it('dropping a small key onto a wide key is refused', () => {
    expect(planReflow([{ id: 'W', x: 0, y: 0, w: 2, h: 1 }, one('a', 2, 0)], 'a', 1, 0, 3, 1)).toBeNull();
  });
});

describe('flowLayout', () => {
  it('keeps reading order in fewer columns and grows downwards', () => {
    const keys = [0, 1, 2, 3, 4, 5].flatMap(x => [0, 1].map(y => ({ id: `${x},${y}`, x, y, w: 1, h: 1 })));
    const r = flowLayout(keys, 4);
    expect(r.rows).toBe(3);
    expect(r.widgets.map(k => `${k.id}@${k.x},${k.y}`).slice(0, 7)).toEqual(['0,0@0,0', '1,0@1,0', '2,0@2,0', '3,0@3,0', '4,0@0,1', '5,0@1,1', '0,1@2,1']);
  });
  it('a key wider than the screen is narrowed, and big keys still never overlap', () => {
    const r = flowLayout([{ id: 'wide', x: 0, y: 0, w: 6, h: 1 }, { id: 'big', x: 0, y: 1, w: 2, h: 2 }, { id: 'a', x: 2, y: 1, w: 1, h: 1 }], 3);
    expect(r.widgets.map(k => [k.id, k.x, k.y, k.w])).toEqual([['wide', 0, 0, 3], ['big', 0, 1, 2], ['a', 2, 1, 1]]);
    expect(r.rows).toBe(3);
  });
});
