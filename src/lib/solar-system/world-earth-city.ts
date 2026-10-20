// Tbilisi's buildings, from OpenStreetMap footprints and the heights and
// storey counts mapped on them. Each footprint is raised from the lowest
// ground under it (the city is on hills: the downhill side shows its full
// height), its walls carry a facade shader — storeys, bays, glass that
// reflects the sky, and at night a share of windows lit warm or cold — and
// small hipped and pyramid roofs go on where OSM says the roof is pitched or
// the building is a house. Merged per 800 m cell in two levels of detail:
// every footprint near the crew, the larger ones simplified further out.
//
// Walking: the crew is pushed off the footprint edges nearby. The rooftop
// for the telescope is reached through its stairwell, which is a door.

import * as THREE from 'three';
import {
  KIND, ROOF, centroid, insideRing, ringArea, type Building, type Pt,
} from '@/lib/solar-system/world-earth-data';
import { withHaze } from '@/lib/solar-system/world-earth-haze';

export interface CityHandle {
  group: THREE.Group;
  /** Keep the crew out of walls. Returns true if it moved them. */
  pushOut: (pos: THREE.Vector3, radius: number, onRoof: boolean) => boolean;
  /** Circles along the walls round a point, for the camera's line of sight. */
  cameraColliders: (x: number, z: number) => { x: number; z: number; r: number }[];
  rooftop: { x: number; z: number; roofY: number; ring: Pt[]; door: Pt; hatch: Pt } | null;
  /** Night 0…1 lights the windows. */
  update: (cameraPos: THREE.Vector3, night: number) => void;
  /** Roof height if (x, z) is on a building's footprint, else NaN. */
  roofAt: (x: number, z: number) => number;
  dispose: () => void;
}

const CELL = 800;
const NEAR = 900;
/** Past this only the big footprints stay, simplified harder. */
const FAR = 2600;
const SEG_CELL = 24;

/** One integer for a grid cell: the spatial hashes below never build a string per lookup. */
export const cellKey = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);

const hash1 = (n: number) => {
  let v = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967295;
};

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const PLASTER = [srgb(0.78, 0.69, 0.55), srgb(0.84, 0.8, 0.7), srgb(0.76, 0.62, 0.56), srgb(0.62, 0.66, 0.68), srgb(0.72, 0.58, 0.42), srgb(0.66, 0.5, 0.38)];
const PANEL = [srgb(0.64, 0.62, 0.58), srgb(0.7, 0.68, 0.64), srgb(0.58, 0.57, 0.55), srgb(0.74, 0.7, 0.62)];
const BRICK = srgb(0.56, 0.36, 0.26);
const STONE = srgb(0.72, 0.64, 0.52);
const GLASSY = srgb(0.5, 0.56, 0.6);
const INDUSTRIAL = srgb(0.55, 0.54, 0.52);
const ROOF_FLAT = [srgb(0.36, 0.35, 0.34), srgb(0.44, 0.43, 0.41), srgb(0.3, 0.3, 0.31)];
const ROOF_PITCH = [srgb(0.5, 0.3, 0.24), srgb(0.36, 0.44, 0.38), srgb(0.6, 0.61, 0.62), srgb(0.45, 0.27, 0.22)];

/** Facade styles the shader knows: 0 blank, 1 flats, 2 old town, 3 glass, 4 stone church. */
function styleOf(b: Building, oldTown: boolean): number {
  if (b.kind === KIND.shed || b.kind === KIND.industrial) return 0;
  if (b.kind === KIND.church) return 4;
  if (b.kind === KIND.commercial && b.height > 18) return 3;
  if (oldTown && b.height < 18) return 2;
  return 1;
}

function fromRgb565(v: number): THREE.Color | null {
  if (!v) return null;
  return srgb(((v >> 11) & 31) / 31, ((v >> 5) & 63) / 63, (v & 31) / 31);
}

