import { describe, it, expect } from 'vitest';
import { FingertipTrail } from './trail';
import { TRAIL_LENGTH } from './constants';

describe('FingertipTrail', () => {
  it('环形缓冲不超过 TRAIL_LENGTH', () => {
    const t = new FingertipTrail();
    for (let i = 0; i < TRAIL_LENGTH + 5; i++) t.push(i, 0, i);
    expect(t.length).toBe(TRAIL_LENGTH);
  });

  it('latest 返回最新一点', () => {
    const t = new FingertipTrail();
    t.push(1, 2, 0);
    t.push(3, 4, 1);
    expect(t.latest).toEqual({ x: 3, y: 4, t: 1 });
  });

  it('clear 清空', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 0);
    t.clear();
    expect(t.length).toBe(0);
    expect(t.latest).toBeNull();
  });

  it('recentSpeed 在不到 2 个点时返回 0', () => {
    const t = new FingertipTrail();
    expect(t.recentSpeed()).toBe(0);
    t.push(0, 0, 0);
    expect(t.recentSpeed()).toBe(0);
  });

  it('recentSpeed 计算最近一段速度', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 0);
    t.push(3, 4, 1);
    expect(t.recentSpeed()).toBe(5);
  });

  it('recentSpeed 时间差为 0 时返回 0', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 1);
    t.push(1, 0, 1);
    expect(t.recentSpeed()).toBe(0);
  });

  it('closestDistanceTo 空 trail 返回 Infinity', () => {
    const t = new FingertipTrail();
    expect(t.closestDistanceTo(0, 0)).toBe(Infinity);
  });

  it('closestDistanceTo 单点 trail', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 0);
    expect(t.closestDistanceTo(3, 4)).toBe(5);
  });

  it('closestDistanceTo 多段中取最小', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 0);
    t.push(2, 0, 1);
    t.push(2, 2, 2);
    expect(t.closestDistanceTo(2, 1)).toBeCloseTo(0);
  });

  it('recentDirection 单位方向向量', () => {
    const t = new FingertipTrail();
    t.push(0, 0, 0);
    t.push(3, 4, 1);
    const dir = t.recentDirection();
    expect(dir).not.toBeNull();
    expect(dir!.x).toBeCloseTo(0.6);
    expect(dir!.y).toBeCloseTo(0.8);
  });

  it('recentDirection 不到 2 点返回 null', () => {
    const t = new FingertipTrail();
    expect(t.recentDirection()).toBeNull();
  });
});
