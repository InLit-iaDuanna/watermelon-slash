/**
 * Detect iOS for permission flow tweaks (DeviceMotion etc).
 * We deliberately keep this narrow — feature detection beats UA sniffing for most things.
 */
export const isIOS = (): boolean => {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
};

export const isSafari = (): boolean => {
  const ua = navigator.userAgent;
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
};

export const supportsCamera = (): boolean =>
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices !== 'undefined' &&
  typeof navigator.mediaDevices.getUserMedia === 'function';

/** WebGL2 is required by MediaPipe Tasks Vision GPU delegate. */
export const supportsWebGL2 = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
};

export type CapabilityReport = {
  camera: boolean;
  webgl2: boolean;
  ok: boolean;
};

export const detectCapabilities = (): CapabilityReport => {
  const camera = supportsCamera();
  const webgl2 = supportsWebGL2();
  return { camera, webgl2, ok: camera && webgl2 };
};
