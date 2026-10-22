import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact-render-to-string';
import { DEFAULT_LOOK, type DeckView } from '@tabbydeck/shared';
import { tileStyle, Tile, Grid, Icon, ICON_NAMES, gridCellSize } from '../src/index.ts';

const sprite = readFileSync(new URL('../src/icons/sprite.svg', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

describe('tileStyle', () => {
  it('maps radius 16 to 16px border radius', () => {
    expect(tileStyle(DEFAULT_LOOK, 96).style.borderRadius).toBe('16px');
  });
  it('maps labelPos top to flex-start', () => {
    expect(tileStyle({ ...DEFAULT_LOOK, labelPos: 'top' }, 96).style.justifyContent).toBe('flex-start');
    expect(tileStyle({ ...DEFAULT_LOOK, labelPos: 'center' }, 96).style.justifyContent).toBe('center');
    expect(tileStyle({ ...DEFAULT_LOOK, labelPos: 'bottom' }, 96).style.justifyContent).toBe('flex-end');
  });
  it('scales the label with the cell size, but only between 0.75x and 1.3x', () => {
    expect(tileStyle(DEFAULT_LOOK, 96).labelStyle.fontSize).toBe('14px');
    expect(tileStyle(DEFAULT_LOOK, 192).labelStyle.fontSize).toBe('18px');
    expect(tileStyle(DEFAULT_LOOK, 40).labelStyle.fontSize).toBe('11px');
  });
  it('keeps the label clear of the key lip and lifts the icon further for two-line labels', () => {
    const one = tileStyle({ ...DEFAULT_LOOK, label: 'Copy' }, 96);
    expect(one.innerStyle.padding).toBe('10px 7px 15px'); // bottom = 12% + 3 px lip
    const lift = (t: ReturnType<typeof tileStyle>) => Number(/\+ (-?[\d.]+)px\)\)$/.exec(String(t.iconStyle.transform))![1]);
    expect(lift(tileStyle({ ...DEFAULT_LOOK, label: 'Task Manager' }, 96, 2))).toBeLessThan(lift(one));
  });
  it('is deterministic', () => {
    expect(tileStyle(DEFAULT_LOOK, 80)).toEqual(tileStyle(DEFAULT_LOOK, 80));
  });
  it('adds a border when set', () => {
    expect(tileStyle({ ...DEFAULT_LOOK, border: { color: '#f00', width: 2 } }, 96).style.border).toBe('2px solid #f00');
  });
});

describe('icons', () => {
  it('has several hundred icons including the defaults', () => {
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(250);
    for (const n of ['notepad', 'question', 'folder', 'speaker-high', 'play', 'youtube-logo', 'spotify-logo']) expect(ICON_NAMES).toContain(n);
  });
  it('sprite contains a symbol for every name', () => {
    for (const n of ICON_NAMES) expect(sprite).toContain(`id="i-${n}"`);
  });
  it('an unknown icon name renders the question symbol', () => {
    expect(render(<Icon name="does-not-exist" size={24} />)).toContain('#i-question');
    expect(render(<Icon name="play" size={24} />)).toContain('#i-play');
  });
});

describe('tokens.css', () => {
  it('uses no backdrop-filter (old Android GPUs)', () => {
    expect(tokens).not.toMatch(/backdrop-filter/);
  });
  it('defines the amber accent in dark and light', () => {
    expect(tokens).toContain('#f5a524');
    expect(tokens).toContain('#b86e00');
  });
});

