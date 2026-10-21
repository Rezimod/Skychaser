// How high the ground is, anywhere on the globe: one function per world,
// asked for a unit direction in the body-fixed frame (planet-frame.ts) and
// the spacing of the grid that will draw it.
//
// The spacing matters. A chunk whose vertices are 3 km apart cannot show a
// 400 m crater; asking for it anyway only aliases into noise that crawls as
// the camera moves. So every layer here is band-limited by `detailM`: an
// octave or a crater scale that the grid cannot resolve is left out, and the
// smallest one it can is faded in, so a chunk and its four children agree on
// everything the parent could draw and the children add only what is new.
//
// The Moon and Mars are procedural (deterministic, so every player sees the
// same planet and a chunk rebuilt from the cache matches the one it
// replaces). Earth is real elevation, streamed (planet-globe-terrarium.ts);
// this module only shapes what the terrarium store hands back.
//
// Pure: plain numbers in, plain numbers out. No three.js, nothing drawn.

import type { GlobeWorld, PlanetBody } from '@/lib/solar-system/planet-frame';

const DEG = Math.PI / 180;

/** Per-sample context: a chunk build passes one so an Earth sample can say
 *  which tiles it wanted and did not have yet. The procedural worlds ignore it. */
export interface SampleContext {
  /** Terrarium zoom the chunk wants. */
  zoom: number;
  /** Tile keys asked for and not in the store yet. */
  missing: Set<number>;
}

export interface HeightField {
  readonly world: GlobeWorld;
  /** Metres above the reference sphere at the unit direction (x, y, z),
   *  band-limited to a grid of `detailM` metre spacing. */
  sample: (x: number, y: number, z: number, detailM: number, ctx?: SampleContext) => number;
  /** The same function specialised for a patch round the unit direction
   *  (cx, cy, cz) out to `angRadius` radians: a chunk build asks once, then
   *  calls the result for every vertex. Agrees with `sample` everywhere in the patch. */
  region: (cx: number, cy: number, cz: number, angRadius: number, detailM: number, ctx?: SampleContext) =>
    (x: number, y: number, z: number) => number;
  /** Everything `sample` can return lies inside these, m. Horizon culling
   *  leans on `min`: the planet can hide nothing behind a sphere lower than it. */
  readonly min: number;
  readonly max: number;
  /** Heights below this are drawn at it (Earth's sea level); −Infinity elsewhere. */
  readonly floor: number;
}

// ── Direction helpers ─────────────────────────────────────────────────────

/** Latitude and longitude of a unit direction, degrees (east-positive). */
export function dirToLatLon(x: number, y: number, z: number): [number, number] {
  const lat = Math.asin(Math.max(-1, Math.min(1, z))) / DEG;
  const lon = Math.atan2(y, x) / DEG;
  return [lat, lon];
}

/** Unit direction of a latitude and longitude, degrees. */
export function latLonToDir(lat: number, lon: number): [number, number, number] {
  const la = lat * DEG; const lo = lon * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

/** Angle between two unit directions, radians. atan2 of the cross and dot
 *  products keeps its precision for the small angles the site work lives on,
 *  where acos of a dot a hair under 1 does not. */
export function angleBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const cx = ay * bz - az * by; const cy = az * bx - ax * bz; const cz = ax * by - ay * bx;
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ax * bx + ay * by + az * bz);
}

/** The site's frame as plain numbers: up, east, north (unit). */
export interface SiteAxes {
  up: [number, number, number];
  east: [number, number, number];
  north: [number, number, number];
}

export function siteAxes(lat: number, lon: number): SiteAxes {
  const la = lat * DEG; const lo = lon * DEG;
  return {
    up: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
    east: [-Math.sin(lo), Math.cos(lo), 0],
    north: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)],
  };
}

/**
 * A surface scene's local point (metres, east +X, north −Z) as a direction
 * from the planet's centre. The scene's ground is flat and dropped by
 * `curvatureDrop` at range, which puts the point at local (x, z) on the
 * sphere exactly where an orthographic projection onto the site's tangent
 * plane would: so that is the inverse used here.
 */
