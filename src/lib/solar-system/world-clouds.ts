// A cloud deck for the sky dome. The clouds are a slab of noise between two
// altitudes, raymarched a few steps per pixel inside the sky shader: a 2D
// coverage field (domain-warped fbm) gives each cloud its footprint, a
// vertical profile gives it a flat base and a rounded top, and one octave of
// 3D noise erodes the edges so they do not read as a stencil. Each sample is
// lit by a short march toward the star — Beer's law for the shadowed side,
// the "powder" term for the bright edges — with a forward-scattering phase
// so the thin edges silver when the star is behind them.
//
// This file owns the GLSL and the uniforms; world-sky compiles it into the
// dome at the step count the quality preset allows (0 compiles it out).

import * as THREE from 'three';
import type { WorldClouds } from '@/lib/solar-system/world-profiles';

export interface CloudUniforms {
  uCloudBase: { value: number };
  uCloudTop: { value: number };
  uCloudScale: { value: number };
  uCloudCoverage: { value: number };
  uCloudDrift: { value: THREE.Vector2 };
  uCloudLit: { value: THREE.Color };
  uCloudShade: { value: THREE.Color };
  /** Horizontal stretch of the noise (wisps are long along the wind) and the warp strength. */
  uCloudStretch: { value: THREE.Vector2 };
  uCloudWarp: { value: number };
  /** How dense a full cloud is, per metre of slab. */
  uCloudDensity: { value: number };
}

/** Steps per pixel for a preset's cloud level. */
export function cloudSteps(level: number): number {
  return level >= 2 ? 10 : level >= 1 ? 4 : 0;
}

export function cloudUniforms(c: WorldClouds | null): CloudUniforms {
  const wisps = c?.kind === 'wisps';
  return {
    uCloudBase: { value: c ? c.altitude : 1000 },
    uCloudTop: { value: c ? c.altitude + c.thickness : 1200 },
    uCloudScale: { value: c ? c.scale : 1000 },
    uCloudCoverage: { value: c ? c.coverage : 0 },
    uCloudDrift: { value: new THREE.Vector2() },
    uCloudLit: { value: new THREE.Color(...(c ? c.lit : [1, 1, 1])) },
    uCloudShade: { value: new THREE.Color(...(c ? c.shade : [0.5, 0.5, 0.5])) },
    uCloudStretch: { value: wisps ? new THREE.Vector2(0.28, 1.6) : new THREE.Vector2(1, 1) },
    uCloudWarp: { value: wisps ? 0.9 : 0.35 },
    uCloudDensity: { value: c ? (wisps ? 0.010 : 0.016) : 0 },
  };
}

/** Move the deck with the wind; `t` in seconds. */
export function driftClouds(u: CloudUniforms, c: WorldClouds | null, t: number) {
  if (!c) return;
  u.uCloudDrift.value.set((c.wind[0] * t) / c.scale, (c.wind[1] * t) / c.scale);
}