describe('Tile and Grid', () => {
  const view: DeckView = {
    profileId: 'p', profileName: 'Main', profiles: [], folderId: 'f', path: [], cols: 5, rows: 3, gap: 8, bg: '#000',
    widgets: [
      { id: 'a', kind: 'button', x: 0, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Notepad', icon: 'notepad' } },
      { id: 'b', kind: 'folder', x: 2, y: 1, w: 2, h: 1, look: { ...DEFAULT_LOOK, label: 'Media' } },
    ],
  };
  it('renders the label, icon and an accessible name', () => {
    const html = render(<Tile widget={view.widgets[0]} cell={{ w: 96, h: 96 }} assetUrl={id => `/assets/${id}`} />);
    expect(html).toContain('Notepad');
    expect(html).toContain('#i-notepad');
    expect(html).toContain('aria-label="Notepad"');
  });
  it('shows an uploaded image instead of the icon', () => {
    const html = render(<Tile widget={{ ...view.widgets[0], look: { ...view.widgets[0].look, image: 'abc.png' } }} cell={{ w: 96, h: 96 }} assetUrl={id => `/assets/${id}`} />);
    expect(html).toContain('src="/assets/abc.png"');
  });
  it('pressed tiles get the pressed class', () => {
    expect(render(<Tile widget={view.widgets[0]} cell={{ w: 96, h: 96 }} pressed assetUrl={x => x} />)).toContain('tb-pressed');
  });
  it('grid positions tiles by cell and gap', () => {
    const html = render(<Grid view={view} cell={{ w: 100, h: 80 }} assetUrl={x => x} />);
    expect(html).toMatch(/left:\s*216px/); // x=2: 2*(100+8)
    expect(html).toMatch(/top:\s*88px/);   // y=1: 80+8
    expect(html).toMatch(/width:\s*208px/); // w=2: 2*100+8
    expect(html).toMatch(/height:\s*80px/);
  });
  it('gridCellSize fills the box and stretches cells up to a 1.35 aspect', () => {
    // 600 x 300, 6 x 3, gap 10: room for 91 x 93 cells
    expect(gridCellSize(600, 300, 6, 3, 10)).toEqual({ w: 91, h: 93 });
    // wide box: 1000 x 200, 5 x 3, gap 8 -> 193 x 61, width capped to 1.35 x 61 = 82
    expect(gridCellSize(1000, 200, 5, 3, 8)).toEqual({ w: 82, h: 61 });
    // tall portrait phone: 388 x 760, 6 x 3, gap 10 -> 56 x 246, height capped to 1.35 x 56 = 75
    expect(gridCellSize(388, 760, 6, 3, 10)).toEqual({ w: 56, h: 75 });
  });
  it('gridCellSize never makes a tile bigger than MAX_CELL_PX on either side', () => {
    expect(gridCellSize(1240, 736, 10, 5, 10)).toEqual({ w: 115, h: 128 });
    expect(gridCellSize(2400, 1500, 5, 3, 10)).toEqual({ w: 128, h: 128 });
  });
  it('a stretched tile scales its icon from the shorter side', () => {
    expect(render(<Tile widget={view.widgets[0]} cell={{ w: 200, h: 100 }} assetUrl={x => x} />)).toContain('width="30"');
  });
});

describe('long labels', () => {
  it('shrinks a long single word to fit the tile instead of breaking it', () => {
    const w = { id: 'x', kind: 'button' as const, x: 0, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Screenshot' } };
    const html = render(<Tile widget={w} cell={{ w: 60, h: 100 }} assetUrl={x => x} />);
    const px = Number(html.match(/font-size:\s*(\d+)px/)![1]);
    expect(px * 'Screenshot'.length * 0.58).toBeLessThanOrEqual(60 * 0.86);
  });
  it('leaves short labels at their normal size', () => {
    const w = { id: 'x', kind: 'button' as const, x: 0, y: 0, w: 1, h: 1, look: { ...DEFAULT_LOOK, label: 'Copy' } };
    expect(render(<Tile widget={w} cell={{ w: 80, h: 100 }} assetUrl={x => x} />)).toMatch(/font-size:\s*12px/);
  });
});

describe('key colours for the styles', () => {
  it('passes the key colours as rgb parts, and nothing for other formats', async () => {
    const { rgbVar } = await import('../src/looks.ts');
    expect(rgbVar('--key-rgb', '#1e3a5f')).toEqual({ '--key-rgb': '30, 58, 95' });
    expect(rgbVar('--fg-rgb', '#fff')).toEqual({ '--fg-rgb': '255, 255, 255' });
    expect(rgbVar('--key-rgb', 'red')).toEqual({});
  });
});
