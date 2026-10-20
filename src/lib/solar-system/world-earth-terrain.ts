// The ground of Tbilisi and everything to the horizon, from the baked grids.
// Four rings, each laid in the hole of the one inside it: the walk area in
// chunks that change detail with distance, the city, the valley, and the
// Caucasus — the last two folded in by the haze hook so they sit at their
// true angle inside the far plane, and curved down onto the sphere from the
// site (surface-orbit `withCurvature`), 4 km down at their edge, so they meet
// the planet globe past them from any height. Colour is the land cover OpenStreetMap
// gives where it has it; past the city it is the elevation and the slope,
// and above the season's snowline, snow.

import * as THREE from 'three';
import { COVER, coverAt, makeHeightAt, type HeightGrid } from '@/lib/solar-system/world-earth-data';
import { EARTH_R_REFRACTED, withHaze } from '@/lib/solar-system/world-earth-haze';
import { withCurvature } from '@/lib/solar-system/surface-orbit';

export interface EarthTerrain {
  group: THREE.Group;
  heightAt: (x: number, z: number) => number;
  walkGrid: HeightGrid;
  /** The rings past the walk area, for the orbit view's ceilings. */
  rings: { city: THREE.Mesh; valley: THREE.Mesh; caucasus: THREE.Mesh };
  /** Pick detail for the camera; cheap, call every frame. */
  update: (cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

const CHUNK = 160;
const lin = (r: number, g: number, b: number): [number, number, number] => [r, g, b];
const PALETTE: Record<number, [number, number, number]> = {
  [COVER.ground]: lin(0.22, 0.2, 0.17),
  [COVER.grass]: lin(0.17, 0.2, 0.09),
  [COVER.forest]: lin(0.065, 0.09, 0.045),
  [COVER.water]: lin(0.09, 0.085, 0.07),
  [COVER.scrub]: lin(0.2, 0.19, 0.11),
  [COVER.building]: lin(0.27, 0.26, 0.24),
  [COVER.road]: lin(0.085, 0.085, 0.09),
  [COVER.plaza]: lin(0.34, 0.31, 0.27),
  [COVER.farmland]: lin(0.3, 0.26, 0.15),
};

function hash(ix: number, iy: number): number {
  let n = (ix * 374761393 + iy * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/** The snowline for the month, m: high in late summer, down the valleys in winter. */
export function snowline(date: Date): number {
  const m = date.getUTCMonth() + date.getUTCDate() / 31;
  // Lowest near the start of February, highest near the start of September.
  return 3000 - 1500 * Math.cos(((m - 8) / 12) * Math.PI * 2);
}

function grainTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const i = (y * s + x) * 4;
    const v = 0.82 + (hash(x, y) - 0.5) * 0.22 + (hash(x >> 3, y >> 3) - 0.5) * 0.14 + (hash(x >> 5, y >> 5) - 0.5) * 0.08;
    const b = Math.round(Math.max(0, Math.min(1, v)) * 255);
    img.data[i] = b; img.data[i + 1] = b; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeEarthTerrain(grids: HeightGrid[], date: Date, lite: boolean): EarthTerrain {
  const [walk, city, valley, caucasus] = grids;
  const group = new THREE.Group();
  group.name = 'earth-terrain';
  const heightAt = makeHeightAt(grids);
  const snow = snowline(date);
  const autumn = THREE.MathUtils.smoothstep(Math.abs(date.getUTCMonth() - 8.5), 3, 0);
  const geometries: THREE.BufferGeometry[] = [];

  const colour = (g: HeightGrid, i: number, j: number, h: number, slope: number, out: number[]) => {
    const x = -g.size / 2 + i * g.cell; const z = -g.size / 2 + j * g.cell;
    let c = g.id === 'walk' || g.id === 'city' ? g.cover[j * g.n + i] : coverAt(city, x, z);
    if (c < 0) c = g.cover[j * g.n + i] === COVER.water ? COVER.water : -1;
    let rgb: [number, number, number];
    if (c >= 0 && !(c === COVER.ground && g.id !== 'walk' && Math.abs(x) > 5200)) {
      rgb = PALETTE[c] ?? PALETTE[COVER.ground];
    } else if (h > snow + (slope > 0.9 ? 600 : 0)) {
      rgb = lin(0.82, 0.85, 0.9);
    } else if (h > 3000 || slope > 1.1) {
      rgb = lin(0.27, 0.26, 0.25);
    } else if (h > 2100) {
      rgb = lin(0.2, 0.22, 0.11);
    } else if (h > 650 && slope > 0.18) {
      rgb = lin(0.06, 0.085, 0.04);
    } else {
      // The dry steppe of the Kartli plain and the Iori plateau.
      rgb = lin(0.29, 0.26, 0.16);
    }
    const n = 0.88 + hash(i, j * 7 + g.n) * 0.24;
    let r = rgb[0] * n; let gg = rgb[1] * n; let b = rgb[2] * n;
    if (c === COVER.grass || c === COVER.scrub) {
      // Late-summer grass in Tbilisi is straw more often than green.
      r += 0.03 * autumn; gg += 0.015 * autumn;
    }
    if (slope > 0.75 && c !== COVER.building && c !== COVER.road && c !== COVER.water) {
      const k = Math.min(1, (slope - 0.75) * 2);
      r = r + (0.3 - r) * k; gg = gg + (0.27 - gg) * k; b = b + (0.23 - b) * k;
    }
    out[0] = r; out[1] = gg; out[2] = b;
  };

  /** A grid patch at `step`, cells [i0, i1) × [j0, j1); quads the `skip` test rejects are left out. */
  const patch = (g: HeightGrid, i0: number, i1: number, j0: number, j1: number, step: number, skip?: (x: number, z: number) => boolean, sink?: (x: number, z: number) => boolean) => {
    const nx = Math.floor((i1 - i0) / step) + 1; const nz = Math.floor((j1 - j0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const nrm = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const rgb = [0, 0, 0];
    const H = g.heights; const n = g.n;
    const at = (i: number, j: number) => H[Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))];
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(n - 1, i0 + a * step); const j = Math.min(n - 1, j0 + b * step);
      const x = -g.size / 2 + i * g.cell; const z = -g.size / 2 + j * g.cell;
      let h = at(i, j);
      if (sink?.(x, z)) h -= 2.5;
      const k = b * nx + a;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const dx = (at(i + step, j) - at(i - step, j)) / (2 * step * g.cell);
      const dz = (at(i, j + step) - at(i, j - step)) / (2 * step * g.cell);
      const len = Math.hypot(dx, 1, dz);
      nrm[k * 3] = -dx / len; nrm[k * 3 + 1] = 1 / len; nrm[k * 3 + 2] = -dz / len;
      colour(g, i, j, h, Math.hypot(dx, dz), rgb);
      col[k * 3] = rgb[0]; col[k * 3 + 1] = rgb[1]; col[k * 3 + 2] = rgb[2];
      uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
    }
    const idx: number[] = [];
    for (let b = 0; b < nz - 1; b++) for (let a = 0; a < nx - 1; a++) {
      const k = b * nx + a;
      if (skip) {
        const cx = (pos[k * 3] + pos[(k + nx + 1) * 3]) / 2; const cz = (pos[k * 3 + 2] + pos[(k + nx + 1) * 3 + 2]) / 2;
        if (skip(cx, cz)) continue;
      }
      idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geom.setIndex(nx * nz > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    geom.computeBoundingSphere();
    geometries.push(geom);
    return geom;
  };

  // ── The walk area: chunks, three levels of detail each, the finest built on demand. ──
  const grain = grainTexture();
  const walkMat = withHaze(new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.96, metalness: 0 }), 'terrain');
  const chunks: { mesh: THREE.Mesh; i0: number; j0: number; cx: number; cz: number; lods: (THREE.BufferGeometry | null)[]; lod: number }[] = [];
  const cells = walk.n - 1;
  for (let j0 = 0; j0 < cells; j0 += CHUNK) for (let i0 = 0; i0 < cells; i0 += CHUNK) {
    const i1 = Math.min(cells, i0 + CHUNK); const j1 = Math.min(cells, j0 + CHUNK);
    const lods: (THREE.BufferGeometry | null)[] = [null, patch(walk, i0, i1, j0, j1, 2), patch(walk, i0, i1, j0, j1, lite ? 8 : 4)];
    const mesh = new THREE.Mesh(lods[2]!, walkMat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain-walk';
    const cx = -walk.size / 2 + ((i0 + i1) / 2) * walk.cell; const cz = -walk.size / 2 + ((j0 + j1) / 2) * walk.cell;
    chunks.push({ mesh, i0, j0, cx, cz, lods, lod: 2 });
    group.add(mesh);
  }

  // ── The rings. Each leaves a hole a cell smaller than the ring inside it,
  // and drops what lies under that ring out of sight. ──
  const inside = (g: HeightGrid, inset: number) => (x: number, z: number) => Math.abs(x) < g.size / 2 - inset && Math.abs(z) < g.size / 2 - inset;
  const ring = (g: HeightGrid, hole: HeightGrid, step: number, far: boolean) => {
    const geom = patch(g, 0, g.n - 1, 0, g.n - 1, step, inside(hole, g.cell * step), inside(hole, 0));
    const mat = withHaze(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }), `ring-${g.id}`, far);
    // The eye sees the far ground curve away with refraction's longer radius.
    if (far) withCurvature(mat, EARTH_R_REFRACTED);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.receiveShadow = !far;
    mesh.frustumCulled = !far;
    mesh.name = `terrain-${g.id}`;
    group.add(mesh);
    return mesh;
  };
  const rings = [ring(city, walk, lite ? 4 : 3, false), ring(valley, city, 3, true), ring(caucasus, valley, 3, true)];

  const lodFor = (d: number) => (d < 380 ? 0 : d < 1300 ? 1 : 2);
  let tick = 0;
  return {
    group, heightAt, walkGrid: walk,
    rings: { city: rings[0], valley: rings[1], caucasus: rings[2] },
    update(cameraPos) {
      if ((tick++ & 7) !== 0) return;
      for (const c of chunks) {
        const d = Math.max(0, Math.hypot(cameraPos.x - c.cx, cameraPos.z - c.cz) - CHUNK * walk.cell * 0.7);
        const want = lite ? Math.max(1, lodFor(d)) : lodFor(d);
        if (want === c.lod) continue;
        if (!c.lods[want]) c.lods[want] = patch(walk, c.i0, Math.min(cells, c.i0 + CHUNK), c.j0, Math.min(cells, c.j0 + CHUNK), 1);
        c.mesh.geometry = c.lods[want]!;
        c.lod = want;
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      walkMat.dispose();
      grain.dispose();
      for (const r of rings) (r.material as THREE.Material).dispose();
    },
  };
}
