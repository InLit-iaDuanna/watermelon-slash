import { describe, it, expect } from 'vitest';
import { SpawnScheduler } from './spawner';

describe('SpawnScheduler', () => {
  it('warmup 期间不出炸弹', () => {
    const s = new SpawnScheduler();
    let bombCount = 0;
    let fruitCount = 0;
    for (let i = 0; i < 200; i++) {
      const events = s.step(0.02);
      events.forEach((e) => {
        if (e.kind === 'bomb') bombCount++;
        else fruitCount += e.variants.length;
      });
      if (4 < i * 0.02) break;
    }
    expect(bombCount).toBe(0);
    expect(fruitCount).toBeGreaterThan(0);
  });

  it('reset 重置内部计时器', () => {
    const s = new SpawnScheduler();
    for (let i = 0; i < 100; i++) s.step(0.02);
    s.reset();
    // reset 后第一次 step(短 dt)不应该立刻 spawn
    const events = s.step(0.1);
    expect(events.length).toBe(0);
  });
});
