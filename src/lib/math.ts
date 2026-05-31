/** Math + utility helpers. Pure functions only. */

export const clamp = (n: number, min: number, max: number): number =>
  Math.min(Math.max(n, min), max);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const randRange = (min: number, max: number): number => min + Math.random() * (max - min);

export const randSign = (): number => (Math.random() < 0.5 ? -1 : 1);

/** Easing: smoothstep */
export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Distance between two 2D points. */
export const dist2 = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

/** Closest distance from point P to line segment AB (all 2D). */
export const distPointToSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
