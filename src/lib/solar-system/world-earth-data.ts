// The ground under Tbilisi, as baked by scripts/bake-tbilisi.mjs: four
// height grids from the walk area out to the Caucasus, the land cover on
// them, and OpenStreetMap's buildings, streets, water, trees and landmark
// outlines. This file only reads the files; it builds nothing, so the tests
// can load it straight off the disk.
//
// Coordinates are the bake's local tangent plane at the pad: x east, z south.

export const TBILISI_BASE = '/explore/tbilisi';

export const COVER = { ground: 0, grass: 1, forest: 2, water: 3, scrub: 4, building: 5, road: 6, plaza: 7, farmland: 8 } as const;
export const ROOF = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, skillion: 5 } as const;
export const KIND = { generic: 0, house: 1, apartments: 2, church: 3, commercial: 4, industrial: 5, shed: 6, historic: 7, public: 8 } as const;
export const ROAD = { motorway: 0, primary: 1, secondary: 2, tertiary: 3, residential: 4, service: 5, pedestrian: 6, footway: 7, steps: 8, path: 9 } as const;

export type Pt = [number, number];

export interface HeightGrid {
  id: string;
  n: number;
  size: number;
  cell: number;
  heights: Float32Array;
  cover: Uint8Array;
}

export interface Ring { inner: boolean; pts: Pt[] }

export interface Building {
  /** The height is not in OSM: a plain storey count by building type. */
  estimated: boolean;
  /** The flat roof the telescope goes up on. */
  rooftop: boolean;
  kind: number;
  height: number;
  minHeight: number;
  roof: number;
  levels: number;
  /** RGB565 from building:colour / roof:colour, 0 when not tagged. */
  wall: number;
  roofColour: number;
  rings: Ring[];
}

export interface Road { cls: number; width: number; bridge: boolean; tunnel: boolean; lit: boolean; layer: number; pts: Pt[] }
export interface Water { rings: Ring[] }
export interface Tree { x: number; z: number; conifer: boolean; height: number }

export interface Manifest {
  version: number;
  baked: string;
  origin: { lat: number; lon: number };
  pad: { x: number; z: number; clear: number };
  grids: { id: string; n: number; size: number }[];
  rooftop: { id: number; x: number; z: number; base: number; height: number; horizon: number } | null;
  river: [number, number, number][];
  landmarks: {
    bridgeOfPeace: { deck: Pt[] | null; roof: Pt[] | null };
    cableCar: { line: Pt[] | null };
    sameba: { outline: Pt[] | null; height: number };
    tvTower: { at: Pt | null; height: number };
    kartlisDeda: { at: Pt; outline: Pt[]; height: number } | null;
    ferrisWheel: { at: Pt; height: number | null } | null;
    narikalaWalls: { id: number; pts: Pt[]; closed: boolean }[];
    narikalaTowers: Pt[];
    baths: { id: number; name: string; at: Pt; outline: Pt[] | null }[];
    rikeTubes: { outline: Pt[] } | null;
    stations: { which: string; at: Pt }[];
  };
  stats: Record<string, number>;
}

export interface EarthData {
  manifest: Manifest;
  grids: HeightGrid[];
  buildings: Building[];
  roads: Road[];
  water: Water[];
  trees: Tree[];
  lamps: Pt[];
}

export function parseTerrain(buf: ArrayBuffer): HeightGrid[] {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'TBT1') throw new Error('terrain.bin: bad magic');
  const count = dv.getUint32(4, true);
  const ids = ['walk', 'city', 'valley', 'caucasus'];
  let p = 8;
  const grids: HeightGrid[] = [];
  for (let g = 0; g < count; g++) {
    const n = dv.getUint16(p, true);
    const size = dv.getFloat32(p + 4, true);
    p += 8;
    const heights = new Float32Array(n * n);
    for (let k = 0; k < n * n; k++) heights[k] = dv.getUint16(p + k * 2, true) / 10 - 100;
    p += n * n * 2;
    const cover = new Uint8Array(buf.slice(p, p + n * n));
    p += n * n;
    grids.push({ id: ids[g] ?? `g${g}`, n, size, cell: size / (n - 1), heights, cover });
  }
  return grids;
}

