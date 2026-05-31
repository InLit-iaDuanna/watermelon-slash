import { distPointToSegment } from './math';
import { TRAIL_LENGTH } from './constants';

export type TrailPoint = {
  /** Screen-space x in [-aspect, aspect] (world-ish units, see Game scene setup). */
  x: number;
  /** Screen-space y in [-1, 1]. */
  y: number;
  /** Time in seconds since trail start. */
  t: number;
};

/**
 * Ring buffer of recent fingertip positions in screen space.
 * Used both for visual trail rendering and slice collision detection.
 */
export class FingertipTrail {
  private points: TrailPoint[] = [];

  push(x: number, y: number, t: number): void {
    this.points.push({ x, y, t });
    if (this.points.length > TRAIL_LENGTH) {
      this.points.shift();
    }
  }

  clear(): void {
    this.points.length = 0;
  }

  get length(): number {
    return this.points.length;
  }

  get latest(): TrailPoint | null {
    return this.points[this.points.length - 1] ?? null;
  }

  toArray(): readonly TrailPoint[] {
    return this.points;
  }

  /**
   * Average speed over the most recent up-to-3 points, in units/sec.
   * 用 3 点窗口而不是单段:单帧 ML 抖动会让 2 点速度偶发跳到 0,
   * 把阈值检测吃掉一半。
   */
  recentSpeed(): number {
    const n = this.points.length;
    if (n < 2) return 0;
    const start = Math.max(0, n - 3);
    const first = this.points[start];
    const last = this.points[n - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    let dist = 0;
    for (let i = start + 1; i < n; i += 1) {
      const a = this.points[i - 1];
      const b = this.points[i];
      dist += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return dist / dt;
  }

  /**
   * Closest distance from a point to any segment in the trail.
   * Used for circle-vs-segment slice testing.
   */
  closestDistanceTo(px: number, py: number): number {
    const n = this.points.length;
    if (n === 0) return Infinity;
    if (n === 1) return Math.hypot(px - this.points[0].x, py - this.points[0].y);
    let best = Infinity;
    for (let i = 1; i < n; i += 1) {
      const a = this.points[i - 1];
      const b = this.points[i];
      const d = distPointToSegment(px, py, a.x, a.y, b.x, b.y);
      if (d < best) best = d;
    }
    return best;
  }

  /**
   * Direction vector across the most recent up-to-3 points, normalized.
   * 用 3 点端到端而不是最后一段,降低单帧抖动让方向歪 90° 的概率。
   * Used for setting slice-half initial velocity along the cut direction.
   */
  recentDirection(): { x: number; y: number } | null {
    const n = this.points.length;
    if (n < 2) return null;
    const start = Math.max(0, n - 3);
    const first = this.points[start];
    const last = this.points[n - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) return null;
    return { x: dx / len, y: dy / len };
  }
}
