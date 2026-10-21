// The big rock: mesas, hoodoos, arches, spires and boulders, grown as
// procedural geometry and drawn instanced, a few cuts of each. A mesa is a
// stack of strata — each band a wall with its own outline noise, stepped
// in from the one below by a ledge, on a talus skirt, under a flat cap — so
// the reference's banded tables come out of the profile's palette. A hoodoo
// is a column of bulges under a wider cap rock; a spire tapers and twists;
// an arch is a sweep of a squarish section along a bent path, thick in the
// legs; a boulder is the Moon's breccia recipe at a larger size. The strata
// ride on vertex colours, the grain on the ground's own normal map, and
// every piece takes the air and the rim light the ground does.
//
// Placement is seeded and pure (placeFormations), so it can be tested: the
// mesas stand outside the walk radius where they read as landscape, the
// rest inside it; nothing intersects the pad, the base, the lake or the
// village, and nothing overlaps another piece. Every piece inside the walk
// radius gives the cosmonaut a collider in the same shape the base uses.

import * as THREE from 'three';
import { fbm } from '@/lib/solar-system/moon-terrain';
import { withHaze } from '@/lib/solar-system/world-earth-haze';
import { injectRim, PAD_RADIUS } from '@/lib/solar-system/world-terrain';
import type { Collider } from '@/lib/solar-system/suit-collision';
import type { WorldProfile } from '@/lib/solar-system/world-profiles';

export type FormationKind = 'mesa' | 'hoodoo' | 'arch' | 'spire' | 'boulder';

export interface KeepOut { x: number; z: number; r: number }

export interface Formation {
  kind: FormationKind;
  /** Which cut of the kind. */
  cut: number;
  x: number;
  z: number;
  /** Footprint radius on the ground, m; scale is metres per unit of the cut. */
  r: number;
  sx: number;
  sy: number;
  yaw: number;
}

export interface FormationsOptions {
  density: number;
  keepOut: KeepOut[];
  walkRadius: number;
}

export interface Formations {
  group: THREE.Group;
  placed: readonly Formation[];
  colliders: Collider[];
  dispose: () => void;
}

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The unit footprint radius of each kind, and how many cuts it comes in. */
const KINDS: Record<FormationKind, { cuts: number; foot: number }> = {
  mesa: { cuts: 3, foot: 1.45 },
  hoodoo: { cuts: 3, foot: 1.0 },
  arch: { cuts: 2, foot: 1.0 },
  spire: { cuts: 2, foot: 1.0 },
  boulder: { cuts: 2, foot: 1.0 },
};

/** Where everything stands. Seeded by the world; pure. */
export function placeFormations(profile: WorldProfile, opts: FormationsOptions): Formation[] {
  const F = profile.formations;
  if (!F) return [];
  const seed = profile.ground.seed + 900;
  const pad = profile.pad;
  const water = profile.ground.water;
  const out: Formation[] = [];
  const keep: KeepOut[] = [{ x: pad.x, z: pad.z, r: PAD_RADIUS + 12 }, ...opts.keepOut];
  if (water) keep.push({ x: water.x, z: water.z, r: water.r * 1.15 });
  const clear = (x: number, z: number, r: number) => {
    for (const k of keep) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return false;
    for (const f of out) if (Math.hypot(x - f.x, z - f.z) < (f.r + r) * 1.15) return false;
    return true;
  };
  let n = 0;
  const place = (kind: FormationKind, count: number, rMin: number, rMax: number, size: () => { sx: number; sy: number }, inSquare: boolean) => {
    const want = Math.round(count * opts.density);
    let placed = 0;
    for (let i = 0; i < want * 12 && placed < want; i++) {
      n += 1;
      const a = hash(n, 1, seed) * Math.PI * 2;
      // Linear in distance, not in area: the near ground gets its share, which is where the eye is.
      const d = rMin + hash(n, 2, seed) * (rMax - rMin);
      const x = pad.x + Math.cos(a) * d; const z = pad.z + Math.sin(a) * d;
      if (inSquare && (Math.abs(x) > 172 || Math.abs(z) > 172)) continue;
      const { sx, sy } = size();
      const r = KINDS[kind].foot * sx;
      if (!clear(x, z, r)) continue;
      out.push({ kind, cut: n % KINDS[kind].cuts, x, z, r, sx, sy, yaw: hash(n, 3, seed) * Math.PI * 2 });
      placed += 1;
    }
  };
  const rnd = (k: number) => hash(n, 10 + k, seed);
  // Mesas: landscape, past the fence, out to where the haze takes them.
  place('mesa', F.mesas, opts.walkRadius + 50, 520, () => { const sx = 16 + rnd(1) * 30; return { sx, sy: 18 + rnd(2) * 34 }; }, false);
  place('hoodoo', F.hoodoos, PAD_RADIUS + 26, opts.walkRadius + 40, () => { const sx = 1.1 + rnd(1) * 1.5; return { sx, sy: 6 + rnd(2) * 9 }; }, true);
  place('spire', F.spires, PAD_RADIUS + 30, opts.walkRadius + 40, () => { const sx = 1.8 + rnd(1) * 2.4; return { sx, sy: 14 + rnd(2) * 18 }; }, true);
  place('arch', F.arches, PAD_RADIUS + 34, opts.walkRadius - 16, () => { const sx = 7 + rnd(1) * 6; return { sx, sy: sx * (0.9 + rnd(2) * 0.5) }; }, true);
  place('boulder', F.boulders, PAD_RADIUS + 16, opts.walkRadius + 30, () => { const sx = 1.6 + Math.pow(rnd(1), 1.5) * 3.2; return { sx, sy: sx * (0.7 + rnd(2) * 0.4) }; }, true);
  return out;
}

