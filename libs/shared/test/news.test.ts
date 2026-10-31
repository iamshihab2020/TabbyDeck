import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { latestNews, splitLabel } from '../src/news.ts';
import { BACKGROUNDS, isBackground } from '../src/backgrounds.ts';

describe('what is new, from the changelog', () => {
  it('reads the newest release: its version and the lines under each heading', () => {
    const n = latestNews('# Changelog\n\n## 1.2.0 (2026-11-01)\n\n### On the phone\n- One\n- Two\n\n### Editor\n- Three\n\n## 1.1.0\n\n### Old\n- Gone\n');
    expect(n).toEqual({ version: '1.2.0', sections: [{ title: 'On the phone', items: ['One', 'Two'] }, { title: 'Editor', items: ['Three'] }] });
  });
  it('the real changelog has a phone section in its newest release', () => {
    const n = latestNews(readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'))!;
    expect(n.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(n.sections.find(s => s.title === 'On the phone')?.items.length).toBeGreaterThan(0);
  });
  it('none without a release', () => expect(latestNews('# Changelog\n')).toBeNull());
  it('splits a leading label off a line', () => {
    expect(splitLabel('Customize: choose a background')).toEqual({ label: 'Customize', text: 'Choose a background' });
    expect(splitLabel('A line, with: a colon later on and no label')).toEqual({ label: null, text: 'A line, with: a colon later on and no label' });
  });
});

describe('backgrounds a phone may set', () => {
  it('ready-made ones and plain colours only', () => {
    for (const b of BACKGROUNDS) expect(isBackground(b.bg)).toBe(true);
    expect(isBackground('#A1b2C3')).toBe(true);
    for (const bad of ['red', 'url(x)', '#12345', 'linear-gradient(red, blue)']) expect(isBackground(bad)).toBe(false);
  });
});
