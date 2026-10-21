import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, type DeckView } from '@tabbydeck/shared';
import { layoutFor } from '../src/screens/Deck.tsx';

const deck = (cols: number, rows: number): DeckView => ({
  profileId: 'p', profileName: 'Main', profiles: [], folderId: 'f', path: [{ id: 'f', name: 'Main' }], cols, rows, gap: 16, bg: '#000',
  widgets: Array.from({ length: cols * rows }, (_, i) => ({ id: `k${i}`, kind: 'button' as const, x: i % cols, y: Math.floor(i / cols), w: 1, h: 1, look: DEFAULT_LOOK })),
});

describe('deck layout per screen', () => {
  it('a tablet shows the deck as built, with no scrolling', () => {
    const r = layoutFor(deck(6, 5), { w: 1256, h: 740 });
    expect(r.scroll).toBe(false);
    expect(r.view.cols).toBe(6);
  });
  it('a phone held upright keeps thumb-sized keys in fewer columns and scrolls', () => {
    const r = layoutFor(deck(6, 5), { w: 366, h: 760 });
    expect(r).toMatchObject({ scroll: true, view: { cols: 4, rows: 8 } });
    expect(r.cell.w).toBeGreaterThanOrEqual(72);
    expect(r.view.widgets[4]).toMatchObject({ id: 'k4', x: 0, y: 1 });
  });
  it('a phone on its side keeps all six columns and scrolls down', () => {
    const r = layoutFor(deck(6, 5), { w: 820, h: 300 });
    expect(r).toMatchObject({ scroll: true, view: { cols: 6, rows: 5 } });
    expect(r.view.widgets[7]).toMatchObject({ x: 1, y: 1 });
  });
});
