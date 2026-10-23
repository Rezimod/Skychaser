import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeCity } from '@/lib/solar-system/world-earth-city';
import { KIND, ROOF, type Building } from '@/lib/solar-system/world-earth-data';

// A 4 × 4 grid of 800 m cells, a few square blocks in each: twelve cells are
// within full-detail reach of the pad at the origin.
function grid(): Building[] {
  const out: Building[] = [];
  for (let i = -2; i <= 1; i++) for (let j = -2; j <= 1; j++) {
    for (let k = 0; k < 4; k++) {
      const x = (i + 0.5) * 800 + k * 40 - 60; const z = (j + 0.5) * 800;
      out.push({
        estimated: false, rooftop: false, kind: KIND.apartments, height: 12, minHeight: 0, roof: ROOF.flat, levels: 4,
        wall: 0, roofColour: 0,
        rings: [{ inner: false, pts: [[x, z], [x + 20, z], [x + 20, z + 20], [x, z + 20]] }],
      });
    }
  }
  return out;
}

describe('the city builds full detail a cell at a time', () => {
  it('prebuilds round the pad, adds one cell per tick, frees cells that go far', () => {
    const city = makeCity(grid(), () => 0, false, [0, 0], [0, 0]);
    const meshes = city.group.children as THREE.Mesh[];
    const coarseVerts = new Map(meshes.map((m) => [m, m.geometry.attributes.position.count]));
    // Full detail has the parapets the coarse level leaves out: more vertices.
    const fullCount = () => meshes.filter((m) => m.visible && m.geometry.attributes.position.count > coarseVerts.get(m)!).length;
    const cam = new THREE.Vector3(0, 2, 0);
    const tick = () => { for (let f = 0; f < 16; f++) city.update(cam, 0); };

    tick();
    // Two prebuilt at the pad, one built on this tick.
    expect(fullCount()).toBe(3);
    tick();
    expect(fullCount()).toBe(4);
    for (let k = 0; k < 20; k++) tick();
    expect(fullCount()).toBe(12);

    // Far away: every full cell's geometry is let go.
    let freed = 0;
    for (const m of meshes) m.geometry.addEventListener('dispose', () => { freed += 1; });
    cam.set(20000, 2, 0);
    tick();
    expect(fullCount()).toBe(0);
    expect(freed).toBe(12);
    // Coming back rebuilds them, one per tick again.
    cam.set(0, 2, 0);
    tick();
    expect(fullCount()).toBe(1);
    city.dispose();
  });
});
