import * as THREE from 'three';
import { MAX_DEVICE_PIXEL_RATIO } from '../lib/constants';

/**
 * Three.js scene configured for camera-passthrough AR:
 *   - Orthographic camera so screen units map cleanly to world units
 *   - Background: full-bleed video texture from the camera feed (rear, no mirroring)
 *   - Foreground: 3D entities in NDC-ish space (-aspect..aspect, -1..1)
 *
 * Coordinate convention used across the game:
 *   x ∈ [-aspect, aspect], y ∈ [-1, 1], origin = screen center, +y = up
 */
export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  readonly entityRoot: THREE.Group;
  readonly fxRoot: THREE.Group;

  private videoMesh: THREE.Mesh | null = null;
  private videoTexture: THREE.VideoTexture | null = null;
  private video: HTMLVideoElement | null = null;
  private mirrored = false;
  private videoUploadActive = true;

  aspect = 1;

  // iOS 内存吃紧或切到后台回来会 lose 掉 WebGL context;不处理就一直白屏
  private contextLostListeners = new Set<() => void>();
  private contextRestoredListeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x070318, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.camera.position.z = 5;

    this.entityRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.entityRoot);
    this.scene.add(this.fxRoot);

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);

    // iOS 内存吃紧或切到后台回来会 lose 掉 context;不处理就一直白屏
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private onContextLost = (e: Event): void => {
    // preventDefault 让 restored 事件能正常触发
    e.preventDefault();
    console.warn('[scene] WebGL context lost');
    this.contextLostListeners.forEach((cb) => cb());
  };

  private onContextRestored = (): void => {
    console.warn('[scene] WebGL context restored');
    // 视频材质重建(VideoTexture 在 context 重建后通常会自己恢复)
    // 但保险起见调用 restore 通知外部
    this.contextRestoredListeners.forEach((cb) => cb());
  };

  onContextLostHook(cb: () => void): () => void {
    this.contextLostListeners.add(cb);
    return () => {
      this.contextLostListeners.delete(cb);
    };
  }

  onContextRestoredHook(cb: () => void): () => void {
    this.contextRestoredListeners.add(cb);
    return () => {
      this.contextRestoredListeners.delete(cb);
    };
  }

  attachVideoBackground(video: HTMLVideoElement): void {
    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false; // 省 GPU 内存,过滤是 LinearFilter 不需要 mipmap

    // 平面初始尺寸 2x2;applyVideoCover 负责按比例缩放(后置摄像头不镜像)
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = -1;
    mesh.renderOrder = -1;
    this.videoMesh = mesh;
    this.video = video;
    this.scene.add(mesh);
    this.applyVideoCover(video);
    this.videoUploadActive = true;
  }

  /** 把视频平面按 CSS-style cover 拉伸:保持宽高比、覆盖整个视椎,超出部分裁掉。后置摄像头不镜像。 */
  private applyVideoCover(video: HTMLVideoElement): void {
    if (!this.videoMesh) return;
    const canvasAspect = this.aspect;
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const videoAspect = vw / vh;

    let scaleX: number;
    let scaleY: number;
    if (videoAspect > canvasAspect) {
      // 视频比视椎更"宽":Y 完全填满,X 等比超出(裁掉左右)
      scaleX = videoAspect;
      scaleY = 1;
    } else {
      // 视频比视椎更"窄":X 填满视椎,Y 等比超出(裁掉上下)
      scaleX = canvasAspect;
      scaleY = canvasAspect / videoAspect;
    }

    // 后置摄像头默认不镜像;前置摄像头时通过 setMirrored(true) 切换
    const sx = this.mirrored ? -scaleX : scaleX;
    this.videoMesh.scale.set(sx, scaleY, 1);
  }

  refreshVideoCover(video: HTMLVideoElement): void {
    this.applyVideoCover(video);
  }

  setMirrored(mirrored: boolean): void {
    this.mirrored = mirrored;
    if (this.video) this.applyVideoCover(this.video);
  }

  isMirrored(): boolean {
    return this.mirrored;
  }

  /** Video 帧上传激活态。结算屏 / 后台时 false 以省 GPU。 */
  isVideoUploadActive(): boolean {
    return this.videoUploadActive;
  }

  /** 暂停 GPU 端 video 帧上传(切到后台 / 结算屏)。直接 pause video 元素以停止解码,iOS 上能省 30-50% 视频带宽。 */
  pauseVideoUpload(): void {
    this.videoUploadActive = false;
    if (this.video && !this.video.paused) {
      this.video.pause();
    }
  }

  resumeVideoUpload(): void {
    this.videoUploadActive = true;
    if (this.video && this.video.paused) {
      void this.video.play().catch((err) => {
        console.warn('[scene] video resume play 失败', err);
      });
    }
  }

  handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.aspect = w / h;

    // iOS 设备像素密度通常是 3,1.5x 已压一半;再压到 1.25 能省 30% 帧时间和显存
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
    const cap = isIOS ? Math.min(MAX_DEVICE_PIXEL_RATIO, 1.25) : MAX_DEVICE_PIXEL_RATIO;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);

    this.camera.left = -this.aspect;
    this.camera.right = this.aspect;
    this.camera.top = 1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();

    // resize 后需要按新视椎比例重算 cover
    if (this.video) this.applyVideoCover(this.video);
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.contextLostListeners.clear();
    this.contextRestoredListeners.clear();
    this.scene.remove(this.entityRoot);
    this.scene.remove(this.fxRoot);
    if (this.videoMesh) {
      this.scene.remove(this.videoMesh);
      this.videoMesh.geometry.dispose();
      (this.videoMesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.videoTexture?.dispose();
    this.videoMesh = null;
    this.videoTexture = null;
    this.video = null;
    // 主动触发 context lost,iOS Safari 上能立刻让 WebKit 回收 GPU buffer
    const loseExt = this.renderer.getContext().getExtension('WEBGL_lose_context');
    if (loseExt) {
      try {
        loseExt.loseContext();
      } catch (err) {
        console.warn('[scene] forceContextLoss 失败', err);
      }
    }
    this.renderer.dispose();
  }
}
