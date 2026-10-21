// The globe's chunk cache over a long flight. The level of detail descends
// from the six roots through every split chunk to what is drawn, so a chunk
// that is split (not drawn itself) is still in use: if the cache lets it go,
// the next frame cannot get past it and the whole branch falls back to a
// root chunk — the planet turns to a blur for as long as the rebuild takes.
// No WebGL: the globe is plain three.js objects until it is drawn.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makePlanetGlobe } from '@/lib/solar-system/planet-globe';
import { qualityProfile } from '@/game/quality';

describe('planet globe cache', () => {
  it('keeps the chunks a drawn branch is split through, however long the flight', () => {
    // Performance: the smallest cache (48 spare chunks), so eviction starts early.
    const globe = makePlanetGlobe('mars', {
      quality: qualityProfile('performance'), lite: true, sunDir: new THREE.Vector3(0.3, 0.8, 0.2).normalize(),
    });
    globe.setViewport?.(800);
    const cam = new THREE.PerspectiveCamera(60, 16 / 10, 0.1, 1e8);
    const look = new THREE.Vector3();
    let deepest = 0;
    let collapses = 0;
    let evicting = false;
    // Low over the ground, round and round the site looking out: the view
    // keeps turning onto ground the cache let go of a while ago, so old
    // chunks must be dropped all the time (and the flight stays on one face
    // of the cube, where nothing legitimately starts again from a root).
    for (let i = 0; i < 1600; i++) {
      const a = (i / 400) * Math.PI * 2;
      const x = Math.cos(a) * 40_000; const z = Math.sin(a) * 40_000;
      cam.position.set(x, 4000, z);
      cam.lookAt(look.set(x * 1.6 - z * 0.3, 0, z * 1.6 + x * 0.3));
      cam.updateMatrixWorld();
      globe.sync(cam);
      globe.update(1 / 60);
      const s = globe.stats();
      if (s.built > 60) evicting = true;
      if (i > 300) {
        deepest = Math.max(deepest, s.level);
        // A branch collapsed: everything back to the roots or near them.
        if (evicting && s.level <= 3) { collapses++; if (process.env.GLOBE_DEBUG) console.log(i, JSON.stringify(s)); }
      }
    }
    globe.dispose();
    expect(deepest).toBeGreaterThan(6);
    expect(evicting).toBe(true);
    expect(collapses).toBe(0);
  });
});