export function localToDir(axes: SiteAxes, radiusM: number, localX: number, localZ: number): [number, number, number] {
  const e = localX / radiusM; const n = -localZ / radiusM;
  const u = Math.sqrt(Math.max(0, 1 - e * e - n * n));
  const x = axes.up[0] * u + axes.east[0] * e + axes.north[0] * n;
  const y = axes.up[1] * u + axes.east[1] * e + axes.north[1] * n;
  const z = axes.up[2] * u + axes.east[2] * e + axes.north[2] * n;
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/** The inverse: a direction's orthographic local (x, z), metres. */
export function dirToLocal(axes: SiteAxes, radiusM: number, x: number, y: number, z: number): [number, number] {
  const e = x * axes.east[0] + y * axes.east[1] + z * axes.east[2];
  const n = x * axes.north[0] + y * axes.north[1] + z * axes.north[2];
  return [e * radiusM, -n * radiusM];
}

// ── Noise ─────────────────────────────────────────────────────────────────

/** A 32-bit integer hash of three integers and a seed (murmur-style finaliser). */
export function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x8da6b343) ^ Math.imul(iy | 0, 0xd8163841) ^ Math.imul(iz | 0, 0xcb1ab31f) ^ Math.imul(seed | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

const PERM = (() => {
  // Perlin's improved-noise permutation, shuffled from a fixed seed so the
  // planets never change between builds.
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = 0x9e3779b9;
  for (let i = 255; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
    const j = s % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

// The twelve edge gradients of a cube, repeated to sixteen (Perlin's
// improved noise), as a flat table: a lookup and a dot product beats the
// branchy `grad` of the reference code by a wide margin in V8.
const GRAD = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
]);

/** Improved Perlin noise in 3D, about −1…1. */
export function noise3(x: number, y: number, z: number): number {
  const fx = Math.floor(x); const fy = Math.floor(y); const fz = Math.floor(z);
  const X = fx & 255; const Y = fy & 255; const Z = fz & 255;
  x -= fx; y -= fy; z -= fz;
  const x1 = x - 1; const y1 = y - 1; const z1 = z - 1;
  const u = x * x * x * (x * (x * 6 - 15) + 10);
  const v = y * y * y * (y * (y * 6 - 15) + 10);
  const w = z * z * z * (z * (z * 6 - 15) + 10);
  const P = PERM; const G = GRAD;
  const A = P[X] + Y; const AA = P[A] + Z; const AB = P[A + 1] + Z;
  const B = P[X + 1] + Y; const BA = P[B] + Z; const BB = P[B + 1] + Z;
  let g = (P[AA] & 15) * 3; const n000 = G[g] * x + G[g + 1] * y + G[g + 2] * z;
  g = (P[BA] & 15) * 3; const n100 = G[g] * x1 + G[g + 1] * y + G[g + 2] * z;
  g = (P[AB] & 15) * 3; const n010 = G[g] * x + G[g + 1] * y1 + G[g + 2] * z;
  g = (P[BB] & 15) * 3; const n110 = G[g] * x1 + G[g + 1] * y1 + G[g + 2] * z;
  g = (P[AA + 1] & 15) * 3; const n001 = G[g] * x + G[g + 1] * y + G[g + 2] * z1;
  g = (P[BA + 1] & 15) * 3; const n101 = G[g] * x1 + G[g + 1] * y + G[g + 2] * z1;
  g = (P[AB + 1] & 15) * 3; const n011 = G[g] * x + G[g + 1] * y1 + G[g + 2] * z1;
  g = (P[BB + 1] & 15) * 3; const n111 = G[g] * x1 + G[g + 1] * y1 + G[g + 2] * z1;
  const l1 = n000 + u * (n100 - n000);
  const l2 = n010 + u * (n110 - n010);
  const l3 = n001 + u * (n101 - n001);
  const l4 = n011 + u * (n111 - n011);
  const m1 = l1 + v * (l2 - l1);
  const m2 = l3 + v * (l4 - l3);
  return m1 + w * (m2 - m1);
}

/** How much of a feature of wavelength (or radius) `sizeM` a grid of
 *  `detailM` spacing should draw: none under two cells, all past five. */
export function bandWeight(sizeM: number, detailM: number): number {
  const t = (sizeM / Math.max(1e-6, detailM) - 2) / 3;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Fractal sum over octaves from `wavelengthKm` down, stopping at the grid's
 * limit or once an octave's amplitude is under `minAmpM`. Point in km.
 * Returns metres. `ridged` folds each octave into sharp crests.
 */
export function fbm(
  qx: number, qy: number, qz: number, wavelengthKm: number, ampM: number,
  detailM: number, gain = 0.5, minAmpM = 0.5, offset = 0, ridged = false,
): number {
  let sum = 0; let lam = wavelengthKm; let amp = ampM; let o = offset;
  for (let i = 0; i < 20; i++) {
    const w = bandWeight(lam * 1000, detailM);
    if (w <= 0 || amp < minAmpM) break;
    const f = 1 / lam;
    let n = noise3(qx * f + o, qy * f - o * 0.7, qz * f + o * 1.3);
    if (ridged) n = 1 - Math.abs(n) * 2;
    sum += n * amp * w;
    lam *= 0.5; amp *= gain; o += 17.31;
  }
  return sum;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// ── Craters ───────────────────────────────────────────────────────────────

export interface CraterScale {
  /** Radius range, km. */
  rMin: number;
  rMax: number;
  /** Chance a cell holds a crater (before the mare/erosion factors). */
  density: number;
  /** Fresh (1) to eroded (0): rim height and sharpness, lower bound of the random age. */
  freshMin: number;
  seed: number;
}

/** One crater: the centre of its ball (km, near the sphere), radius km, freshness 0…1. */
export interface Crater { x: number; y: number; z: number; r: number; fresh: number }

/** Depth of a crater of radius r km, m: simple bowls are about a fifth of their
 *  diameter deep, big complex craters much shallower, and none deeper than 4 km. */
export function craterDepthM(rKm: number): number {
  const ratio = Math.min(0.4, 0.4 * Math.pow(Math.max(rKm, 1e-3) / 2, -0.45));
  return Math.min(4000, Math.max(0.03, ratio) * rKm * 1000);
}

/**
 * A crater's profile against x = distance / radius: a bowl (flat-floored
 * when the crater is big), a raised rim at x = 1, and an ejecta blanket
 * falling off as x⁻³ out to 2.2 radii, where it is exactly zero so the
 * gathering below can stop there. Metres.
 */
export function craterProfile(x: number, depthM: number, fresh: number, rKm: number): number {
  if (x >= 2.2) return 0;
  const rim = depthM * (0.12 + 0.2 * fresh);
  if (x < 1) {
    const floor = rKm > 8 ? Math.min(0.55, 0.2 + rKm / 200) : 0;
    const t = Math.max(0, (x - floor) / (1 - floor));
    let h = -depthM + (depthM + rim) * Math.pow(t, 1.6 + 1.4 * fresh);
    // Central peak in the big ones.
    if (rKm > 12) h += depthM * 0.35 * Math.exp(-(x * x) / 0.012);
    return h;
  }
  return rim * Math.pow(x, -3 - 3 * fresh) * (1 - smoothstep(1.5, 2.2, x));
}

/**
 * The craters of one size class that can reach a ball of radius `rhoKm`
 * round the point q (km). Space is cut into cubes of 4.4 × rMax; each holds
 * at most one crater, centred at a hashed point inside it, whose ball meets
 * the sphere in the crater's rim circle. Two such lattices, offset by half a
 * cube, double the count. Gathering once per chunk and then testing every
 * vertex against the short list is what keeps a 33 × 33 build under a
 * couple of milliseconds; the answer is the same as testing every cube.
 * `densityAt` scales the chance per crater (the maria keep fewer).
 */
export function gatherCraters(
  s: CraterScale, qx: number, qy: number, qz: number, rhoKm: number,
  densityAt: ((x: number, y: number, z: number) => number) | null, out: Crater[],
): void {
  const cell = 4.4 * s.rMax;
  const reach = rhoKm + 2.2 * s.rMax;
  for (let lattice = 0; lattice < 2; lattice++) {
    const off = lattice * 0.5 * cell;
    const seed = s.seed + lattice * 7919;
    const x0 = Math.floor((qx + off - reach) / cell); const x1 = Math.floor((qx + off + reach) / cell);
    const y0 = Math.floor((qy + off - reach) / cell); const y1 = Math.floor((qy + off + reach) / cell);
    const z0 = Math.floor((qz + off - reach) / cell); const z1 = Math.floor((qz + off + reach) / cell);
    for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) for (let iz = z0; iz <= z1; iz++) {
      const h0 = hash3(ix, iy, iz, seed);
      const roll = (h0 & 0xffff) / 65536;
      if (roll >= s.density) continue;
      const h1 = hash3(ix, iy, iz, seed + 1);
      const h2 = hash3(ix, iy, iz, seed + 2);
      const cx = (ix + (h1 & 0xffff) / 65536) * cell - off;
      const cy = (iy + (h1 >>> 16) / 65536) * cell - off;
      const cz = (iz + (h2 & 0xffff) / 65536) * cell - off;
      const r = s.rMin + (s.rMax - s.rMin) * Math.pow((h2 >>> 16) / 65536, 2.2);
      const dx = cx - qx; const dy = cy - qy; const dz = cz - qz;
      const lim = rhoKm + 2.2 * r;
      if (dx * dx + dy * dy + dz * dz >= lim * lim) continue;
      if (densityAt && roll >= s.density * densityAt(cx, cy, cz)) continue;
      const fresh = s.freshMin + (1 - s.freshMin) * ((hash3(ix, iy, iz, seed + 3) & 0xffff) / 65536);
      out.push({ x: cx, y: cy, z: cz, r, fresh });
    }
  }
}

/** The summed profiles of gathered craters at a point on the sphere (km), m. */
export function cratersAt(list: Crater[], qx: number, qy: number, qz: number, detailM: number): number {
  let sum = 0;
  let ql = -1;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    const dx = qx - c.x; const dy = qy - c.y; const dz = qz - c.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const reach = 2.2 * c.r;
    if (d2 >= reach * reach) continue;
    if (ql < 0) ql = Math.sqrt(qx * qx + qy * qy + qz * qz);
    // The ball's centre sits δ off the sphere: its footprint is a smaller circle.
    const along = (dx * qx + dy * qy + dz * qz) / ql;
    const delta2 = along * along;
    const rEff2 = c.r * c.r - delta2;
    if (rEff2 <= c.r * c.r * 0.04) continue;
    const rEff = Math.sqrt(rEff2);
    const x = Math.sqrt(Math.max(0, d2 - delta2)) / rEff;
    if (x >= 2.2) continue;
    const w = bandWeight(rEff * 1000, detailM);
    if (w > 0) sum += craterProfile(x, craterDepthM(rEff), c.fresh, rEff) * w;
  }
  return sum;
}

/** A crater field sampled directly at one point: gather round it, sum. */
export function craterField(
  qx: number, qy: number, qz: number, s: CraterScale, detailM: number, densityScale: number,
): number {
  const w = bandWeight(s.rMin * 1000, detailM);
  if (w <= 0) return 0;
  const list: Crater[] = [];
  gatherCraters(s, qx, qy, qz, 0, densityScale === 1 ? null : () => densityScale, list);
  return cratersAt(list, qx, qy, qz, detailM) * w;
}

// ── Big named features (Mars) ─────────────────────────────────────────────

interface Dome { dir: [number, number, number]; rKm: number; hM: number; caldera: number }
interface Basin { dir: [number, number, number]; rKm: number; depthM: number }

const dome = (lat: number, lon: number, rKm: number, hM: number, caldera = 0.14): Dome =>
  ({ dir: latLonToDir(lat, lon), rKm, hM, caldera });
const basin = (lat: number, lon: number, rKm: number, depthM: number): Basin =>
  ({ dir: latLonToDir(lat, lon), rKm, depthM });

/** Olympus, the Tharsis three, Elysium: broad shields with a caldera on top. */
const MARS_VOLCANOES: Dome[] = [
  dome(18.65, 226.2, 320, 21000, 0.1),
  dome(11.9, 255.5, 200, 11000),
  dome(1.48, 247.0, 190, 9000),
  dome(-8.26, 239.9, 220, 10000),
  dome(24.8, 146.9, 190, 8500),
];
const MARS_BASINS: Basin[] = [
  basin(-42.4, 70.5, 1150, 6500),
  basin(-49.7, 316.0, 900, 3500),
  basin(13.0, 87.0, 620, 2500),
  basin(46.7, 117.5, 1500, 1500),
];
const THARSIS = latLonToDir(2, 255);

interface Seg {
  a: [number, number, number]; b: [number, number, number];
  n: [number, number, number];
  /** Tangents at a (toward b) and at b (toward a): the foot of a point lies
   *  on the arc when it is on the inner side of both. */
  ta: [number, number, number]; tb: [number, number, number];
}
interface Trough { segs: Seg[]; centre: [number, number, number]; cap: number; halfKm: number; depthM: number }

const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function trough(path: [number, number][], halfKm: number, depthM: number): Trough {
  const pts = path.map(([la, lo]) => latLonToDir(la, lo));
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]; const b = pts[i + 1];
    const c = cross(a, b);
    const l = Math.hypot(c[0], c[1], c[2]);
    const n: [number, number, number] = [c[0] / l, c[1] / l, c[2] / l];
    segs.push({ a, b, n, ta: cross(n, a), tb: cross(b, n) });
  }
  let cx = 0; let cy = 0; let cz = 0;
  for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
  const cl = Math.hypot(cx, cy, cz);
  const centre: [number, number, number] = [cx / cl, cy / cl, cz / cl];
  let cap = 0;
  for (const p of pts) cap = Math.max(cap, angleBetween(centre[0], centre[1], centre[2], p[0], p[1], p[2]));
  return { segs, centre, cap, halfKm, depthM };
}

