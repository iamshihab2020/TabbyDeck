import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPressTracker } from '../src/press.ts';

describe('press tracker', () => {
  let events: string[];
  let t: ReturnType<typeof createPressTracker>;
  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    t = createPressTracker({
      onPress: () => events.push('press'), onLong: () => events.push('long'),
      onDouble: () => events.push('double'), onRelease: () => events.push('release'),
    }, { longMs: 500, doubleMs: 300 });
  });
  afterEach(() => vi.useRealTimers());

  it('a key with its own hold: a tap presses on release, a hold sends only long', () => {
    const got: string[] = [];
    const h = createPressTracker({ onPress: () => got.push('press'), onLong: () => got.push('long'), onDouble: () => got.push('double'), onRelease: () => got.push('release') },
      { longMs: 500, doubleMs: 300, holdOnly: true });
    h.down(); expect(got).toEqual([]); // nothing yet: it may become a hold
    vi.advanceTimersByTime(200); h.up();
    expect(got).toEqual(['press', 'release']);
    got.length = 0; vi.advanceTimersByTime(1000);
    h.down(); vi.advanceTimersByTime(500); expect(got).toEqual(['long']); // no press first
    h.up(); expect(got).toEqual(['long', 'release']);
  });
  it('fires press immediately on down', () => {
    t.down();
    expect(events).toEqual(['press']);
  });
  it('fires long once after holding 500 ms', () => {
    t.down();
    vi.advanceTimersByTime(499); expect(events).toEqual(['press']);
    vi.advanceTimersByTime(1); expect(events).toEqual(['press', 'long']);
    vi.advanceTimersByTime(2000); expect(events).toEqual(['press', 'long']);
    t.up(); expect(events).toEqual(['press', 'long', 'release']);
  });
  it('fires release on up and no long for a short tap', () => {
    t.down(); vi.advanceTimersByTime(100); t.up(); vi.advanceTimersByTime(1000);
    expect(events).toEqual(['press', 'release']);
  });
  it('down-up-down within 300 ms fires double and still delivers the second press', () => {
    t.down(); t.up(); vi.advanceTimersByTime(200); t.down();
    expect(events).toEqual(['press', 'release', 'press', 'double']);
  });
  it('a second down after 300 ms is not a double', () => {
    t.down(); t.up(); vi.advanceTimersByTime(301); t.down();
    expect(events).toEqual(['press', 'release', 'press']);
  });
  it('a triple tap fires double only once', () => {
    t.down(); t.up(); vi.advanceTimersByTime(100); t.down(); t.up(); vi.advanceTimersByTime(100); t.down();
    expect(events.filter(e => e === 'double')).toHaveLength(1);
  });
  it('cancel stops a pending long press without a release', () => {
    t.down(); vi.advanceTimersByTime(200); t.cancel(); vi.advanceTimersByTime(1000);
    expect(events).toEqual(['press']);
  });
  it('with repeat, holding repeats press instead of firing long, and stops on release', () => {
    const r: string[] = [];
    const k = createPressTracker({ onPress: () => r.push('press'), onLong: () => r.push('long'), onDouble: () => r.push('double'), onRelease: () => r.push('release') }, { longMs: 400, doubleMs: 300, repeatMs: 150 });
    k.down();
    vi.advanceTimersByTime(399);
    expect(r).toEqual(['press']);
    vi.advanceTimersByTime(1 + 150 * 3);
    expect(r).toEqual(['press', 'press', 'press', 'press']);
    k.up();
    vi.advanceTimersByTime(1000);
    expect(r).toEqual(['press', 'press', 'press', 'press', 'release']);
  });
});

