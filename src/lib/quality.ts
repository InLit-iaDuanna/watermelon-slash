/**
 * 视频画质预设。
 * - high:Mac / iPad Pro / 桌面浏览器,1080p30
 * - medium:iPhone 主力档,720p30,内存吃得住
 * - low:老 iPhone / 弱设备 / 网格不行,540p24
 * - auto:按设备启发式选(默认行为)
 *
 * URL 参数 ?q=high|medium|low|auto 优先生效;
 * 用户在 HUD 里手动改的话会写到 localStorage,下次自动用。
 */

export type QualityPreset = 'auto' | 'high' | 'medium' | 'low';
export type ConcreteQuality = Exclude<QualityPreset, 'auto'>;

export type ResolvedQuality = {
  /** 用户选的偏好(可能是 'auto') */
  preset: QualityPreset;
  /** 实际使用的档位 */
  effective: ConcreteQuality;
  width: number;
  height: number;
  frameRate: number;
};

const PRESETS: Record<ConcreteQuality, { width: number; height: number; frameRate: number }> = {
  high: { width: 1920, height: 1080, frameRate: 30 },
  medium: { width: 1280, height: 720, frameRate: 30 },
  low: { width: 960, height: 540, frameRate: 24 },
};

const STORAGE_KEY = 'hks.quality';
const URL_PARAM = 'q';

/** 把任意值收敛到合法 QualityPreset,不合法返回 null。 */
const normalize = (raw: unknown): QualityPreset | null => {
  if (raw === 'auto' || raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return null;
};

/** 启发式自动选档:Mac 桌面给最高,iPhone 给中档,内存少的设备给低档。 */
const detectAuto = (): ConcreteQuality => {
  if (typeof navigator === 'undefined') return 'medium';
  const ua = navigator.userAgent;
  const hasTouch = typeof window !== 'undefined' && 'ontouchend' in window;

  // 桌面 Mac:UA 含 Mac 且没有触摸事件支持(iPad 13+ 也报 Mac UA 但有触摸,要排除)
  const isDesktopMac = /Macintosh/.test(ua) && !hasTouch;
  // 普通桌面浏览器(Win / Linux),也按高档
  const isDesktop = !/iP(hone|ad|od)|Android/.test(ua) && !hasTouch;
  if (isDesktopMac || isDesktop) return 'high';

  // 弱设备探测:Chromium 暴露 deviceMemory(GB),Safari 不给所以是 undefined
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === 'number' && mem <= 2) return 'low';

  // iPad / iPhone / Android 默认 medium
  return 'medium';
};

/** 读用户偏好,URL 参数优先 → localStorage → 默认 auto。 */
export const readQualityPref = (): QualityPreset => {
  try {
    if (typeof location !== 'undefined') {
      const url = new URLSearchParams(location.search);
      const fromUrl = normalize(url.get(URL_PARAM));
      if (fromUrl) return fromUrl;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = normalize(localStorage.getItem(STORAGE_KEY));
      if (stored) return stored;
    }
  } catch {
    /* ignore */
  }
  return 'auto';
};

export const writeQualityPref = (q: QualityPreset): void => {
  try {
    localStorage.setItem(STORAGE_KEY, q);
  } catch {
    /* localStorage 不可用就不持久化 */
  }
};

export const resolveQuality = (preset: QualityPreset): ResolvedQuality => {
  const effective: ConcreteQuality = preset === 'auto' ? detectAuto() : preset;
  return {
    preset,
    effective,
    ...PRESETS[effective],
  };
};

/** HUD 按钮显示用的短标签。 */
export const qualityLabel = (q: ResolvedQuality): string => {
  if (q.preset === 'auto') return `自动·${q.height}p`;
  return `${q.height}p`;
};

/** UI 循环顺序:auto → high → medium → low → auto。 */
export const cycleQualityPreset = (q: QualityPreset): QualityPreset => {
  switch (q) {
    case 'auto':
      return 'high';
    case 'high':
      return 'medium';
    case 'medium':
      return 'low';
    case 'low':
    default:
      return 'auto';
  }
};
