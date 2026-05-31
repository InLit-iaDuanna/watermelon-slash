import { describe, it, expect } from 'vitest';
import { clamp, lerp, smoothstep, dist2, distPointToSegment } from './math';

describe('clamp', () => {
  it('夹到上下界之间', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('线性插值', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('smoothstep', () => {
  it('两端为 0 和 1', () => {
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(1)).toBe(1);
  });
  it('中点为 0.5', () => {
    expect(smoothstep(0.5)).toBeCloseTo(0.5);
  });
});

describe('dist2', () => {
  it('两点距离', () => {
    expect(dist2(0, 0, 3, 4)).toBe(5);
    expect(dist2(1, 1, 1, 1)).toBe(0);
  });
});

describe('distPointToSegment', () => {
  it('点在线段上', () => {
    expect(distPointToSegment(0.5, 0, 0, 0, 1, 0)).toBe(0);
  });
  it('点在线段一端外', () => {
    expect(distPointToSegment(-1, 0, 0, 0, 1, 0)).toBe(1);
    expect(distPointToSegment(2, 0, 0, 0, 1, 0)).toBe(1);
  });
  it('点垂直于线段中点', () => {
    expect(distPointToSegment(0.5, 1, 0, 0, 1, 0)).toBe(1);
  });
  it('退化为点的线段', () => {
    expect(distPointToSegment(3, 4, 0, 0, 0, 0)).toBe(5);
  });
});
