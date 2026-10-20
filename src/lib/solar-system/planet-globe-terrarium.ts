// Earth's real elevation, streamed: the public AWS Terrain Tiles in the
// Mapzen "terrarium" encoding, the same source the Tbilisi bake used
// (scripts/bake-tbilisi.mjs), so the globe and the surface scene's own
// terrain are the same numbers where they meet.
//
// A tile is a 256 px Web-Mercator PNG; each pixel packs a height as
// (R·256 + G + B/256) − 32768 m. The globe asks for them through an <img>
// (THREE.ImageLoader with crossOrigin), which the page's CSP allows under
// `img-src https:` where a fetch would need a connect-src entry, and
// decodes each into a Float32 grid through a 2D canvas.
//
// This module is the pure part: the decode, the tile arithmetic, the
// Catmull-Rom sampler that walks down to a coarser tile while a finer one is
// on its way, and the store with its LRU. The loader and the decoder are
// handed in, so the tests run without a browser.

/** The tile URL. */
export function terrariumUrl(z: number, x: number, y: number): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

export const TILE_PX = 256;

/** One pixel's height, m. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** An RGBA pixel buffer (as `getImageData` gives it) → heights, m, row-major. */
export function decodeTerrarium(rgba: ArrayLike<number>, w = TILE_PX, h = TILE_PX): Float32Array {
  const out = new Float32Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768;
  return out;
}

/** Web Mercator stops here. */
export const MERCATOR_MAX_LAT = 85.05112878;

const DEG = Math.PI / 180;

/**
 * A latitude and longitude as global pixel coordinates at zoom z, with pixel
 * (i, j)'s centre at exactly (i, j): what the samplers index by.
 */
export function lonLatToPixel(lat: number, lon: number, z: number): [number, number] {
  const n = TILE_PX * 2 ** z;
  const la = Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat));
  const s = Math.sin(la * DEG);
  const x = ((((lon + 180) / 360) % 1) + 1) % 1 * n;
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x - 0.5, y - 0.5];
}

/** Which tile holds a latitude and longitude at zoom z. */
export function tileOf(lat: number, lon: number, z: number): [number, number] {
  const [px, py] = lonLatToPixel(lat, lon, z);
  const n = 2 ** z;
  const tx = Math.floor((px + 0.5) / TILE_PX);
  const ty = Math.floor((py + 0.5) / TILE_PX);
  return [((tx % n) + n) % n, Math.max(0, Math.min(n - 1, ty))];
}

/** A tile's latitude/longitude bounds: [south, west, north, east], degrees. */
export function tileBounds(z: number, x: number, y: number): [number, number, number, number] {
  const n = 2 ** z;
  const lat = (t: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * t) / n))) / DEG;
  return [lat(y + 1), (x / n) * 360 - 180, lat(y), ((x + 1) / n) * 360 - 180];
}

/** Tiles as one number: zoom up to 15, x and y up to 2¹⁵. */
export function tileKey(z: number, x: number, y: number): number {
  return z * 2 ** 30 + y * 2 ** 15 + x;
}

export function keyToTile(key: number): [number, number, number] {
  const z = Math.floor(key / 2 ** 30);
  const rest = key - z * 2 ** 30;
  const y = Math.floor(rest / 2 ** 15);
  return [z, rest - y * 2 ** 15, y];
}

/** Ground metres per pixel at a latitude and zoom. */
export function metresPerPixel(lat: number, z: number): number {
  return (40075016.686 * Math.cos(Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat)) * DEG)) / (TILE_PX * 2 ** z);
}

/** The zoom whose pixels best match a grid of `spacingM` at `lat`, capped. */
export function zoomForSpacing(spacingM: number, lat: number, cap: number): number {
  const at0 = metresPerPixel(lat, 0);
  const z = Math.round(Math.log2(at0 / Math.max(1e-3, spacingM)));
  return Math.max(0, Math.min(cap, z));
}

/** The local frame the Tbilisi bake used (WGS84 radii of curvature at the
 *  origin): local metres (east +X, north −Z) → latitude, longitude. */
