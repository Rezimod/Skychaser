// The lunar surface under the cosmonaut's boots: a heightfield in metres
// built from layered noise, a rim ridge, a few dozen old craters and a
// levelled pad for the base, skinned with procedural regolith (albedo +
// normal + roughness, all drawn on canvas — no texture downloads). The
// heightfield stays authoritative after build so a meteor can dig a fresh
// crater into it and the geometry, the boots and the rocks all agree.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TERRAIN_SIZE = 360;
/** Playable radius — the cosmonaut is kept inside this. */
export const TERRAIN_WALK_RADIUS = 165;
/** Base pad: level ground so the habitats sit square. */
export const PAD_CENTER = new THREE.Vector2(0, -6);
export const PAD_RADIUS = 46;
/** The telescope station's footing on the western ridge: levelled to the crest. */
export const TELESCOPE_PAD = { x: -58, z: -44, r: 5.5 };

function hash(ix: number, iy: number, seed: number): number {
  let n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function smooth(t: number): number { return t * t * (3 - 2 * t); }
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = smooth(x - ix); const fy = smooth(y - iy);
  const a = hash(ix, iy, seed); const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed); const d = hash(ix + 1, iy + 1, seed);
  return (a + (b - a) * fx) + ((c - a) + (a - b - c + d) * fx) * fy;
}
/** Value noise that repeats every `period` lattice cells: a tile that wraps exactly. */
function periodicNoise(x: number, y: number, period: number, seed: number): number {
  const ix = Math.floor(x); const iy = Math.floor(y);
  const fx = smooth(x - ix); const fy = smooth(y - iy);
  const x0 = ((ix % period) + period) % period; const x1 = (x0 + 1) % period;
  const y0 = ((iy % period) + period) % period; const y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed); const b = hash(x1, y0, seed);
  const c = hash(x0, y1, seed); const d = hash(x1, y1, seed);
  return (a + (b - a) * fx) + ((c - a) + (a - b - c + d) * fx) * fy;
}
export function fbm(x: number, y: number, octaves: number, seed: number, gain = 0.5): number {
  let amp = 1; let sum = 0; let norm = 0; let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise(x * f, y * f, seed + i * 17) * 2 - 1) * amp;
    norm += amp;
    amp *= gain;
    f *= 2.03;
  }
  return sum / norm;
}
function ridged(x: number, y: number, seed: number): number {
  let amp = 1; let sum = 0; let f = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(valueNoise(x * f, y * f, seed + i * 31) * 2 - 1);
    sum += n * n * amp;
    amp *= 0.5;
    f *= 2.1;
  }
  return sum;
}

interface Crater { x: number; z: number; r: number; depth: number }

/** A bowl with a raised rim: −depth at the centre, +rim at r, fading out by
 *  1.5r. The crest is narrow — the inner wall climbs late and the outer
 *  flank drops fast — so a low sun draws a sharp bright arc on one side and
 *  a hard shadow on the other, the way Apollo's surface photographs read. */
function craterProfile(d: number, c: Crater): number {
  const q = d / c.r;
  if (q >= 1.55) return 0;
  const rim = c.depth * 0.42;
  if (q < 1) {
    const bowl = 1 - q * q;
    const climb = smooth(Math.max(0, (q - 0.62) / 0.38));
    return -c.depth * bowl * bowl + rim * climb * climb;
  }
  const t = Math.min(1, (q - 1) / 0.5);
  const fall = 1 - smooth(t);
  return rim * fall * fall;
}

export interface TerrainHandle {
  mesh: THREE.Mesh;
  rocks: THREE.Group;
  heightAt: (x: number, z: number) => number;
  /** Surface normal by finite difference — for boot tilt and rock seating. */
  normalAt: (x: number, z: number, out: THREE.Vector3) => THREE.Vector3;
  /** Dig a fresh crater and re-light the ground around it. */
  stampCrater: (x: number, z: number, r: number, depth: number) => void;
  /** Open a shaft: the ground within r drops away by depth, darker the deeper it goes. */
  punch: (x: number, z: number, r: number, depth: number) => void;
  /** Sun direction in view space, updated by the scene each frame. */
  setSunView: (v: THREE.Vector3) => void;
  /** Darken (k < 0, compacted) or brighten (k > 0, blasted) the regolith
   *  within r of a point, softly. Build time only. */
  tint: (x: number, z: number, r: number, k: number) => void;
  /** The same along a walked path. */
  tintPath: (pts: [number, number][], width: number, k: number) => void;
  /** Take the rocks off a walked path (rovers and boots have kicked them aside). Build time. */
  clearRocks: (pts: [number, number][], width: number) => void;
  dispose: () => void;
}