/** Colliders for what a crew could walk into: everything inside the fence, at its footprint. An arch is two legs. */
export function formationColliders(placed: readonly Formation[], walkRadius: number, pad: { x: number; z: number }): Collider[] {
  const out: Collider[] = [];
  for (const f of placed) {
    if (Math.hypot(f.x - pad.x, f.z - pad.z) > walkRadius + f.r) continue;
    if (f.kind === 'arch') {
      const leg = f.sx * 0.3; const half = f.sx * 0.86;
      out.push({ x: f.x + Math.cos(f.yaw) * half, z: f.z - Math.sin(f.yaw) * half, r: leg });
      out.push({ x: f.x - Math.cos(f.yaw) * half, z: f.z + Math.sin(f.yaw) * half, r: leg });
    } else if (f.kind === 'mesa') {
      out.push({ x: f.x, z: f.z, r: f.sx * 1.1 });
    } else {
      out.push({ x: f.x, z: f.z, r: f.sx * (f.kind === 'boulder' ? 0.85 : f.kind === 'spire' ? 0.95 : 0.75) });
    }
  }
  return out;
}

// ── Geometry. Everything is built in unit size: 1 tall, footprint about 1. ──

type RGB = [number, number, number];
interface Ring { y: number; r: (a: number) => number; color: (a: number) => RGB }

interface Builder {
  pos: number[]; nrm: number[]; col: number[]; uv: number[]; idx: number[];
}
const newBuilder = (): Builder => ({ pos: [], nrm: [], col: [], uv: [], idx: [] });

/** Rings joined into a tube. Rings in one call share vertices (smooth); separate calls meet at a hard edge. */
function tube(b: Builder, rings: Ring[], seg: number) {
  const base = b.pos.length / 3;
  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k];
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const r = ring.r(a);
      b.pos.push(Math.cos(a) * r, ring.y, Math.sin(a) * r);
      b.nrm.push(0, 0, 0);
      const c = ring.color(a);
      b.col.push(c[0], c[1], c[2]);
      b.uv.push((s / seg) * r * 6, ring.y * 3);
    }
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let s = 0; s < seg; s++) {
      const a = base + k * (seg + 1) + s; const bb = a + 1;
      const c = a + seg + 1; const d = c + 1;
      b.idx.push(a, c, bb, bb, c, d);
    }
  }
}

/** A flat lid on a ring: its own vertices, so the edge is hard. */
function cap(b: Builder, ring: Ring, seg: number, up = true) {
  const base = b.pos.length / 3;
  const c = ring.color(0);
  b.pos.push(0, ring.y, 0); b.nrm.push(0, up ? 1 : -1, 0); b.col.push(c[0], c[1], c[2]); b.uv.push(0, 0);
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const r = ring.r(a);
    b.pos.push(Math.cos(a) * r, ring.y, Math.sin(a) * r);
    b.nrm.push(0, up ? 1 : -1, 0);
    const cc = ring.color(a);
    b.col.push(cc[0], cc[1], cc[2]);
    b.uv.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let s = 0; s < seg; s++) {
    if (up) b.idx.push(base, base + 1 + s + 1, base + 1 + s);
    else b.idx.push(base, base + 1 + s, base + 1 + s + 1);
  }
}