/** Valles Marineris west to east, Kasei Valles, Ma'adim Vallis (lat, lon). */
const MARS_TROUGHS: Trough[] = [
  trough([[-6.5, 262], [-6.8, 270], [-8, 280], [-9.5, 289], [-11, 297], [-12.5, 304], [-12, 311], [-8, 318], [-3.5, 325]], 70, 6000),
  trough([[1, 290], [10, 293], [20, 297], [24, 302], [26, 310]], 45, 2000),
  trough([[-28, 177], [-22, 180], [-16, 182], [-10, 183]], 20, 1800),
];

/** Distance from a direction to a polyline of great-circle arcs, as a chord
 *  of the unit sphere (the angle, to within a part in a thousand at the
 *  widths a canyon is drawn over). */
export function distanceToPath(segs: Seg[], x: number, y: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    let d: number;
    if (x * s.ta[0] + y * s.ta[1] + z * s.ta[2] >= 0 && x * s.tb[0] + y * s.tb[1] + z * s.tb[2] >= 0) {
      d = Math.abs(x * s.n[0] + y * s.n[1] + z * s.n[2]);
    } else {
      const ax = x - s.a[0]; const ay = y - s.a[1]; const az = z - s.a[2];
      const bx = x - s.b[0]; const by = y - s.b[1]; const bz = z - s.b[2];
      d = Math.sqrt(Math.min(ax * ax + ay * ay + az * az, bx * bx + by * by + bz * bz));
    }
    if (d < best) best = d;
  }
  return best;
}

