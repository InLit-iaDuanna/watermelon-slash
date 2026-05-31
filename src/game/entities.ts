import * as THREE from 'three';
import {
  GRAVITY,
  SPAWN_VELOCITY_X_RANGE,
  SPAWN_VELOCITY_Y_MAX,
  SPAWN_VELOCITY_Y_MIN,
  BOMB_RADIUS,
  WATERMELON_MAX_AGE,
  BOMB_MAX_AGE,
  HALF_MAX_AGE,
  HALF_PUSH_SPEED,
  HALF_OFFSET,
  SPAWN_X_RANGE_RATIO,
  ROTATION_RANGE_WATERMELON,
  ROTATION_RANGE_BOMB,
  ROTATION_RANGE_HALF,
  FRUITS,
  type FruitVariant,
} from '../lib/constants';
import { randRange } from '../lib/math';
import {
  createBombMesh,
  createFruitHalf,
  createFruitMesh,
} from './watermelon-mesh';

export type EntityKind = 'fruit' | 'bomb' | 'half';

/** 抛投模式:决定生成位置 + 初速度 */
export type SpawnMode = 'single' | 'fan' | 'side-left' | 'side-right' | 'shower';

export type Entity = {
  id: number;
  kind: EntityKind;
  /** 仅 fruit/half 有变种 */
  variant?: FruitVariant;
  mesh: THREE.Object3D;
  vx: number;
  vy: number;
  vRot: number;
  /** Lifetime in seconds since spawn. */
  age: number;
  /** Max lifetime; entity is culled past this. */
  maxAge: number;
  /** Bounding radius for collision. */
  radius: number;
  /** True once it's been sliced (for fruit) or detonated (bomb). Skip collision. */
  sliced: boolean;
};

let nextId = 1;

/**
 * 创建一颗水果,根据抛投模式决定生成位置和初速度。
 * 支持五种模式:
 *   single     底部随机位置正常抛物线
 *   fan        与上一个同位置但 vx 不同(扇形,Spawner 控制连发)
 *   side-left  从屏幕左边水平飞入
 *   side-right 从屏幕右边水平飞入
 *   shower     底部偏向中段,vy 小一点(模拟落雨)
 */
export const createFruit = (
  variant: FruitVariant,
  mode: SpawnMode,
  aspect: number,
  /** 扇形模式可指定共同 x */
  sharedX?: number,
): Entity => {
  const cfg = FRUITS[variant];
  const mesh = createFruitMesh(variant);
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;

  switch (mode) {
    case 'side-left': {
      x = -aspect - cfg.radius;
      y = randRange(-0.7, -0.2);
      vx = randRange(2.0, 3.2);
      vy = randRange(1.6, 2.4);
      break;
    }
    case 'side-right': {
      x = aspect + cfg.radius;
      y = randRange(-0.7, -0.2);
      vx = -randRange(2.0, 3.2);
      vy = randRange(1.6, 2.4);
      break;
    }
    case 'shower': {
      x = randRange(-aspect * 0.85, aspect * 0.85);
      y = -1.05;
      vx = randRange(-0.4, 0.4);
      vy = randRange(SPAWN_VELOCITY_Y_MIN - 0.2, SPAWN_VELOCITY_Y_MIN + 0.3);
      break;
    }
    case 'fan': {
      x = sharedX ?? randRange(-aspect * SPAWN_X_RANGE_RATIO, aspect * SPAWN_X_RANGE_RATIO);
      y = -1.05;
      // 扇形:vx 范围更大、vy 略低
      vx = randRange(-SPAWN_VELOCITY_X_RANGE * 1.6, SPAWN_VELOCITY_X_RANGE * 1.6);
      vy = randRange(SPAWN_VELOCITY_Y_MIN, SPAWN_VELOCITY_Y_MAX);
      break;
    }
    case 'single':
    default: {
      x = randRange(-aspect * SPAWN_X_RANGE_RATIO, aspect * SPAWN_X_RANGE_RATIO);
      y = -1.05;
      vx = randRange(-SPAWN_VELOCITY_X_RANGE, SPAWN_VELOCITY_X_RANGE) - Math.sign(x) * 0.2;
      vy = randRange(SPAWN_VELOCITY_Y_MIN, SPAWN_VELOCITY_Y_MAX);
      break;
    }
  }

  mesh.position.set(x, y, 0);
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

  return {
    id: nextId++,
    kind: 'fruit',
    variant,
    mesh,
    vx,
    vy,
    vRot: randRange(-ROTATION_RANGE_WATERMELON, ROTATION_RANGE_WATERMELON),
    age: 0,
    maxAge: WATERMELON_MAX_AGE,
    radius: cfg.radius,
    sliced: false,
  };
};

