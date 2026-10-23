import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeCity, prepareCity } from '@/lib/solar-system/world-earth-city';
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

// Mixed footprints: a courtyard (a hole), small hipped houses, tall flat blocks with parapets.
function mixed(): Building[] {
  const out = grid();
  for (let k = 0; k < 40; k++) {
    const x = (k % 8) * 60 - 240; const z = Math.floor(k / 8) * 60 - 150;
    out.push({
      estimated: false, rooftop: k === 3, kind: k % 3 ? KIND.house : KIND.apartments, height: 6 + k, minHeight: 0,
      roof: k % 3 ? ROOF.hipped : ROOF.flat, levels: 2, wall: 0, roofColour: 0,
      rings: k % 5 === 0
        ? [{ inner: false, pts: [[x, z], [x + 40, z], [x + 40, z + 40], [x, z + 40]] }, { inner: true, pts: [[x + 10, z + 10], [x + 30, z + 10], [x + 30, z + 30], [x + 10, z + 30]] }]
        : [{ inner: false, pts: [[x, z], [x + 12, z], [x + 12, z + 9], [x, z + 9]] }],
    });
  }
  return out;
}

describe('the city prepared ahead in slices', () => {
  const heightAt = (x: number, z: number) => Math.sin(x / 90) * 4 + z * 0.01;
  const snapshot = (city: ReturnType<typeof makeCity>) => {
    const cam = new THREE.Vector3(0, 2, 0);
    for (let k = 0; k < 16 * 16; k++) city.update(cam, 0);
    return (city.group.children as THREE.Mesh[]).map((m) => {
      const g = m.geometry;
      return [m.visible, g.attributes.position.count, g.index!.count, Array.from(g.attributes.position.array as Float32Array).reduce((a, b) => a + b, 0)];
    });
  };

  for (const lite of [false, true]) {
    it(`builds the same geometry as building it in one go (lite ${lite})`, async () => {
      const buildings = mixed();
      const plain = makeCity(buildings, heightAt, lite, [0, 0]);
      const ready = await prepareCity(buildings, heightAt, lite, [0, 0], [0, 0], { sliceMs: 0 });
      const fromReady = makeCity(buildings, heightAt, lite, [0, 0], [0, 0], ready);
      // Prepared at the other quality: the coarse and far levels still serve, the pad's full cells are redone.
      const otherLite = makeCity(buildings, heightAt, !lite, [0, 0], [0, 0], await prepareCity(buildings, heightAt, lite, [0, 0]));
      const want = snapshot(plain);
      expect(want.length).toBeGreaterThan(0);
      expect(snapshot(fromReady)).toEqual(want);
      expect(snapshot(otherLite)).toEqual(snapshot(makeCity(buildings, heightAt, !lite, [0, 0])));
      expect(fromReady.rooftop).toEqual(plain.rooftop);
      expect(fromReady.roofAt(-238, -148)).toBe(plain.roofAt(-238, -148));
      for (const c of [plain, fromReady, otherLite]) c.dispose();
    });
  }

  it('yields between slices and stops when aborted', async () => {
    let slices = 0;
    await prepareCity(mixed(), heightAt, false, [0, 0], [0, 0], { sliceMs: 0, onSlice: () => { slices += 1; } });
    expect(slices).toBeGreaterThan(1);
    const abort = new AbortController();
    const run = prepareCity(mixed(), heightAt, false, [0, 0], [0, 0], { sliceMs: 0, signal: abort.signal });
    abort.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});
