// The big rock on Mars and Proxima b: where it may stand, and what it does
// not touch. Placement is pure, so this runs without a GPU.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { formationColliders, makeFormations, placeFormations, type Formation } from '@/lib/solar-system/world-formations';
import { PAD_RADIUS } from '@/lib/solar-system/world-terrain';
import { MARS, PROXIMA_B, type WorldProfile } from '@/lib/solar-system/world-profiles';

const worlds: [string, WorldProfile][] = [['Mars', MARS], ['Proxima b', PROXIMA_B]];
const padDist = (p: WorldProfile, f: Formation) => Math.hypot(f.x - p.pad.x, f.z - p.pad.z);

describe('where the formations stand', () => {
  it.each(worlds)('on %s nothing reaches the pad, and the mesas stay outside the fence', (_, p) => {
    for (const density of [0.5, 1, 1.6]) {
      const placed = placeFormations(p, { density, keepOut: [], walkRadius: p.walkRadius });
      expect(placed.length).toBeGreaterThan(0);
      for (const f of placed) {
        expect(padDist(p, f) - f.r).toBeGreaterThan(PAD_RADIUS);
        if (f.kind === 'mesa') expect(padDist(p, f) - f.r).toBeGreaterThan(p.walkRadius);
        else {
          // The rest is inside the ground square, where the crew can reach it.
          expect(Math.abs(f.x)).toBeLessThan(180);
          expect(Math.abs(f.z)).toBeLessThan(180);
        }
      }
    }
  });

  it.each(worlds)('on %s no two pieces overlap', (_, p) => {
    const placed = placeFormations(p, { density: 1.6, keepOut: [], walkRadius: p.walkRadius });
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]; const b = placed[j];
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r);
      }
    }
  });

  it('keeps clear of what the scene asks it to — the base, the village, the lake', () => {
    const keepOut = [{ x: 44, z: -50, r: 12 }, { x: 0, z: 90, r: 30 }];
    const placed = placeFormations(MARS, { density: 1.6, keepOut, walkRadius: MARS.walkRadius });
    for (const f of placed) for (const k of keepOut) expect(Math.hypot(f.x - k.x, f.z - k.z)).toBeGreaterThan(k.r + f.r);
    const water = PROXIMA_B.ground.water!;
    for (const f of placeFormations(PROXIMA_B, { density: 1.6, keepOut: [], walkRadius: PROXIMA_B.walkRadius })) {
      expect(Math.hypot(f.x - water.x, f.z - water.z)).toBeGreaterThan(water.r + f.r);
    }
  });

  it('gives each world what its profile asks for, and the same layout every visit', () => {
    const mars = placeFormations(MARS, { density: 1, keepOut: [], walkRadius: MARS.walkRadius });
    expect(mars.filter((f) => f.kind === 'mesa').length).toBeGreaterThanOrEqual(6);
    expect(mars.filter((f) => f.kind === 'hoodoo').length).toBeGreaterThanOrEqual(15);
    expect(mars.filter((f) => f.kind === 'arch').length).toBeGreaterThanOrEqual(1);
    const prox = placeFormations(PROXIMA_B, { density: 1, keepOut: [], walkRadius: PROXIMA_B.walkRadius });
    expect(prox.filter((f) => f.kind === 'mesa').length).toBe(0);
    expect(prox.filter((f) => f.kind === 'spire').length).toBeGreaterThanOrEqual(8);
    expect(prox.filter((f) => f.kind === 'arch').length).toBeGreaterThanOrEqual(2);
    expect(placeFormations(MARS, { density: 1, keepOut: [], walkRadius: MARS.walkRadius })).toEqual(mars);
    // More density, more rock.
    const ultra = placeFormations(MARS, { density: 1.6, keepOut: [], walkRadius: MARS.walkRadius });
    expect(ultra.length).toBeGreaterThan(mars.length);
  });

  it('gives the crew a collider for everything inside the fence, two legs for an arch', () => {
    const placed = placeFormations(MARS, { density: 1, keepOut: [], walkRadius: MARS.walkRadius });
    const colliders = formationColliders(placed, MARS.walkRadius, MARS.pad);
    const inside = placed.filter((f) => padDist(MARS, f) <= MARS.walkRadius + f.r);
    const arches = inside.filter((f) => f.kind === 'arch').length;
    expect(colliders.length).toBe(inside.length + arches);
    for (const c of colliders) expect(c.r).toBeGreaterThan(0);
    // A mesa's collider is out past the fence where the crew never goes: none of them.
    expect(colliders.some((c) => Math.hypot(c.x - MARS.pad.x, c.z - MARS.pad.z) > MARS.walkRadius + 60)).toBe(false);
  });
});

describe('the formations as drawn', () => {
  it('builds one instanced mesh per cut, well inside the draw-call budget, seated on the ground', () => {
    const groundAt = (x: number, z: number) => Math.sin(x / 50) * 4 + Math.cos(z / 70) * 3;
    const f = makeFormations(MARS, { groundAt, grain: new THREE.Texture() }, { density: 1.6, lite: false, keepOut: [], walkRadius: MARS.walkRadius });
    expect(f.group.children.length).toBeGreaterThan(0);
    expect(f.group.children.length).toBeLessThanOrEqual(12);
    const m = new THREE.Matrix4(); const p = new THREE.Vector3();
    for (const im of f.group.children as THREE.InstancedMesh[]) {
      expect(im).toBeInstanceOf(THREE.InstancedMesh);
      expect(im.geometry.getAttribute('color')).toBeTruthy();
      for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, m);
        p.setFromMatrixPosition(m);
        // Set a little into the lowest ground under it, never floating above it.
        expect(p.y).toBeLessThan(groundAt(p.x, p.z) + 0.01);
        expect(p.y).toBeGreaterThan(groundAt(p.x, p.z) - 12);
      }
    }
    f.dispose();
  });

  it('builds nothing for a world without formations', () => {
    const bare = { ...MARS, formations: null };
    const f = makeFormations(bare, { groundAt: () => 0, grain: new THREE.Texture() }, { density: 1, lite: true, keepOut: [], walkRadius: 165 });
    expect(f.placed).toEqual([]);
    expect(f.group.children.length).toBe(0);
  });
});
