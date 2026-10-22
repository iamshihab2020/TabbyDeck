import { describe, expect, it } from 'vitest';
import { profileAfterSwipe, swipeDir } from '../src/swipe.ts';

describe('swipe', () => {
  it('needs a long, mostly sideways move', () => {
    expect(swipeDir(-90, 10)).toBe(-1);
    expect(swipeDir(90, -20)).toBe(1);
    expect(swipeDir(40, 0)).toBe(0); // too short
    expect(swipeDir(90, 60)).toBe(0); // more of a scroll
  });
  it('goes left to the next profile and right to the previous, without wrapping', () => {
    const ids = ['a', 'b', 'c'];
    expect(profileAfterSwipe(ids, 'a', -1)).toBe('b');
    expect(profileAfterSwipe(ids, 'b', 1)).toBe('a');
    expect(profileAfterSwipe(ids, 'c', -1)).toBeNull();
    expect(profileAfterSwipe(ids, 'a', 1)).toBeNull();
    expect(profileAfterSwipe(ids, 'gone', -1)).toBeNull();
  });
});