// ── Worlds ────────────────────────────────────────────────────────────────

/** A mare mask: 0 highland … 1 mare, at a latitude and longitude (degrees). */
export type MareMask = (lat: number, lon: number) => number;

const MOON_CRATERS: CraterScale[] = [
  { rMin: 45, rMax: 140, density: 0.55, freshMin: 0.2, seed: 101 },
  { rMin: 14, rMax: 45, density: 0.8, freshMin: 0.25, seed: 211 },
  { rMin: 4.5, rMax: 14, density: 0.9, freshMin: 0.3, seed: 307 },
  { rMin: 1.4, rMax: 4.5, density: 0.9, freshMin: 0.35, seed: 401 },
  { rMin: 0.45, rMax: 1.4, density: 0.9, freshMin: 0.4, seed: 503 },
  { rMin: 0.14, rMax: 0.45, density: 0.9, freshMin: 0.45, seed: 601 },
  { rMin: 0.045, rMax: 0.14, density: 0.85, freshMin: 0.5, seed: 709 },
];

const MARS_CRATERS: CraterScale[] = [
  { rMin: 35, rMax: 110, density: 0.4, freshMin: 0.05, seed: 1103 },
  { rMin: 11, rMax: 35, density: 0.55, freshMin: 0.1, seed: 1201 },
  { rMin: 3.5, rMax: 11, density: 0.6, freshMin: 0.15, seed: 1301 },
  { rMin: 1.1, rMax: 3.5, density: 0.55, freshMin: 0.2, seed: 1409 },
  { rMin: 0.35, rMax: 1.1, density: 0.5, freshMin: 0.25, seed: 1511 },
];

