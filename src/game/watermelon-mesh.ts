import * as THREE from 'three';
import { FRUITS, type FruitVariant } from '../lib/constants';

/**
 * Procedural fruit meshes:每种水果共用一组球形/胶囊几何 + 自定义 shader。
 * shader 通过 uniform 控制颜色与纹理图案,避免每变体一个材质 bloat。
 *
 * 切开后的"半身"复用 hemisphere 几何 + 对应果肉色平面。
 */

const fruitVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fruitFragmentShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vPos;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uPattern; // 0=stripes 1=rough 2=diamond 3=smooth 4=glow
  uniform float uGlow;
  uniform float uTime;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  void main() {
    vec3 base = uColorA;
    float angleY = atan(vPos.x, vPos.z);
    float u = (angleY + 3.14159) / 6.28318;
    float v = vPos.y / 0.2 + 0.5;

    if (uPattern < 0.5) {
      // stripes:经线条纹(西瓜)
      float stripe = smoothstep(0.45, 0.55, abs(sin(angleY * 6.0)));
      base = mix(uColorA, uColorB, stripe);
    } else if (uPattern < 1.5) {
      // rough:噪声小麻点(橘子/草莓)
      float n = hash(floor(vPos * 35.0));
      base = mix(uColorA, uColorB, smoothstep(0.65, 0.85, n) * 0.55);
    } else if (uPattern < 2.5) {
      // diamond:菱形格纹(菠萝)
      float gx = abs(fract(u * 12.0) - 0.5);
      float gy = abs(fract(v * 6.0 + u * 6.0) - 0.5);
      float d = max(gx, gy);
      float edge = smoothstep(0.30, 0.45, d);
      base = mix(uColorA, uColorB, edge * 0.7);
    } else if (uPattern < 3.5) {
      // smooth:纯色光泽(预留)
      base = uColorA;
    } else {
      // glow:金色发光(罕见金瓜)
      float n = hash(floor(vPos * 25.0 + vec3(uTime * 0.3)));
      base = mix(uColorA, uColorB, n * 0.3);
    }

    // 兰伯特 + 边缘高光
    vec3 lightDir = normalize(vec3(0.3, 0.8, 0.6));
    float diffuse = max(dot(vNormal, lightDir), 0.0);
    float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);

    vec3 color = base * (0.35 + 0.85 * diffuse) + rim * 0.25;
    // 发光叠加(金瓜)
    color += base * uGlow * (0.4 + 0.2 * sin(uTime * 4.0));
    gl_FragColor = vec4(color, 1.0);
  }
