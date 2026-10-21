// Regolith in motion: one pooled particle system for boot puffs, landing
// splashes and meteor ejecta. Every grain is a ballistic point under lunar
// gravity — no air, so no drift and no lingering cloud: it goes up, it
// comes down, it stops.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

export const MOON_G = 1.62;

export interface DustBurst {
  x: number; y: number; z: number;
  count: number;
  /** Speed range, m/s, and the cone half-angle from straight up (rad). */
  speedMin: number; speedMax: number; cone: number;
  size: number;
  /** Optional horizontal bias (a boot pushing back, an oblique impact). */
  dirX?: number; dirZ?: number; bias?: number;
  brightness?: number;
}

export interface DustHandle {
  points: THREE.Points;
  burst: (b: DustBurst) => void;
  update: (dt: number, heightAt: (x: number, z: number) => number) => void;
  /** How many grains may be in the air at once (the preset's cap, live). */
  setCap: (n: number) => void;
  dispose: () => void;
}

/** `max` grains are allocated and `cap` of them used; `g` is the surface gravity the
 *  grains fall under; `tint` the colour of the ground they came off. */
export function makeMoonDust(max: number, cap = max, g = MOON_G, tint: [number, number, number] = [0.62, 0.61, 0.59]): DustHandle {
  const pos = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const sizes = new Float32Array(max);
  const shade = new Float32Array(max);
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const shadeAttr = new THREE.BufferAttribute(shade, 1);
  geom.setAttribute('position', posAttr);
  geom.setAttribute('aSize', sizeAttr);
  geom.setAttribute('aShade', shadeAttr);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: softSpriteTexture() }, uScale: { value: 600 }, uTint: { value: new THREE.Vector3(...tint) } },
    vertexShader: `
      attribute float aSize; attribute float aShade; varying float vShade;
      uniform float uScale;
      void main() {
        // Grains right at the lens fade out rather than filling the screen:
        // a capped size keeps a spray behind the wheels from costing a frame.
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vShade = aShade * smoothstep(0.6, 2.2, -mv.z);
        gl_PointSize = min(aSize * uScale / max(1.0, -mv.z), 40.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uTint; varying float vShade;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        if (vShade <= 0.0) discard;
        gl_FragColor = vec4(uTint * vShade, a * 0.9);
      }`,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geom, mat);
  // Grains are wherever the last burst put them: the bounds follow the live ones.
  geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  points.name = 'moon-dust';
  const scratch = new THREE.Vector3();
  let head = 0;
  let alive = 0;
  let limit = Math.max(1, Math.min(max, cap));
  const bounds = new THREE.Box3();

  const burst = (b: DustBurst) => {
    const bias = b.bias ?? 0;
    for (let n = 0; n < b.count; n++) {
      const i = head;
      head = (head + 1) % limit;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * b.cone;
      const sp = b.speedMin + Math.random() * (b.speedMax - b.speedMin);
      const sx = Math.sin(phi) * Math.cos(theta);
      const sz = Math.sin(phi) * Math.sin(theta);
      vel[i * 3] = (sx + (b.dirX ?? 0) * bias) * sp;
      vel[i * 3 + 1] = Math.cos(phi) * sp;
      vel[i * 3 + 2] = (sz + (b.dirZ ?? 0) * bias) * sp;
      pos[i * 3] = b.x + sx * 0.15;
      pos[i * 3 + 1] = b.y + 0.05;
      pos[i * 3 + 2] = b.z + sz * 0.15;
      life[i] = 1;
      sizes[i] = b.size * (0.6 + Math.random() * 0.8);
      shade[i] = (b.brightness ?? 1) * (0.85 + Math.random() * 0.3);
    }
    alive = max;
    sizeAttr.needsUpdate = true;
  };

  return {
    points,
    burst,
    update(dt, heightAt) {
      if (alive === 0) return;
      let any = false;
      bounds.makeEmpty();
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        any = true;
        vel[i * 3 + 1] -= g * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const ground = heightAt(pos[i * 3], pos[i * 3 + 2]);
        if (pos[i * 3 + 1] <= ground && vel[i * 3 + 1] < 0) {
          // Settled: it is regolith again.
          life[i] = 0;
          shade[i] = 0;
          pos[i * 3 + 1] = ground - 1;
        } else {
          bounds.expandByPoint(scratch.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
        }
      }
      if (!any) { alive = 0; return; }
      if (!bounds.isEmpty()) bounds.getBoundingSphere(geom.boundingSphere!).radius += 1;
      posAttr.needsUpdate = true;
      shadeAttr.needsUpdate = true;
    },
    setCap(n) {
      limit = Math.max(1, Math.min(max, Math.round(n)));
      if (head >= limit) head = 0;
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}

export interface SparkHandle {
  points: THREE.Points;
  /** `n` sparks from a point, thrown along (dx, dy, dz) at `speed` ± spread, carried by the emitter's own velocity. */
  emit: (x: number, y: number, z: number, dx: number, dy: number, dz: number, vx: number, vy: number, vz: number, n: number, speed: number) => void;
  update: (dt: number, heightAt: (x: number, z: number) => number) => void;
  dispose: () => void;
}

/**
 * The jetpack's exhaust: hot grains thrown out of the nozzles that burn out
 * as they fly. The same pooled ballistic points as the dust, but additive
 * and bright, fading with their own life rather than waiting for the ground
 * (though the ground still stops them), and under a fraction of gravity
 * because they are light and still burning.
 */
export function makeSparkStream(max: number, g = MOON_G, tint: [number, number, number] = [1.6, 1.9, 2.6]): SparkHandle {
  const pos = new Float32Array(max * 3);
  const vel = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const span = new Float32Array(max);
  const sizes = new Float32Array(max);
  const shade = new Float32Array(max);
  const geom = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  const shadeAttr = new THREE.BufferAttribute(shade, 1);
  geom.setAttribute('position', posAttr);
  geom.setAttribute('aSize', sizeAttr);
  geom.setAttribute('aShade', shadeAttr);
  // Built with the suit, which a test builds without a 2D canvas: then the sparks go without their sprite.
  let map: THREE.Texture | null = null;
  try { map = softSpriteTexture(); } catch { map = null; }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uScale: { value: 500 }, uTint: { value: new THREE.Vector3(...tint) } },
    vertexShader: `
      attribute float aSize; attribute float aShade; varying float vShade;
      uniform float uScale;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vShade = aShade * smoothstep(0.3, 1.5, -mv.z);
        gl_PointSize = min(aSize * uScale / max(1.0, -mv.z), 24.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform vec3 uTint; varying float vShade;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        if (vShade <= 0.0) discard;
        // Fresh sparks are blue-white; dying ones cool to orange.
        vec3 c = mix(vec3(1.0, 0.45, 0.15), uTint, smoothstep(0.0, 0.7, vShade));
        gl_FragColor = vec4(c * vShade * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.name = 'jet-sparks';
  // The grains are in world space whatever the points are parented to: the
  // suit carries them so they are in the scene (and its compile pass) from
  // the start, and the world matrix is put back to identity before each
  // draw, which is after any forced update from above.
  points.matrixAutoUpdate = false;
  points.matrixWorldAutoUpdate = false;
  points.onBeforeRender = () => { points.matrixWorld.identity(); };
  let head = 0;
  let alive = false;
  const emit: SparkHandle['emit'] = (x, y, z, dx, dy, dz, vx, vy, vz, n, speed) => {
    for (let k = 0; k < n; k++) {
      const i = head;
      head = (head + 1) % max;
      // A cone about the thrown direction: a little sideways, most of it along.
      const sx = (Math.random() - 0.5) * 0.45; const sy = (Math.random() - 0.5) * 0.45; const sz = (Math.random() - 0.5) * 0.45;
      const sp = speed * (0.6 + Math.random() * 0.8);
      vel[i * 3] = vx * 0.6 + (dx + sx) * sp;
      vel[i * 3 + 1] = vy * 0.6 + (dy + sy) * sp;
      vel[i * 3 + 2] = vz * 0.6 + (dz + sz) * sp;
      pos[i * 3] = x + sx * 0.05; pos[i * 3 + 1] = y + sy * 0.05; pos[i * 3 + 2] = z + sz * 0.05;
      span[i] = 0.35 + Math.random() * 0.45;
      life[i] = span[i];
      sizes[i] = 0.05 + Math.random() * 0.05;
      shade[i] = 1;
    }
    alive = true;
    sizeAttr.needsUpdate = true;
  };
  return {
    points,
    emit,
    update(dt, heightAt) {
      if (!alive) return;
      let any = false;
      for (let i = 0; i < max; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        vel[i * 3 + 1] -= g * 0.35 * dt;
        pos[i * 3] += vel[i * 3] * dt;
        pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
        pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        const ground = heightAt(pos[i * 3], pos[i * 3 + 2]);
        if (life[i] <= 0 || pos[i * 3 + 1] <= ground) {
          life[i] = 0; shade[i] = 0; pos[i * 3 + 1] = ground - 1;
          continue;
        }
        any = true;
        shade[i] = life[i] / span[i];
      }
      if (!any) alive = false;
      posAttr.needsUpdate = true;
      shadeAttr.needsUpdate = true;
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}
