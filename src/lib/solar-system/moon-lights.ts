// Practical lights. Every punctual light in a three.js scene is paid for by
// every lit fragment on screen, whether it is lit or not — so the surface
// keeps a fixed pool of two, and the things that glow hard enough to light
// their surroundings (a habitat ceiling, the descent plume, a meteoroid, the
// craft) ask for one each frame. The strongest requests near the crew win.
// The pool never changes size, so no request ever recompiles a shader.

import * as THREE from 'three';

export interface LightPool {
  lights: THREE.PointLight[];
  /** Ask for a light this frame. Colour as hex; intensity in three's units. */
  request: (x: number, y: number, z: number, color: number, intensity: number, distance: number, decay?: number) => void;
  /** Hand the pool to this frame's strongest requests near the crew. */
  flush: (x: number, y: number, z: number) => void;
}

const MAX_REQUESTS = 12;

export function makeLightPool(count: number): LightPool {
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < count; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
    l.castShadow = false;
    lights.push(l);
  }
  const reqs = Array.from({ length: MAX_REQUESTS }, () => ({ x: 0, y: 0, z: 0, color: 0, intensity: 0, distance: 0, decay: 1.6, score: 0 }));
  let n = 0;
  // Where the crew was at the last flush: a request is scored on arrival, so
  // when the slots are full the weakest one goes, not the newest.
  let lx = 0; let ly = 0; let lz = 0;
  const score = (x: number, y: number, z: number, intensity: number, distance: number) =>
    intensity / (1 + ((x - lx) ** 2 + (y - ly) ** 2 + (z - lz) ** 2) / (distance * distance));
  return {
    lights,
    request(x, y, z, color, intensity, distance, decay = 1.6) {
      if (intensity <= 0.001) return;
      const sc = score(x, y, z, intensity, distance);
      let slot = n;
      if (n >= MAX_REQUESTS) {
        let weakest = 0;
        for (let i = 1; i < n; i++) if (reqs[i].score < reqs[weakest].score) weakest = i;
        if (reqs[weakest].score >= sc) return;
        slot = weakest;
      } else {
        n += 1;
      }
      const r = reqs[slot];
      r.x = x; r.y = y; r.z = z; r.color = color; r.intensity = intensity; r.distance = distance; r.decay = decay; r.score = sc;
    },
    flush(cx, cy, cz) {
      lx = cx; ly = cy; lz = cz;
      for (let i = 0; i < n; i++) {
        const r = reqs[i];
        r.score = score(r.x, r.y, r.z, r.intensity, r.distance);
      }
      for (let k = 0; k < lights.length; k++) {
        let best = -1;
        for (let i = 0; i < n; i++) if (reqs[i].score >= 0 && (best < 0 || reqs[i].score > reqs[best].score)) best = i;
        const l = lights[k];
        if (best < 0) { l.intensity = 0; continue; }
        const r = reqs[best];
        r.score = -1;
        l.position.set(r.x, r.y, r.z);
        l.color.setHex(r.color);
        l.intensity = r.intensity;
        l.distance = r.distance;
        l.decay = r.decay;
      }
      n = 0;
    },
  };
}
