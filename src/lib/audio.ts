/**
 * 统一管理 AudioContext。必须在 user gesture 内调用 primeAudio,
 * 之后任何模块通过 getAudioContext 拿到同一个实例。
 */

let ctx: AudioContext | null = null;

export const primeAudio = (): void => {
  if (ctx) return;
  const AC =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    void ctx.resume();
  } catch (err) {
    console.warn('[audio] AudioContext 初始化失败', err);
    ctx = null;
  }
};

export const getAudioContext = (): AudioContext | null => ctx;
