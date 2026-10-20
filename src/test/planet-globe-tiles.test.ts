// The globe's quadtree: the cube-sphere mapping, the chunk geometry and its
// skirts, horizon and patch culling, and the greedy split/merge selection.
// All pure: no WebGL.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  faceToDir, dirToFace, QuadTree, ChunkBuilder, chunkIndices, chunkVertexCount, aboveHorizon, insidePatch,
  selectChunks, lodBudget, maxLevelFor, cellPixels, type QuadNode, type SelectOptions,
} from '@/lib/solar-system/planet-globe-tiles';

const R = 1737.4;
const params = { radiusKm: R, segments: 8, hMin: -10000, hMax: 10000 };

const len = (v: ArrayLike<number>) => Math.hypot(v[0], v[1], v[2]);

function cameraAt(pos: THREE.Vector3, look: THREE.Vector3, fov = 60): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(fov, 1.6, 0.001, 1e5);
  cam.position.copy(pos);
  cam.up.copy(pos).normalize();
  if (Math.abs(cam.up.dot(look.clone().sub(pos).normalize())) > 0.999) cam.up.set(1, 0, 0);
  cam.lookAt(look);
  cam.updateMatrixWorld();
  return cam;
}

function frustumOf(cam: THREE.PerspectiveCamera): THREE.Frustum {
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
}

function opts(over: Partial<SelectOptions> = {}): SelectOptions {
  return {
    radiusKm: R, occluderKm: R - 10, targetPx: 10, maxLevel: 12, maxChunks: 40,
    site: [0, 0, 1], patchAngle: 0, ready: () => true, ...over,
  };
}

const isAncestor = (a: QuadNode, b: QuadNode) => {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
};

describe('cube → sphere', () => {
  it('maps every face coordinate to a unit direction and back', () => {
    for (let f = 0; f < 6; f++) for (const [u, v] of [[-1, -1], [0, 0], [0.3, -0.7], [0.99, 0.5]]) {
      const d = faceToDir(f, u, v);
      expect(len(d)).toBeCloseTo(1, 12);
      const back = dirToFace(d[0], d[1], d[2]);
      if (Math.abs(u) < 0.999 && Math.abs(v) < 0.999) {
        expect(back.face).toBe(f);
        expect(back.u).toBeCloseTo(u, 9);
        expect(back.v).toBeCloseTo(v, 9);
      }
    }
  });

  it('covers the sphere: any direction lands on a face inside −1…1', () => {
    for (let i = 0; i < 500; i++) {
      const z = 2 * ((i * 0.618034) % 1) - 1; const a = i * 2.39996;
      const r = Math.sqrt(1 - z * z);
      const f = dirToFace(r * Math.cos(a), r * Math.sin(a), z);
      expect(Math.abs(f.u)).toBeLessThanOrEqual(1 + 1e-12);
      expect(Math.abs(f.v)).toBeLessThanOrEqual(1 + 1e-12);
    }
  });

  it('keeps cells near equal in size across a face (the tangent warp)', () => {
    const t = new QuadTree(params);
    const face = t.roots[4];
    let n: QuadNode = face;
    for (let i = 0; i < 3; i++) n = t.children(n)[0];
    const corner = n.edgeKm;
    // Corner and near-centre cells at the same level within a factor of 1.6.
    const mid = t.children(t.children(t.children(face)[0])[3])[3];
    expect(corner / mid.edgeKm).toBeGreaterThan(1 / 1.6);
    expect(corner / mid.edgeKm).toBeLessThan(1.6);
  });
});

