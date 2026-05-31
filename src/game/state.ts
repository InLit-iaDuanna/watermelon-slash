import {
  COMBO_MAX_MULTIPLIER,
  COMBO_MULTIPLIER_STEP,
  COMBO_RAW_CAP,
  COMBO_WINDOW_MS,
  GAME_DURATION_MS,
  SCORE_PER_WATERMELON,
  STORAGE_HIGH_SCORE,
} from '../lib/constants';
import { EventBus } from '../lib/event-bus';

export type GameState = 'idle' | 'playing' | 'ended';

export type GameEvents = {
  stateChange: GameState;
  scoreChange: { score: number; combo: number; multiplier: number };
  timeChange: { remainingMs: number };
  ended: { score: number; highScore: number; isNewHigh: boolean; reason: 'time' | 'bomb' };
};

/**
 * Pure-data game state machine. Rendering and physics live elsewhere.
 */
export class GameStateMachine {
  readonly events = new EventBus<GameEvents>();

  private state: GameState = 'idle';
  private score = 0;
  private combo = 0;
  private lastSliceAt = 0;
  private startedAt = 0;
  private elapsedMs = 0;
  // 暂停起始时间戳；非空表示当前处于暂停状态
  private pausedAt: number | null = null;
  // 累积已暂停的毫秒数,用于从经过时间中扣除
  private pausedTotalMs = 0;

  start(): void {
    this.score = 0;
    this.combo = 0;
    this.lastSliceAt = 0;
    this.startedAt = performance.now();
    this.elapsedMs = 0;
    // 重置暂停状态,避免上一局残留影响新一局
    this.pausedAt = null;
    this.pausedTotalMs = 0;
    this.setState('playing');
    this.emitScore();
    this.events.emit('timeChange', { remainingMs: GAME_DURATION_MS });
  }

  /** 暂停游戏:仅在 playing 状态生效,记录暂停起始点。 */
  pause(now: number): void {
    if (this.state !== 'playing') return;
    if (this.pausedAt !== null) return;
    this.pausedAt = now;
  }

  /** 恢复游戏:把暂停期间的耗时累加到 pausedTotalMs,从 elapsed 中扣除。 */
  resume(now: number): void {
    if (this.pausedAt === null) return;
    const delta = now - this.pausedAt;
    this.pausedTotalMs += delta;
    // 把 combo 的最近一次切瓜时间也平移过去,
    // 否则后台 5 秒后回来 combo 立即过期。
    if (this.lastSliceAt > 0) {
      this.lastSliceAt += delta;
    }
    this.pausedAt = null;
  }

  tick(now: number): void {
    if (this.state !== 'playing') return;
    // 暂停期间不推进倒计时,避免后台时游戏跑完
    if (this.pausedAt !== null) return;
    this.elapsedMs = now - this.startedAt - this.pausedTotalMs;
    const remaining = Math.max(0, GAME_DURATION_MS - this.elapsedMs);
    this.events.emit('timeChange', { remainingMs: remaining });

    // Combo expiry
    if (this.combo > 0 && now - this.lastSliceAt > COMBO_WINDOW_MS) {
      this.combo = 0;
      this.emitScore();
    }

    if (remaining <= 0) {
      this.end('time');
    }
  }

  registerSlice(now: number, scoreMultiplier = 1): void {
    if (this.state !== 'playing') return;
    if (now - this.lastSliceAt < COMBO_WINDOW_MS) {
      this.combo = Math.min(this.combo + 1, COMBO_RAW_CAP);
    } else {
      this.combo = 1;
    }
    this.lastSliceAt = now;
    const multiplier = this.currentMultiplier();
    this.score += Math.round(SCORE_PER_WATERMELON * scoreMultiplier * multiplier);
    this.emitScore();
  }

  registerBomb(): void {
    if (this.state !== 'playing') return;
    this.end('bomb');
  }

  private currentMultiplier(): number {
    return Math.min(1 + Math.max(0, this.combo - 1) * COMBO_MULTIPLIER_STEP, COMBO_MAX_MULTIPLIER);
  }

  private emitScore(): void {
    this.events.emit('scoreChange', {
      score: this.score,
      combo: this.combo,
      multiplier: this.currentMultiplier(),
    });
  }

  private setState(next: GameState): void {
    if (this.state === next) return;
    this.state = next;
    this.events.emit('stateChange', next);
  }

  private end(reason: 'time' | 'bomb'): void {
    this.setState('ended');
    const highScore = readHighScore();
    const isNewHigh = this.score > highScore;
    if (isNewHigh) writeHighScore(this.score);
    this.events.emit('ended', {
      score: this.score,
      highScore: Math.max(highScore, this.score),
      isNewHigh,
      reason,
    });
  }

  get currentState(): GameState {
    return this.state;
  }

  get currentScore(): number {
    return this.score;
  }
}

export const readHighScore = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_HIGH_SCORE);
    return raw ? Math.max(0, Number.parseInt(raw, 10) || 0) : 0;
  } catch {
    return 0;
  }
};

export const writeHighScore = (score: number): void => {
  try {
    localStorage.setItem(STORAGE_HIGH_SCORE, String(score));
  } catch {
    /* ignore */
  }
};