/** 兼容旧名:始终生成西瓜 */
export const createWatermelon = (aspect: number): Entity =>
  createFruit('watermelon', 'single', aspect);

export const createBomb = (aspect: number, mode: SpawnMode = 'single'): Entity => {
  const mesh = createBombMesh(BOMB_RADIUS);
  let x: number;
  let y: number;
  let vx: number;
  let vy: number;

  switch (mode) {
    case 'side-left': {
      x = -aspect - BOMB_RADIUS;
      y = randRange(-0.7, -0.2);
      vx = randRange(1.8, 2.6);
      vy = randRange(1.4, 2.0);
      break;
    }
    case 'side-right': {
      x = aspect + BOMB_RADIUS;
      y = randRange(-0.7, -0.2);
      vx = -randRange(1.8, 2.6);
      vy = randRange(1.4, 2.0);
      break;
    }
    default: {
      x = randRange(-aspect * SPAWN_X_RANGE_RATIO, aspect * SPAWN_X_RANGE_RATIO);
      y = -1.05;
      vx = randRange(-SPAWN_VELOCITY_X_RANGE, SPAWN_VELOCITY_X_RANGE) - Math.sign(x) * 0.2;
      vy = randRange(SPAWN_VELOCITY_Y_MIN - 0.2, SPAWN_VELOCITY_Y_MAX - 0.4);
    }
  }

  mesh.position.set(x, y, 0);

  return {
    id: nextId++,
    kind: 'bomb',
    mesh,
    vx,
    vy,
    vRot: randRange(-ROTATION_RANGE_BOMB, ROTATION_RANGE_BOMB),
    age: 0,
    maxAge: BOMB_MAX_AGE,
    radius: BOMB_RADIUS,
    sliced: false,
  };
};

/**
 * Create the two flying halves at the position of the original fruit.
 * `cutDir` is the unit slice direction; halves push perpendicular to it.
 */
export const createWatermelonHalves = (
  origin: Entity,
  cutDir: { x: number; y: number },
): [Entity, Entity] => {
  const variant: FruitVariant = origin.variant ?? 'watermelon';
  const cfg = FRUITS[variant];
  const px = origin.mesh.position.x;
  const py = origin.mesh.position.y;

  const perpX = -cutDir.y;
  const perpY = cutDir.x;

  const make = (side: 1 | -1): Entity => {
    const mesh = createFruitHalf(variant, side);
    mesh.position.set(px + perpX * HALF_OFFSET * side, py + perpY * HALF_OFFSET * side, 0);
    mesh.rotation.copy(origin.mesh.rotation);
    return {
      id: nextId++,
      kind: 'half',
      variant,
      mesh,
      vx: origin.vx + perpX * HALF_PUSH_SPEED * side,
      vy: origin.vy + perpY * HALF_PUSH_SPEED * side + 0.5,
      vRot: randRange(-ROTATION_RANGE_HALF, ROTATION_RANGE_HALF),
      age: 0,
      maxAge: HALF_MAX_AGE,
      radius: cfg.radius,
      sliced: true,
    };
  };

  return [make(1), make(-1)];
};

/** Step physics: simple Euler integration with gravity. No entity-entity collisions. */
export const stepEntity = (e: Entity, dt: number): void => {
  e.age += dt;
  e.vy += GRAVITY * dt;
  e.mesh.position.x += e.vx * dt;
  e.mesh.position.y += e.vy * dt;
  e.mesh.rotation.x += e.vRot * dt;
  e.mesh.rotation.z += e.vRot * 0.5 * dt;
};

export const isOffscreen = (e: Entity, aspect: number): boolean =>
  e.mesh.position.y < -1.4 ||
  Math.abs(e.mesh.position.x) > aspect + 0.4 ||
  e.age > e.maxAge;

/** 释放实体本地 geometry。材质在 watermelon-mesh 模块层共享,这里不动。 */
export const disposeEntity = (e: Entity): void => {
  e.mesh.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
};
