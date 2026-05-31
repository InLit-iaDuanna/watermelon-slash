import { describe, it, expect } from 'vitest';
import { OneEuroFilter, OneEuroFilter2D } from './one-euro';

const params = { minCutoff: 1, beta: 0.5, dCutoff: 1 };

describe('OneEuroFilter', () => {
  it('首帧返回原值(没有历史可用)', () => {
    const f = new OneEuroFilter(params);
    expect(f.filter(1.23, 0)).toBe(1.23);
  });

  it('恒定输入会收敛到该值', () => {
    const f = new OneEuroFilter(params);
    let last = 0;
    for (let i = 0; i < 200; i += 1) last = f.filter(5, i / 60);
    expect(last).toBeCloseTo(5, 4);
  });

  it('小幅抖动会被显著抑制', () => {
    const f = new OneEuroFilter({ minCutoff: 0.5, beta: 0.0, dCutoff: 1 });
    f.filter(0, 0); // 第一帧无滤波
    let maxDeviation = 0;
    for (let i = 1; i < 60; i += 1) {
      const noisy = (i % 2 === 0 ? 1 : -1) * 0.05;
      const out = f.filter(noisy, i / 60);
      maxDeviation = Math.max(maxDeviation, Math.abs(out));
    }
    expect(maxDeviation).toBeLessThan(0.04);
  });

  it('beta 增大会让快速变化更快通过', () => {
    const lowBeta = new OneEuroFilter({ minCutoff: 1, beta: 0, dCutoff: 1 });
    const highBeta = new OneEuroFilter({ minCutoff: 1, beta: 10, dCutoff: 1 });
    lowBeta.filter(0, 0);
    highBeta.filter(0, 0);
    let lowOut = 0;
    let highOut = 0;
    for (let i = 1; i <= 5; i += 1) {
      const x = i * 0.2;
      lowOut = lowBeta.filter(x, i / 60);
      highOut = highBeta.filter(x, i / 60);
    }
    expect(highOut).toBeGreaterThan(lowOut);
  });

  it('reset 后再 filter 第一帧重新无滤波', () => {
    const f = new OneEuroFilter(params);
    f.filter(0, 0);
    f.filter(10, 1 / 60);
    f.reset();
    expect(f.filter(7, 0)).toBe(7);
  });

  it('velocity 在恒定速度信号下趋近真实速度', () => {
    const f = new OneEuroFilter(params);
    for (let i = 0; i < 200; i += 1) f.filter(i * 0.1, i / 60);
    expect(f.velocity).toBeCloseTo(6, 0); // 0.1 units / (1/60 s) = 6 units/s
  });
});

describe('OneEuroFilter2D', () => {
  it('x/y 互相独立', () => {
    const f = new OneEuroFilter2D(params);
    const out = f.filter(3, 7, 0);
    expect(out).toEqual({ x: 3, y: 7 });
  });

  it('reset 同时清空 x/y 状态', () => {
    const f = new OneEuroFilter2D(params);
    f.filter(0, 0, 0);
    f.filter(10, 10, 1 / 60);
    f.reset();
    const out = f.filter(2, 5, 0);
    expect(out).toEqual({ x: 2, y: 5 });
  });
});