function finish(b: Builder, smoothNormals: boolean): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setIndex(b.idx);
  if (smoothNormals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A banded table on a talus skirt. */
function mesaGeometry(strata: RGB[], seed: number, seg: number): THREE.BufferGeometry {
  const b = newBuilder();
  const outline = (s: number, amp: number) => (a: number) => 1 + fbm(Math.cos(a) * 1.6 + s, Math.sin(a) * 1.6, 3, seed + s) * amp;
  const varnish = (a: number, y: number) => 0.86 + 0.14 * Math.abs(fbm(Math.cos(a) * 1.4 + y * 2, Math.sin(a) * 1.4 + y * 5 + seed, 2, seed + 3));
  const tint = (c: RGB, y: number) => (a: number): RGB => shade(c, varnish(a, y));
  const n = strata.length;
  // The skirt.
  const talus = shade(strata[0], 0.8);
  const skirt = outline(0, 0.06);
  tube(b, [
    { y: 0, r: (a) => 1.45 * skirt(a), color: tint(talus, 0) },
    { y: 0.24, r: (a) => 1.03 * skirt(a), color: tint(talus, 0.24) },
  ], seg);
  // The bands: each a wall with its own outline, then a ledge stepping in.
  let r = 1.0;
  const y0 = 0.24; const bandH = (1 - y0) / n;
  for (let i = 0; i < n; i++) {
    const yb = y0 + i * bandH; const yt = yb + bandH;
    const wall = outline(i + 1, 0.09);
    const rb = r; const rt = r * 0.985;
    const c = strata[i];
    // Every other band overhangs a touch: the softer rock under it has worn back.
    const under = i % 2 === 1 ? 0.97 : 1;
    tube(b, [
      { y: yb, r: (a) => rb * under * wall(a), color: tint(shade(c, 0.9), yb) },
      { y: yt, r: (a) => rt * wall(a), color: tint(c, yt) },
    ], seg);
    if (i < n - 1) {
      const next = r * (0.9 + hash(i, 4, seed) * 0.06);
      const nextWall = outline(i + 2, 0.09);
      tube(b, [
        { y: yt, r: (a) => rt * wall(a), color: tint(shade(c, 1.05), yt) },
        { y: yt, r: (a) => next * nextWall(a) * (i % 2 === 0 ? 0.97 : 1), color: tint(shade(strata[i + 1], 1.05), yt) },
      ], seg);
      r = next;
    } else {
      cap(b, { y: yt, r: (a) => rt * wall(a), color: () => shade(c, 1.08) }, seg);
    }
  }
  return finish(b, true);
}

/** A column of bulges under a cap rock. */
function hoodooGeometry(strata: RGB[], rock: RGB, seed: number, seg: number): THREE.BufferGeometry {
  const b = newBuilder();
  const phase = hash(seed, 1, 9) * Math.PI;
  const bulges = 2.6 + hash(seed, 2, 9) * 1.4;
  const rings: Ring[] = [];
  const n = strata.length;
  for (let y = 0; y <= 0.86; y += 0.043) {
    const yy = y;
    const band = strata[Math.floor(yy * 9) % n];
    rings.push({
      y: yy,
      r: (a) => Math.pow(0.5 + 0.5 * Math.abs(Math.sin(yy * Math.PI * bulges + phase)), 0.85) * (1 - 0.3 * yy) * (1 + fbm(Math.cos(a) * 1.4 + yy * 3, Math.sin(a) * 1.4 + seed, 3, seed) * 0.16),
      color: (a) => shade(band, 0.85 + 0.15 * Math.abs(fbm(Math.cos(a) * 1.3, Math.sin(a) * 1.3 + yy * 4, 2, seed + 5))),
    });
  }
  tube(b, rings, seg);
  // The cap rock, harder and darker, wider than the neck it sits on.
  const capOutline = (a: number) => 1 + fbm(Math.cos(a) * 2 + 7, Math.sin(a) * 2, 3, seed + 8) * 0.12;
  const capC = shade(rock, 0.72);
  tube(b, [
    { y: 0.86, r: (a) => 0.7 * capOutline(a), color: () => shade(capC, 0.85) },
    { y: 0.9, r: (a) => 1.15 * capOutline(a), color: () => capC },
    { y: 1.0, r: (a) => 1.0 * capOutline(a), color: () => shade(capC, 1.1) },
  ], seg);
  cap(b, { y: 1.0, r: (a) => 1.0 * capOutline(a), color: () => shade(capC, 1.15) }, seg);
  return finish(b, true);
}

/** A tall, twisted taper. */
function spireGeometry(strata: RGB[], seed: number, seg: number): THREE.BufferGeometry {
  const b = newBuilder();
  const rings: Ring[] = [];
  const twist = 1.5 + hash(seed, 3, 9) * 2;
  const n = strata.length;
  for (let y = 0; y <= 1.0001; y += 0.05) {
    const yy = Math.min(y, 1);
    const band = strata[Math.floor(yy * 7) % n];
    rings.push({
      y: yy,
      r: (a) => Math.max(0.03, (1 - 0.92 * Math.pow(yy, 1.15)) * (1 + fbm(Math.cos(a + yy * twist) * 1.5, Math.sin(a + yy * twist) * 1.5 + seed, 3, seed) * 0.22)),
      color: (a) => shade(band, 0.8 + 0.2 * Math.abs(fbm(Math.cos(a + yy * twist) * 2, Math.sin(a + yy * twist) * 2 + yy * 6, 2, seed + 6))),
    });
  }
  tube(b, rings, seg);
  cap(b, rings[rings.length - 1], seg);
  return finish(b, true);
}

/** A sweep of a squarish section over a bent path, thick in the legs. */
function archGeometry(strata: RGB[], seed: number, seg: number): THREE.BufferGeometry {
  const b = newBuilder();
  const M = 30;
  const n = strata.length;
  const P = new THREE.Vector3(); const T = new THREE.Vector3(); const N = new THREE.Vector3();
  const B = new THREE.Vector3(0, 0, 1);
  const at = (t: number, out: THREE.Vector3) => out.set((t - 0.5) * 2, Math.sin(Math.PI * t) - 0.12, 0);
  const base = b.pos.length / 3;
  for (let i = 0; i <= M; i++) {
    const t = i / M;
    at(t, P);
    T.subVectors(at(Math.min(1, t + 0.01), new THREE.Vector3()), at(Math.max(0, t - 0.01), new THREE.Vector3())).normalize();
    N.crossVectors(B, T).normalize();
    const lift = Math.sin(Math.PI * t);
    const r = 0.17 + 0.16 * Math.pow(1 - lift, 1.4);
    const band = strata[Math.floor(clamp01((P.y + 0.12) / 1.12) * (n - 0.001))];
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      const rr = r * (1 + 0.14 * Math.cos(3 * th + t * 5)) * (1 + fbm(Math.cos(th) * 1.3 + t * 6, Math.sin(th) * 1.3 + seed, 3, seed) * 0.18);
      b.pos.push(P.x + N.x * Math.cos(th) * rr, P.y + N.y * Math.cos(th) * rr, B.z * Math.sin(th) * rr);
      b.nrm.push(0, 0, 0);
      const k = 0.82 + 0.18 * Math.abs(fbm(Math.cos(th) * 1.5, Math.sin(th) * 1.5 + t * 8, 2, seed + 7));
      b.col.push(band[0] * k, band[1] * k, band[2] * k);
      b.uv.push((s / seg) * rr * 6, t * 9);
    }
  }
  for (let i = 0; i < M; i++) {
    for (let s = 0; s < seg; s++) {
      const a = base + i * (seg + 1) + s; const bb = a + 1;
      const c = a + seg + 1; const d = c + 1;
      b.idx.push(a, bb, c, bb, d, c);
    }
  }
  return finish(b, true);
}

