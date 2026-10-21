// The crystals: where they grow, what a tap does, and what the device
// remembers between visits.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { COLLECT_RANGE, CRYSTALS_KEY, loadCrystalSave, makeCrystals, placeCrystals } from '@/lib/solar-system/world-crystals';
import { PAD_RADIUS } from '@/lib/solar-system/world-terrain';
import { MARS, PROXIMA_B } from '@/lib/solar-system/world-profiles';

const memoryStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, map: m };
};
const ground = {
  heightAt: (x: number, z: number) => Math.sin(x / 30) + Math.cos(z / 40),
  normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
};
const opts = { density: 1, lite: true, keepOut: [{ x: 60, z: 60, r: 20 }], walkRadius: MARS.walkRadius };

describe('where the crystals grow', () => {
  it.each([['Mars', MARS], ['Proxima b', PROXIMA_B]])('on %s: inside the fence, off the pad, clear of what is kept out, with stable ids', (_, p) => {
    const spots = placeCrystals(p, opts);
    expect(spots.length).toBeGreaterThan(10);
    for (const s of spots) {
      const d = Math.hypot(s.x - p.pad.x, s.z - p.pad.z);
      expect(d).toBeGreaterThan(PAD_RADIUS + 6);
      expect(d).toBeLessThan(p.walkRadius);
      expect(Math.hypot(s.x - 60, s.z - 60)).toBeGreaterThan(20);
      if (p.ground.water) expect(Math.hypot(s.x - p.ground.water.x, s.z - p.ground.water.z)).toBeGreaterThan(p.ground.water.r);
    }
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
    expect(placeCrystals(p, opts)).toEqual(spots);
  });
});

describe('collecting them', () => {
  it('a tap in reach takes the cluster, counts it and writes it to the device', () => {
    const store = memoryStore();
    const c = makeCrystals(MARS, ground, { ...opts, store });
    expect(c.count).toBe(0);
    expect(c.total).toBe(c.clusters.length);
    const target = c.clusters[3];
    // Out of reach: nothing. In reach: the nearest.
    expect(c.nearest(target.x + COLLECT_RANGE + 1, target.z)).toBeNull();
    expect(c.nearest(target.x + 0.8, target.z + 0.4)?.id).toBe(target.id);
    expect(c.collect(target.id)).toBe(true);
    expect(c.count).toBe(1);
    expect(target.collected).toBe(true);
    expect(c.nearest(target.x, target.z)).toBeNull();
    // Twice is nothing.
    expect(c.collect(target.id)).toBe(false);
    expect(c.collect('nope')).toBe(false);
    expect(c.count).toBe(1);
    const saved = JSON.parse(store.map.get(CRYSTALS_KEY)!) as { v: number; worlds: Record<string, string[]> };
    expect(saved.v).toBe(1);
    expect(saved.worlds.mars).toEqual([target.id]);
    c.dispose();
  });

  it('the pop shrinks the cluster to nothing over the animation', () => {
    const store = memoryStore();
    const c = makeCrystals(MARS, ground, { ...opts, store });
    const target = c.clusters[0];
    const im = c.group.children.find((o) => o.name === `crystals-${target.cut}`) as THREE.InstancedMesh;
    const idx = c.clusters.filter((k) => k.cut === target.cut).indexOf(target);
    const m = new THREE.Matrix4(); const s = new THREE.Vector3();
    im.getMatrixAt(idx, m); s.setFromMatrixScale(m);
    expect(s.y).toBeGreaterThan(0.5);
    c.collect(target.id);
    // It swells first.
    c.update(0.08, 0, 0, 0, null);
    im.getMatrixAt(idx, m); s.setFromMatrixScale(m);
    expect(s.y).toBeGreaterThan(target.scale);
    for (let i = 0; i < 20; i++) c.update(0.05, 0, 0, 0, null);
    im.getMatrixAt(idx, m); s.setFromMatrixScale(m);
    expect(s.y).toBe(0);
    c.dispose();
  });

  it('what was taken stays taken on the next visit, per world', () => {
    const store = memoryStore();
    const first = makeCrystals(MARS, ground, { ...opts, store });
    first.collect(first.clusters[1].id);
    first.collect(first.clusters[5].id);
    first.dispose();
    const again = makeCrystals(MARS, ground, { ...opts, store });
    expect(again.count).toBe(2);
    expect(again.clusters[1].collected).toBe(true);
    expect(again.clusters[5].collected).toBe(true);
    expect(again.clusters[2].collected).toBe(false);
    // Gone clusters start at nothing.
    const im = again.group.children.find((o) => o.name === `crystals-${again.clusters[1].cut}`) as THREE.InstancedMesh;
    const idx = again.clusters.filter((k) => k.cut === again.clusters[1].cut).indexOf(again.clusters[1]);
    const m = new THREE.Matrix4(); const s = new THREE.Vector3();
    im.getMatrixAt(idx, m); s.setFromMatrixScale(m);
    expect(s.y).toBe(0);
    again.dispose();
    // Another world is untouched by it.
    const prox = makeCrystals(PROXIMA_B, ground, { ...opts, store });
    expect(prox.count).toBe(0);
    prox.dispose();
  });

  it('a damaged save starts clean rather than throwing', () => {
    const store = memoryStore();
    store.setItem(CRYSTALS_KEY, '{not json');
    expect(loadCrystalSave(store)).toEqual({ v: 1, worlds: {} });
    store.setItem(CRYSTALS_KEY, JSON.stringify({ v: 1, worlds: { mars: ['c1', 4, null] } }));
    expect(loadCrystalSave(store)).toEqual({ v: 1, worlds: { mars: ['c1'] } });
    expect(loadCrystalSave(null)).toEqual({ v: 1, worlds: {} });
  });

  it('lights the nearest few from the pool, and no more', () => {
    const store = memoryStore();
    const c = makeCrystals(MARS, ground, { ...opts, store });
    const requests: number[][] = [];
    const pool = { lights: [], request: (x: number, y: number, z: number) => { requests.push([x, y, z]); }, flush: () => {} };
    const near = c.clusters[4];
    c.update(1 / 60, near.x, near.y, near.z, pool);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.length).toBeLessThanOrEqual(3);
    expect(requests[0][0]).toBeCloseTo(near.x, 5);
    c.dispose();
  });
});
