/** Tiny synthesized SFX. No audio assets required. */

import { getAudioContext } from './audio';

const getCtx = (): AudioContext | null => getAudioContext();

/**
 * Slice: a quick high-pitched chirp (800 → 200 Hz over 80ms) — feels like a wet thwack.
 */
export const playSlice = (): void => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(900, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.13);
};

/**
 * Bomb: low boom — square wave dropping from 200 → 40 Hz with longer tail.
 */
export const playBomb = (): void => {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(40, now + 0.4);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.4, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
};