describe('chunk geometry', () => {
  const flat = () => 0;

  it('winds every triangle outward, skirts included', () => {
    const t = new QuadTree(params);
    for (const node of [t.roots[0], t.children(t.roots[3])[2], t.children(t.children(t.roots[5])[1])[0]]) {
      const b = new ChunkBuilder(node, 8, R, flat);
      expect(b.step()).toBe(true);
      const a = b.arrays();
      const P = (i: number) => new THREE.Vector3(a.position[i * 3] + a.origin[0], a.position[i * 3 + 1] + a.origin[1], a.position[i * 3 + 2] + a.origin[2]);
      const centre = new THREE.Vector3(...node.centre);
      const grid = 9 * 9;
      for (let k = 0; k < a.index.length; k += 3) {
        const p0 = P(a.index[k]); const p1 = P(a.index[k + 1]); const p2 = P(a.index[k + 2]);
        const n = new THREE.Vector3().crossVectors(p1.clone().sub(p0), p2.clone().sub(p0));
        const mid = p0.clone().add(p1).add(p2).divideScalar(3);
        if (a.index[k] < grid && a.index[k + 1] < grid && a.index[k + 2] < grid) {
          expect(n.dot(mid.clone().normalize())).toBeGreaterThan(0);
        } else {
          // A skirt wall faces away from the chunk's middle.
          const radial = mid.clone().normalize();
          const out = mid.clone().normalize().sub(centre).sub(radial.multiplyScalar(radial.dot(mid.clone().normalize().sub(centre))));
          expect(n.dot(out)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('puts vertices relative to the chunk centre, on the sphere plus the height', () => {
    const t = new QuadTree(params);
    let n = t.roots[2];
    for (let i = 0; i < 10; i++) n = t.children(n)[i % 4];
    const b = new ChunkBuilder(n, 8, R, () => 1234);
    b.step();
    const a = b.arrays();
    expect(len(a.origin)).toBeCloseTo(R, 9);
    let maxRel = 0;
    for (let i = 0; i < 81; i++) {
      const rel = [a.position[i * 3], a.position[i * 3 + 1], a.position[i * 3 + 2]];
      maxRel = Math.max(maxRel, len(rel));
      const abs = [rel[0] + a.origin[0], rel[1] + a.origin[1], rel[2] + a.origin[2]];
      expect(len(abs)).toBeCloseTo(R + 1.234, 5);
      // Normals of a sphere shell point straight out.
      const nn = [a.normal[i * 3], a.normal[i * 3 + 1], a.normal[i * 3 + 2]];
      expect((nn[0] * abs[0] + nn[1] * abs[1] + nn[2] * abs[2]) / len(abs)).toBeGreaterThan(0.9999);
    }
    // A level-10 chunk: kilometres from its own centre, not thousands.
    expect(maxRel).toBeLessThan(n.edgeKm);
    expect(a.hMin).toBeCloseTo(1234, 6);
    expect(a.hMax).toBeCloseTo(1234, 6);
    expect(a.position.length).toBe(chunkVertexCount(8) * 3);
  });

  it('builds a row at a time and ends where a one-shot build does', () => {
    const t = new QuadTree(params);
    const n = t.children(t.roots[1])[3];
    const h = (x: number, y: number, z: number) => 3000 * Math.sin(x * 40) * Math.cos(y * 30) + 500 * z;
    const slow = new ChunkBuilder(n, 8, R, h);
    let calls = 0;
    while (!slow.step(() => false)) calls++;
    // 11 rows with the ring: ten calls come back unfinished.
    expect(calls).toBe(10);
    const fast = new ChunkBuilder(n, 8, R, h);
    fast.step();
    expect(Array.from(slow.arrays().position)).toEqual(Array.from(fast.arrays().position));
    expect(Array.from(slow.arrays().normal)).toEqual(Array.from(fast.arrays().normal));
  });

  it('neighbours share their edge vertices exactly (so only level changes need the skirts)', () => {
    const t = new QuadTree(params);
    const [a, b] = t.children(t.roots[0]);
    const h = (x: number, y: number, z: number) => 2000 * Math.sin(x * 9 + y * 5) + 700 * z;
    const ba = new ChunkBuilder(a, 8, R, h); ba.step();
    const bb = new ChunkBuilder(b, 8, R, h); bb.step();
    const A = ba.arrays(); const B = bb.arrays();
    for (let j = 0; j <= 8; j++) {
      const ia = j * 9 + 8; const ib = j * 9;
      for (let c = 0; c < 3; c++) {
        expect(A.position[ia * 3 + c] + A.origin[c]).toBeCloseTo(B.position[ib * 3 + c] + B.origin[c], 4);
        expect(A.normal[ia * 3 + c]).toBeCloseTo(B.normal[ib * 3 + c], 5);
      }
    }
  });

  it('holds the sea at the floor and keeps the depth in the height attribute', () => {
    const t = new QuadTree({ ...params, radiusKm: 6371 });
    const b = new ChunkBuilder(t.roots[0], 8, 6371, () => -3000, 0);
    b.step();
    const a = b.arrays();
    expect(a.hMin).toBe(0);
    expect(a.height[0]).toBe(-3000);
  });

  it('indexes 16-bit while it can', () => {
    expect(chunkIndices(32)).toBeInstanceOf(Uint16Array);
    expect(chunkIndices(32).length).toBe((32 * 32 * 2 + 4 * 32 * 2) * 3);
  });
});

describe('culling', () => {
  const t = new QuadTree(params);

  it('hides the far side behind the horizon and keeps the near side', () => {
    const cam = [0, 0, R + 100];
    const top = t.roots[4];
    const bottom = t.roots[5];
    expect(aboveHorizon(top, cam, R, R - 10)).toBe(true);
    expect(aboveHorizon(bottom, cam, R, R - 10)).toBe(false);
    // A small chunk just past the geometric horizon is still seen if it stands high enough.
    const horizon = Math.acos(R / (R + 100));
    const n = { centre: [Math.sin(horizon + 0.05), 0, Math.cos(horizon + 0.05)] as [number, number, number], angRadius: 0.001, hMax: 0 };
    expect(aboveHorizon(n, cam, R, R)).toBe(false);
    expect(aboveHorizon({ ...n, hMax: 20000 }, cam, R, R)).toBe(true);
  });

  it('from a metre above the ground, the horizon is under two kilometres off unless the ground rises', () => {
    const cam = [0, 0, R + 0.001];
    // On a smooth Moon the horizon from 1 m is √(2Rh) ≈ 1.86 km away.
    const at = (km: number, hMax: number) => ({ centre: [Math.sin(km / R), 0, Math.cos(km / R)] as [number, number, number], angRadius: 0.1 / R, hMax });
    expect(aboveHorizon(at(1.5, 0), cam, R, R)).toBe(true);
    expect(aboveHorizon(at(3.5, 0), cam, R, R)).toBe(false);
    // A 100 m rise 3.5 km off shows over it.
    expect(aboveHorizon(at(3.5, 100), cam, R, R)).toBe(true);
    expect(aboveHorizon(at(900, 0), cam, R, R)).toBe(false);
  });

  it('skips chunks wholly inside the patch, and only those', () => {
    const site = [0, 0, 1];
    const inner = { centre: [Math.sin(0.0002), 0, Math.cos(0.0002)] as [number, number, number], angRadius: 0.0002 };
    const edge = { centre: [Math.sin(0.0008), 0, Math.cos(0.0008)] as [number, number, number], angRadius: 0.0004 };
    const patch = 1.5 / R;
    expect(insidePatch(inner, site, patch)).toBe(true);
    expect(insidePatch(edge, site, patch)).toBe(false);
    expect(insidePatch(inner, site, 0)).toBe(false);
  });
});

describe('selection (split and merge)', () => {
  it('from far away draws only the roots it can see', () => {
    const t = new QuadTree(params);
    const cam = cameraAt(new THREE.Vector3(0, 0, R * 40), new THREE.Vector3());
    const s = selectChunks(t, { cam: cam.position.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts());
    expect(s.draw.every((n) => n.level === 0)).toBe(true);
    expect(s.draw.length).toBeGreaterThanOrEqual(1);
    expect(s.draw.length).toBeLessThanOrEqual(5);
    expect(s.draw.includes(t.roots[5])).toBe(false);
  });

  it('close in, splits toward the camera within the budget, with no overlaps', () => {
    const t = new QuadTree(params);
    const ground = new THREE.Vector3(0.3, 0.2, 1).normalize().multiplyScalar(R);
    const cam = cameraAt(ground.clone().multiplyScalar((R + 5) / R), ground.clone().add(new THREE.Vector3(40, 0, 0)));
    for (const maxChunks of [40, 90]) {
      const s = selectChunks(t, { cam: cam.position.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts({ maxChunks }));
      expect(s.draw.length).toBeLessThanOrEqual(maxChunks);
      expect(s.draw.length).toBeGreaterThan(8);
      const deepest = Math.max(...s.draw.map((n) => n.level));
      expect(deepest).toBeGreaterThanOrEqual(7);
      for (const a of s.draw) for (const b of s.draw) if (a !== b) expect(isAncestor(a, b)).toBe(false);
      // The finest chunk is the one under the camera.
      const finest = s.draw.find((n) => n.level === deepest)!;
      const c = new THREE.Vector3(...finest.centre).multiplyScalar(R);
      expect(c.distanceTo(cam.position)).toBeLessThan(R * 0.1);
    }
  });

  it('merges back as the camera climbs', () => {
    const t = new QuadTree(params);
    const up = new THREE.Vector3(0.1, -0.4, 1).normalize();
    const levels = [3, 50, 600, 6000].map((alt) => {
      const cam = cameraAt(up.clone().multiplyScalar(R + alt), new THREE.Vector3());
      const s = selectChunks(t, { cam: cam.position.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts());
      return Math.max(...s.draw.map((n) => n.level));
    });
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    expect(levels[0]).toBeGreaterThan(levels[3]);
  });

  it('keeps a parent drawn and asks for its children while they are not built', () => {
    const t = new QuadTree(params);
    const cam = cameraAt(new THREE.Vector3(0, 0, R + 20), new THREE.Vector3(0, 30, R));
    const s = selectChunks(t, { cam: cam.position.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts({ ready: (n) => n.level === 0 }));
    expect(s.draw.every((n) => n.level === 0)).toBe(true);
    expect(s.want.length).toBeGreaterThan(0);
    expect(s.want.every((w) => w.node.level === 1)).toBe(true);
    // Highest priority first.
    for (let i = 1; i < s.want.length; i++) expect(s.want[i].priority).toBeLessThanOrEqual(s.want[i - 1].priority);
  });

  it('draws nothing when looking away into space', () => {
    const t = new QuadTree(params);
    const pos = new THREE.Vector3(0, 0, R + 300);
    const cam = cameraAt(pos, pos.clone().multiplyScalar(2));
    const s = selectChunks(t, { cam: pos.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts());
    expect(s.draw.length).toBe(0);
  });

  it('holds a split a little longer than it made it (hysteresis)', () => {
    const t = new QuadTree(params);
    const n = t.roots[4];
    const cam = [0, 0, R + 800];
    const px = cellPixels(n, { cam, frustum: null, pxPerRad: 900 });
    const target = px * 1.2;
    const fresh = selectChunks(t, { cam, frustum: null, pxPerRad: 900 }, opts({ targetPx: target }));
    expect(fresh.split.has(n.key)).toBe(false);
    const held = selectChunks(t, { cam, frustum: null, pxPerRad: 900 }, opts({ targetPx: target, wasSplit: (m) => m === n }));
    expect(held.split.has(n.key)).toBe(true);
  });

  it('never draws inside the patch', () => {
    const t = new QuadTree(params);
    const site = new THREE.Vector3(0, 0, 1);
    const cam = cameraAt(site.clone().multiplyScalar(R + 0.002), new THREE.Vector3(0, 3, R));
    const patchAngle = 20 / R;
    const s = selectChunks(t, { cam: cam.position.toArray(), frustum: frustumOf(cam), pxPerRad: 900 }, opts({ site: [0, 0, 1], patchAngle }));
    for (const n of s.draw) expect(insidePatch(n, [0, 0, 1], patchAngle)).toBe(false);
  });

  it('prunes subtrees nobody has visited', () => {
    const t = new QuadTree(params);
    let n = t.roots[0];
    for (let i = 0; i < 5; i++) n = t.children(n)[0];
    expect(t.size()).toBe(6 + 20);
    t.prune(1000, 100, () => false);
    expect(t.size()).toBe(6);
  });
});

describe('budgets', () => {
  it('stay inside the draw-call limits per preset', () => {
    expect(lodBudget('performance', true).maxChunks).toBeLessThanOrEqual(40);
    expect(lodBudget('balanced', true).maxChunks).toBeLessThanOrEqual(40);
    expect(lodBudget('ultra', false).maxChunks).toBeLessThanOrEqual(90);
    for (const l of ['performance', 'balanced', 'high', 'ultra'] as const) expect(lodBudget(l, false).buildMs).toBeLessThanOrEqual(2);
  });

  it('split each world down to cells of ten or twenty metres', () => {
    const lv = (r: number, cell: number) => maxLevelFor(r, 32, cell);
    expect(lv(1737.4, 10)).toBe(14);
    expect(lv(3389.5, 12)).toBe(14);
    expect(lv(6371, 20)).toBe(14);
    const cellM = (r: number, l: number) => (r * Math.PI / 2 * 1000) / 2 ** l / 32;
    expect(cellM(1737.4, 14)).toBeLessThan(10);
    expect(cellM(6371, 14)).toBeLessThan(20);
  });
});