`;

// —— 共享材质缓存 ——
const sharedFruitMaterials: Partial<Record<FruitVariant, THREE.ShaderMaterial>> = {};
const sharedFleshMaterials: Partial<Record<FruitVariant, THREE.MeshBasicMaterial>> = {};

let sharedBombSphereMaterial: THREE.MeshBasicMaterial | null = null;
let sharedBombRingMaterial: THREE.MeshBasicMaterial | null = null;
let sharedSeedMaterial: THREE.MeshBasicMaterial | null = null;
let sharedSeedGeometry: THREE.SphereGeometry | null = null;

const patternId = (p: import('../lib/constants').FruitConfig['pattern']): number => {
  switch (p) {
    case 'stripes': return 0;
    case 'rough': return 1;
    case 'diamond': return 2;
    case 'smooth': return 3;
    case 'glow': return 4;
  }
};

export const getFruitMaterial = (variant: FruitVariant): THREE.ShaderMaterial => {
  const cached = sharedFruitMaterials[variant];
  if (cached) return cached;
  const cfg = FRUITS[variant];
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color(cfg.rindColor) },
      uColorB: { value: new THREE.Color(cfg.rindDark) },
      uPattern: { value: patternId(cfg.pattern) },
      uGlow: { value: cfg.glow },
      uTime: { value: 0 },
    },
    vertexShader: fruitVertexShader,
    fragmentShader: fruitFragmentShader,
  });
  sharedFruitMaterials[variant] = mat;
  return mat;
};

const getFleshMaterial = (variant: FruitVariant): THREE.MeshBasicMaterial => {
  const cached = sharedFleshMaterials[variant];
  if (cached) return cached;
  const cfg = FRUITS[variant];
  const mat = new THREE.MeshBasicMaterial({
    color: cfg.fleshColor,
    side: THREE.DoubleSide,
  });
  sharedFleshMaterials[variant] = mat;
  return mat;
};

export const getBombSphereMaterial = (): THREE.MeshBasicMaterial =>
  (sharedBombSphereMaterial ??= new THREE.MeshBasicMaterial({ color: 0x180420 }));

export const getBombRingMaterial = (): THREE.MeshBasicMaterial =>
  (sharedBombRingMaterial ??= new THREE.MeshBasicMaterial({ color: 0xff4f9b }));

export const getSeedMaterial = (): THREE.MeshBasicMaterial =>
  (sharedSeedMaterial ??= new THREE.MeshBasicMaterial({ color: 0x1a0a0a }));

export const getSeedGeometry = (): THREE.SphereGeometry =>
  (sharedSeedGeometry ??= new THREE.SphereGeometry(0.008, 6, 4));

/** 每帧推进 shader uTime,让 glow 类水果的脉动跑起来 */
export const tickFruitMaterials = (now: number): void => {
  const t = now / 1000;
  for (const m of Object.values(sharedFruitMaterials)) {
    if (m) m.uniforms.uTime.value = t;
  }
};

export const createFruitMesh = (variant: FruitVariant): THREE.Mesh => {
  const cfg = FRUITS[variant];
  const geometry = new THREE.SphereGeometry(cfg.radius, 24, 18);
  geometry.scale(1, cfg.scaleY, 1);
  const mesh = new THREE.Mesh(geometry, getFruitMaterial(variant));
  return mesh;
};

/**
 * 切开半身。`side` +1=右,-1=左。沿 x 轴切;切面是法线指向 ±x 的圆盘(果肉)。
 */
export const createFruitHalf = (variant: FruitVariant, side: 1 | -1): THREE.Group => {
  const cfg = FRUITS[variant];
  const group = new THREE.Group();
  group.userData.side = side;

  const hemiGeom = new THREE.SphereGeometry(
    cfg.radius, 24, 18,
    0, Math.PI * 2,
    0, Math.PI / 2,
  );
  hemiGeom.scale(1, cfg.scaleY, 1);
  hemiGeom.rotateZ(side === 1 ? -Math.PI / 2 : Math.PI / 2);
  const hemi = new THREE.Mesh(hemiGeom, getFruitMaterial(variant));
  group.add(hemi);

  const fleshGeom = new THREE.CircleGeometry(cfg.radius * 0.97, 28);
  const flesh = new THREE.Mesh(fleshGeom, getFleshMaterial(variant));
  flesh.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
  flesh.scale.y = cfg.scaleY;
  group.add(flesh);

  // 籽:西瓜/草莓有,菠萝/橘子/金瓜没有
  if (variant === 'watermelon' || variant === 'strawberry') {
    const seedMat = getSeedMaterial();
    const seedGeom = getSeedGeometry();
    const count = variant === 'strawberry' ? 5 : 7;
    for (let i = 0; i < count; i += 1) {
      const seed = new THREE.Mesh(seedGeom, seedMat);
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * cfg.radius * 0.7;
      seed.position.set(
        side * 0.001,
        Math.sin(angle) * r * cfg.scaleY,
        Math.cos(angle) * r,
      );
      seed.scale.x = 0.3;
      group.add(seed);
    }
  }

  return group;
};

// —— 兼容旧名称(为避免大改 entities.ts 名称) ——
export const createWatermelonMesh = (radius: number): THREE.Mesh => {
  // 旧版本接口,默认西瓜
  const geometry = new THREE.SphereGeometry(radius, 24, 18);
  return new THREE.Mesh(geometry, getFruitMaterial('watermelon'));
};

export const createWatermelonHalf = createFruitHalf.bind(null, 'watermelon');

/**
 * Bomb: dark sphere with neon-pink warning ring.
 */
export const createBombMesh = (radius: number): THREE.Group => {
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 18),
    getBombSphereMaterial(),
  );
  group.add(sphere);

  const ringGeom = new THREE.TorusGeometry(radius * 1.05, radius * 0.08, 12, 32);
  const ring = new THREE.Mesh(ringGeom, getBombRingMaterial());
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  group.userData.warningRing = ring;
  return group;
};
