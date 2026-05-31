import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { FINGERTIP_LANDMARKS, NUM_HANDS } from './constants';

/** "Left" / "Right",或 unknown 时给 fallback 标识。 */
export type Handedness = 'Left' | 'Right' | 'Unknown';

export type FingerSample = {
  /** 21 点中的 landmark index(只可能是 4/8/12/16/20)。 */
  landmark: number;
  /** Normalized [0, 1] coordinates in the input video frame (top-left origin). */
  x: number;
  y: number;
  /** landmark 自身的可见性 0..1,低于阈值的点应被跳过。 */
  visibility: number;
};

export type HandSample = {
  handedness: Handedness;
  /** MediaPipe 返回的左右手分类置信度。 */
  handednessScore: number;
  /** 五指尖的观测,visibility 低的点会被过滤掉。 */
  fingers: FingerSample[];
};

export type ProgressEvent =
  | { phase: 'wasm'; message: string }
  | { phase: 'model-download'; loaded: number; total: number }
  | { phase: 'model-init'; message: string }
  | { phase: 'done' };

export type HandTrackerOptions = {
  visionAssetUrl?: string;
  modelAssetUrl?: string;
  onProgress?: (e: ProgressEvent) => void;
};

const DEFAULT_VISION_ASSETS = '/mediapipe/wasm';
const DEFAULT_MODEL_URL = '/mediapipe/hand_landmarker.task';

const fetchModelWithProgress = async (
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> => {
  const res = await fetch(url, { cache: 'default' });
  if (!res.ok) throw new Error(`model fetch failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get('content-length') ?? '0');
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress(buf.byteLength, buf.byteLength || total);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  let done = false;
  while (!done) {
    const chunk = await reader.read();
    done = chunk.done;
    if (chunk.value) {
      chunks.push(chunk.value);
      loaded += chunk.value.byteLength;
      onProgress(loaded, total);
    }
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
};

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private lastTimestampMs = 0;
  private lastDetectMs = 0;

  get lastDetectCostMs(): number {
    return this.lastDetectMs;
  }

  async init(options: HandTrackerOptions = {}): Promise<void> {
    const visionAssetUrl = options.visionAssetUrl ?? DEFAULT_VISION_ASSETS;
    const modelAssetUrl = options.modelAssetUrl ?? DEFAULT_MODEL_URL;
    const onProgress = options.onProgress ?? (() => {});

    onProgress({ phase: 'wasm', message: '加载 MediaPipe 运行时' });
    const fileset = await FilesetResolver.forVisionTasks(visionAssetUrl);

    const modelBuffer = await fetchModelWithProgress(modelAssetUrl, (loaded, total) => {
      onProgress({ phase: 'model-download', loaded, total });
    });

    onProgress({ phase: 'model-init', message: '初始化模型' });

    const baseConfig = {
      runningMode: 'VIDEO' as const,
      numHands: NUM_HANDS,
      minHandDetectionConfidence: 0.55,
      minHandPresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };

    // iOS Safari 上 MediaPipe GPU delegate 经常 hang。直接默认 CPU,稳。
    // CPU 在 iPhone 上 ~10-15 FPS,够玩。
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS =
      /iP(hone|ad|od)/.test(ua) ||
      (/Mac/.test(ua) && typeof window !== 'undefined' && 'ontouchend' in window);
    const preferCpu = isIOS;

    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      return Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} 超过 ${ms / 1000}s 超时`)), ms),
        ),
      ]);
    };

    const tryDelegate = (delegate: 'GPU' | 'CPU', ms: number) =>
      withTimeout(
        HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: modelBuffer, delegate },
          ...baseConfig,
        }),
        ms,
        `${delegate} delegate init`,
      );

    if (preferCpu) {
      onProgress({ phase: 'model-init', message: '③ iOS 检测,直接走 CPU 模式…' });
      this.landmarker = await tryDelegate('CPU', 25_000);
    } else {
      try {
        this.landmarker = await tryDelegate('GPU', 8_000);
      } catch (gpuErr) {
        console.warn('[hand-tracker] GPU delegate 失败/超时,回退到 CPU:', gpuErr);
        onProgress({ phase: 'model-init', message: '③ GPU 不可用,切到 CPU 模式…' });
        this.landmarker = await tryDelegate('CPU', 25_000);
      }
    }

    onProgress({ phase: 'done' });
  }

  /**
   * 跑一次推理,返回每只手的五指尖采样。低 visibility 的指尖会被过滤掉。
   * 返回空数组 = 这一帧没有任何可用观测。
   */
  detect(video: HTMLVideoElement, performanceNowMs: number): HandSample[] {
    if (!this.landmarker) return [];
    if (video.readyState < 2) return [];

    const ts = Math.max(performanceNowMs, this.lastTimestampMs + 1);
    this.lastTimestampMs = ts;

    const t0 = performance.now();
    let result: HandLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(video, ts);
    } catch (err) {
      console.warn('[hand-tracker] detect failed', err);
      return [];
    }
    this.lastDetectMs = performance.now() - t0;

    const handsCount = result.landmarks?.length ?? 0;
    if (handsCount === 0) return [];

    const out: HandSample[] = [];
    for (let h = 0; h < handsCount; h += 1) {
      const lm = result.landmarks[h];
      if (!lm) continue;

      const handednessCat = result.handedness?.[h]?.[0];
      // MediaPipe 训练标签是镜像视角,这里直接透传 categoryName,游戏层不依赖左右物理意义。
      const handedness =
        handednessCat?.categoryName === 'Left'
          ? 'Left'
          : handednessCat?.categoryName === 'Right'
            ? 'Right'
            : 'Unknown';
      const handednessScore = handednessCat?.score ?? 0;

      const fingers: FingerSample[] = [];
      for (const idx of FINGERTIP_LANDMARKS) {
        const tip = lm[idx];
        if (!tip) continue;
        // 注意:HandLandmarker 不填 visibility(那是 Pose 模型的字段),恒为 0。
        // 所以这里不做 visibility 门控——会把所有指尖都误杀。
        // 整手的可信度交给上面的 handedness/presence/tracking 三个 confidence 阈值。
        fingers.push({ landmark: idx, x: tip.x, y: tip.y, visibility: tip.visibility ?? 1 });
      }
      if (fingers.length === 0) continue;
      out.push({ handedness, handednessScore, fingers });
    }
    return out;
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
