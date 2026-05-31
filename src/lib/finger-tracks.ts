import { FingertipTrail } from './trail';
import { OneEuroFilter2D } from './one-euro';
import type { Handedness, HandSample } from './hand-tracker';
import {
  MAX_PREDICTED_FRAMES,
  ONE_EURO_BETA,
  ONE_EURO_D_CUTOFF,
  ONE_EURO_MIN_CUTOFF,
  PRIMARY_FINGERTIP_LANDMARK,
  TRACK_STALE_AFTER_S,
} from './constants';

/**
 * 把 MediaPipe 输出的 normalized [0,1] 坐标转到游戏的场景空间坐标。
 * 游戏视椎是 x∈[-aspect, aspect], y∈[-1,1],并且根据用户偏好可能左右镜像。
 */
export type SceneTransform = (
  nx: number,
  ny: number,
) => { x: number; y: number };

export type ObservedFinger = {
  handedness: Handedness;
  landmark: number;
  /** 已经过 1€ 滤波后的场景坐标 */
  x: number;
  y: number;
  /** 来自 MediaPipe 的 visibility 估计 */
  visibility: number;
};

const trackKey = (handedness: Handedness, landmark: number): string =>
  `${handedness}:${landmark}`;

/**
 * 单根手指轨迹:1€ 滤波 + 帧间外推 + 短窗 trail 缓冲。
 * - observe: 来自真观测,filter 一下并 push 进 trail。
 * - predict: MediaPipe 这一帧没出该指,基于上一次 1€ 估计的速度往前外推。
 *   超过 MAX_PREDICTED_FRAMES 后就认为追丢,清空 trail 防止幻影刀。
 */
export class FingerTrack {
  readonly handedness: Handedness;
  readonly landmark: number;
  readonly trail = new FingertipTrail();

  private filter = new OneEuroFilter2D({
    minCutoff: ONE_EURO_MIN_CUTOFF,
    beta: ONE_EURO_BETA,
    dCutoff: ONE_EURO_D_CUTOFF,
  });
  private lastObservedAt = -Infinity;
  private predictedStreak = 0;
  /** 最近一次过滤后的位置(场景坐标),用来做帧间外推。 */
  private lastFiltered: { x: number; y: number } | null = null;

  constructor(handedness: Handedness, landmark: number) {
    this.handedness = handedness;
    this.landmark = landmark;
  }

  observe(sceneX: number, sceneY: number, tSec: number): { x: number; y: number } {
    const filtered = this.filter.filter(sceneX, sceneY, tSec);
    this.trail.push(filtered.x, filtered.y, tSec);
    this.lastFiltered = filtered;
    this.lastObservedAt = tSec;
    this.predictedStreak = 0;
    return filtered;
  }

  /**
   * 没拿到该指的真观测时调用:基于 1€ 估计的速度做线性外推。
   * @returns true = 还在跟踪;false = 连续外推过头,track 已被清空
   */
  predict(tSec: number): boolean {
    if (!this.lastFiltered) return false;
    if (this.predictedStreak >= MAX_PREDICTED_FRAMES) {
      this.reset();
      return false;
    }
    if (tSec - this.lastObservedAt > TRACK_STALE_AFTER_S) {
      this.reset();
      return false;
    }
    const v = this.filter.velocity();
    const last = this.trail.latest;
    const baseT = last?.t ?? this.lastObservedAt;
    const dt = Math.max(0, tSec - baseT);
    const baseX = last?.x ?? this.lastFiltered.x;
    const baseY = last?.y ?? this.lastFiltered.y;
    this.trail.push(baseX + v.x * dt, baseY + v.y * dt, tSec);
    this.predictedStreak += 1;
    return true;
  }

  isStale(nowSec: number): boolean {
    return nowSec - this.lastObservedAt > TRACK_STALE_AFTER_S;
  }

  reset(): void {
    this.filter.reset();
    this.trail.clear();
    this.lastFiltered = null;
    this.predictedStreak = 0;
    this.lastObservedAt = -Infinity;
  }
}

/**
 * 多手 × 多指轨迹管理器。
 * 每帧调一次 step(可能带 hands 也可能不带),它负责:
 *   - 给本帧观测到的指喂真值(observe)
 *   - 给本帧没观测到的活跃指做外推(predict)
 *   - 把太久没动静的 track 清掉
 */
export class FingerTracks {
  private tracks = new Map<string, FingerTrack>();
  private toScene: SceneTransform;

  constructor(toScene: SceneTransform) {
    this.toScene = toScene;
  }

  setSceneTransform(toScene: SceneTransform): void {
    this.toScene = toScene;
  }

  /**
   * @param hands 这一帧 MediaPipe 的输出。null = 没跑推理(跳帧),走纯外推。
   * @param tSec 当前时间(秒)
   */
  step(hands: HandSample[] | null, tSec: number): void {
    const observed = new Set<string>();
    if (hands) {
      for (const h of hands) {
        for (const f of h.fingers) {
          const key = trackKey(h.handedness, f.landmark);
          const scene = this.toScene(f.x, f.y);
          let track = this.tracks.get(key);
          if (!track) {
            track = new FingerTrack(h.handedness, f.landmark);
            this.tracks.set(key, track);
          }
          track.observe(scene.x, scene.y, tSec);
          observed.add(key);
        }
      }
    }
    // 没观测到的 track:外推或淘汰
    for (const [key, track] of this.tracks) {
      if (observed.has(key)) continue;
      const alive = track.predict(tSec);
      if (!alive) this.tracks.delete(key);
    }
  }

  /**
   * 重置所有 track 状态。镜像切换 / 摄像头切换时调用,避免坐标跳变后
   * 1€ 滤波器把跳变当成"高速运动"放大成幻影刀。
   */
  resetAll(): void {
    for (const track of this.tracks.values()) track.reset();
    this.tracks.clear();
  }

  /** 当前所有活跃轨迹(用于碰撞检测,所有指都参与)。 */
  allTrails(): FingertipTrail[] {
    return Array.from(this.tracks.values()).map((t) => t.trail);
  }

  /**
   * 按 handedness 取主显示指(食指)的 trail,用来画 ribbon。
   * 最多两条:左手食指 + 右手食指。Unknown 也会被透传。
   */
  primaryTrails(): { handedness: Handedness; trail: FingertipTrail }[] {
    const out: { handedness: Handedness; trail: FingertipTrail }[] = [];
    for (const t of this.tracks.values()) {
      if (t.landmark !== PRIMARY_FINGERTIP_LANDMARK) continue;
      out.push({ handedness: t.handedness, trail: t.trail });
    }
    return out;
  }

  /** 当前活跃 track 数,主要用于诊断 / HUD。 */
  trackCount(): number {
    return this.tracks.size;
  }
}
