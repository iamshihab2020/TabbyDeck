/** A finger that has moved this far sideways is swiping, so the key it started on is not pressed. */
export const SWIPE_START = 12;
const SWIPE_MIN = 70;

/** -1 swiped left, 1 swiped right, 0 not a swipe (too short, or more up and down than across). */
export function swipeDir(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
  return dx < 0 ? -1 : 1;
}

/** Left goes to the next profile, right to the one before. No wrapping round, so the ends are felt. */
export function profileAfterSwipe(ids: string[], current: string, dir: -1 | 1): string | null {
  const at = ids.indexOf(current);
  if (at < 0) return null;
  return ids[at - dir] ?? null;
}
