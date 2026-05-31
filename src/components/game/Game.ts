import { mountHud, type HudHandles } from './Hud';
import { GameScene } from '../../game/scene';
import { startCamera, type CameraInfo, type CameraStream } from '../../lib/camera';
import { qualityLabel } from '../../lib/quality';
import { HandTracker } from '../../lib/hand-tracker';
import { FingertipTrail } from '../../lib/trail';
import { FingerTracks } from '../../lib/finger-tracks';
import { TrailRenderer } from '../../game/trail-renderer';
import { JuiceBurst } from '../../game/particles';
import {
  createBomb,
  createFruit,
  createWatermelonHalves,
  disposeEntity,
  isOffscreen,
  stepEntity,
  type Entity,
} from '../../game/entities';
import { SpawnScheduler } from '../../game/spawner';
import { GameStateMachine } from '../../game/state';
import {
  FRUITS,
  GAME_DURATION_MS,
  HAND_DETECT_SLOW_MS,
  MAX_BURSTS,
  MAX_ENTITIES,
  SLICE_SPEED_THRESHOLD,
  TRAIL_LENGTH,
  type FruitVariant,
} from '../../lib/constants';
import { tickFruitMaterials } from '../../game/watermelon-mesh';
import { playBomb, playSlice } from '../../lib/sfx';

export type GameProps = { onExit: () => void };

const EMPTY_TRAIL = new FingertipTrail();