/** A height function specialised for a patch: centre direction, angular
 *  radius (rad) and grid spacing fixed, so the per-vertex work is a loop over
 *  what can actually reach the patch. */
export type RegionSampler = (x: number, y: number, z: number) => number;

/** Crater lists for every scale the grid can draw, gathered round a patch. */
function gatherAll(
  scales: CraterScale[], cx: number, cy: number, cz: number, radiusKm: number, angRadius: number,
  detailM: number, densityFor: ((s: CraterScale) => ((x: number, y: number, z: number) => number) | null),
): { list: Crater[]; w: number }[] {
  const qx = cx * radiusKm; const qy = cy * radiusKm; const qz = cz * radiusKm;
  // A ball a hair wider than the arc. The distances are taken on the
  // reference sphere, so the relief needs no room of its own.
  const rho = angRadius * radiusKm * 1.02 + 1e-3;
  const out: { list: Crater[]; w: number }[] = [];
  for (const s of scales) {
    const w = bandWeight(s.rMin * 1000, detailM);
    if (w <= 0) continue;
    const list: Crater[] = [];
    gatherCraters(s, qx, qy, qz, rho, densityFor(s), list);
    if (list.length) out.push({ list, w });
  }
  return out;
}

/** The raw Moon: rolling highland fbm, maria sunk and smoothed, craters at
 *  seven scales from 140 km down to 45 m. Metres. */
