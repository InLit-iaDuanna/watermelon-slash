import { describe, it, expect } from 'vitest';
import { FingerTrack, FingerTracks } from './finger-tracks';
import type { HandSample } from './hand-tracker';
import { MAX_PREDICTED_FRAMES, TRACK_STALE_AFTER_S } from './constants';

const identityScene = (nx: number, ny: number) => ({ x: nx, y: ny });

describe('FingerTrack', () => {
  it('observe 第一帧 trail 有一个点(滤波首帧透传)', () => {
    const t = new FingerTrack('Right', 8);
    t.observe(0.5, 0.5, 0);
    expect(t.trail.length).toBe(1);
    expect(t.trail.latest).toEqual({ x: 0.5, y: 0.5, t: 0 });
  });

  it('predict 在恒定速度后外推位置朝着速度方向走', () => {
    const t = new FingerTrack('Right', 8);
    for (let i = 0; i < 6; i += 1) t.observe(i * 0.1, 0, i / 60);
    const before = t.trail.latest!;
    const ok = t.predict(7 / 60);
    expect(ok).toBe(true);
    const after = t.trail.latest!;
    expect(after.x).toBeGreaterThan(before.x);
  });

  it('predict 超过 MAX_PREDICTED_FRAMES 后失活', () => {
    const t = new FingerTrack('Right', 8);
    t.observe(0, 0, 0);
    let alive = true;
    for (let i = 0; i < MAX_PREDICTED_FRAMES + 1; i += 1) {
      alive = t.predict((i + 1) / 60);
    }
    expect(alive).toBe(false);
    expect(t.trail.length).toBe(0);
  });

  it('predict 超过 stale 时间也失活', () => {
    const t = new FingerTrack('Right', 8);
    t.observe(0, 0, 0);
    const alive = t.predict(TRACK_STALE_AFTER_S + 1);
    expect(alive).toBe(false);
  });

  it('reset 清空 trail 与滤波器', () => {
    const t = new FingerTrack('Right', 8);
    t.observe(0, 0, 0);
    t.observe(1, 1, 1 / 60);
    t.reset();
    expect(t.trail.length).toBe(0);
    // 重置后第一次 observe 应该再次"首帧透传"
    t.observe(2, 3, 0);
    expect(t.trail.latest).toEqual({ x: 2, y: 3, t: 0 });
  });
});

describe('FingerTracks', () => {
  it('左右手食指各产生一条 primary trail', () => {
    const tracks = new FingerTracks(identityScene);
    const hands: HandSample[] = [
      {
        handedness: 'Left',
        handednessScore: 0.9,
        fingers: [{ landmark: 8, x: 0.2, y: 0.5, visibility: 1 }],
      },
      {
        handedness: 'Right',
        handednessScore: 0.95,
        fingers: [{ landmark: 8, x: 0.8, y: 0.5, visibility: 1 }],
      },
    ];
    tracks.step(hands, 0);
    const primary = tracks.primaryTrails();
    expect(primary).toHaveLength(2);
    expect(primary.map((p) => p.handedness).sort()).toEqual(['Left', 'Right']);
  });

  it('五指都进入 allTrails 用于碰撞冗余', () => {
    const tracks = new FingerTracks(identityScene);
    const fingers = [4, 8, 12, 16, 20].map((lm) => ({
      landmark: lm,
      x: 0.5,
      y: 0.5,
      visibility: 1,
    }));
    tracks.step(
      [{ handedness: 'Right', handednessScore: 1, fingers }],
      0,
    );
    expect(tracks.trackCount()).toBe(5);
    expect(tracks.allTrails()).toHaveLength(5);
  });

  it('不再观测到的 track 经过若干帧后自动消失', () => {
    const tracks = new FingerTracks(identityScene);
    tracks.step(
      [
        {
          handedness: 'Right',
          handednessScore: 1,
          fingers: [{ landmark: 8, x: 0.5, y: 0.5, visibility: 1 }],
        },
      ],
      0,
    );
    expect(tracks.trackCount()).toBe(1);
    for (let i = 1; i <= MAX_PREDICTED_FRAMES + 2; i += 1) {
      tracks.step(null, i / 60);
    }
    expect(tracks.trackCount()).toBe(0);
  });

  it('resetAll 清空所有 track', () => {
    const tracks = new FingerTracks(identityScene);
    tracks.step(
      [
        {
          handedness: 'Right',
          handednessScore: 1,
          fingers: [{ landmark: 8, x: 0.5, y: 0.5, visibility: 1 }],
        },
      ],
      0,
    );
    tracks.resetAll();
    expect(tracks.trackCount()).toBe(0);
  });

  it('SceneTransform 会被应用,镜像后 x 翻转', () => {
    const mirroredScene = (nx: number, ny: number) => ({ x: 1 - nx, y: ny });
    const tracks = new FingerTracks(mirroredScene);
    tracks.step(
      [
        {
          handedness: 'Right',
          handednessScore: 1,
          fingers: [{ landmark: 8, x: 0.2, y: 0.5, visibility: 1 }],
        },
      ],
      0,
    );
    const point = tracks.primaryTrails()[0].trail.latest!;
    expect(point.x).toBeCloseTo(0.8);
  });
});
