import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameStateMachine } from './state';
import {
  COMBO_WINDOW_MS,
  GAME_DURATION_MS,
  SCORE_PER_WATERMELON,
} from '../lib/constants';

describe('GameStateMachine', () => {
  beforeEach(() => {
    // 使用假定时器,锁定 performance.now 起点为 0
    // 默认 toFake 不含 'performance',需显式声明,否则 performance.now()
    // 仍取真实高分辨率时钟,导致 elapsed 出现微秒级漂移。
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'setImmediate',
        'clearImmediate',
        'Date',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'performance',
      ],
    });
    vi.setSystemTime(0);
    // node 环境下没有 localStorage,需要手动 stub
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
      length: 0,
      key: () => null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('start 触发 stateChange + scoreChange + timeChange', () => {
    const m = new GameStateMachine();
    const events: string[] = [];
    m.events.on('stateChange', (s) => events.push(`state:${s}`));
    m.events.on('scoreChange', () => events.push('score'));
    m.events.on('timeChange', () => events.push('time'));
    m.start();
    expect(events).toContain('state:playing');
    expect(events).toContain('score');
    expect(events).toContain('time');
    expect(m.currentState).toBe('playing');
  });

  it('单次 slice 增加基础分', () => {
    const m = new GameStateMachine();
    m.start();
    m.registerSlice(performance.now());
    expect(m.currentScore).toBe(SCORE_PER_WATERMELON);
  });

  it('连击在窗口内累加', () => {
    const m = new GameStateMachine();
    m.start();
    const t0 = performance.now();
    m.registerSlice(t0);
    m.registerSlice(t0 + 100);
    m.registerSlice(t0 + 200);
    expect(m.currentScore).toBeGreaterThan(SCORE_PER_WATERMELON * 3);
  });

  it('连击超时重置', () => {
    const m = new GameStateMachine();
    m.start();
    const t0 = performance.now();
    m.registerSlice(t0);
    m.registerSlice(t0 + COMBO_WINDOW_MS + 100);
    expect(m.currentScore).toBe(SCORE_PER_WATERMELON * 2);
  });

  it('炸弹立即结束', () => {
    const m = new GameStateMachine();
    let endedReason: string | null = null;
    m.events.on('ended', (e) => {
      endedReason = e.reason;
    });
    m.start();
    m.registerBomb();
    expect(m.currentState).toBe('ended');
    expect(endedReason).toBe('bomb');
  });

  it('时间到自动结束', () => {
    const m = new GameStateMachine();
    let endedReason: string | null = null;
    m.events.on('ended', (e) => {
      endedReason = e.reason;
    });
    m.start();
    m.tick(performance.now() + GAME_DURATION_MS + 1);
    expect(m.currentState).toBe('ended');
    expect(endedReason).toBe('time');
  });

  it('结束后再 slice 无效', () => {
    const m = new GameStateMachine();
    m.start();
    m.registerBomb();
    const before = m.currentScore;
    m.registerSlice(performance.now());
    expect(m.currentScore).toBe(before);
  });

  it('pause 后 tick 不推进 elapsed', () => {
    const m = new GameStateMachine();
    let lastRemaining = 0;
    m.events.on('timeChange', (e) => { lastRemaining = e.remainingMs; });
    m.start();
    const t0 = performance.now();
    m.tick(t0 + 1000);
    const before = lastRemaining;
    m.pause(t0 + 1000);
    m.tick(t0 + 6000);
    expect(lastRemaining).toBe(before); // tick 在 pause 时直接 return,事件不发,值不变
  });

  it('resume 后 elapsed 扣除暂停时长', () => {
    const m = new GameStateMachine();
    let lastRemaining = GAME_DURATION_MS;
    m.events.on('timeChange', (e) => { lastRemaining = e.remainingMs; });
    m.start();
    const t0 = performance.now();
    m.tick(t0 + 1000);
    m.pause(t0 + 1000);
    m.resume(t0 + 6000);          // 暂停了 5 秒
    m.tick(t0 + 7000);             // 实际游戏时间应该是 2 秒
    expect(lastRemaining).toBe(GAME_DURATION_MS - 2000);
  });

  it('暂停期间 combo 不过期', () => {
    const m = new GameStateMachine();
    m.start();
    const t0 = performance.now();
    m.registerSlice(t0);
    m.registerSlice(t0 + 200);
    const beforeCombo = m.currentScore;
    m.pause(t0 + 200);
    m.resume(t0 + 200 + 5000);                   // 暂停了 5 秒,远超 COMBO_WINDOW_MS
    m.registerSlice(t0 + 200 + 5000 + 100);     // 暂停后 100ms 又切一刀
    expect(m.currentScore).toBeGreaterThanOrEqual(beforeCombo + SCORE_PER_WATERMELON * 2);
    // ↑ combo 未过期则第 3 刀按 2.0x 倍率 +20;若错判过期则只 +10。
    // 用 >=*2 严格区分两种情况(combo=3 时倍率恰为 2.0,所以是 >= 而非 >)。
  });

  it('pause 不在 playing 状态下无效', () => {
    const m = new GameStateMachine();
    m.pause(performance.now());          // idle
    expect(m['pausedAt']).toBeNull();    // 无副作用
  });
});