export function bakeFrame(lat0: number, lon0: number): { toGeo: (x: number, z: number) => [number, number]; toLocal: (lat: number, lon: number) => [number, number] } {
  const A = 6378137; const E2 = 6.69437999014e-3;
  const s = Math.sin(lat0 * DEG);
  const w = 1 - E2 * s * s;
  const N = A / Math.sqrt(w);
  const M = (A * (1 - E2)) / Math.pow(w, 1.5);
  const kx = N * Math.cos(lat0 * DEG) * DEG;
  const kz = M * DEG;
  return {
    toGeo: (x, z) => [lat0 - z / kz, lon0 + x / kx],
    toLocal: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * kz],
  };
}

const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

export interface TerrariumStoreOptions<T> {
  /** Start loading a tile; resolve with whatever `decode` turns into heights. */
  load: (z: number, x: number, y: number) => Promise<T>;
  decode: (raw: T) => Float32Array;
  /** Decoded tiles kept, LRU. Zooms 0–2 are pinned and not counted. */
  maxTiles: number;
  maxConcurrent: number;
  /** A failed tile is not asked for again for this long, ms. */
  retryMs?: number;
  now?: () => number;
}

export interface TerrariumStats {
  tiles: number;
  inflight: number;
  queued: number;
  decoding: number;
  streamed: number;
  failed: number;
}

/**
 * Decoded tiles, the queue of tiles wanted, the loads in flight. `pump`
 * starts loads (highest priority first) and decodes what has arrived, one
 * at a time while the frame's budget lasts; `onArrive` hears about every
 * tile that lands or fails, which is when chunks built without it rebuild.
 */
export class TerrariumStore<T> {
  private tiles = new Map<number, Float32Array>();
  private pinned = new Map<number, Float32Array>();
  private wanted = new Map<number, number>();
  private inflight = new Set<number>();
  private arrived: { key: number; raw: T | null }[] = [];
  private failed = new Map<number, number>();
  private listeners = new Set<(key: number) => void>();
  private disposed = false;
  private streamed = 0;
  private readonly opts: TerrariumStoreOptions<T>;
  private readonly now: () => number;

