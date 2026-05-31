/**
 * One Euro Filter — Casiez, Roussel, Vogel (CHI 2012)
 *
 * 比 EMA 准:静止时强滤波(抖动→稳),快速运动时几乎不滤(挥砍→跟手)。
 * 通过把 cutoff 频率与"信号变化率"挂钩做到自适应。
 *
 * 论文参考实现:https://gery.casiez.net/1euro/
 */

export type OneEuroParams = {
  /** 静止时的截止频率 Hz,越小越稳但越滞后 */
  minCutoff: number;
  /** 速度对截止频率的耦合系数,越大对快速运动越敏感 */
  beta: number;
  /** 速度自身的低通截止 Hz */
  dCutoff: number;
};

const smoothingFactor = (te: number, cutoff: number): number => {
  const r = 2 * Math.PI * cutoff * te;
  return r / (r + 1);
};

const exponentialSmoothing = (a: number, x: number, xPrev: number): number =>
  a * x + (1 - a) * xPrev;

export class OneEuroFilter {
  private xRawPrev: number | null = null;
  private xHatPrev = 0;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(private params: OneEuroParams) {}

  /**
   * @param x 当前观测值
   * @param tSec 当前时间戳(秒,单调递增)
   */
  filter(x: number, tSec: number): number {
    if (this.xRawPrev === null) {
      this.xRawPrev = x;
      this.xHatPrev = x;
      this.tPrev = tSec;
      this.dxPrev = 0;
      return x;
    }
    const te = Math.max(1e-6, tSec - this.tPrev);
    // dx 必须用原始观测值差分;以前用滤波后的 xPrev 会把 dx 放大几倍,
    // 导致 velocity 错估,切瓜阈值识别失效
    const dx = (x - this.xRawPrev) / te;
    const aD = smoothingFactor(te, this.params.dCutoff);
    const dxHat = exponentialSmoothing(aD, dx, this.dxPrev);

    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(dxHat);
    const a = smoothingFactor(te, cutoff);
    const xHat = exponentialSmoothing(a, x, this.xHatPrev);

    this.xRawPrev = x;
    this.xHatPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tSec;
    return xHat;
  }

  /** 滤波器内部估计的瞬时速度(per second);被 finger-tracks 用来做帧间预测 */
  get velocity(): number {
    return this.dxPrev;
  }

  reset(): void {
    this.xRawPrev = null;
    this.xHatPrev = 0;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
}

export class OneEuroFilter2D {
  private fx: OneEuroFilter;
  private fy: OneEuroFilter;

  constructor(params: OneEuroParams) {
    this.fx = new OneEuroFilter(params);
    this.fy = new OneEuroFilter(params);
  }

  filter(x: number, y: number, tSec: number): { x: number; y: number } {
    return { x: this.fx.filter(x, tSec), y: this.fy.filter(y, tSec) };
  }

  velocity(): { x: number; y: number } {
    return { x: this.fx.velocity, y: this.fy.velocity };
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}