/** Fine regolith: grain, a few tiny pits, small bright clasts. */
/** The drawn maps depend only on their size, so a second landing reuses them. */
const canvasCache = new Map<number, HTMLCanvasElement[]>();
function regolithCanvases(size: number): HTMLCanvasElement[] {
  const cached = canvasCache.get(size);
  if (cached) return cached;
  const h = new Float32Array(size * size);
  const S = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size; const v = y / size;
      // Periodic noise, octave periods doubling from 38 cells, so the tile wraps.
      let n = 0; let amp = 1; let norm = 0; let f = 38;
      for (let o = 0; o < 5; o++) {
        n += (periodicNoise(u * f, v * f, f, S + o * 17) * 2 - 1) * amp;
        norm += amp;
        amp *= 0.55;
        f *= 2;
      }
      h[y * size + x] = (n / norm) * 0.75;
    }
  }
  // Tiny pits stamped in (wrapping).
  const pits = 140;
  for (let i = 0; i < pits; i++) {
    const cx = hash(i, 3, S) * size; const cy = hash(i, 7, S) * size;
    const r = 3 + hash(i, 11, S) * 14;
    const dpt = 0.35 + hash(i, 13, S) * 0.5;
    for (let y = -r * 1.6; y <= r * 1.6; y++) {
      for (let x = -r * 1.6; x <= r * 1.6; x++) {
        const d = Math.hypot(x, y);
        const q = d / r;
        if (q > 1.6) continue;
        const px = ((Math.round(cx + x) % size) + size) % size;
        const py = ((Math.round(cy + y) % size) + size) % size;
        const bowl = q < 1 ? -(1 - q * q) * (1 - q * q) : 0;
        const rim = q > 0.6 && q < 1.6 ? 0.28 * (1 - Math.abs(q - 1.05) / 0.55) : 0;
        h[py * size + px] += dpt * (bowl + Math.max(0, rim));
      }
    }
  }
  const map = document.createElement('canvas');
  map.width = map.height = size;
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = size;
  const rgh = document.createElement('canvas');
  rgh.width = rgh.height = size;
  const mc = map.getContext('2d')!; const nc = nrm.getContext('2d')!; const rc = rgh.getContext('2d')!;
  const mi = mc.createImageData(size, size); const ni = nc.createImageData(size, size); const ri = rc.createImageData(size, size);
  const at = (x: number, y: number) => h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = at(x, y);
      const grain = hash(x, y, 91) - 0.5;
      const clast = hash(x, y, 97) > 0.9965 ? 0.45 : 0;
      // Albedo: mid grey, a little warmer in the dips, sparkly clasts.
      const base = 0.76 + v * 0.09 + grain * 0.06 + clast;
      const g = Math.max(0, Math.min(1, base));
      mi.data[i] = Math.round(g * 255 * 1.0);
      mi.data[i + 1] = Math.round(g * 255 * 0.985);
      mi.data[i + 2] = Math.round(g * 255 * 0.975);
      mi.data[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.6 + grain * 0.3;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.6 + (hash(x, y, 93) - 0.5) * 0.3;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      ni.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      ni.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
      ni.data[i + 3] = 255;
      const r = Math.max(0, Math.min(1, 0.9 - clast * 0.8 + grain * 0.1));
      ri.data[i] = ri.data[i + 1] = ri.data[i + 2] = Math.round(r * 255);
      ri.data[i + 3] = 255;
    }
  }
  mc.putImageData(mi, 0, 0); nc.putImageData(ni, 0, 0); rc.putImageData(ri, 0, 0);
  const out = [map, nrm, rgh];
  canvasCache.set(size, out);
  return out;
}

