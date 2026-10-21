import { describe, expect, it } from 'vitest';
import { cellFromPointer, planMove, planResize } from '../src/canvas/drag.ts';

const rect = { left: 100, top: 50, width: 0, height: 0 };
const cell = { w: 100, h: 80 };
const at = (id: string, x: number, y: number, w = 1, h = 1) => ({ id, x, y, w, h });

describe('cellFromPointer', () => {
  it('maps the centre of cell (2,1) on a 5x3 grid with gap 10', () => {
    // cell (2,1) starts at left 100 + 2*110 = 320, top 50 + 1*90 = 140
    expect(cellFromPointer(rect, 5, 3, 10, cell, 320 + 50, 140 + 40)).toEqual({ x: 2, y: 1 });
  });
  it('clamps pointers outside the grid to the edge cells', () => {
    expect(cellFromPointer(rect, 5, 3, 10, cell, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(cellFromPointer(rect, 5, 3, 10, cell, 9999, 9999)).toEqual({ x: 4, y: 2 });
  });
  it('a point inside a gap belongs to the cell before it', () => {
    expect(cellFromPointer(rect, 5, 3, 10, cell, 100 + 105, 60)).toEqual({ x: 0, y: 0 });
  });
});

describe('planMove', () => {
  const ws = [at('a', 0, 0), at('b', 2, 1, 2, 1)];
  it('returns the target when free', () => {
    expect(planMove(ws, 'a', 1, 0, 5, 3)).toEqual({ x: 1, y: 0 });
  });
  it('returns null when the target overlaps another widget', () => {
    expect(planMove(ws, 'a', 3, 1, 5, 3)).toBeNull();
  });
  it('keeps a wide widget inside the grid by shifting it left', () => {
    expect(planMove(ws, 'b', 4, 2, 5, 3)).toEqual({ x: 3, y: 2 });
  });
  it('allows moving onto its own old cells', () => {
    expect(planMove(ws, 'b', 3, 1, 5, 3)).toEqual({ x: 3, y: 1 });
  });
});

describe('planResize', () => {
  const ws = [at('a', 0, 0), at('b', 3, 0)];
  it('clamps to the grid', () => {
    expect(planResize([at('a', 3, 1)], 'a', 9, 9, 5, 3)).toEqual({ w: 2, h: 2 });
  });
  it('refuses to grow over a neighbour', () => {
    expect(planResize(ws, 'a', 4, 1, 5, 3)).toBeNull();
  });
  it('allows growing into free cells and never below 1x1', () => {
    expect(planResize(ws, 'a', 2, 2, 5, 3)).toEqual({ w: 2, h: 2 });
    expect(planResize(ws, 'a', 0, -3, 5, 3)).toEqual({ w: 1, h: 1 });
  });
});
