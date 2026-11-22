import { describe, expect, it } from 'vitest';
import { render } from 'preact-render-to-string';
import { angleAt, levelAngle, turn } from '../src/wheel.ts';
import { BrightnessWheelPanel, VolumeWheelPanel } from '../src/screens/Wheel.tsx';

const noop = () => {};

describe('turning the wheel', () => {
  it('measures the finger in degrees from the top of the wheel, clockwise', () => {
    expect(angleAt(50, 0, 50, 50)).toBeCloseTo(0);
    expect(angleAt(100, 50, 50, 50)).toBeCloseTo(90);
    expect(angleAt(0, 50, 50, 50)).toBeCloseTo(-90);
  });
  it('moves the level by how far the finger turns, 270 degrees for the whole range, not by where it lands', () => {
    expect(turn(50, 0, 27)).toBeCloseTo(60);
    expect(turn(50, 27, 0)).toBeCloseTo(40);
    expect(turn(50, 170, -170)).toBeCloseTo(50 + 20 / 2.7); // across the bottom of the wheel, still a small turn
  });
  it('stops at 0 and 100', () => {
    expect(turn(95, 0, 90)).toBe(100);
    expect(turn(3, 0, -90)).toBe(0);
  });
  it('draws 0 at the lower left and 100 at the lower right, with 50 at the top', () => {
    expect([levelAngle(0), levelAngle(50), levelAngle(100)]).toEqual([-135, 0, 135]);
  });
});

/** The wheel's slider, and every choice (screen chips) in a panel. */
const slider = (html: string) => /<[^>]*role="slider"[^>]*>/.exec(html)?.[0] ?? '';
const valueOf = (html: string) => Number(/aria-valuenow="(\d+)"/.exec(slider(html))?.[1]);
const chips = (html: string) => [...html.matchAll(/<button[^>]*role="radio"[^>]*aria-checked="(true|false)"[^>]*>([^<]*)<\/button>/g)].map(m => `${m[1] === 'true' ? '*' : ''}${m[2]}`);

describe('the knob', () => {
  const knob = (level: number) => render(<VolumeWheelPanel level={level} muted={false} onSet={noop} onMute={noop} onClose={noop} />);
  const lights = (html: string) => ({ all: (html.match(/class="wheel-led( lit)?"/g) ?? []).length, lit: (html.match(/class="wheel-led lit"/g) ?? []).length });
  it('lights the ring of 20 lights round the knob up to the level, one for every 5%', () => {
    expect(lights(knob(40))).toEqual({ all: 20, lit: 8 });
    expect(lights(knob(0)).lit).toBe(0);
    expect(lights(knob(100)).lit).toBe(20);
  });
  it('is turned to the level, so its dimple points at it', () => {
    expect(knob(40)).toContain(`rotate(${levelAngle(40)} 130 130)`);
    expect(knob(100)).toContain('rotate(135 130 130)');
  });
});

describe('the Volume wheel', () => {
  it('shows the PC volume in the middle and on the wheel', () => {
    const html = render(<VolumeWheelPanel level={40} muted={false} onSet={noop} onMute={noop} onClose={noop} />);
    expect(valueOf(html)).toBe(40);
    expect(html).toContain('40%');
    expect(html).toContain('Mute');
  });
  it('says Muted while the PC is muted, and offers Unmute', () => {
    const html = render(<VolumeWheelPanel level={40} muted onSet={noop} onMute={noop} onClose={noop} />);
    expect(html).toContain('Muted');
    expect(html).toContain('Unmute');
  });
  it('says it is reading until the PC sends the level', () => {
    const html = render(<VolumeWheelPanel onSet={noop} onMute={noop} onClose={noop} />);
    expect(html).toContain('Reading from the PC');
    expect(slider(html)).toBe('');
  });
});

describe('the Brightness wheel', () => {
  const screens = [{ id: 'LAP1', name: 'Laptop screen', brightness: 60 }, { id: 'MON1', name: 'Monitor', brightness: 80 }];
  it('turns every screen at first, from their average, and offers each screen on its own', () => {
    const html = render(<BrightnessWheelPanel screens={screens} onSet={noop} onClose={noop} />);
    expect(chips(html)).toEqual(['*All screens', 'Laptop screen', 'Monitor']);
    expect(valueOf(html)).toBe(70);
  });
  it('with one screen, turns that screen and offers no choice', () => {
    const html = render(<BrightnessWheelPanel screens={screens.slice(0, 1)} onSet={noop} onClose={noop} />);
    expect(chips(html)).toEqual([]);
    expect(valueOf(html)).toBe(60);
    expect(html).toContain('Laptop screen');
  });
  it('says so when no screen can change its brightness', () => {
    expect(render(<BrightnessWheelPanel screens={[]} onSet={noop} onClose={noop} />)).toContain('No screen here lets Windows change its brightness');
  });
});