function regolithMaps(size: number): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const [map, nrm, rgh] = regolithCanvases(size);
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(map, true), normal: tex(nrm, false), rough: tex(rgh, false) };
}

/** A boulder: angular breccia whose edges micrometeorites have rounded. The
 *  sphere is welded first, so it shades smooth, then cut by a few fracture
 *  planes (the flats a rock breaks along) before the noise roughens it. */
function rockGeometry(seed: number, detail: number): THREE.BufferGeometry {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const sx = 0.7 + hash(seed, 1, 5) * 0.6; const sy = 0.55 + hash(seed, 2, 5) * 0.4; const sz = 0.7 + hash(seed, 3, 5) * 0.6;
  const cuts = Array.from({ length: 5 }, (_, k) => {
    const a = hash(seed, 10 + k, 7) * Math.PI * 2; const b = (hash(seed, 20 + k, 7) - 0.3) * 1.6;
    return { n: new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)), d: 0.62 + hash(seed, 30 + k, 7) * 0.22 };
  });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Fracture faces: a softened clamp, so the flat meets the round without a crease.
    for (const c of cuts) {
      const over = v.dot(c.n) - c.d;
      if (over > 0) v.addScaledVector(c.n, -over * (1 - 0.35 * Math.exp(-over * 12)));
    }
    const n = 1 + fbm(v.x * 1.7 + seed, v.y * 1.7 + v.z * 0.9, 4, seed + 40) * 0.3 + fbm(v.x * 6 + seed, v.z * 6 - v.y * 3, 2, seed + 44) * 0.08;
    v.multiplyScalar(n);
    // Flatten the underside so it sits in the dust rather than on a point.
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.25;
    v.x *= sx; v.y *= sy; v.z *= sz;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Welding took the sphere's UVs: project new ones off the shape, for the grain.
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 0.9 + pos.getZ(i) * 0.4;
    uv[i * 2 + 1] = pos.getY(i) * 0.9 + pos.getZ(i) * 0.5;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** 0 inside, 1 at the horizon ring's outer edge (1500 m): how far its
 *  ground has come back down to the datum, where the globe meets it. */
export function ringEdge(r: number): number {
  const k = THREE.MathUtils.clamp((r - 1040) / 440, 0, 1);
  return k * k * (3 - 2 * k);
}

/**
 * Beyond the playable square: a ring of hills out to the horizon, sharing
 * the terrain's material, sitting just under the square where they overlap
 * so the near ground always wins, and rising into mountains past it.
 */
export function makeMoonHorizon(terrain: TerrainHandle, lite: boolean): THREE.Mesh {
  const inner = 172;
  const outer = 1500;
  const geom = new THREE.RingGeometry(inner, outer, lite ? 96 : 160, lite ? 10 : 18);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const seed = 2026;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const near = terrain.heightAt(x, z) - 0.08;
    const hills = fbm(x / 260, z / 260, 4, seed + 71) * 34 + ridged(x / 520 + 9, z / 520, seed + 77) * 46 * Math.min(1, (r - 300) / 600);
    const k = r <= 250 ? 0 : Math.min(1, (r - 250) / 90);
    const t = k * k * (3 - 2 * k);
    // The hills settle back to the datum by the ring's outer edge, where the
    // globe (planet-globe.ts: flat to the datum for 8 km round the site)
    // takes the ground on: no step at the seam, no wall from above.
    pos.setY(i, (near * (1 - t) + hills * t) * (1 - ringEdge(r)));
    const v = 0.95 + fbm(x / 120, z / 120, 3, seed + 33) * 0.1;
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  // Tile the regolith off world position, at the same six metres a tile the
  // near ground uses: anything else puts a visible seam where the two meet,
  // and from a hundred metres up on the way down you look straight at it.
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
  const mesh = new THREE.Mesh(geom, terrain.mesh.material);
  mesh.receiveShadow = true;
  mesh.name = 'moon-horizon';
  return mesh;
}