export function moonRegion(
  cx: number, cy: number, cz: number, angRadius: number, detailM: number, radiusKm: number, mare?: MareMask,
): RegionSampler {
  const mareAtKm = mare
    ? (x: number, y: number, z: number) => {
      const l = Math.hypot(x, y, z) || 1;
      const [lat, lon] = dirToLatLon(x / l, y / l, z / l);
      return Math.max(0, Math.min(1, mare(lat, lon)));
    }
    : null;
  // The maria are younger: fewer big and middling craters survive on them.
  const craters = gatherAll(MOON_CRATERS, cx, cy, cz, radiusKm, angRadius, detailM, (s) => {
    if (!mareAtKm) return null;
    const k = s.rMax > 1.5 ? 0.7 : 0.2;
    return (x, y, z) => 1 - k * mareAtKm(x, y, z);
  });
  return (x, y, z) => {
    const qx = x * radiusKm; const qy = y * radiusKm; const qz = z * radiusKm;
    const m = mareAtKm ? mareAtKm(x, y, z) : 0;
    const rough = 1 - 0.65 * m;
    let h = fbm(qx, qy, qz, 700, 1600 * rough, detailM, 0.5, 5, 3.1);
    // Small-scale roughness with a slower fall-off, so a grid 20 m apart still
    // has something to draw between the craters.
    h += fbm(qx, qy, qz, 6, 90 * rough, detailM, 0.55, 0.6, 9.7);
    h -= 1300 * m;
    for (let i = 0; i < craters.length; i++) h += cratersAt(craters[i].list, qx, qy, qz, detailM) * craters[i].w;
    return h;
  };
}

/** The raw Mars: the north–south dichotomy, Tharsis, the big shields and
 *  basins, three troughs, fbm relief, eroded craters, and dunes that only a
 *  grid finer than about 150 m draws. Metres. */
