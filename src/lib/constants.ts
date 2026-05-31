/** Game-wide constants. Tweak here, not in feature code. */

// —— Game loop ——
export const GAME_DURATION_MS = 60_000;
export const COMBO_WINDOW_MS = 1500;
export const COMBO_MULTIPLIER_STEP = 0.5; // +0.5x per combo tier
export const COMBO_MAX_MULTIPLIER = 4;

// —— Spawning ——
export const SPAWN_INTERVAL_MS_START = 1400;
export const SPAWN_INTERVAL_MS_END = 600;
export const SPAWN_BURST_PROBABILITY = 0.18;
export const BOMB_PROBABILITY = 0.08;

// —— Watermelon physics (units in "viewport heights") ——
export const GRAVITY = -3.2; // negative because Y up
export const SPAWN_VELOCITY_Y_MIN = 2.0;
export const SPAWN_VELOCITY_Y_MAX = 3.0;
export const SPAWN_VELOCITY_X_RANGE = 1.0;
export const WATERMELON_RADIUS = 0.18;
export const BOMB_RADIUS = 0.16;

// —— 水果种类配置 ——
// 每种水果有独立的颜色、分值、罕见度。形状统一球(可压扁拉长以微差异化)。
export type FruitVariant = 'watermelon' | 'orange' | 'strawberry' | 'pineapple' | 'gold';

export type FruitConfig = {
  variant: FruitVariant;
  /** 分值倍数,最终得分 = SCORE_PER_WATERMELON × multiplier × combo */
  scoreMultiplier: number;
  /** 半径相对值 */
  radius: number;
  /** y 缩放(让某些水果不那么圆) */
  scaleY: number;
  /** rind 主色 / 副色(给条纹/格纹) */
  rindColor: number;
  rindDark: number;
  /** 切开后内部果肉色 */
  fleshColor: number;
  /** 表面纹理类型 */
  pattern: 'stripes' | 'rough' | 'diamond' | 'smooth' | 'glow';
  /** 是否发光 */
  glow: number; // 0..1
};

export const FRUITS: Record<FruitVariant, FruitConfig> = {
  watermelon: {
    variant: 'watermelon', scoreMultiplier: 1.0, radius: 0.18, scaleY: 1.0,
    rindColor: 0x2ea84a, rindDark: 0x0e3d20, fleshColor: 0xff4263,
    pattern: 'stripes', glow: 0,
  },
  orange: {
    variant: 'orange', scoreMultiplier: 0.8, radius: 0.14, scaleY: 0.95,
    rindColor: 0xff8a2a, rindDark: 0xc05010, fleshColor: 0xffb060,
    pattern: 'rough', glow: 0,
  },
  strawberry: {
    variant: 'strawberry', scoreMultiplier: 1.2, radius: 0.13, scaleY: 1.15,
    rindColor: 0xff3060, rindDark: 0x801025, fleshColor: 0xffd0d8,
    pattern: 'rough', glow: 0,
  },
  pineapple: {
    variant: 'pineapple', scoreMultiplier: 1.5, radius: 0.16, scaleY: 1.3,
    rindColor: 0xe8c540, rindDark: 0x6a4a08, fleshColor: 0xfff5b8,
    pattern: 'diamond', glow: 0,
  },
  gold: {
    variant: 'gold', scoreMultiplier: 3.0, radius: 0.18, scaleY: 1.0,
    rindColor: 0xffd24a, rindDark: 0xe0a020, fleshColor: 0xfff0a0,
    pattern: 'glow', glow: 0.6,
  },
};

// —— Hand tracking ——
/** Trail buffer length (frames) — used for slice detection. */
export const TRAIL_LENGTH = 8;
/** Min fingertip speed (scene units / sec) to register as a slice. */
export const SLICE_SPEED_THRESHOLD = 1.1;
/**
 * One Euro Filter 参数。1€ 自适应:静止抖动被强滤波,快速挥砍几乎不滤。
 * minCutoff 越小越稳;beta 越大越跟手。当前组合在 30Hz 输入下抖动显著低于 EMA。
 */
export const ONE_EURO_MIN_CUTOFF = 1.0;
export const ONE_EURO_BETA = 1.5;
export const ONE_EURO_D_CUTOFF = 1.0;
/** 同时跟踪几只手 (1..2)。两只手会让 MediaPipe 推理慢约 30%,但碰撞冗余翻倍。 */
export const NUM_HANDS = 2;
/** 五指 landmark 索引(thumb 4, index 8, middle 12, ring 16, pinky 20)。全部用于碰撞冗余。 */
export const FINGERTIP_LANDMARKS = [4, 8, 12, 16, 20] as const;
/** 主显示指(画 ribbon 的那根)用食指,符合握刀直觉。 */
export const PRIMARY_FINGERTIP_LANDMARK = 8;
/** 最多连续多少帧没有真观测时仍允许用 1€ 速度做帧间外推,超过就丢弃这条 track。 */
export const MAX_PREDICTED_FRAMES = 4;
/** 一条 track 多久没更新就视为消失(秒)。 */
export const TRACK_STALE_AFTER_S = 0.4;
/**
 * Skip MediaPipe inference next frame when last detect cost exceeds this (ms).
 * 性能够时每帧都跑,卡时自动降到隔帧——给主线程留渲染时间。
 */
export const HAND_DETECT_SLOW_MS = 25;

// —— Scoring ——
export const SCORE_PER_WATERMELON = 10;
export const STORAGE_HIGH_SCORE = 'watermelon-slash:highscore:v1';

// —— Rendering ——
/** 渲染像素比上限。iPhone 屏 DPR=3,1.5 已减半像素;scene.handleResize 会在 iOS 上再压到 1.25 */
export const MAX_DEVICE_PIXEL_RATIO = 1.5;

// —— 实体生命周期 ——
export const WATERMELON_MAX_AGE = 4;
export const BOMB_MAX_AGE = 4;
export const HALF_MAX_AGE = 1.6;
export const HALF_PUSH_SPEED = 1.2;
export const HALF_OFFSET = 0.04;
export const SPAWN_X_RANGE_RATIO = 0.7; // spawn 在屏幕中央 ±70% 内
export const ROTATION_RANGE_WATERMELON = 2.5;
export const ROTATION_RANGE_BOMB = 1.5;
export const ROTATION_RANGE_HALF = 4;

// —— 连击 ——
export const COMBO_RAW_CAP = 20;

// —— iOS 内存兜底 ——
/** 屏上 entity(西瓜+炸弹+半边)总数上限,超出时阻止 spawn 防累积 */
export const MAX_ENTITIES = 24;
/** 同时存在的粒子组数量上限 */
export const MAX_BURSTS = 8;
