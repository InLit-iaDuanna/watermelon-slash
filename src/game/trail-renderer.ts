import * as THREE from 'three';
import type { FingertipTrail, TrailPoint } from '../lib/trail';

/**
 * 流体光带拖尾:
 *   - Ribbon mesh(自己生成 quad strip),头宽尾细
 *   - 自定义 ShaderMaterial:头部白热 → 中段霓虹黄 → 尾部西瓜红/粉透明
 *   - 加性混合 + 时间脉动让光带"活"起来
 *   - 速度越快、ribbon 越粗,有切割力度感
 *
 * 公开接口与上一版兼容:`object`、`update(trail)`、`dispose()`。
 */
export class TrailRenderer {
  readonly object: THREE.Mesh;
  /** 单边稠密插值点数(顶点是 2× 这个数,左右各一条边) */
  private readonly densePoints: number;
  private positions: Float32Array;
  private uvs: Float32Array;
  private indices: Uint16Array;
  private material: THREE.ShaderMaterial;
  private startTime: number;

  constructor(_capacity: number) {
    // 原始 trail 点(6 个)在屏幕上太稀,中间用 catmull-rom 加密到 32 个
    this.densePoints = 32;
    const vertCount = this.densePoints * 2;
    const triCount = (this.densePoints - 1) * 2;

    this.positions = new Float32Array(vertCount * 3);
    this.uvs = new Float32Array(vertCount * 2);
    this.indices = new Uint16Array(triCount * 3);

    // uv.x 沿 ribbon 长度方向 0→1,uv.y 上边=1 / 下边=0
    for (let i = 0; i < this.densePoints; i += 1) {
      const u = i / (this.densePoints - 1);
      this.uvs[i * 4 + 0] = u; // 上边顶点 u
      this.uvs[i * 4 + 1] = 1; // 上边顶点 v
      this.uvs[i * 4 + 2] = u; // 下边顶点 u
      this.uvs[i * 4 + 3] = 0; // 下边顶点 v
    }
    // 三角形索引:每对相邻段 → 2 个三角(上下交替)
    for (let i = 0; i < this.densePoints - 1; i += 1) {
      const a = i * 2; // 当前 上
      const b = i * 2 + 1; // 当前 下
      const c = (i + 1) * 2; // 下一 上
      const d = (i + 1) * 2 + 1; // 下一 下
      const k = i * 6;
      this.indices[k + 0] = a;
      this.indices[k + 1] = b;
      this.indices[k + 2] = c;
      this.indices[k + 3] = b;
      this.indices[k + 4] = d;
      this.indices[k + 5] = c;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    geometry.setDrawRange(0, 0);

    // 自定义 shader:沿 uv.x 做"白热 → 黄 → 粉"渐变,uv.y 做软边 alpha
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uIntensity;

        // 沿 ribbon 长度做颜色渐变:头(u=1)白热 → 中段霓虹黄 → 尾(u=0)粉红透明
        vec3 trailColor(float u) {
          vec3 cTail = vec3(1.00, 0.26, 0.39); // 西瓜红/粉
          vec3 cMid  = vec3(1.00, 0.91, 0.35); // 霓虹黄
          vec3 cHead = vec3(1.00, 1.00, 1.00); // 白热
          // 0..0.55 粉→黄,0.55..1 黄→白
          vec3 c1 = mix(cTail, cMid, smoothstep(0.0, 0.55, u));
          vec3 c2 = mix(cMid, cHead, smoothstep(0.55, 1.0, u));
          return mix(c1, c2, step(0.55, u));
        }

        void main() {
          float u = vUv.x;
          float v = vUv.y;

          // 软边:中线最亮,边缘衰减(越靠近 v=0 / v=1 越透明)
          float band = 1.0 - abs(v - 0.5) * 2.0;     // 0..1 中线=1
          float edge = pow(band, 1.8);

          // 沿长度衰减:头部不透明,尾部 ~0
          float lengthAlpha = pow(u, 1.4);

          // 时间脉动:轻微的频闪,营造流光感
          float pulse = 0.85 + 0.15 * sin(uTime * 9.0 + u * 14.0);

          vec3 col = trailColor(u) * pulse;

          // 头部追加白核高光(u 接近 1 时再加一波白)
          float head = smoothstep(0.78, 1.0, u);
          col += vec3(1.0) * head * 0.9;

          float a = edge * lengthAlpha * uIntensity;

          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this.object = new THREE.Mesh(geometry, this.material);
    this.object.renderOrder = 999;
    this.object.frustumCulled = false;
    this.startTime = performance.now();
  }

  update(trail: FingertipTrail): void {
    const raw = trail.toArray();
    const n = raw.length;

    // 不到 2 个点画不了 ribbon
    if (n < 2) {
      this.object.geometry.setDrawRange(0, 0);
      this.material.uniforms.uTime.value = (performance.now() - this.startTime) / 1000;
      return;
    }

    // 1) 把稀疏的 trail 点用 catmull-rom 加密到 densePoints 个
    const dense = this.densifyCatmullRom(raw, this.densePoints);

    // 2) 计算切线/法线 + 宽度,头粗尾细
    // 速度越快,基础宽度越大(可视化切割力度)
    const speed = trail.recentSpeed();
    const speedFactor = Math.min(1.0, speed / 4.0); // 0..1
    const baseWidth = 0.018 + 0.022 * speedFactor; // 0.018 ~ 0.04

    for (let i = 0; i < this.densePoints; i += 1) {
      const p = dense[i];
      // 切线:中心差分
      const prev = dense[Math.max(0, i - 1)];
      const next = dense[Math.min(this.densePoints - 1, i + 1)];
      let tx = next.x - prev.x;
      let ty = next.y - prev.y;
      const len = Math.hypot(tx, ty);
      if (len > 1e-5) {
        tx /= len;
        ty /= len;
      } else {
        tx = 1;
        ty = 0;
      }
      // 法线 = 切线旋转 90°
      const nx = -ty;
      const ny = tx;

      // 头部(i 接近 densePoints-1)宽,尾部细
      const u = i / (this.densePoints - 1);
      const taper = 0.25 + u * 0.75; // 0.25 ~ 1.0
      const halfW = (baseWidth * taper) / 2;

      this.positions[i * 6 + 0] = p.x + nx * halfW; // 上边
      this.positions[i * 6 + 1] = p.y + ny * halfW;
      this.positions[i * 6 + 2] = 0.05;
      this.positions[i * 6 + 3] = p.x - nx * halfW; // 下边
      this.positions[i * 6 + 4] = p.y - ny * halfW;
      this.positions[i * 6 + 5] = 0.05;
    }

    const attr = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
    this.object.geometry.setDrawRange(0, (this.densePoints - 1) * 6);

    // 速度越快、强度越高,慢下来时光带变淡
    this.material.uniforms.uIntensity.value = 0.55 + 0.45 * speedFactor;
    this.material.uniforms.uTime.value = (performance.now() - this.startTime) / 1000;
  }

  /** Catmull-rom 把稀疏 trail 点加密到固定数量,使 ribbon 平滑 */
  private densifyCatmullRom(pts: readonly TrailPoint[], outN: number): { x: number; y: number }[] {
    const n = pts.length;
    const out: { x: number; y: number }[] = new Array(outN);
    if (n === 1) {
      for (let i = 0; i < outN; i += 1) out[i] = { x: pts[0].x, y: pts[0].y };
      return out;
    }
    // 把 outN 个 t ∈ [0, n-1] 映射到原始点的 spline 段上
    for (let i = 0; i < outN; i += 1) {
      const t = (i / (outN - 1)) * (n - 1);
      const i1 = Math.floor(t);
      const i2 = Math.min(n - 1, i1 + 1);
      const i0 = Math.max(0, i1 - 1);
      const i3 = Math.min(n - 1, i2 + 1);
      const local = t - i1;
      out[i] = {
        x: catmull(pts[i0].x, pts[i1].x, pts[i2].x, pts[i3].x, local),
        y: catmull(pts[i0].y, pts[i1].y, pts[i2].y, pts[i3].y, local),
      };
    }
    return out;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}

/** 标准 Catmull-Rom (uniform, tension=0.5) 插值 */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}
