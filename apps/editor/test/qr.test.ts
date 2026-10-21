import { describe, expect, it } from 'vitest';
import { qrSvg } from '../src/components/qr.ts';

describe('qrSvg', () => {
  it('renders a square SVG with dark modules for a URL', () => {
    const svg = qrSvg('http://192.168.1.20:8191/');
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('<path');
    expect(svg.length).toBeGreaterThan(300);
  });
  it('is deterministic', () => {
    expect(qrSvg('http://a/')).toBe(qrSvg('http://a/'));
  });
  it('includes a quiet zone of 4 modules', () => {
    const m = qrSvg('x').match(/viewBox="0 0 (\d+) \d+"/)!;
    expect(Number(m[1])).toBe(21 + 8); // version 1 is 21 modules
  });
});