export const CLOUD_GLSL = /* glsl */`
  uniform float uCloudBase; uniform float uCloudTop; uniform float uCloudScale; uniform float uCloudCoverage;
  uniform vec2 uCloudDrift; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform vec2 uCloudStretch;
  uniform float uCloudWarp; uniform float uCloudDensity;

  float chash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float chash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float cnoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(chash(i), chash(i + vec2(1.0, 0.0)), f.x), mix(chash(i + vec2(0.0, 1.0)), chash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float cnoise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = mix(mix(chash3(i), chash3(i + vec3(1, 0, 0)), f.x), mix(chash3(i + vec3(0, 1, 0)), chash3(i + vec3(1, 1, 0)), f.x), f.y);
    float b = mix(mix(chash3(i + vec3(0, 0, 1)), chash3(i + vec3(1, 0, 1)), f.x), mix(chash3(i + vec3(0, 1, 1)), chash3(i + vec3(1, 1, 1)), f.x), f.y);
    return mix(a, b, f.z);
  }
  float cfbm(vec2 p) {
    float s = 0.0; float a = 0.5;
    for (int o = 0; o < 4; o++) { s += cnoise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  // Where the clouds are, 0…1, from the footprint alone.
  float cloudCover(vec2 xz) {
    vec2 q = xz / uCloudScale + uCloudDrift;
    vec2 w = vec2(cfbm(q * 1.3 + 3.1), cfbm(q * 1.3 - 2.3)) - 0.5;
    q = (q + w * uCloudWarp) * uCloudStretch;
    float b = cfbm(q);
    float lo = 0.72 - uCloudCoverage * 0.5;
    return smoothstep(lo, lo + 0.22, b);
  }
  float cloudDensity(vec3 p) {
    float h = clamp((p.y - uCloudBase) / (uCloudTop - uCloudBase), 0.0, 1.0);
    float cov = cloudCover(p.xz);
    if (cov <= 0.001) return 0.0;
    // Flat below, domed above: a taller cloud where the footprint is dense.
    float prof = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.25 + cov * 0.6, 1.0, h));
    float ero = cnoise3(p / (uCloudScale * 0.09) + vec3(uCloudDrift.x * 2.0, 0.0, uCloudDrift.y * 2.0));
    return max(0.0, cov * prof - ero * 0.32 * (1.0 - cov * 0.5));
  }
  float hg(float c, float g) { float k = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (4.0 * 3.14159 * k * sqrt(k)); }

  // March dir from origin through the slab; returns rgb in-scatter and transmittance in a.
  vec4 marchClouds(vec3 origin, vec3 dir, vec3 sunDir, vec3 sunLight) {
    #if CLOUD_STEPS > 0
      if (uCloudCoverage <= 0.0 || abs(dir.y) < 0.004) return vec4(0.0, 0.0, 0.0, 1.0);
      float t0 = (uCloudBase - origin.y) / dir.y;
      float t1 = (uCloudTop - origin.y) / dir.y;
      float tn = max(min(t0, t1), 0.0); float tf = max(t0, t1);
      if (tf <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
      // The deck is flat: cap how far a grazing ray goes, and let it fade there.
      float reach = uCloudScale * 14.0;
      tf = min(tf, tn + reach);
      float len = tf - tn;
      float dt = len / float(CLOUD_STEPS);
      // A little jitter hides the step banding; too much and the deck reads as grain at four steps.
      float jitter = chash(dir.xz * 977.0 + dir.y * 131.0) * dt * 0.35;
      float phase = 0.55 * hg(dot(dir, sunDir), 0.62) + 0.35 * hg(dot(dir, sunDir), -0.18) + 0.08;
      vec3 col = vec3(0.0); float T = 1.0;
      float lstep = (uCloudTop - uCloudBase) * 0.55;
      for (int i = 0; i < CLOUD_STEPS; i++) {
        float t = tn + jitter + dt * float(i);
        vec3 p = origin + dir * t;
        float d = cloudDensity(p);
        if (d <= 0.002) continue;
        // Toward the star: two samples give the shadowed side and the lit edge.
        float occ = cloudDensity(p + sunDir * lstep * 0.45) * 0.6 + cloudDensity(p + sunDir * lstep) * 0.4;
        float lit = exp(-occ * uCloudDensity * lstep * 1.6);
        float powder = 1.0 - exp(-d * uCloudDensity * dt * 2.5);
        vec3 c = mix(uCloudShade, uCloudLit * sunLight, lit) * (0.35 + 0.65 * powder) * (0.6 + phase * 2.4 * lit);
        float a = 1.0 - exp(-d * uCloudDensity * dt);
        col += T * a * c;
        T *= 1.0 - a;
        if (T < 0.02) break;
      }
      float fade = 1.0 - smoothstep(reach * 0.45, reach, tn + len * 0.5);
      return vec4(col * fade, mix(1.0, T, fade));
    #else
      return vec4(0.0, 0.0, 0.0, 1.0);
    #endif
  }
`;