export function parseCity(buf: ArrayBuffer): Pick<EarthData, 'buildings' | 'roads' | 'water' | 'trees' | 'lamps'> {
  const dv = new DataView(buf);
  let p = 4;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const i16 = () => { const v = dv.getInt16(p, true); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const pts = (): Pt[] => {
    const n = u16();
    const out: Pt[] = new Array(n);
    for (let k = 0; k < n; k++) { const x = i16() / 2; const z = i16() / 2; out[k] = [x, z]; }
    return out;
  };
  const rings = (): Ring[] => {
    const n = u8();
    const out: Ring[] = [];
    for (let r = 0; r < n; r++) { const inner = u8() === 1; out.push({ inner, pts: pts() }); }
    return out;
  };

  const buildings: Building[] = [];
  for (let n = u32(), k = 0; k < n; k++) {
    const flags = u8();
    const kind = u8();
    const height = u16() / 10;
    const minHeight = u16() / 10;
    const roof = u8();
    const levels = u8();
    const wall = u16();
    const roofColour = u16();
    buildings.push({ estimated: (flags & 1) !== 0, rooftop: (flags & 2) !== 0, kind, height, minHeight, roof, levels, wall, roofColour, rings: rings() });
  }
  const roads: Road[] = [];
  for (let n = u32(), k = 0; k < n; k++) {
    const cls = u8();
    const width = u8() / 4;
    const flags = u8();
    const layer = u8() - 8;
    roads.push({ cls, width, bridge: (flags & 1) !== 0, tunnel: (flags & 2) !== 0, lit: (flags & 4) !== 0, layer, pts: pts() });
  }
  const water: Water[] = [];
  for (let n = u32(), k = 0; k < n; k++) water.push({ rings: rings() });
  const trees: Tree[] = [];
  for (let n = u32(), k = 0; k < n; k++) {
    const x = i16() / 2; const z = i16() / 2;
    const conifer = u8() === 1;
    trees.push({ x, z, conifer, height: u8() });
  }
  const lamps: Pt[] = [];
  for (let n = u32(), k = 0; k < n; k++) { const x = i16() / 2; const z = i16() / 2; lamps.push([x, z]); }
  return { buildings, roads, water, trees, lamps };
}

export async function loadTbilisi(signal?: AbortSignal): Promise<EarthData> {
  const get = async (name: string) => {
    const res = await fetch(`${TBILISI_BASE}/${name}`, { signal });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return res;
  };
  const [manifest, terrain, city] = await Promise.all([
    get('manifest.json').then((r) => r.json() as Promise<Manifest>),
    get('terrain.bin').then((r) => r.arrayBuffer()),
    get('city.bin').then((r) => r.arrayBuffer()),
  ]);
  return { manifest, grids: parseTerrain(terrain), ...parseCity(city) };
}

/** Bilinear height from one grid, or NaN outside it. */
export function sampleGrid(g: HeightGrid, x: number, z: number): number {
  const fx = (x + g.size / 2) / g.cell;
  const fz = (z + g.size / 2) / g.cell;
  if (fx < 0 || fz < 0 || fx > g.n - 1 || fz > g.n - 1) return NaN;
  const i = Math.min(g.n - 2, Math.floor(fx)); const j = Math.min(g.n - 2, Math.floor(fz));
  const tx = fx - i; const tz = fz - j;
  const h = g.heights; const n = g.n;
  return (h[j * n + i] * (1 - tx) + h[j * n + i + 1] * tx) * (1 - tz) + (h[(j + 1) * n + i] * (1 - tx) + h[(j + 1) * n + i + 1] * tx) * tz;
}

export function coverAt(g: HeightGrid, x: number, z: number): number {
  const i = Math.round((x + g.size / 2) / g.cell);
  const j = Math.round((z + g.size / 2) / g.cell);
  if (i < 0 || j < 0 || i >= g.n || j >= g.n) return -1;
  return g.cover[j * g.n + i];
}

/** The finest grid that covers a point, blended across the last cells of each
 *  so the walk area meets the city without a step. */
export function makeHeightAt(grids: HeightGrid[]): (x: number, z: number) => number {
  return (x, z) => {
    for (let k = 0; k < grids.length; k++) {
      const g = grids[k];
      const h = sampleGrid(g, x, z);
      if (Number.isNaN(h)) continue;
      const edge = Math.min(g.size / 2 - Math.abs(x), g.size / 2 - Math.abs(z));
      const band = g.cell * 4;
      if (edge >= band || k === grids.length - 1) return h;
      const outer = sampleGrid(grids[k + 1], x, z);
      if (Number.isNaN(outer)) return h;
      const t = Math.max(0, edge / band);
      return outer + (h - outer) * t;
    }
    return 0;
  };
}

/** The Mtkvari's surface at a point: the nearest level sample along the river. */
export function makeRiverLevel(river: Manifest['river']): (x: number, z: number) => number {
  return (x, z) => {
    let best = river[0]?.[2] ?? 0; let bd = Infinity;
    for (const [rx, rz, l] of river) {
      const d = (rx - x) ** 2 + (rz - z) ** 2;
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  };
}

export const ringArea = (pts: Pt[]): number => {
  let a = 0;
  for (let k = 0; k < pts.length; k++) { const [ax, az] = pts[k]; const [bx, bz] = pts[(k + 1) % pts.length]; a += ax * bz - bx * az; }
  return a / 2;
};
export const centroid = (pts: Pt[]): Pt => {
  let x = 0; let z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
};
export function insideRing(x: number, z: number, pts: Pt[]): boolean {
  let c = false;
  for (let k = 0, l = pts.length - 1; k < pts.length; l = k++) {
    const [ax, az] = pts[k]; const [bx, bz] = pts[l];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) c = !c;
  }
  return c;
}