  constructor(opts: TerrariumStoreOptions<T>) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
  }

  /** A decoded tile, or undefined; marks it used. */
  get(key: number): Float32Array | undefined {
    const p = this.pinned.get(key);
    if (p) return p;
    const t = this.tiles.get(key);
    if (t) { this.tiles.delete(key); this.tiles.set(key, t); }
    return t;
  }

  has(key: number): boolean {
    return this.pinned.has(key) || this.tiles.has(key);
  }

  /** Ask for a tile; a higher priority wins if it is asked for twice. */
  request(key: number, priority: number): void {
    if (this.disposed || this.has(key) || this.inflight.has(key)) return;
    const f = this.failed.get(key);
    if (f !== undefined && this.now() - f < (this.opts.retryMs ?? 60_000)) return;
    const p = this.wanted.get(key);
    if (p === undefined || priority > p) this.wanted.set(key, priority);
  }

  onArrive(fn: (key: number) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Put a decoded tile in directly (tests, and a warm start). */
  put(key: number, grid: Float32Array): void {
    if (this.disposed) return;
    const [z] = keyToTile(key);
    if (z <= 2) this.pinned.set(key, grid);
    else {
      this.tiles.delete(key);
      this.tiles.set(key, grid);
      while (this.tiles.size > this.opts.maxTiles) {
        const oldest = this.tiles.keys().next().value as number;
        this.tiles.delete(oldest);
      }
    }
  }

  /** Start loads up to the concurrency; decode arrivals while `more()` says there is time (always one). */
  pump(more: () => boolean = () => true): void {
    if (this.disposed) return;
    if (this.inflight.size < this.opts.maxConcurrent && this.wanted.size) {
      const order = [...this.wanted.entries()].sort((a, b) => b[1] - a[1]);
      for (const [key] of order) {
        if (this.inflight.size >= this.opts.maxConcurrent) break;
        this.wanted.delete(key);
        this.start(key);
      }
    }
    let first = true;
    while (this.arrived.length && (first || more())) {
      first = false;
      const { key, raw } = this.arrived.shift()!;
      if (raw === null) {
        this.failed.set(key, this.now());
      } else {
        try {
          this.put(key, this.opts.decode(raw));
          this.streamed++;
        } catch {
          this.failed.set(key, this.now());
        }
      }
      for (const fn of this.listeners) fn(key);
    }
  }

  /** Drop the queue of wanted tiles (the next selection asks again). */
  clearWanted(): void {
    this.wanted.clear();
  }

  private start(key: number): void {
    const [z, x, y] = keyToTile(key);
    this.inflight.add(key);
    let p: Promise<T>;
    try {
      p = this.opts.load(z, x, y);
    } catch {
      p = Promise.reject(new Error('load'));
    }
    p.then(
      (raw) => {
        if (this.disposed) return;
        this.inflight.delete(key);
        this.arrived.push({ key, raw });
      },
      () => {
        if (this.disposed) return;
        this.inflight.delete(key);
        this.arrived.push({ key, raw: null });
      },
    );
  }

  /**
   * Height at a latitude and longitude from the zoom-z tiles, Catmull-Rom
   * across tile edges (the bake's own interpolation). Returns NaN when a
   * tile it needs is not here, and adds its key to `missing` if given.
   */
  sampleAt(lat: number, lon: number, z: number, missing?: Set<number>): number {
    const [px, py] = lonLatToPixel(lat, lon, z);
    const ix = Math.floor(px); const iy = Math.floor(py);
    const fx = px - ix; const fy = py - iy;
    const n = TILE_PX * 2 ** z;
    const tilesAcross = 2 ** z;
    const tx0 = Math.floor((ix - 1) / TILE_PX); const tx1 = Math.floor((ix + 2) / TILE_PX);
    const ty0 = Math.floor(Math.max(0, iy - 1) / TILE_PX); const ty1 = Math.floor(Math.min(n - 1, iy + 2) / TILE_PX);
    if (tx0 === tx1 && ty0 === ty1 && tx0 >= 0 && tx0 < tilesAcross) {
      // The common case: all sixteen pixels in one tile.
      const key = tileKey(z, tx0, ty0);
      const t = this.get(key);
      if (!t) { missing?.add(key); return NaN; }
      const bx = ix - tx0 * TILE_PX; const by = iy - ty0 * TILE_PX;
      const rows = [0, 0, 0, 0];
      for (let j = 0; j < 4; j++) {
        const yy = Math.max(0, Math.min(TILE_PX - 1, by + j - 1));
        const o = yy * TILE_PX + bx;
        rows[j] = cr(t[o - 1], t[o], t[o + 1], t[o + 2], fx);
      }
      return cr(rows[0], rows[1], rows[2], rows[3], fy);
    }
    let ok = true;
    const at = (gx: number, gy: number): number => {
      const x = ((gx % n) + n) % n; const y = Math.max(0, Math.min(n - 1, gy));
      const tx = Math.floor(x / TILE_PX); const ty = Math.floor(y / TILE_PX);
      const key = tileKey(z, tx, ty);
      const t = this.get(key);
      if (!t) { ok = false; missing?.add(key); return 0; }
      return t[(y - ty * TILE_PX) * TILE_PX + (x - tx * TILE_PX)];
    };
    const rows = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      const gy = iy + j - 1;
      rows[j] = cr(at(ix - 1, gy), at(ix, gy), at(ix + 1, gy), at(ix + 2, gy), fx);
    }
    return ok ? cr(rows[0], rows[1], rows[2], rows[3], fy) : NaN;
  }

  /**
   * Height from the finest tiles here, starting at zoom z and walking down
   * to coarser ones while a finer tile is missing. The zoom-z tiles that were
   * missing go into `missing`. Nothing at all (before zoom 0 has landed): `fallback`.
   */
  sample(lat: number, lon: number, z: number, missing?: Set<number>, fallback = 0): number {
    for (let zz = z; zz >= 0; zz--) {
      const v = this.sampleAt(lat, lon, zz, zz === z ? missing : undefined);
      if (!Number.isNaN(v)) return v;
    }
    return fallback;
  }

  stats(): TerrariumStats {
    return {
      tiles: this.tiles.size + this.pinned.size,
      inflight: this.inflight.size,
      queued: this.wanted.size,
      decoding: this.arrived.length,
      streamed: this.streamed,
      failed: this.failed.size,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.tiles.clear();
    this.pinned.clear();
    this.wanted.clear();
    this.inflight.clear();
    this.arrived.length = 0;
    this.listeners.clear();
  }
}