/** A big breccia boulder: fracture planes, then noise, flat underneath. */
function boulderGeometry(rock: RGB, seed: number, detail: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const cuts = Array.from({ length: 5 }, (_, k) => {
    const a = hash(seed, 10 + k, 7) * Math.PI * 2; const bb = (hash(seed, 20 + k, 7) - 0.3) * 1.6;
    return { n: new THREE.Vector3(Math.cos(a) * Math.cos(bb), Math.sin(bb), Math.sin(a) * Math.cos(bb)), d: 0.62 + hash(seed, 30 + k, 7) * 0.22 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    for (const c of cuts) {
      const over = v.dot(c.n) - c.d;
      if (over > 0) v.addScaledVector(c.n, -over * (1 - 0.35 * Math.exp(-over * 12)));
    }
    v.multiplyScalar(1 + fbm(v.x * 1.7 + seed, v.y * 1.7 + v.z * 0.9, 4, seed + 40) * 0.3);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    pos.setXYZ(i, v.x, v.y, v.z);
    const k = 0.82 + 0.18 * Math.abs(fbm(v.x * 3, v.z * 3 + v.y, 2, seed + 9));
    col[i * 3] = rock[0] * k; col[i * 3 + 1] = rock[1] * k; col[i * 3 + 2] = rock[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export function makeFormations(
  profile: WorldProfile,
  ground: { groundAt: (x: number, z: number) => number; grain: THREE.Texture },
  opts: FormationsOptions & { lite: boolean },
): Formations {
  const group = new THREE.Group();
  group.name = 'formations';
  const F = profile.formations;
  const placed = placeFormations(profile, opts);
  const colliders = formationColliders(placed, opts.walkRadius, profile.pad);
  if (!F || placed.length === 0) return { group, placed, colliders, dispose() { /* nothing built */ } };
  const seed = profile.ground.seed + 500;
  const seg = opts.lite ? 18 : 28;
  const strata = F.strata;
  const geoms: Record<FormationKind, THREE.BufferGeometry[]> = {
    mesa: [], hoodoo: [], arch: [], spire: [], boulder: [],
  };
  const need = (kind: FormationKind) => placed.some((f) => f.kind === kind);
  if (need('mesa')) for (let c = 0; c < KINDS.mesa.cuts; c++) geoms.mesa.push(mesaGeometry(strata, seed + c * 13, seg + 8));
  if (need('hoodoo')) for (let c = 0; c < KINDS.hoodoo.cuts; c++) geoms.hoodoo.push(hoodooGeometry(strata, F.rock, seed + 40 + c * 13, seg - 6));
  if (need('spire')) for (let c = 0; c < KINDS.spire.cuts; c++) geoms.spire.push(spireGeometry(strata, seed + 80 + c * 13, seg - 8));
  if (need('arch')) for (let c = 0; c < KINDS.arch.cuts; c++) geoms.arch.push(archGeometry(strata, seed + 120 + c * 13, opts.lite ? 10 : 14));
  if (need('boulder')) for (let c = 0; c < KINDS.boulder.cuts; c++) geoms.boulder.push(boulderGeometry(F.rock, seed + 160 + c * 13, opts.lite ? 1 : 2));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.93, metalness: 0.0, normalMap: ground.grain, normalScale: new THREE.Vector2(0.55, 0.55) });
  const rim = new THREE.Color(...profile.atmosphere.hazeSun);
  withHaze(mat, `world-formation|${profile.id}`, false, (shader) => {
    injectRim(shader, rim);
    // The grain twice, at two scales, so a forty-metre wall does not tile visibly.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.23 + vec2( 0.4, 0.1 ) ).xyz * 2.0 - 1.0;
      mapN = normalize( vec3( mapN.xy * normalScale + mapN2.xy * normalScale * 0.8, mapN.z * mapN2.z ) );
      normal = normalize( tbn * mapN );`);
  });

  // Seat each piece on the lowest ground under its footprint, a little in, so no edge floats on a slope.
  const seat = (f: Formation): number => {
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      low = Math.min(low, ground.groundAt(f.x + Math.cos(a) * f.r * 0.8, f.z + Math.sin(a) * f.r * 0.8));
    }
    low = Math.min(low, ground.groundAt(f.x, f.z));
    return low - (f.kind === 'mesa' ? f.sy * 0.04 : f.kind === 'boulder' ? f.sy * 0.3 : f.sy * 0.03) - 0.25;
  };
  const meshes: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of Object.keys(geoms) as FormationKind[]) {
    geoms[kind].forEach((geom, cut) => {
      const list = placed.filter((f) => f.kind === kind && f.cut === cut);
      if (list.length === 0) return;
      const im = new THREE.InstancedMesh(geom, mat, list.length);
      im.name = `formation-${kind}-${cut}`;
      im.castShadow = true;
      im.receiveShadow = true;
      list.forEach((f, k) => {
        p.set(f.x, seat(f), f.z);
        q.setFromAxisAngle(up, f.yaw);
        s.set(f.sx, f.sy, f.sx);
        m.compose(p, q, s);
        im.setMatrixAt(k, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      group.add(im);
      meshes.push(im);
    });
  }
  return {
    group, placed, colliders,
    dispose() {
      for (const im of meshes) im.dispose();
      for (const kind of Object.keys(geoms) as FormationKind[]) for (const g of geoms[kind]) g.dispose();
      mat.dispose();
    },
  };
}
