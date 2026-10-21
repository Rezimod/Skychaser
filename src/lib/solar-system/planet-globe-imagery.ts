// Optional satellite imagery over Earth's globe: NASA GIBS, Blue Marble with
// shaded relief and bathymetry, 500 m a pixel, in the EPSG:4326 tile matrix
// (level 0 is two 512 px tiles side by side, each 180° square; every level
// halves them). Twenty times finer than the 4K map the globe starts from,
// which is what makes the last few hundred kilometres of a descent read as a
// place rather than a blur.
//
// It is off unless it answers: one tile is asked for at start, through an
// <img> (THREE.ImageLoader, crossOrigin) as the CSP's `img-src https:`
// allows, and if that fails the provider is off for the session and asks
// for nothing more. `GIBS_IMAGERY` turns it off outright.
//
// Unverified from the build machine: its network blocks NASA's hosts, so
// the URL pattern and the level range follow the GIBS documentation.

import * as THREE from 'three';

/** The switch. */
export const GIBS_IMAGERY = true;

/** The deepest level of the 500 m tile matrix. */
export const GIBS_MAX_LEVEL = 7;
/** Coarser than this the 4K map is as good. */
export const GIBS_MIN_LEVEL = 3;
export const GIBS_TILE_PX = 512;

export function gibsUrl(z: number, x: number, y: number): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/${z}/${y}/${x}.jpeg`;
}

/** A tile's span, degrees: 180 at level 0. */
export function gibsSpan(z: number): number {
  return 180 / 2 ** z;
}

/** Degrees per pixel at a level. */
export function gibsDegPerPx(z: number): number {
  return gibsSpan(z) / GIBS_TILE_PX;
}

/** A tile's bounds: [west, south, east, north], degrees. Row 0 is at the north pole. */
export function gibsBounds(z: number, x: number, y: number): [number, number, number, number] {
  const s = gibsSpan(z);
  return [-180 + x * s, 90 - (y + 1) * s, -180 + (x + 1) * s, 90 - y * s];
}

/**
 * The finest tile at or above `wantZ` that holds a whole latitude/longitude
 * box (degrees; the box must not cross the antimeridian), or null when even
 * level `GIBS_MIN_LEVEL` does not.
 */
export function gibsTileFor(south: number, west: number, north: number, east: number, wantZ: number): { z: number; x: number; y: number } | null {
  for (let z = Math.min(wantZ, GIBS_MAX_LEVEL); z >= GIBS_MIN_LEVEL; z--) {
    const s = gibsSpan(z);
    const x0 = Math.floor((west + 180) / s); const x1 = Math.floor((east + 180) / s - 1e-9);
    const y0 = Math.floor((90 - north) / s); const y1 = Math.floor((90 - south) / s - 1e-9);
    if (x0 === x1 && y0 === y1 && x0 >= 0 && y0 >= 0 && x0 < 2 ** (z + 1) && y0 < 2 ** z) return { z, x: x0, y: y0 };
  }
  return null;
}

/** The level whose pixels match a grid spacing of `spacingDeg`. */
export function gibsLevelFor(spacingDeg: number): number {
  const z = Math.ceil(Math.log2(180 / (GIBS_TILE_PX * Math.max(1e-6, spacingDeg))));
  return Math.max(0, Math.min(GIBS_MAX_LEVEL, z));
}

export interface ImageryTile {
  texture: THREE.Texture;
  /** [west, south, east, north], degrees. */
  bounds: [number, number, number, number];
}

const key = (z: number, x: number, y: number) => `${z}/${x}/${y}`;

export class GibsImagery {
  private state: 'off' | 'probing' | 'on' | 'failed' = 'off';
  private tiles = new Map<string, ImageryTile>();
  private inflight = new Set<string>();
  private wanted = new Map<string, number>();
  private failed = new Set<string>();
  private loader = new THREE.ImageLoader();
  private disposed = false;
  private loaded = 0;

  constructor(private readonly opts: { maxTextures: number; maxConcurrent: number; anisotropy: number }) {
    this.loader.setCrossOrigin('anonymous');
  }

  /** Ask for one tile (the one over the landing site, which the descent
   *  will want anyway); on an answer, the provider is on. */
  start(siteLat: number, siteLon: number): void {
    if (!GIBS_IMAGERY || this.state !== 'off' || this.disposed) return;
    const t = gibsTileFor(siteLat, siteLon, siteLat, siteLon, GIBS_MIN_LEVEL) ?? { z: GIBS_MIN_LEVEL, x: 0, y: 0 };
    this.state = 'probing';
    this.fetch(t.z, t.x, t.y, true);
  }

  get enabled(): boolean {
    return this.state === 'on';
  }

  /** The best tile here for a box, asking for the finer one it wants. */
  tileFor(south: number, west: number, north: number, east: number, wantZ: number, priority: number): ImageryTile | null {
    if (this.state !== 'on') return null;
    const best = gibsTileFor(south, west, north, east, wantZ);
    if (!best) return null;
    for (let z = best.z; z >= GIBS_MIN_LEVEL; z--) {
      const t = gibsTileFor(south, west, north, east, z);
      if (!t) break;
      const k = key(t.z, t.x, t.y);
      const have = this.tiles.get(k);
      if (have) {
        this.tiles.delete(k); this.tiles.set(k, have);
        if (z === best.z) return have;
        this.want(best.z, best.x, best.y, priority);
        return have;
      }
    }
    this.want(best.z, best.x, best.y, priority);
    return null;
  }

  /** Start loads, highest priority first. */
  pump(): void {
    if (this.state !== 'on' || this.disposed) return;
    if (this.inflight.size >= this.opts.maxConcurrent || !this.wanted.size) return;
    const order = [...this.wanted.entries()].sort((a, b) => b[1] - a[1]);
    this.wanted.clear();
    for (const [k] of order) {
      if (this.inflight.size >= this.opts.maxConcurrent) break;
      const [z, x, y] = k.split('/').map(Number);
      this.fetch(z, x, y, false);
    }
  }

  stats(): { imagery: number; imageryLoading: number; imageryOn: number } {
    return { imagery: this.tiles.size, imageryLoading: this.inflight.size, imageryOn: this.state === 'on' ? 1 : 0 };
  }

  dispose(): void {
    this.disposed = true;
    for (const t of this.tiles.values()) t.texture.dispose();
    this.tiles.clear();
    this.wanted.clear();
    this.inflight.clear();
  }

  private want(z: number, x: number, y: number, priority: number): void {
    const k = key(z, x, y);
    if (this.tiles.has(k) || this.inflight.has(k) || this.failed.has(k)) return;
    const p = this.wanted.get(k);
    if (p === undefined || priority > p) this.wanted.set(k, priority);
  }

  private fetch(z: number, x: number, y: number, probe: boolean): void {
    const k = key(z, x, y);
    this.inflight.add(k);
    this.loader.load(gibsUrl(z, x, y), (img) => {
      if (this.disposed) return;
      this.inflight.delete(k);
      if (probe) this.state = 'on';
      const texture = new THREE.Texture(img);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.opts.anisotropy;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      this.tiles.set(k, { texture, bounds: gibsBounds(z, x, y) });
      this.loaded++;
      while (this.tiles.size > this.opts.maxTextures) {
        const oldest = this.tiles.keys().next().value as string;
        this.tiles.get(oldest)?.texture.dispose();
        this.tiles.delete(oldest);
      }
    }, undefined, () => {
      if (this.disposed) return;
      this.inflight.delete(k);
      // The probe failing turns the provider off for the session, quietly.
      if (probe) { this.state = 'failed'; this.wanted.clear(); return; }
      this.failed.add(k);
    });
  }
}