export const mountGame = (root: HTMLElement, props: GameProps): void => {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;';
  root.appendChild(wrap);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  wrap.appendChild(canvas);

  const scene = new GameScene(canvas);
  const stateMachine = new GameStateMachine();
  const spawner = new SpawnScheduler();
  const tracker = new HandTracker();

  const tipToScene = (nx: number, ny: number) => {
    const aspect = scene.aspect;
    const x = scene.isMirrored() ? (1 - nx) * 2 * aspect - aspect : nx * 2 * aspect - aspect;
    return { x, y: -(ny * 2 - 1) };
  };
  const tracks = new FingerTracks(tipToScene);

  // 一条 ribbon 一只手,最多两条。无活跃 track 时 setDrawRange(0,0) 自然隐藏。
  const ribbonA = new TrailRenderer(TRAIL_LENGTH);
  const ribbonB = new TrailRenderer(TRAIL_LENGTH);
  scene.fxRoot.add(ribbonA.object);
  scene.fxRoot.add(ribbonB.object);

  const entities = new Map<number, Entity>();
  const bursts = new Set<JuiceBurst>();

  let camera: CameraStream | null = null;
  let frameIndex = 0;
  let rafId = 0;
  let prevTime = performance.now();
  let disposed = false;

  let cameras: CameraInfo[] = [];
  let currentCameraIndex = 0;
  let cameraSwitchBusy = false;
  let qualitySwitchBusy = false;

  const MIRROR_KEY = 'hks.mirror';
  const initialMirrored = (() => {
    try {
      return localStorage.getItem(MIRROR_KEY) === '1';
    } catch {
      return false;
    }
  })();
  scene.setMirrored(initialMirrored);

  const hud: HudHandles = mountHud(wrap, {
    onRestart: () => {
      hud.hideEnded();
      resetRound();
      scene.resumeVideoUpload();
      stateMachine.start();
    },
    onExit: () => {
      cleanup();
      props.onExit();
    },
    onToggleMirror: () => {
      const next = !scene.isMirrored();
      scene.setMirrored(next);
      hud.setMirrorState(next);
      try {
        localStorage.setItem(MIRROR_KEY, next ? '1' : '0');
      } catch {
        /* localStorage 不可用就不持久化 */
      }
      // 镜像把 x 突变 → 1€ 滤波会把它当成超快运动放出幻影刀,必须整体 reset。
      tracks.resetAll();
    },
    onCycleCamera: () => {
      void cycleCamera();
    },
    onCycleQuality: () => {
      void cycleQuality();
    },
  });
  hud.setMirrorState(initialMirrored);

  const debugMode = new URLSearchParams(location.search).has('debug');
  hud.showDiag(debugMode);

  const fpsSamples: number[] = [];
  let lastDiagAt = 0;

  stateMachine.events.on('scoreChange', ({ score, combo, multiplier }) => {
    hud.setScore(score, multiplier);
    hud.setCombo(combo);
  });
  stateMachine.events.on('timeChange', ({ remainingMs }) => hud.setTime(remainingMs));
  stateMachine.events.on('ended', (info) => {
    hud.showEnded(info);
    scene.pauseVideoUpload();
  });
  hud.setScore(0, 1);
  hud.setTime(GAME_DURATION_MS);

  const resetRound = (): void => {
    entities.forEach((e) => {
      scene.entityRoot.remove(e.mesh);
      disposeEntity(e);
    });
    entities.clear();
    bursts.forEach((b) => {
      scene.fxRoot.remove(b.object);
      b.dispose();
    });
    bursts.clear();
    spawner.reset();
    tracks.resetAll();
  };

  const cycleCamera = async (): Promise<void> => {
    if (!camera || cameraSwitchBusy || cameras.length < 2) return;
    cameraSwitchBusy = true;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    hud.setCameraSwitch({ count: cameras.length, current: nextIndex, busy: true });
    try {
      await camera.switchTo(cameras[nextIndex].deviceId);
      currentCameraIndex = nextIndex;
      scene.refreshVideoCover(camera.video);
      // FOV / 视频分辨率变,旧 1€ 状态全部失效
      tracks.resetAll();
    } catch (err) {
      console.error('[game] cycle camera failed', err);
    } finally {
      cameraSwitchBusy = false;
      hud.setCameraSwitch({
        count: cameras.length,
        current: currentCameraIndex,
        busy: false,
      });
    }
  };

  const cycleQuality = async (): Promise<void> => {
    if (!camera || qualitySwitchBusy) return;
    qualitySwitchBusy = true;
    // 转一档先把按钮置 busy,留 UI 反馈窗口
    hud.setQualityButton({ label: qualityLabel(camera.currentQuality()), busy: true });
    try {
      const next = await camera.cycleQuality();
      // 分辨率变了重算 cover;旧 trail / 1€ 状态失效(虽然变化通常很小)
      scene.refreshVideoCover(camera.video);
      tracks.resetAll();
      hud.setQualityButton({ label: qualityLabel(next), busy: false });
    } catch (err) {
      console.error('[game] cycle quality failed', err);
      hud.setQualityButton({
        label: qualityLabel(camera.currentQuality()),
        busy: false,
      });
    } finally {
      qualitySwitchBusy = false;
    }
  };

  const handleSlice = (entity: Entity, cutDir: { x: number; y: number }): void => {
    if (entity.sliced) return;
    entity.sliced = true;

    if (entity.kind === 'fruit') {
      const variant: FruitVariant = entity.variant ?? 'watermelon';
      const cfg = FRUITS[variant];
      if (bursts.size >= MAX_BURSTS) {
        const oldest = bursts.values().next().value;
        if (oldest) {
          scene.fxRoot.remove(oldest.object);
          oldest.dispose();
          bursts.delete(oldest);
        }
      }
      const burst = new JuiceBurst(20, entity.mesh.position.x, entity.mesh.position.y, cfg.fleshColor);
      scene.fxRoot.add(burst.object);
      bursts.add(burst);

      const [left, right] = createWatermelonHalves(entity, cutDir);
      scene.entityRoot.remove(entity.mesh);
      disposeEntity(entity);
      entities.delete(entity.id);
      scene.entityRoot.add(left.mesh);
      scene.entityRoot.add(right.mesh);
      entities.set(left.id, left);
      entities.set(right.id, right);

      stateMachine.registerSlice(performance.now(), cfg.scoreMultiplier);
      playSlice();
    } else if (entity.kind === 'bomb') {
      if (bursts.size >= MAX_BURSTS) {
        const oldest = bursts.values().next().value;
        if (oldest) {
          scene.fxRoot.remove(oldest.object);
          oldest.dispose();
          bursts.delete(oldest);
        }
      }
      const burst = new JuiceBurst(24, entity.mesh.position.x, entity.mesh.position.y, 0xff4f9b);
      scene.fxRoot.add(burst.object);
      bursts.add(burst);
      scene.entityRoot.remove(entity.mesh);
      disposeEntity(entity);
      entities.delete(entity.id);
      stateMachine.registerBomb();
      playBomb();
    }
  };

  /**
   * 多 track 碰撞:每个实体逐条 trail 测距,任一指尖快到阈值且距离 < 半径就切。
   * entity.sliced 守卫保证多指同时触发不会重复计分。
   */
  const checkCollisions = (): void => {
    const allTrails = tracks.allTrails();
    if (allTrails.length === 0) return;
    entities.forEach((e) => {
      if (e.sliced || e.kind === 'half') return;
      for (const trail of allTrails) {
        if (trail.length < 2) continue;
        if (trail.recentSpeed() < SLICE_SPEED_THRESHOLD) continue;
        const dist = trail.closestDistanceTo(e.mesh.position.x, e.mesh.position.y);
        if (dist < e.radius) {
          const cutDir = trail.recentDirection();
          if (cutDir) {
            handleSlice(e, cutDir);
            break;
          }
        }
      }
    });
  };

  const stepEntities = (dt: number): void => {
    const aspect = scene.aspect;
    const toRemove: number[] = [];
    entities.forEach((e) => {
      stepEntity(e, dt);
      if (isOffscreen(e, aspect)) toRemove.push(e.id);
    });
    toRemove.forEach((id) => {
      const e = entities.get(id);
      if (!e) return;
      scene.entityRoot.remove(e.mesh);
      disposeEntity(e);
      entities.delete(id);
    });
  };

  const stepBursts = (dt: number): void => {
    bursts.forEach((b) => {
      if (b.step(dt)) {
        scene.fxRoot.remove(b.object);
        b.dispose();
        bursts.delete(b);
      }
    });
  };

  const handleSpawn = (dt: number): void => {
    if (stateMachine.currentState !== 'playing') return;
    if (entities.size >= MAX_ENTITIES) return;
    const events = spawner.step(dt);
    events.forEach((ev) => {
      if (ev.kind === 'bomb') {
        if (entities.size >= MAX_ENTITIES) return;
        const e = createBomb(scene.aspect, ev.mode);
        entities.set(e.id, e);
        scene.entityRoot.add(e.mesh);
        return;
      }
      const sharedX =
        ev.mode === 'fan'
          ? (Math.random() - 0.5) * scene.aspect * 1.4
          : undefined;
      ev.variants.forEach((variant) => {
        if (entities.size >= MAX_ENTITIES) return;
        const e = createFruit(variant, ev.mode, scene.aspect, sharedX);
        entities.set(e.id, e);
        scene.entityRoot.add(e.mesh);
      });
    });
  };

  const updateHand = (now: number): void => {
    if (!camera || stateMachine.currentState !== 'playing') return;
    const tSec = now / 1000;
    // 自适应跳帧:推理慢就隔帧跑一次,但 tracks.step(null) 仍然用 1€ 速度做帧间外推,
    // trail 不会因为跳帧出现"采样断点 → recentSpeed=0"的假死。
    const skipDetect = tracker.lastDetectCostMs > HAND_DETECT_SLOW_MS && frameIndex % 2 !== 0;
    const hands = skipDetect ? null : tracker.detect(camera.video, now);
    tracks.step(hands, tSec);
  };

  const updateRibbons = (): void => {
    const primary = tracks.primaryTrails();
    ribbonA.update(primary[0]?.trail ?? EMPTY_TRAIL);
    ribbonB.update(primary[1]?.trail ?? EMPTY_TRAIL);
  };

  const loop = (now: number): void => {
    if (disposed) return;
    rafId = requestAnimationFrame(loop);
    try {
      const dt = Math.min(0.05, (now - prevTime) / 1000);
      prevTime = now;
      frameIndex += 1;

      updateHand(now);
      stateMachine.tick(now);
      handleSpawn(dt);
      stepEntities(dt);
      stepBursts(dt);
      checkCollisions();
      updateRibbons();
      tickFruitMaterials(now);
      scene.render();

      if (debugMode) {
        fpsSamples.push(now);
        while (fpsSamples.length > 0 && now - fpsSamples[0] > 1000) fpsSamples.shift();
        if (now - lastDiagAt > 250) {
          lastDiagAt = now;
          const fps = fpsSamples.length;
          const perf = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
          const heapMb = perf ? perf.usedJSHeapSize / 1048576 : null;
          hud.setDiagnostics({
            fps,
            entities: entities.size,
            bursts: bursts.size,
            detectMs: tracker.lastDetectCostMs,
            heapMb,
          });
        }
      }
    } catch (err) {
      console.error('[game] loop frame failed', err);
    }
  };

  const onVisibilityChange = (): void => {
    if (document.hidden) {
      stateMachine.pause(performance.now());
      scene.pauseVideoUpload();
    } else {
      stateMachine.resume(performance.now());
      scene.resumeVideoUpload();
      prevTime = performance.now();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const offCtxLost = scene.onContextLostHook(() => {
    stateMachine.pause(performance.now());
    scene.pauseVideoUpload();
    hud.showPermissionError('显卡资源被系统回收。点返回重新进入即可继续。');
  });
  const offCtxRestored = scene.onContextRestoredHook(() => {
    console.info('[game] context restored');
  });

  const onWindowError = (e: ErrorEvent): void => {
    console.error('[game] uncaught error', e.error ?? e.message);
    hud.showPermissionError(`运行时崩了一下:${e.message ?? '未知错误'}`);
  };
  const onUnhandledRejection = (e: PromiseRejectionEvent): void => {
    console.error('[game] unhandled rejection', e.reason);
    hud.showPermissionError(`异步任务崩了:${String(e.reason)?.slice(0, 80)}`);
  };
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  const cleanup = (): void => {
    disposed = true;
    cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
    offCtxLost();
    offCtxRestored();
    camera?.stop();
    tracker.dispose();
    bursts.forEach((b) => b.dispose());
    bursts.clear();
    ribbonA.dispose();
    ribbonB.dispose();
    entities.forEach((e) => disposeEntity(e));
    entities.clear();
    scene.dispose();
    hud.destroy();
    wrap.remove();
  };

  // —— Boot ——
  void (async () => {
    hud.showLoading('正在打开摄像头…');
    try {
      camera = await startCamera();
      scene.attachVideoBackground(camera.video);
      camera.video.addEventListener('loadeddata', () => {
        if (camera) scene.refreshVideoCover(camera.video);
      });
      // 初始化画质按钮 label(从用户偏好 / auto 启发式得来)
      hud.setQualityButton({ label: qualityLabel(camera.currentQuality()) });
      try {
        cameras = await camera.listCameras();
        const activeId = camera.currentDeviceId();
        const idx = activeId ? cameras.findIndex((c) => c.deviceId === activeId) : -1;
        currentCameraIndex = idx >= 0 ? idx : 0;
        hud.setCameraSwitch({ count: cameras.length, current: currentCameraIndex });
      } catch (enumErr) {
        console.warn('[game] enumerate cameras failed', enumErr);
      }
    } catch (err) {
      console.error('[game] camera failed', err);
      hud.hideLoading();
      hud.showPermissionError(
        '没有拿到摄像头权限。请在 Safari 设置 → 网站 → 摄像头 里允许后再回来。',
      );
      return;
    }

    hud.showLoading('正在加载手部识别模型…');
    try {
      await tracker.init({
        onProgress: (e) => {
          if (e.phase === 'wasm') {
            hud.showLoading('① 加载 MediaPipe 运行时…');
          } else if (e.phase === 'model-download') {
            const totalMb = e.total ? (e.total / 1024 / 1024).toFixed(1) : '?';
            const loadedMb = (e.loaded / 1024 / 1024).toFixed(1);
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            hud.showLoading(`② 下载手部模型 ${loadedMb} / ${totalMb} MB (${pct}%)`);
          } else if (e.phase === 'model-init') {
            hud.showLoading('③ 初始化手部模型…');
          }
        },
      });
    } catch (err) {
      console.error('[game] tracker init failed', err);
      hud.hideLoading();
      const msg = err instanceof Error ? err.message : String(err);
      hud.showPermissionError(`手部识别模型加载失败:${msg}`);
      return;
    }

    hud.hideLoading();
    stateMachine.start();
    prevTime = performance.now();
    rafId = requestAnimationFrame(loop);
  })();
};
