import {
  cycleQualityPreset,
  readQualityPref,
  resolveQuality,
  writeQualityPref,
  type QualityPreset,
  type ResolvedQuality,
} from './quality';

export type CameraInfo = {
  deviceId: string;
  /** 设备给的标签,如 "Back Ultra Wide Camera"。授权前可能为空。 */
  label: string;
};

export type CameraStream = {
  video: HTMLVideoElement;
  stop: () => void;
  /** 列出可切换的摄像头(默认排除明显的前置)。授权后才有 label。 */
  listCameras: () => Promise<CameraInfo[]>;
  /** 切到指定 deviceId,在原 video 元素上原地换流。 */
  switchTo: (deviceId: string) => Promise<void>;
  /** 当前活跃的 deviceId(可能为 undefined,例如 fallback 路径走老 API)。 */
  currentDeviceId: () => string | undefined;
  /** 当前画质设置(含偏好 + 实际档 + 分辨率)。 */
  currentQuality: () => ResolvedQuality;
  /** 用户在 HUD 里循环档位(auto → high → medium → low → auto),返回新的 ResolvedQuality。 */
  cycleQuality: () => Promise<ResolvedQuality>;
  /** 直接设到指定档位。 */
  setQuality: (preset: QualityPreset) => Promise<ResolvedQuality>;
};

const buildVideoHints = (q: ResolvedQuality): MediaTrackConstraints => ({
  // ideal 是浏览器优先尝试的目标;max 给个上限避免某些桌面摄像头给 4K 把内存打爆
  width: { ideal: q.width, max: Math.max(q.width, 1920) },
  height: { ideal: q.height, max: Math.max(q.height, 1080) },
  frameRate: { ideal: q.frameRate, max: 30 },
});

/** 看 label 像不像后置;label 为空(没授权)时保守地保留。 */
const isLikelyRearLabel = (label: string): boolean => {
  if (!label) return true;
  // 中英文常见前置标识词全打掉,剩下的当作可切的后置
  return !/(front|user|facetime|前置|自拍)/i.test(label);
};

const waitForMetadata = (video: HTMLVideoElement): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1 && video.videoWidth > 0) {
      resolve();
      return;
    }
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('video element error'));
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
  });

const requestStream = (video: MediaTrackConstraints): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({ audio: false, video });

const buildPrimary = (q: ResolvedQuality): MediaTrackConstraints => ({
  facingMode: { ideal: 'environment' },
  ...buildVideoHints(q),
});

const buildFallback = (q: ResolvedQuality): MediaTrackConstraints => ({
  facingMode: 'user',
  ...buildVideoHints(q),
});

/**
 * Request camera access and return a playing <video> element + stream.
 * 画质从用户偏好(URL ?q=… / localStorage)读取,默认 auto 启发式选档。
 * Must be called from a user gesture on iOS Safari.
 */
export const startCamera = async (): Promise<CameraStream> => {
  let quality = resolveQuality(readQualityPref());

  let activeStream: MediaStream;
  try {
    activeStream = await requestStream(buildPrimary(quality));
  } catch (primaryErr) {
    console.warn('[camera] primary constraints failed, falling back:', primaryErr);
    activeStream = await requestStream(buildFallback(quality));
  }

  const video = document.createElement('video');
  video.srcObject = activeStream;
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');

  await waitForMetadata(video);
  await video.play();

  let activeDeviceId = activeStream.getVideoTracks()[0]?.getSettings().deviceId;

  const listCameras = async (): Promise<CameraInfo[]> => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .filter((d) => isLikelyRearLabel(d.label))
      .map((d) => ({ deviceId: d.deviceId, label: d.label }));
  };

  /** 用当前 quality + 给定 deviceId(undefined = 沿用 facingMode environment)起一条新流,失败兜底到原 environment。 */
  const openWith = async (deviceId: string | undefined): Promise<MediaStream> => {
    const base = buildVideoHints(quality);
    const constraints: MediaTrackConstraints = deviceId
      ? { deviceId: { exact: deviceId }, ...base }
      : { facingMode: { ideal: 'environment' }, ...base };
    try {
      return await requestStream(constraints);
    } catch (err) {
      console.warn('[camera] open with constraints failed, falling back to environment:', err);
      return requestStream(buildPrimary(quality));
    }
  };

  const swapStream = async (next: MediaStream, fallbackDeviceId?: string): Promise<void> => {
    video.srcObject = next;
    await waitForMetadata(video);
    await video.play();
    activeStream = next;
    activeDeviceId =
      next.getVideoTracks()[0]?.getSettings().deviceId ?? fallbackDeviceId ?? activeDeviceId;
  };

  const switchTo = async (deviceId: string): Promise<void> => {
    if (!deviceId || deviceId === activeDeviceId) return;
    // iOS Safari 不让两个 track 同时占同一摄像头组,先停旧的再开新的。
    activeStream.getTracks().forEach((t) => t.stop());
    const next = await openWith(deviceId);
    await swapStream(next, deviceId);
  };

  const setQuality = async (preset: QualityPreset): Promise<ResolvedQuality> => {
    const nextQuality = resolveQuality(preset);
    // 同档位且分辨率没变,跳过避免无谓闪烁
    if (
      nextQuality.effective === quality.effective &&
      nextQuality.preset === quality.preset
    ) {
      return quality;
    }
    quality = nextQuality;
    writeQualityPref(preset);
    // 用 applyConstraints 在不重启 track 的前提下能换分辨率,但很多摄像头(尤其 iOS)
    // 只在 reopen 时才肯换,稳起见还是停旧开新。
    activeStream.getTracks().forEach((t) => t.stop());
    const next = await openWith(activeDeviceId);
    await swapStream(next, activeDeviceId);
    return quality;
  };

  const cycleQuality = async (): Promise<ResolvedQuality> => {
    const nextPref = cycleQualityPreset(quality.preset);
    return setQuality(nextPref);
  };

  const stop = () => {
    activeStream.getTracks().forEach((t) => t.stop());
    video.pause();
    video.srcObject = null;
  };

  return {
    video,
    stop,
    listCameras,
    switchTo,
    currentDeviceId: () => activeDeviceId,
    currentQuality: () => quality,
    cycleQuality,
    setQuality,
  };
};

/** EMA-smooth a 2D point to suppress ML jitter. alpha=0.7 平衡跟手 vs 抖动。 */
export const smoothPoint = (
  prev: { x: number; y: number } | null,
  next: { x: number; y: number },
  alpha = 0.7,
): { x: number; y: number } => {
  if (!prev) return { x: next.x, y: next.y };
  return {
    x: prev.x * (1 - alpha) + next.x * alpha,
    y: prev.y * (1 - alpha) + next.y * alpha,
  };
};