export function marsRegion(
  cx: number, cy: number, cz: number, angRadius: number, detailM: number, radiusKm: number,
): RegionSampler {
  const near = (dir: [number, number, number], capRad: number) =>
    angleBetween(cx, cy, cz, dir[0], dir[1], dir[2]) < capRad + angRadius;
  const volcanoes = MARS_VOLCANOES.filter((v) => near(v.dir, (1.4 * v.rKm) / radiusKm));
  const basins = MARS_BASINS.filter((b) => near(b.dir, (1.6 * b.rKm) / radiusKm));
  const troughs = MARS_TROUGHS.filter((t) => near(t.centre, t.cap + (t.halfKm * 2.5) / radiusKm));
  const craters = gatherAll(MARS_CRATERS, cx, cy, cz, radiusKm, angRadius, detailM, () => null);
  const dunes = detailM < 160;
  return (x, y, z) => {
    const qx = x * radiusKm; const qy = y * radiusKm; const qz = z * radiusKm;
    const lat = Math.asin(Math.max(-1, Math.min(1, z))) / DEG;
    const lon = Math.atan2(y, x);
    // The dichotomy: lowlands to the north of a wavering line.
    const warp = noise3(qx / 1800 + 4.1, qy / 1800, qz / 1800) * 9;
    const boundary = 12 + 14 * Math.sin(lon + 0.9) + warp;
    let h = -1300 - 2700 * Math.tanh((lat - boundary) / 9);
    // Tharsis: a continent-sized bulge under the shields.
    const th = angleBetween(x, y, z, THARSIS[0], THARSIS[1], THARSIS[2]);
    h += 5000 * Math.exp(-(th * th) / (0.42 * 0.42));
    for (const v of volcanoes) {
      const a = (angleBetween(x, y, z, v.dir[0], v.dir[1], v.dir[2]) * radiusKm) / v.rKm;
      if (a >= 1.4) continue;
      h += v.hM * Math.pow(1 - a / 1.4, 1.8) - v.hM * 0.18 * (1 - smoothstep(0, v.caldera, a));
    }
    for (const b of basins) {
      const a = (angleBetween(x, y, z, b.dir[0], b.dir[1], b.dir[2]) * radiusKm) / b.rKm;
      if (a >= 1.6) continue;
      const bowl = a < 1 ? (1 - a * a) * (1 - a * a) : 0;
      h += -b.depthM * bowl + b.depthM * 0.3 * Math.exp(-((a - 1) * (a - 1)) / 0.03);
    }
    for (const t of troughs) {
      const dKm = distanceToPath(t.segs, x, y, z) * radiusKm;
      if (dKm > t.halfKm * 2.2) continue;
      const wobble = 1 + 0.35 * noise3(qx / 90, qy / 90 + 2.3, qz / 90);
      const u = dKm / (t.halfKm * wobble);
      // Steep walls, a flat-ish floor, a shoulder on the rim.
      h -= t.depthM * (1 - smoothstep(0.55, 1.0, u));
      h += t.depthM * 0.05 * Math.exp(-((u - 1.15) * (u - 1.15)) / 0.02);
    }
    h += fbm(qx, qy, qz, 1100, 1700, detailM, 0.5, 6, 21.7);
    // Wrinkle ridges: sharp, low, a few hundred metres, in long lines.
    const ridgeMask = smoothstep(0.1, 0.45, noise3(qx / 900, qy / 900 + 7.7, qz / 900));
    if (ridgeMask > 0) h += ridgeMask * fbm(qx, qy, qz, 160, 320, detailM, 0.45, 4, 33.3, true);
    h += fbm(qx, qy, qz, 8, 120, detailM, 0.55, 0.6, 45.1);
    for (let i = 0; i < craters.length; i++) h += cratersAt(craters[i].list, qx, qy, qz, detailM) * craters[i].w;
    // Dunes: only where the grid can draw them, and only in the sand fields.
    if (dunes) {
      const field = smoothstep(0.05, 0.4, noise3(qx / 60 + 1.9, qy / 60, qz / 60 - 3.3));
      if (field > 0) h += field * fbm(qx, qy, qz, 0.7, 26, detailM, 0.4, 0.5, 57.9, true);
    }
    return h;
  };
}

/** Height bounds the fields keep inside, m (margins included). */
export const HEIGHT_BOUNDS: Record<GlobeWorld, { min: number; max: number }> = {
  moon: { min: -12000, max: 10000 },
  mars: { min: -12000, max: 26000 },
  // Earth is drawn with the sea flat at 0; the deepest dry land is the Dead
  // Sea shore, drawn at the sea too.
  earth: { min: -50, max: 9000 },
};

export interface SiteShaping {
  /** Where the flat ground ends and where the planet's own relief is back, km. */
  flatKm: number;
  blendKm: number;
  /** The raw height near the site is pulled toward the datum out to here, km,
   *  so the flattening only takes out the small-scale residue. */
  levelKm: number;
}

export const SITE_SHAPING: SiteShaping = { flatKm: 8, blendKm: 20, levelKm: 600 };

