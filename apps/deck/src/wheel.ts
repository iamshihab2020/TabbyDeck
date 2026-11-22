// The wheel's geometry. Angles are degrees from the top of the wheel, clockwise; levels are 0 to 100.

/** How far round the wheel the whole range goes: 0 at the lower left, 100 at the lower right, a gap at the bottom. */
export const SWEEP = 270;

/** Where a finger at x, y is, as an angle round the wheel's centre cx, cy. */
export const angleAt = (x: number, y: number, cx: number, cy: number) => Math.atan2(x - cx, cy - y) * 180 / Math.PI;

/**
 * The level after the finger turns from one angle to another: it moves by how far the finger went, as a real knob does,
 * so touching the far side of the wheel never jumps the volume. A turn across the bottom counts as the short way round.
 */
export function turn(level: number, from: number, to: number): number {
  const d = ((to - from) % 360 + 540) % 360 - 180;
  return Math.max(0, Math.min(100, level + d * 100 / SWEEP));
}

/** The angle a level is drawn at. */
export const levelAngle = (level: number) => -SWEEP / 2 + SWEEP * level / 100;

/** The point at an angle on a circle of radius r round cx, cy. */
export function pointAt(angle: number, r: number, cx: number, cy: number): [number, number] {
  const a = angle * Math.PI / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
