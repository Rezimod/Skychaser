import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The terrain draws its regolith on canvas; jsdom has none, so hand it a stub.
const gradient = { addColorStop: () => {} };
const ctx = new Proxy({}, {
  get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => gradient : () => {}),
});
const getContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => ctx) as never; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = getContext; });

interface Rock { im: THREE.InstancedMesh; k: number; pos: THREE.Vector3; scale: number }
function rocksOf(group: THREE.Group): Rock[] {
  const out: Rock[] = [];
  const m = new THREE.Matrix4(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  for (const im of group.children as THREE.InstancedMesh[]) {
    for (let k = 0; k < im.count; k++) {
      im.getMatrixAt(k, m);
      // Column lengths: decompose() reports a hidden (zero-scale) rock as scale 1.
      p.setFromMatrixPosition(m);
      s.setFromMatrixScale(m);
      out.push({ im, k, pos: p.clone(), scale: s.y });
    }
  }
  return out;
}

describe('a new crater and what was on the ground', () => {
  it('blows the small rocks out of the bowl and settles the rim rocks on the new ground', async () => {
    const { makeMoonTerrain } = await import('@/lib/solar-system/moon-terrain');
    const t = makeMoonTerrain(true, 1);
    const before = rocksOf(t.rocks).filter((r) => r.scale > 0);
    // A crater centred on a small rock out on the plain.
    const target = before.find((r) => r.scale < 0.4 && Math.hypot(r.pos.x, r.pos.z) > 80)!;
    const R = 6;
    t.stampCrater(target.pos.x, target.pos.z, R, 2);
    const after = rocksOf(t.rocks);
    const same = (r: Rock) => after.find((a) => a.im === r.im && a.k === r.k)!;
    expect(same(target).scale).toBe(0);
    for (const r of before) {
      const d = Math.hypot(r.pos.x - target.pos.x, r.pos.z - target.pos.z);
      if (d < R * 1.6 && d > R * 0.95) {
        const a = same(r);
        const ground = t.heightAt(a.pos.x, a.pos.z);
        // Seated: into the ground by its sink, never floating over the old surface.
        expect(a.pos.y).toBeLessThan(ground + 1e-3);
        expect(a.pos.y).toBeGreaterThan(ground - a.scale * 0.5);
      }
    }
    t.dispose();
  });

  it('clears the rocks off a walked path', async () => {
    const { makeMoonTerrain } = await import('@/lib/solar-system/moon-terrain');
    const t = makeMoonTerrain(true, 1);
    const path: [number, number][] = [[60, -150], [60, 150]];
    t.clearRocks(path, 1.4);
    for (const r of rocksOf(t.rocks)) {
      if (r.scale > 0) expect(Math.abs(r.pos.x - 60)).toBeGreaterThan(1.4);
    }
    t.dispose();
  });

  it('takes the prints in the crater with it, and only those', async () => {
    const { makePrints } = await import('@/lib/solar-system/moon-prints');
    const prints = makePrints(50);
    prints.stamp(0, 0, 0, 0, 1);
    prints.stamp(20, 0, 0, 0, 1);
    prints.clear(0, 0, 3);
    const m = new THREE.Matrix4(); const s = new THREE.Vector3();
    prints.mesh.getMatrixAt(0, m); s.setFromMatrixScale(m);
    expect(s.x).toBe(0);
    prints.mesh.getMatrixAt(1, m); s.setFromMatrixScale(m);
    expect(s.x).toBeGreaterThan(0);
    prints.dispose();
  });
});