/**
 * The procedural fields with the site worked in: the broad relief is
 * levelled so that the landing site sits at its datum, then the last few
 * kilometres are flattened outright, because the surface scene's own ground
 * (1.5 km) is drawn over this and its edge must meet it.
 */
export function makeProceduralHeight(
  world: 'moon' | 'mars', body: PlanetBody, opts: { mare?: MareMask; shaping?: SiteShaping } = {},
): HeightField {
  const R = body.radiusKm;
  const sh = opts.shaping ?? SITE_SHAPING;
  const site = latLonToDir(body.site.lat, body.site.lon);
  const datum = body.datumKm * 1000;
  const raw = (cx: number, cy: number, cz: number, ang: number, d: number): RegionSampler => world === 'moon'
    ? moonRegion(cx, cy, cz, ang, d, R, opts.mare)
    : marsRegion(cx, cy, cz, ang, d, R);
  // The broad height of the site, read at a coarse grid: what is levelled out.
  const siteBase = raw(site[0], site[1], site[2], 0, 20000)(site[0], site[1], site[2]) - datum;
  const bounds = HEIGHT_BOUNDS[world];
  const shape = (h: number, x: number, y: number, z: number) => {
    const dKm = angleBetween(x, y, z, site[0], site[1], site[2]) * R;
    if (dKm < sh.levelKm) {
      h -= siteBase * (1 - smoothstep(sh.levelKm * 0.25, sh.levelKm, dKm));
      if (dKm < sh.blendKm) h = datum + (h - datum) * smoothstep(sh.flatKm, sh.blendKm, dKm);
    }
    return Math.max(bounds.min, Math.min(bounds.max, h));
  };
  const region = (cx: number, cy: number, cz: number, ang: number, detailM: number): RegionSampler => {
    const f = raw(cx, cy, cz, ang, detailM);
    return (x, y, z) => shape(f(x, y, z), x, y, z);
  };
  return {
    world, min: bounds.min, max: bounds.max, floor: -Infinity,
    region,
    sample: (x, y, z, detailM) => region(x, y, z, 0, detailM)(x, y, z),
  };
}

/** Earth: whatever the terrarium sampler says, at the zoom the chunk wants. */
export function makeEarthHeight(
  sampleEarth: (x: number, y: number, z: number, zoom: number, ctx?: SampleContext) => number,
): HeightField {
  const bounds = HEIGHT_BOUNDS.earth;
  return {
    world: 'earth', min: bounds.min, max: bounds.max, floor: 0,
    region: (_cx, _cy, _cz, _ang, _detailM, ctx) => (x, y, z) => sampleEarth(x, y, z, ctx ? ctx.zoom : 11, ctx),
    sample: (x, y, z, _detailM, ctx) => sampleEarth(x, y, z, ctx ? ctx.zoom : 11, ctx),
  };
}

/**
 * A mare mask from an albedo map's luminance (row-major, north row first,
 * longitude −180 at column 0): dark is mare. The thresholds come from the
 * map's own percentiles, so a brighter or darker map still splits the same.
 */
export function mareMaskFromLuminance(lum: Float32Array, w: number, h: number): MareMask {
  const sorted = Float32Array.from(lum).sort();
  const lo = sorted[Math.floor(sorted.length * 0.12)];
  const hi = sorted[Math.floor(sorted.length * 0.42)];
  const span = Math.max(1e-3, hi - lo);
  return (lat, lon) => {
    const fx = ((lon + 180) / 360) * w - 0.5;
    const fy = ((90 - lat) / 180) * h - 0.5;
    const x0 = Math.floor(fx); const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
    const y1 = Math.min(h - 1, y0 + 1);
    const tx = fx - x0; const ty = Math.max(0, Math.min(1, fy - y0));
    const xa = ((x0 % w) + w) % w; const xb = (xa + 1) % w;
    const v = (lum[y0 * w + xa] * (1 - tx) + lum[y0 * w + xb] * tx) * (1 - ty)
      + (lum[y1 * w + xa] * (1 - tx) + lum[y1 * w + xb] * tx) * ty;
    const t = Math.max(0, Math.min(1, (hi - v) / span));
    return t * t * (3 - 2 * t);
  };
}
