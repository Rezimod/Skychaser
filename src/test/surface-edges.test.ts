// Where the surface scenes meet the planet under them, and how they shade.
//
// The walkable ground is a 1.5 km patch: the square and a ring of hills out
// to its edge. Past the edge the globe draws the ground, flat at the datum
// for kilometres round the site (planet-globe-height SITE_SHAPING). The
// ring used to end on its hills — up to 80 m on the Moon and 140 m on Mars —
// so from the air the patch stood up off the globe like a cake. And the
// shadows: the bias was a fixed third of a metre, so nothing under knee
// height cast one. No WebGL: the meshes and the numbers only.

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { makeMoonHorizon, makeMoonTerrain, ringEdge } from '@/lib/solar-system/moon-terrain';
import { makeWorldTerrain } from '@/lib/solar-system/world-terrain';
import { MARS, PROXIMA_B } from '@/lib/solar-system/world-profiles';
import { shadowBiasFor, shadowSoftness } from '@/lib/solar-system/surface-host';
import { qualityProfile } from '@/game/quality';

beforeAll(() => {
  // The regolith maps are drawn on a canvas: any context will do here.
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

/** Highest |y| among the ring's vertices at least `from` m out. */
function edgeRelief(ring: THREE.Mesh, from: number): number {
  const pos = ring.geometry.getAttribute('position') as THREE.BufferAttribute;
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.hypot(pos.getX(i), pos.getZ(i)) >= from) worst = Math.max(worst, Math.abs(pos.getY(i)));
  }
  return worst;
}

describe('the edge of the walkable ground', () => {
  it('comes back to the datum by the ring’s outer edge', () => {
    expect(ringEdge(900)).toBe(0);
    expect(ringEdge(1500)).toBe(1);
    expect(ringEdge(1300)).toBeGreaterThan(0.3);
  });

  it('on the Moon, meets the globe with no wall', () => {
    const terrain = makeMoonTerrain(true, 0.2);
    const ring = makeMoonHorizon(terrain, true);
    expect(edgeRelief(ring, 1499)).toBeLessThan(0.5);
    // The hills are still there inside it: the horizon from the ground keeps its skyline.
    let hills = 0;
    const pos = ring.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r > 600 && r < 1000) hills = Math.max(hills, pos.getY(i));
    }
    expect(hills).toBeGreaterThan(10);
    ring.geometry.dispose();
    terrain.dispose();
  });

  it.each([['Mars', MARS], ['Proxima b', PROXIMA_B]])('on %s, meets the globe with no wall', (_, profile) => {
    const t = makeWorldTerrain(profile, true, 0.2);
    expect(edgeRelief(t.horizon, 1499)).toBeLessThan(0.5);
    // groundAt agrees with the mesh out there (the descent camera's floor reads it).
    expect(Math.abs(t.groundAt(1499, 0))).toBeLessThan(0.5);
    t.dispose();
  });
});

describe('the sun’s shadow', () => {
  it('biases by the texel, not by a fixed third of a metre', () => {
    for (const level of ['performance', 'balanced', 'high', 'ultra'] as const) {
      const q = qualityProfile(level);
      const texel = (q.shadowRadius * 2) / q.shadowMapSize;
      const b = shadowBiasFor(texel, shadowSoftness(q));
      // A boot (10 cm) and a fist-sized rock must still cast.
      expect(b.normal).toBeLessThan(0.16);
      expect(b.normal).toBeGreaterThan(texel);
      // Depth bias over the 419 m shadow range: a few centimetres at most.
      expect(Math.abs(b.depth) * 419).toBeLessThan(0.06);
    }
  });

  it('never asks three for the PCF-soft map it dropped (a sampler mismatch on every lit draw)', () => {
    const src = readFileSync(path.resolve(__dirname, '../lib/solar-system/surface-host.ts'), 'utf8');
    expect(src).not.toMatch(/shadowMap\.type\s*=\s*[^;]*PCFSoftShadowMap/);
    expect(src).toMatch(/shadowMap\.type\s*=\s*THREE\.PCFShadowMap/);
  });
});
