import * as THREE from 'three';

/**
 * Burst of juice particles emitted on a successful slice.
 * Pure additive points — cheap, looks good against camera passthrough.
 */
export class JuiceBurst {
  readonly object: THREE.Points;
  private velocities: Float32Array;
  private ages: Float32Array;
  private positions: Float32Array;
  private maxAge = 0.7;
  private gravity = -2.4;
  private elapsed = 0;

  constructor(count: number, x: number, y: number, color: number) {
    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.ages = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      this.positions[i3] = x;
      this.positions[i3 + 1] = y;
      this.positions[i3 + 2] = 0;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 1.6;
      this.velocities[i3] = Math.cos(angle) * speed;
      this.velocities[i3 + 1] = Math.sin(angle) * speed + 0.3;
      this.velocities[i3 + 2] = 0;
      this.ages[i] = Math.random() * 0.1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size: 0.045,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.object = new THREE.Points(geometry, material);
  }

  /** Returns true when the burst is finished and should be removed. */
  step(dt: number): boolean {
    const positions = this.positions;
    const velocities = this.velocities;
    this.elapsed += dt;
    let alive = false;
    for (let i = 0; i < this.ages.length; i += 1) {
      this.ages[i] += dt;
      if (this.ages[i] > this.maxAge) continue;
      alive = true;
      const i3 = i * 3;
      velocities[i3 + 1] += this.gravity * dt;
      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
    }
    const attr = this.object.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;

    const mat = this.object.material as THREE.PointsMaterial;
    // 用 burst 自身累积时间,避免最老粒子死亡时透明度反弹
    mat.opacity = Math.max(0, 1 - this.elapsed / this.maxAge) * 0.9;
    return !alive;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.PointsMaterial).dispose();
  }
}