/** Douglas–Peucker, closed ring. */
function simplify(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 4) return pts;
  const keep = new Uint8Array(pts.length);
  const rec = (a: number, b: number) => {
    let best = -1; let bd = tol;
    const [ax, az] = pts[a]; const [bx, bz] = pts[b];
    const dx = bx - ax; const dz = bz - az; const len = Math.hypot(dx, dz) || 1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / len;
      if (d > bd) { bd = d; best = k; }
    }
    if (best >= 0) { keep[best] = 1; rec(a, best); rec(best, b); }
  };
  const mid = Math.floor(pts.length / 2);
  keep[0] = 1; keep[mid] = 1;
  rec(0, mid); rec(mid, pts.length - 1);
  keep[pts.length - 1] = 1;
  const out = pts.filter((_, k) => keep[k]);
  return out.length >= 3 ? out : pts;
}

class Batch {
  pos: number[] = []; nrm: number[] = []; col: number[] = []; fac: number[] = []; sty: number[] = []; idx: number[] = [];
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: THREE.Color, u: number, v: number, style: number, seed: number) {
    this.pos.push(x, y, z); this.nrm.push(nx, ny, nz); this.col.push(c.r, c.g, c.b); this.fac.push(u, v); this.sty.push(style, seed);
    return this.pos.length / 3 - 1;
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFacade', new THREE.Float32BufferAttribute(this.fac, 2));
    g.setAttribute('aStyle', new THREE.Float32BufferAttribute(this.sty, 2));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function facadeMaterial(): { material: THREE.MeshStandardMaterial; night: { value: number } } {
  const night = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  withHaze(material, 'facade', false, (shader) => {
    shader.uniforms.uNight = night;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFacade;\nattribute vec2 aStyle;\nvarying vec2 vFacade;\nvarying vec2 vStyle;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacade = aFacade;\nvStyle = aStyle;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying vec2 vFacade; varying vec2 vStyle;
        float fh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float eWin; float eLit; vec3 eLitCol;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        eWin = 0.0; eLit = 0.0; eLitCol = vec3(0.0);
        float eStyle = floor(vStyle.x + 0.5);
        if (eStyle > 0.5 && eStyle < 3.5 && vFacade.y > -0.5) {
          float storey = eStyle > 1.5 && eStyle < 2.5 ? 3.7 : eStyle > 2.5 ? 3.9 : 3.0;
          float bay = eStyle > 1.5 && eStyle < 2.5 ? 3.4 : eStyle > 2.5 ? 1.6 : 3.2;
          vec2 cell = vec2(vFacade.x / bay, vFacade.y / storey);
          vec2 f = fract(cell);
          float ground = step(1.0, cell.y);
          float w;
          if (eStyle > 2.5) w = step(0.06, f.x) * step(0.12, f.y) * step(f.y, 0.9);
          else if (eStyle > 1.5) w = step(0.3, f.x) * step(f.x, 0.7) * step(0.22, f.y) * step(f.y, 0.86);
          else w = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.8);
          eWin = w * mix(0.7, 1.0, ground);
          vec3 id = vec3(floor(cell), vStyle.y * 97.0);
          float r = fh(id);
          eLit = eWin * step(r, 0.38 * uNight) ;
          eLitCol = mix(vec3(1.0, 0.66, 0.36), vec3(0.8, 0.88, 1.0), step(0.7, fh(id + 3.1)));
          // Glass: dark, smooth, and it reflects the sky; the frame is the wall.
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.12 + vec3(0.012, 0.016, 0.02), eWin);
          roughnessFactor = mix(roughnessFactor, 0.06, eWin);
          metalnessFactor = mix(metalnessFactor, 0.35, eWin);
          float upper = step(1.0, cell.y);
          if (eStyle > 0.5 && eStyle < 1.5) {
            // Soviet blocks: each flat glazed or boxed in its loggia its own way, a slab under every storey.
            float loggia = upper * step(fh(id + 5.3), 0.5);
            float panel = loggia * step(0.08, f.x) * step(f.x, 0.92) * step(0.05, f.y) * step(f.y, 0.36);
            vec3 tint = mix(vec3(0.82, 0.8, 0.74), mix(vec3(0.55, 0.62, 0.66), vec3(0.72, 0.58, 0.46), step(0.5, fh(id + 8.7))), step(0.4, fh(id + 2.2)));
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tint * 1.1, panel);
            diffuseColor.rgb *= 1.0 - 0.45 * upper * (1.0 - step(0.045, f.y));
            diffuseColor.rgb *= 1.0 - 0.25 * loggia * (step(f.x, 0.08) + step(0.92, f.x)) * step(f.y, 0.86);
          } else if (eStyle > 1.5 && eStyle < 2.5) {
            // Old Tbilisi: carved wooden balconies on some storeys, balusters and a rail.
            float balcony = upper * step(fh(vec3(floor(cell.y), vStyle.y * 97.0, 4.0)), 0.45);
            float band = balcony * step(0.02, f.y) * step(f.y, 0.3);
            float baluster = step(0.5, fract(vFacade.x * 3.3));
            vec3 wood = vec3(0.36, 0.24, 0.16) * mix(0.7, 1.0, baluster * step(0.06, f.y) * step(f.y, 0.26));
            diffuseColor.rgb = mix(diffuseColor.rgb, wood, band);
            eWin *= 1.0 - band;
          } else if (eStyle > 2.5) {
            // Mullions: thin frames between panes.
            diffuseColor.rgb *= 1.0 - 0.3 * (1.0 - step(0.03, f.y));
          }
          // Ground floors: shopfronts.
          float shop = (1.0 - upper) * step(fh(id + 1.7), 0.55) * step(eStyle, 2.5) * step(0.08, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.78);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02, 0.025, 0.03), shop);
          roughnessFactor = mix(roughnessFactor, 0.08, shop);
          eLit = max(eLit, shop * step(0.2, uNight));
        }
        if (eStyle > 3.5) roughnessFactor = 0.92;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += eLitCol * eLit * (0.9 + 0.5 * fh(vec3(floor(vFacade / 3.0), 7.0)));`);
  });
  return { material, night };
}

export function makeCity(
  buildings: Building[],
  heightAt: (x: number, z: number) => number,
  lite: boolean,
  oldTownCentre: Pt,
): CityHandle {
  const group = new THREE.Group();
  group.name = 'earth-city';
  const { material, night } = facadeMaterial();
  const geometries: THREE.BufferGeometry[] = [];

  interface Prepared { b: Building; outer: Pt[]; holes: Pt[][]; base: number; top: number; area: number; c: Pt; seed: number; style: number; wall: THREE.Color; roof: THREE.Color }
  const prepared: Prepared[] = [];
  buildings.forEach((b, k) => {
    const outer = b.rings.find((r) => !r.inner)?.pts;
    if (!outer || outer.length < 3) return;
    const holes = b.rings.filter((r) => r.inner).map((r) => r.pts);
    const area = Math.abs(ringArea(outer));
    const c = centroid(outer);
    let base = Infinity;
    for (const [x, z] of outer) base = Math.min(base, heightAt(x, z));
    const seed = hash1(k * 7919 + Math.round(c[0]) * 31 + Math.round(c[1]));
    const oldTown = Math.hypot(c[0] - oldTownCentre[0], c[1] - oldTownCentre[1]) < 1400;
    const style = styleOf(b, oldTown);
    const wall = fromRgb565(b.wall)
      ?? (b.kind === KIND.church ? STONE : b.kind === KIND.industrial || b.kind === KIND.shed ? INDUSTRIAL : style === 3 ? GLASSY
        : style === 2 ? (seed < 0.12 ? BRICK : PLASTER[Math.floor(seed * 97) % PLASTER.length]) : PANEL[Math.floor(seed * 89) % PANEL.length]);
    const pitched = b.roof === ROOF.gabled || b.roof === ROOF.hipped || b.roof === ROOF.pyramidal;
    const roof = fromRgb565(b.roofColour) ?? (pitched ? ROOF_PITCH[Math.floor(seed * 53) % ROOF_PITCH.length] : ROOF_FLAT[Math.floor(seed * 41) % ROOF_FLAT.length]);
    // Heights are from the ground at the building's foot; on a slope that is the low side.
    const top = base + Math.max(2.6, b.height);
    prepared.push({ b, outer, holes, base: base + b.minHeight, top, area, c, seed, style, wall, roof });
  });

  const tmp = new THREE.Color();
  const addWalls = (batch: Batch, p: Prepared, ring: Pt[], inner: boolean) => {
    const ccw = ringArea(ring) > 0;
    let u = 0;
    const bottom = p.base - 1.2;
    for (let k = 0; k < ring.length; k++) {
      const [ax, az] = ring[k]; const [bx, bz] = ring[(k + 1) % ring.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      // Outward normal: for a counter-clockwise ring in x-z (z south) it is on the right.
      let nx = (bz - az) / len; let nz = -(bx - ax) / len;
      if (ccw === inner) { nx = -nx; nz = -nz; }
      const shade = tmp.copy(p.wall).multiplyScalar(0.94 + hash1(k + p.seed * 1e5) * 0.1);
      const v0 = p.base - bottom;
      const a0 = batch.vert(ax, bottom, az, nx, 0, nz, shade, u, -v0, p.style, p.seed);
      const b0 = batch.vert(bx, bottom, bz, nx, 0, nz, shade, u + len, -v0, p.style, p.seed);
      const a1 = batch.vert(ax, p.top, az, nx, 0, nz, shade, u, p.top - p.base, p.style, p.seed);
      const b1 = batch.vert(bx, p.top, bz, nx, 0, nz, shade, u + len, p.top - p.base, p.style, p.seed);
      // (b0 − a0) × (a1 − a0) points along (−dz, dx): wind so the face looks along the normal.
      if (-nx * (bz - az) + nz * (bx - ax) > 0) batch.idx.push(a0, b0, a1, b0, b1, a1);
      else batch.idx.push(a0, a1, b0, b0, a1, b1);
      u += len;
    }
  };
  const addFlatRoof = (batch: Batch, p: Prepared, outer: Pt[], holes: Pt[][]) => {
    const contour = outer.map(([x, z]) => new THREE.Vector2(x, z));
    const hv = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
    let tris: number[][];
    try { tris = THREE.ShapeUtils.triangulateShape(contour, hv); } catch { return; }
    const all = [...outer, ...holes.flat()];
    const start = batch.pos.length / 3;
    for (const [x, z] of all) batch.vert(x, p.top, z, 0, 1, 0, p.roof, 0, -1, 0, p.seed);
    for (const [a, b, c] of tris) {
      // Wind upward.
      const [ax, az] = all[a]; const [bx, bz] = all[b]; const [cx, cz] = all[c];
      if ((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0) batch.idx.push(start + a, start + b, start + c);
      else batch.idx.push(start + a, start + c, start + b);
    }
  };
  /** A flat roof's parapet: a band stood a little proud of the wall, a shade darker. */
  const addCornice = (batch: Batch, p: Prepared, ring: Pt[]) => {
    const ccw = ringArea(ring) > 0;
    const band = tmp.copy(p.wall).multiplyScalar(0.78);
    for (let k = 0; k < ring.length; k++) {
      const [ax, az] = ring[k]; const [bx, bz] = ring[(k + 1) % ring.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      let nx = (bz - az) / len; let nz = -(bx - ax) / len;
      if (!ccw) { nx = -nx; nz = -nz; }
      const o = 0.22; const y0 = p.top - 0.55; const y1 = p.top + 0.6;
      const a0 = batch.vert(ax + nx * o, y0, az + nz * o, nx, 0, nz, band, 0, -1, 0, p.seed);
      const b0 = batch.vert(bx + nx * o, y0, bz + nz * o, nx, 0, nz, band, 0, -1, 0, p.seed);
      const a1 = batch.vert(ax + nx * o, y1, az + nz * o, nx, 0, nz, band, 0, -1, 0, p.seed);
      const b1 = batch.vert(bx + nx * o, y1, bz + nz * o, nx, 0, nz, band, 0, -1, 0, p.seed);
      if (-nx * (bz - az) + nz * (bx - ax) > 0) batch.idx.push(a0, b0, a1, b0, b1, a1);
      else batch.idx.push(a0, a1, b0, b0, a1, b1);
    }
  };
  /** A hip: a ridge along the long axis, every eave corner to its nearer ridge end. Convex, few-sided footprints only. */
  const addHipRoof = (batch: Batch, p: Prepared, outer: Pt[]) => {
    let lx = 1; let lz = 0; let best = 0;
    for (let k = 0; k < outer.length; k++) {
      const [ax, az] = outer[k]; const [bx, bz] = outer[(k + 1) % outer.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len > best) { best = len; lx = (bx - ax) / len; lz = (bz - az) / len; }
    }
    let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
    for (const [x, z] of outer) {
      const u = (x - p.c[0]) * lx + (z - p.c[1]) * lz; const v = -(x - p.c[0]) * lz + (z - p.c[1]) * lx;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const halfW = (maxV - minV) / 2; const midV = (maxV + minV) / 2;
    const rise = Math.min(4.5, Math.max(1.2, halfW * 0.55));
    const pyramid = p.b.roof === ROOF.pyramidal || maxU - minU < halfW * 2.2;
    const r0 = pyramid ? (minU + maxU) / 2 : minU + halfW; const r1 = pyramid ? r0 : maxU - halfW;
    const ridge = (u: number): Pt => [p.c[0] + lx * u - lz * midV, p.c[1] + lz * u + lx * midV];
    const R0 = ridge(r0); const R1 = ridge(r1);
    const y = p.top + rise;
    const up = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
      const ux = bx - ax; const uy = by - ay; const uz = bz - az; const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
      let nx = uy * vz - uz * vy; let ny = uz * vx - ux * vz; let nz = ux * vy - uy * vx;
      if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      const s = tmp.copy(p.roof).multiplyScalar(0.8 + 0.25 * Math.max(0, ny / l));
      const ia = batch.vert(ax, ay, az, nx / l, ny / l, nz / l, s, 0, -1, 0, p.seed);
      const ib = batch.vert(bx, by, bz, nx / l, ny / l, nz / l, s, 0, -1, 0, p.seed);
      const ic = batch.vert(cx, cy, cz, nx / l, ny / l, nz / l, s, 0, -1, 0, p.seed);
      batch.idx.push(ia, ib, ic, ia, ic, ib);
    };
    for (let k = 0; k < outer.length; k++) {
      const [ax, az] = outer[k]; const [bx, bz] = outer[(k + 1) % outer.length];
      const ua = (ax - p.c[0]) * lx + (az - p.c[1]) * lz; const ub = (bx - p.c[0]) * lx + (bz - p.c[1]) * lz;
      const RA = Math.abs(ua - r0) < Math.abs(ua - r1) ? R0 : R1;
      const RB = Math.abs(ub - r0) < Math.abs(ub - r1) ? R0 : R1;
      up(ax, p.top, az, bx, p.top, bz, RB[0], y, RB[1]);
      if (RA !== RB) up(ax, p.top, az, RB[0], y, RB[1], RA[0], y, RA[1]);
    }
  };

  const convex = (pts: Pt[]) => {
    let sign = 0;
    for (let k = 0; k < pts.length; k++) {
      const [ax, az] = pts[k]; const [bx, bz] = pts[(k + 1) % pts.length]; const [cx, cz] = pts[(k + 2) % pts.length];
      const cr = (bx - ax) * (cz - bz) - (bz - az) * (cx - bx);
      if (Math.abs(cr) < 1e-3) continue;
      if (sign === 0) sign = Math.sign(cr); else if (Math.sign(cr) !== sign) return false;
    }
    return true;
  };

  // ── Cells. ──
  type Detail = 'full' | 'coarse' | 'far';
  const cells = new Map<string, { near: Prepared[]; mesh: THREE.Mesh; full: THREE.BufferGeometry | null; coarse: THREE.BufferGeometry | null; far: THREE.BufferGeometry | null; cx: number; cz: number; showing: Detail }>();
  const buckets = new Map<string, Prepared[]>();
  for (const p of prepared) {
    const key = `${Math.floor(p.c[0] / CELL)},${Math.floor(p.c[1] / CELL)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  const build = (list: Prepared[], coarse: boolean, far = false) => {
    const batch = new Batch();
    for (const p of list) {
      if (coarse && p.area < (far ? 320 : 90)) continue;
      const outer = coarse ? simplify(p.outer, far ? 5 : 2.5) : p.outer;
      addWalls(batch, p, outer, false);
      if (!coarse) for (const h of p.holes) addWalls(batch, p, h, true);
      const pitched = p.b.roof === ROOF.gabled || p.b.roof === ROOF.hipped || p.b.roof === ROOF.pyramidal;
      if (!coarse && pitched && outer.length <= 8 && !p.holes.length && convex(outer) && p.area < 900) addHipRoof(batch, p, outer);
      else {
        addFlatRoof(batch, p, outer, coarse ? [] : p.holes);
        if (!coarse && p.top - p.base > 5) addCornice(batch, p, outer);
      }
    }
    const g = batch.geometry();
    if (g) geometries.push(g);
    return g;
  };
  for (const [key, list] of buckets) {
    const [ci, cj] = key.split(',').map(Number);
    const coarse = build(list, true);
    if (!coarse) continue;
    const mesh = new THREE.Mesh(coarse, material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'city-cell';
    group.add(mesh);
    cells.set(key, { near: list, mesh, full: null, coarse, far: build(list, true, true), cx: (ci + 0.5) * CELL, cz: (cj + 0.5) * CELL, showing: 'coarse' });
  }

  // ── Walls for walking into: segments hashed on a grid. ──
  interface Seg { ax: number; az: number; bx: number; bz: number; rooftop: boolean; /** Last camera query that took it: a Set-free "seen". */ stamp: number }
  const segs = new Map<number, Seg[]>();
  const addSeg = (ax: number, az: number, bx: number, bz: number, rooftop: boolean) => {
    const s: Seg = { ax, az, bx, bz, rooftop, stamp: 0 };
    const i0 = Math.floor(Math.min(ax, bx) / SEG_CELL); const i1 = Math.floor(Math.max(ax, bx) / SEG_CELL);
    const j0 = Math.floor(Math.min(az, bz) / SEG_CELL); const j1 = Math.floor(Math.max(az, bz) / SEG_CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = cellKey(i, j);
      let list = segs.get(k);
      if (!list) { list = []; segs.set(k, list); }
      list.push(s);
    }
  };
  const footprints = new Map<number, Prepared[]>();
  for (const p of prepared) {
    if (Math.hypot(p.c[0], p.c[1]) > 2300) continue;
    for (const ring of [p.outer, ...p.holes]) for (let k = 0; k < ring.length; k++) {
      const [ax, az] = ring[k]; const [bx, bz] = ring[(k + 1) % ring.length];
      addSeg(ax, az, bx, bz, p.b.rooftop);
    }
    const key = cellKey(Math.floor(p.c[0] / 60), Math.floor(p.c[1] / 60));
    let list = footprints.get(key);
    if (!list) { list = []; footprints.set(key, list); }
    list.push(p);
  }
  const nearFootprints = (x: number, z: number, out: Prepared[]) => {
    out.length = 0;
    const i = Math.floor(x / 60); const j = Math.floor(z / 60);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const l = footprints.get(cellKey(i + di, j + dj));
      if (l) for (const p of l) out.push(p);
    }
    return out;
  };
  const found: Prepared[] = [];

  const top = prepared.find((p) => p.b.rooftop) ?? null;
  let rooftop: CityHandle['rooftop'] = null;
  if (top) {
    // The door on the wall nearest the street side (the one facing the most open ground), the hatch in the middle.
    let door: Pt = top.outer[0]; let open = -Infinity;
    for (let k = 0; k < top.outer.length; k++) {
      const [ax, az] = top.outer[k]; const [bx, bz] = top.outer[(k + 1) % top.outer.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 4) continue;
      let nx = (bz - az) / len; let nz = -(bx - ax) / len;
      if (ringArea(top.outer) > 0) { nx = -nx; nz = -nz; }
      const mx = (ax + bx) / 2 + nx * 1.6; const mz = (az + bz) / 2 + nz * 1.6;
      if (insideRing(mx, mz, top.outer)) { nx = -nx; nz = -nz; }
      const px = (ax + bx) / 2 + nx * 1.6; const pz = (az + bz) / 2 + nz * 1.6;
      let clear = 0;
      for (let s = 2; s < 18; s += 2) if (!nearFootprints(px + nx * s, pz + nz * s, found).some((o) => o !== top && insideRing(px + nx * s, pz + nz * s, o.outer))) clear += 1;
      const score = clear * 10 - Math.abs(heightAt(px, pz) - top.base);
      if (score > open) { open = score; door = [px, pz]; }
    }
    rooftop = { x: top.c[0], z: top.c[1], roofY: top.top, ring: top.outer, door, hatch: top.c };
  }

  let t = 0;
  const camPool: { x: number; z: number; r: number }[] = [];
  const camOut: { x: number; z: number; r: number }[] = [];
  let camCell = NaN;
  let camStamp = 0;
  return {
    group,
    rooftop,
    pushOut(pos, radius, onRoof) {
      const i = Math.floor(pos.x / SEG_CELL); const j = Math.floor(pos.z / SEG_CELL);
      let moved = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const list = segs.get(cellKey(i + di, j + dj));
        if (!list) continue;
        for (const s of list) {
          if (onRoof && s.rooftop) continue;
          const dx = s.bx - s.ax; const dz = s.bz - s.az;
          const l2 = dx * dx + dz * dz || 1;
          const tt = Math.max(0, Math.min(1, ((pos.x - s.ax) * dx + (pos.z - s.az) * dz) / l2));
          const qx = s.ax + dx * tt; const qz = s.az + dz * tt;
          const ex = pos.x - qx; const ez = pos.z - qz;
          const d = Math.hypot(ex, ez);
          if (d < radius && d > 1e-4) { pos.x = qx + (ex / d) * radius; pos.z = qz + (ez / d) * radius; moved = true; }
        }
      }
      if (!onRoof) {
        // Inside a footprint (a teleport, a wall passed at speed): out the nearest side.
        for (const p of nearFootprints(pos.x, pos.z, found)) {
          if (!insideRing(pos.x, pos.z, p.outer) || p.holes.some((h) => insideRing(pos.x, pos.z, h))) continue;
          let bd = Infinity; let bx = pos.x; let bz = pos.z;
          for (let k = 0; k < p.outer.length; k++) {
            const [ax, az] = p.outer[k]; const [cx, cz] = p.outer[(k + 1) % p.outer.length];
            const dx = cx - ax; const dz = cz - az; const l2 = dx * dx + dz * dz || 1;
            const tt = Math.max(0, Math.min(1, ((pos.x - ax) * dx + (pos.z - az) * dz) / l2));
            const qx = ax + dx * tt; const qz = az + dz * tt;
            const d = Math.hypot(pos.x - qx, pos.z - qz);
            if (d < bd) { bd = d; bx = qx + (qx - pos.x) / (d || 1) * radius; bz = qz + (qz - pos.z) / (d || 1) * radius; }
          }
          pos.x = bx; pos.z = bz; moved = true;
          break;
        }
      }
      return moved;
    },
    cameraColliders(x, z) {
      const i = Math.floor(x / SEG_CELL); const j = Math.floor(z / SEG_CELL);
      const cell = cellKey(i, j);
      // The walls round a cell do not move: the circles are rebuilt only when the query crosses into another one.
      if (cell === camCell) return camOut;
      camCell = cell;
      camStamp += 1;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const list = segs.get(cellKey(i + di, j + dj));
        if (!list) continue;
        for (const s of list) {
          if (s.stamp === camStamp) continue;
          s.stamp = camStamp;
          const len = Math.hypot(s.bx - s.ax, s.bz - s.az);
          for (let d = 0; d <= len; d += 1.4) {
            let c = camPool[n];
            if (!c) { c = { x: 0, z: 0, r: 0.7 }; camPool[n] = c; }
            c.x = s.ax + ((s.bx - s.ax) * d) / (len || 1);
            c.z = s.az + ((s.bz - s.az) * d) / (len || 1);
            n += 1;
          }
        }
      }
      camOut.length = 0;
      for (let k = 0; k < n; k++) camOut.push(camPool[k]);
      return camOut;
    },
    roofAt(x, z) {
      for (const p of nearFootprints(x, z, found)) if (insideRing(x, z, p.outer)) return p.top;
      return NaN;
    },
    update(cameraPos, n) {
      night.value = n;
      if ((t++ & 15) !== 0) return;
      for (const c of cells.values()) {
        const d = Math.hypot(cameraPos.x - c.cx, cameraPos.z - c.cz);
        const want: Detail = d < NEAR + CELL * 0.7 ? 'full' : d < FAR ? 'coarse' : 'far';
        // Shadows reach sixty metres round the crew: only the cells that hold them cast.
        c.mesh.castShadow = want === 'full' && d < CELL && !lite;
        if (want === c.showing) continue;
        if (want === 'full' && !c.full) c.full = build(c.near, false);
        const g = want === 'full' ? c.full : want === 'coarse' ? c.coarse : c.far;
        c.mesh.visible = !!g;
        c.showing = want;
        if (!g) continue;
        c.mesh.geometry = g;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      material.dispose();
    },
  };
}
