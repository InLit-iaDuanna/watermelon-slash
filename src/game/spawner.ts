import {
  BOMB_PROBABILITY,
  GAME_DURATION_MS,
  SPAWN_INTERVAL_MS_END,
  SPAWN_INTERVAL_MS_START,
  type FruitVariant,
} from '../lib/constants';
import { lerp } from '../lib/math';
import type { SpawnMode } from './entities';

/**
 * 单个 spawn 事件:可能是若干同时出现的水果,或一个炸弹。
 * 同一事件里所有 fruit 共享一个 mode(扇形扩散同位置;水果雨同时间不同位置)。
 */
export type SpawnEvent =
  | {
      kind: 'fruits';
      mode: SpawnMode;
      variants: FruitVariant[];
    }
  | { kind: 'bomb'; mode: SpawnMode };

/**
 * 难度三阶段:
 *   0-15s   warmup     单点为主,只西瓜/橘子,无炸弹
 *   15-35s  rising     扇形 + 侧抛,加草莓/菠萝,炸弹 8%
 *   35-60s  intense    水果雨高发,加金西瓜罕见出现,炸弹 12%
 */
export class SpawnScheduler {
  private nextSpawnAt = 800;
  private elapsed = 0;

  reset(): void {
    this.nextSpawnAt = 800;
    this.elapsed = 0;
  }

  step(dt: number): SpawnEvent[] {
    this.elapsed += dt * 1000;
    const events: SpawnEvent[] = [];
    if (this.elapsed < this.nextSpawnAt) return events;

    const t = Math.min(this.elapsed / GAME_DURATION_MS, 1);
    const interval = lerp(SPAWN_INTERVAL_MS_START, SPAWN_INTERVAL_MS_END, t);
    this.nextSpawnAt = this.elapsed + interval;

    const stage = this.stage();
    const bombChance = stage === 'warmup' ? 0 : stage === 'rising' ? 0.08 : 0.12;

    if (Math.random() < bombChance) {
      // 中后期偶尔从侧边抛炸弹
      const sideChance = stage === 'intense' ? 0.35 : 0.15;
      const sideRoll = Math.random();
      const bombMode: SpawnMode =
        sideRoll < sideChance / 2 ? 'side-left' :
        sideRoll < sideChance ? 'side-right' :
        'single';
      events.push({ kind: 'bomb', mode: bombMode });
      return events;
    }

    const mode = this.pickMode(stage);
    const count = this.pickCount(mode);
    const variants: FruitVariant[] = [];
    for (let i = 0; i < count; i += 1) {
      variants.push(this.pickFruitVariant(stage));
    }
    events.push({ kind: 'fruits', mode, variants });
    return events;
  }

  private stage(): 'warmup' | 'rising' | 'intense' {
    if (this.elapsed < 15_000) return 'warmup';
    if (this.elapsed < 35_000) return 'rising';
    return 'intense';
  }

  /** 按阶段加权随机选择抛投模式 */
  private pickMode(stage: 'warmup' | 'rising' | 'intense'): SpawnMode {
    const r = Math.random();
    if (stage === 'warmup') {
      return r < 0.85 ? 'single' : 'fan';
    }
    if (stage === 'rising') {
      // 60% single / 18% fan / 11% side-left / 11% side-right
      if (r < 0.6) return 'single';
      if (r < 0.78) return 'fan';
      if (r < 0.89) return 'side-left';
      return 'side-right';
    }
    // intense:加水果雨
    if (r < 0.4) return 'single';
    if (r < 0.55) return 'fan';
    if (r < 0.7) return 'side-left';
    if (r < 0.85) return 'side-right';
    return 'shower';
  }

  /** 一次事件里水果数量:fan/shower 多发,single/side 单发 */
  private pickCount(mode: SpawnMode): number {
    switch (mode) {
      case 'fan': return 2 + (Math.random() < 0.35 ? 1 : 0); // 2-3
      case 'shower': return 3 + (Math.random() < 0.4 ? 1 : 0); // 3-4
      default: return 1;
    }
  }

  /** 按阶段加权挑水果。后期解锁草莓/菠萝/金瓜。 */
  private pickFruitVariant(stage: 'warmup' | 'rising' | 'intense'): FruitVariant {
    const r = Math.random();
    if (stage === 'warmup') {
      // 65% 西瓜 35% 橘子
      return r < 0.65 ? 'watermelon' : 'orange';
    }
    if (stage === 'rising') {
      // 40 watermelon / 25 orange / 18 strawberry / 14 pineapple / 3 gold
      if (r < 0.40) return 'watermelon';
      if (r < 0.65) return 'orange';
      if (r < 0.83) return 'strawberry';
      if (r < 0.97) return 'pineapple';
      return 'gold';
    }
    // intense:金瓜稍多
    if (r < 0.30) return 'watermelon';
    if (r < 0.50) return 'orange';
    if (r < 0.70) return 'strawberry';
    if (r < 0.90) return 'pineapple';
    return 'gold';
  }
}

// 兼容性占位:state.ts 里没用,这里只是不删旧常量引用
void BOMB_PROBABILITY;