/** `density` scales the rock count (the preset's prop density). */
export function makeMoonTerrain(lite: boolean, density = 1): TerrainHandle {
  const N = lite ? 160 : 320;
  const size = TERRAIN_SIZE;
  const half = size / 2;
  const cell = size / N;
  const heights = new Float32Array((N + 1) * (N + 1));
  const seed = 2026;

  // Old craters, none on the pad.
  const craters: Crater[] = [];
  for (let i = 0; i < 46; i++) {
    const r = 2.5 + Math.pow(hash(i, 21, seed), 2.2) * 26;
    const x = (hash(i, 22, seed) - 0.5) * size * 0.92;
    const z = (hash(i, 23, seed) - 0.5) * size * 0.92;
    if (Math.hypot(x - PAD_CENTER.x, z - PAD_CENTER.y) < PAD_RADIUS + r * 1.6) continue;
    craters.push({ x, z, r, depth: r * (0.14 + hash(i, 24, seed) * 0.1) });
  }
  // Small craters — the ground is pocked at every scale.
  const small: Crater[] = [];
  for (let i = 0; i < 420; i++) {
    const r = 0.9 + Math.pow(hash(i, 61, seed), 1.6) * 3.6;
    const x = (hash(i, 62, seed) - 0.5) * size * 0.96;
    const z = (hash(i, 63, seed) - 0.5) * size * 0.96;
    if (Math.hypot(x - PAD_CENTER.x, z - PAD_CENTER.y) < 14) continue;
    small.push({ x, z, r, depth: r * (0.16 + hash(i, 64, seed) * 0.12) });
  }
  // Every crater filed under each 16 m cell its rim reaches, so a height
  // sample looks at the handful nearby instead of all four hundred.
  const BIN = 16;
  const bins = Math.ceil(size / BIN) + 1;
  const craterBins: Crater[][] = Array.from({ length: bins * bins }, () => []);
  const binOf = (v: number) => THREE.MathUtils.clamp(Math.floor((v + half) / BIN), 0, bins - 1);
  for (const c of [...craters, ...small]) {
    const reach = c.r * 1.55;
    for (let gz = binOf(c.z - reach); gz <= binOf(c.z + reach); gz++) {
      for (let gx = binOf(c.x - reach); gx <= binOf(c.x + reach); gx++) craterBins[gz * bins + gx].push(c);
    }
  }
  const rawHeight = (x: number, z: number): number => {
    let h = fbm(x / 95, z / 95, 4, seed) * 7.5;
    // A long rim ridge across the western side — the horizon in the reference.
    const ridgeD = Math.abs((x + 0.55 * z) / 1.14 + 68);
    const ridgeMask = Math.exp(-(ridgeD * ridgeD) / (2 * 28 * 28));
    if (ridgeMask > 1e-4) h += ridged(x / 60 + 3.1, z / 60, seed + 5) * 7.5 * ridgeMask;
    // Small relief stays soft: under a low sun a sharp sub-metre bump reads as ripples, and regolith is powder.
    h += fbm(x / 9, z / 9, 3, seed + 9) * 0.42;
    h += fbm(x / 2.2, z / 2.2, 2, seed + 13) * 0.045;
    for (const c of craterBins[binOf(z) * bins + binOf(x)]) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.r * 1.55) h += craterProfile(d, c);
    }
    return h;
  };
  const padHeight = rawHeight(PAD_CENTER.x, PAD_CENTER.y) * 0.3;
  const scopeLevel = rawHeight(TELESCOPE_PAD.x, TELESCOPE_PAD.z);
  const heightFn = (x: number, z: number): number => {
    const ds = Math.hypot(x - TELESCOPE_PAD.x, z - TELESCOPE_PAD.z);
    if (ds < TELESCOPE_PAD.r + 8) {
      const t = ds <= TELESCOPE_PAD.r ? 0 : smooth((ds - TELESCOPE_PAD.r) / 8);
      return scopeLevel + (rawHeight(x, z) - scopeLevel) * t;
    }
    const h = rawHeight(x, z);
    const d = Math.hypot(x - PAD_CENTER.x, z - PAD_CENTER.y);
    if (d >= PAD_RADIUS + 22) return h;
    const t = d <= PAD_RADIUS ? 0 : smooth((d - PAD_RADIUS) / 22);
    const flat = padHeight + fbm(x / 2.2, z / 2.2, 2, seed + 13) * 0.05;
    return flat + (h - flat) * t;
  };
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      heights[j * (N + 1) + i] = heightFn(-half + i * cell, -half + j * cell);
    }
  }

  const heightAt = (x: number, z: number): number => {
    const fx = THREE.MathUtils.clamp((x + half) / cell, 0, N - 1e-6);
    const fz = THREE.MathUtils.clamp((z + half) / cell, 0, N - 1e-6);
    const i = Math.floor(fx); const j = Math.floor(fz);
    const tx = fx - i; const tz = fz - j;
    const h00 = heights[j * (N + 1) + i]; const h10 = heights[j * (N + 1) + i + 1];
    const h01 = heights[(j + 1) * (N + 1) + i]; const h11 = heights[(j + 1) * (N + 1) + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
  const normalAt = (x: number, z: number, out: THREE.Vector3): THREE.Vector3 => {
    const e = 0.6;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return out.set(-dx, 2 * e, -dz).normalize();
  };

  const geom = new THREE.PlaneGeometry(size, size, N, N);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const writeVertex = (i: number) => {
    const x = pos.getX(i); const z = pos.getZ(i);
    const gi = Math.round((x + half) / cell); const gj = Math.round((z + half) / cell);
    pos.setY(i, heights[gj * (N + 1) + gi]);
  };
  for (let i = 0; i < pos.count; i++) {
    writeVertex(i);
    const x = pos.getX(i); const z = pos.getZ(i);
    // Macro albedo: darker maria patches, brighter crater floors, a faint
    // bright halo on the pad where the landers have scattered dust.
    let v = 0.96 + fbm(x / 40, z / 40, 3, seed + 33) * 0.2 + fbm(x / 7, z / 7, 2, seed + 35) * 0.03;
    // Old craters: floors a shade darker, and round the bigger ones a
    // brighter blanket of ejecta thrown out in rays — fresh, unweathered
    // material that stands well clear of the mature regolith round it.
    for (const c of craters) {
      const dx = x - c.x; const dz = z - c.z;
      if (dx > c.r * 2.4 || dx < -c.r * 2.4 || dz > c.r * 2.4 || dz < -c.r * 2.4) continue;
      const q = Math.hypot(dx, dz) / c.r;
      if (q < 0.85) v -= 0.07 * (1 - q / 0.85);
      else if (c.r > 5 && q < 2.4) {
        const ang = Math.atan2(dz, dx);
        const rays = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(ang * 7 + c.x * 0.3) * Math.sin(ang * 3 + c.z * 0.2), 1.6);
        v += 0.13 * Math.pow(1 - (q - 0.85) / 1.55, 1.3) * rays;
      }
    }
    const d = Math.hypot(x - PAD_CENTER.x, z - PAD_CENTER.y);
    if (d < PAD_RADIUS + 10) v += 0.06 * (1 - d / (PAD_RADIUS + 10));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = THREE.MathUtils.clamp(v, 0.64, 1.14);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Normals straight off the heightfield, so a fresh crater can re-light
  // just the ground it dug instead of the whole map.
  const nrmAttr = geom.attributes.normal as THREE.BufferAttribute;
  const writeNormal = (i: number, j: number) => {
    const il = Math.max(0, i - 1); const ir = Math.min(N, i + 1);
    const jd = Math.max(0, j - 1); const ju = Math.min(N, j + 1);
    const dx = (heights[j * (N + 1) + ir] - heights[j * (N + 1) + il]) / ((ir - il) * cell);
    const dz = (heights[ju * (N + 1) + i] - heights[jd * (N + 1) + i]) / ((ju - jd) * cell);
    const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
    nrmAttr.setXYZ(j * (N + 1) + i, -dx * inv, inv, -dz * inv);
  };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) writeNormal(i, j);
  const uv = geom.attributes.uv as THREE.BufferAttribute;
  const repeat = size / 6;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repeat, uv.getY(i) * repeat);

  const maps = regolithMaps(lite ? 512 : 1024);
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: maps.rough,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    color: 0xe2e0dc,
  });
  // Regolith is retro-reflective: it brightens sharply when the Sun is
  // behind the viewer (the opposition surge — why the ground round your own
  // shadow glows in Apollo photographs). A second, finer normal sample
  // breaks the tiling so the same grain never lines up twice.
  // At a grazing angle — the ground a long way off, seen nearly edge-on — a
  // third, finer sample projected off the world position adds the grain
  // the tiled map has run out of, without changing the ground underfoot.
  const sunView = { value: new THREE.Vector3(0, 1, 0) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunView = sunView;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMoonPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvMoonPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunView; varying vec3 vMoonPos;')
      .replace('#include <normal_fragment_maps>', `
        vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 6.37 + vec2(0.31, 0.77) ).xyz * 2.0 - 1.0;
        float graze = pow( 1.0 - max( dot( normal, normalize( vViewPosition ) ), 0.0 ), 3.0 );
        vec3 mapN3 = texture2D( normalMap, vMoonPos.xz * 0.61 + vec2( 0.13, 0.49 ) ).xyz * 2.0 - 1.0;
        mapN = normalize( vec3( mapN.xy * normalScale + mapN2.xy * normalScale * 0.35 + mapN3.xy * normalScale * 0.45 * graze, mapN.z * mapN2.z ) );
        normal = normalize( tbn * mapN );`)
      .replace('#include <lights_fragment_begin>', `
        {
          vec3 V = normalize( -vViewPosition );
          float surge = pow( max( dot( V, uSunView ), 0.0 ), 10.0 );
          diffuseColor.rgb *= 1.0 + 0.42 * surge;
        }
        #include <lights_fragment_begin>`);
  };
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'moon-terrain';

  // Rocks: three cuts, a few hundred seats. Small stuff everywhere, boulders
  // only out on the plain and up the ridge.
  const rockGeoms = [rockGeometry(1, lite ? 1 : 2), rockGeometry(2, lite ? 1 : 2), rockGeometry(3, lite ? 1 : 2)];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0xa8a5a0, roughness: 0.92, metalness: 0.02, normalMap: maps.normal, normalScale: new THREE.Vector2(0.8, 0.8) });
  // A boulder's grain at two scales, so a two-metre block reads as pitted
  // breccia rather than a smooth stone wearing the ground's texture.
  rockMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 4.13 + vec2( 0.17, 0.61 ) ).xyz * 2.0 - 1.0;
      mapN = normalize( vec3( mapN.xy * normalScale + mapN2.xy * normalScale * 0.6, mapN.z * mapN2.z ) );
      normal = normalize( tbn * mapN );`);
  };
  rockMat.customProgramCacheKey = () => 'moon-rock';
  const perCut = Math.round((lite ? 90 : 180) * density);
  const rocks = new THREE.Group();
  rocks.name = 'moon-rocks';
  const instanced: THREE.InstancedMesh[] = [];
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const spin = new THREE.Quaternion();
  const s = new THREE.Vector3(); const p = new THREE.Vector3();
  const nrm = new THREE.Vector3(); const up = new THREE.Vector3(0, 1, 0);
  // Every rock remembers its seat, so a new crater can re-seat it and a path can clear it.
  interface Seat { im: THREE.InstancedMesh | null; k: number; x: number; z: number; spin: number; sx: number; sy: number; sz: number; sink: number; gone: boolean }
  const seats: Seat[] = [];
  const seatMatrix = (st: Seat) => {
    p.set(st.x, heightAt(st.x, st.z) - st.sink, st.z);
    normalAt(st.x, st.z, nrm);
    q.setFromUnitVectors(up, nrm);
    spin.setFromAxisAngle(up, st.spin);
    q.multiply(spin);
    s.set(st.sx, st.sy, st.sz);
    if (st.gone) s.setScalar(0);
    return m.compose(p, q, s);
  };
  // Rocks are filed into a grid of chunks, each its own instanced mesh with
  // a tight bounding sphere: the view and the shadow camera then only draw
  // the chunks they can see, instead of every rock on the map every pass.
  const CHUNKS = 3;
  const chunkOf = (v: number) => THREE.MathUtils.clamp(Math.floor((v + half) / size * CHUNKS), 0, CHUNKS - 1);
  rockGeoms.forEach((rg, cut) => {
    const buckets: Seat[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
    let placed = 0;
    for (let i = 0; i < perCut * 5 && placed < perCut; i++) {
      const k = i + cut * 1000;
      const x = (hash(k, 51, seed) - 0.5) * size * 0.95;
      const z = (hash(k, 52, seed) - 0.5) * size * 0.95;
      const d = Math.hypot(x - PAD_CENTER.x, z - PAD_CENTER.y);
      const big = Math.pow(hash(k, 53, seed), 3);
      const scale = 0.18 + big * 2.6;
      if (d < PAD_RADIUS && scale > 0.5) continue;
      if (d < 12) continue;
      const st: Seat = {
        im: null, k: 0, x, z, spin: hash(k, 54, seed) * Math.PI * 2, sink: scale * 0.22, gone: false,
        sx: scale * (0.8 + hash(k, 55, seed) * 0.5), sy: scale * (0.7 + hash(k, 56, seed) * 0.5), sz: scale * (0.8 + hash(k, 57, seed) * 0.5),
      };
      buckets[chunkOf(z) * CHUNKS + chunkOf(x)].push(st);
      placed += 1;
    }
    for (const bucket of buckets) {
      if (bucket.length === 0) continue;
      const im = new THREE.InstancedMesh(rg, rockMat, bucket.length);
      im.castShadow = true;
      im.receiveShadow = true;
      bucket.forEach((st, k) => { st.im = im; st.k = k; seats.push(st); im.setMatrixAt(k, seatMatrix(st)); });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      rocks.add(im);
      instanced.push(im);
    }
  });

  const stampCrater = (cx: number, cz: number, r: number, depth: number) => {
    const c: Crater = { x: cx, z: cz, r, depth };
    const i0 = Math.max(0, Math.floor((cx - r * 1.6 + half) / cell));
    const i1 = Math.min(N, Math.ceil((cx + r * 1.6 + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - r * 1.6 + half) / cell));
    const j1 = Math.min(N, Math.ceil((cz + r * 1.6 + half) / cell));
    const col = geom.attributes.color as THREE.BufferAttribute;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = -half + i * cell; const z = -half + j * cell;
        const d = Math.hypot(x - cx, z - cz);
        if (d >= r * 1.55) continue;
        const k = j * (N + 1) + i;
        heights[k] += craterProfile(d, c);
        pos.setY(k, heights[k]);
        // Fresh ejecta is brighter than the weathered surface.
        const bright = 1 + 0.12 * (1 - d / (r * 1.55));
        col.setXYZ(k, Math.min(1.1, col.getX(k) * bright), Math.min(1.1, col.getY(k) * bright), Math.min(1.1, col.getZ(k) * bright));
      }
    }
    const jLo = Math.max(0, j0 - 1); const jHi = Math.min(N, j1 + 1);
    for (let j = jLo; j <= jHi; j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(N, i1 + 1); i++) writeNormal(i, j);
    // Upload the rows that changed, not the whole map.
    const start = jLo * (N + 1) * 3; const count = (jHi - jLo + 1) * (N + 1) * 3;
    for (const a of [pos, col, nrmAttr]) { a.addUpdateRange(start, count); a.needsUpdate = true; }
    // The rocks agree with the ground: the small ones in the bowl are blown
    // out with the ejecta, everything on the rim settles onto its new slope.
    reseat((st) => {
      const d = Math.hypot(st.x - cx, st.z - cz);
      if (d >= r * 1.6) return false;
      if (d < r * 0.9 && st.sy < r * 0.5) st.gone = true;
      return true;
    });
  };

  /** Re-seat the rocks `pick` marks, and upload only the chunks it touched. */
  const reseat = (pick: (st: Seat) => boolean) => {
    const touched = new Set<THREE.InstancedMesh>();
    for (const st of seats) {
      if (st.gone || !st.im || !pick(st)) continue;
      st.im.setMatrixAt(st.k, seatMatrix(st));
      touched.add(st.im);
    }
    for (const im of touched) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  };

  const punch = (cx: number, cz: number, r: number, depth: number) => {
    const i0 = Math.max(0, Math.floor((cx - r + half) / cell)); const i1 = Math.min(N, Math.ceil((cx + r + half) / cell));
    const j0 = Math.max(0, Math.floor((cz - r + half) / cell)); const j1 = Math.min(N, Math.ceil((cz + r + half) / cell));
    const col = geom.attributes.color as THREE.BufferAttribute;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(-half + i * cell - cx, -half + j * cell - cz);
        if (d >= r) continue;
        const k = j * (N + 1) + i;
        const q = smooth(Math.min(1, (r - d) / (r * 0.35)));
        heights[k] -= depth * q;
        pos.setY(k, heights[k]);
        const dark = 1 - q * 0.92;
        col.setXYZ(k, col.getX(k) * dark, col.getY(k) * dark, col.getZ(k) * dark);
      }
    }
    const jLo = Math.max(0, j0 - 1); const jHi = Math.min(N, j1 + 1);
    for (let j = jLo; j <= jHi; j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(N, i1 + 1); i++) writeNormal(i, j);
    const start = jLo * (N + 1) * 3; const count = (jHi - jLo + 1) * (N + 1) * 3;
    for (const a of [pos, col, nrmAttr]) { a.addUpdateRange(start, count); a.needsUpdate = true; }
  };

  const colAttr = geom.attributes.color as THREE.BufferAttribute;
  /** Scale vertex colours in a box by 1 + k·falloff(distance). */
  const shade = (x0: number, z0: number, x1: number, z1: number, falloff: (x: number, z: number) => number, k: number) => {
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)); const i1 = Math.min(N, Math.ceil((x1 + half) / cell));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell)); const j1 = Math.min(N, Math.ceil((z1 + half) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const f = falloff(-half + i * cell, -half + j * cell);
        if (f <= 0) continue;
        const idx = j * (N + 1) + i;
        // A little grain in the edge so it reads as worn ground, not paint.
        const g = 1 + k * f * (0.8 + hash(i, j, 404) * 0.4);
        colAttr.setXYZ(idx, colAttr.getX(idx) * g, colAttr.getY(idx) * g, colAttr.getZ(idx) * g);
      }
    }
    colAttr.needsUpdate = true;
  };
  const tint = (x: number, z: number, r: number, k: number) => {
    shade(x - r, z - r, x + r, z + r, (px, pz) => 1 - smooth(Math.min(1, Math.hypot(px - x, pz - z) / r)), k);
  };
  const tintPath = (pts: [number, number][], width: number, k: number) => {
    let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    shade(x0 - width, z0 - width, x1 + width, z1 + width, (px, pz) => {
      let best = Infinity;
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s]; const [bx, bz] = pts[s + 1];
        const vx = bx - ax; const vz = bz - az;
        const t = THREE.MathUtils.clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
        best = Math.min(best, Math.hypot(px - ax - vx * t, pz - az - vz * t));
      }
      return 1 - smooth(Math.min(1, best / width));
    }, k);
  };

  const clearRocks = (pts: [number, number][], width: number) => {
    reseat((st) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i]; const [bx, bz] = pts[i + 1];
        const vx = bx - ax; const vz = bz - az;
        const t = THREE.MathUtils.clamp(((st.x - ax) * vx + (st.z - az) * vz) / (vx * vx + vz * vz || 1), 0, 1);
        if (Math.hypot(st.x - ax - vx * t, st.z - az - vz * t) < width + st.sx) { st.gone = true; return true; }
      }
      return false;
    });
  };

  return {
    mesh, rocks, heightAt, normalAt, stampCrater, punch, tint, tintPath, clearRocks,
    setSunView(v) { sunView.value.copy(v); },
    dispose() {
      geom.dispose(); mat.dispose();
      maps.map.dispose(); maps.normal.dispose(); maps.rough.dispose();
      for (const g of rockGeoms) g.dispose();
      rockMat.dispose();
      for (const im of instanced) im.dispose();
    },
  };
}
