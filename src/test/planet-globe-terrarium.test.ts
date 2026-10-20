// Earth's streamed elevation: the terrarium decode, Web-Mercator tile
// addressing, the Catmull-Rom sampler with its fall-back to coarser tiles,
// and the store's queue, LRU and failure handling. Also the GIBS imagery
// tile addressing. The loaders are faked: no network, no canvas.

import { describe, expect, it } from 'vitest';
import {
  terrariumHeight, decodeTerrarium, lonLatToPixel, tileOf, tileBounds, tileKey, keyToTile, metresPerPixel,
  zoomForSpacing, bakeFrame, terrariumUrl, TerrariumStore, TILE_PX,
} from '@/lib/solar-system/planet-globe-terrarium';
import { gibsTileFor, gibsBounds, gibsUrl, gibsLevelFor, gibsSpan } from '@/lib/solar-system/planet-globe-imagery';

/** A tile whose heights are a function of the global pixel coordinates. */
function synthTile(tx: number, ty: number, f: (gx: number, gy: number) => number): Float32Array {
  const t = new Float32Array(TILE_PX * TILE_PX);
  for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX; x++) t[y * TILE_PX + x] = f(tx * TILE_PX + x, ty * TILE_PX + y);
  return t;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('terrarium decode', () => {
  it('packs metres as R·256 + G + B/256 − 32768', () => {
    expect(terrariumHeight(128, 0, 0)).toBe(0);
    expect(terrariumHeight(0, 0, 0)).toBe(-32768);
    expect(terrariumHeight(129, 200, 128)).toBeCloseTo(456.5, 9);
    expect(terrariumHeight(127, 255, 0)).toBe(-1);
  });

  it('decodes an RGBA buffer row by row, ignoring alpha', () => {
    const rgba = new Uint8ClampedArray(2 * 2 * 4);
    const px = [[128, 0, 0], [129, 200, 128], [120, 0, 0], [130, 16, 64]];
    px.forEach((p, i) => { rgba.set([p[0], p[1], p[2], 255], i * 4); });
    const h = decodeTerrarium(rgba, 2, 2);
    expect(Array.from(h)).toEqual([0, 456.5, -2048, 528.25]);
  });
});

describe('Web-Mercator addressing', () => {
  it('puts the equator and prime meridian at the centre of the world', () => {
    const [x, y] = lonLatToPixel(0, 0, 0);
    expect(x).toBeCloseTo(127.5, 9);
    expect(y).toBeCloseTo(127.5, 9);
    expect(tileOf(0.1, 0.1, 1)).toEqual([1, 0]);
    expect(tileOf(-0.1, -0.1, 1)).toEqual([0, 1]);
  });

  it('finds Tbilisi on the tile the bake read it from', () => {
    expect(tileOf(41.6935274, 44.8104684, 8)).toEqual([159, 95]);
    expect(terrariumUrl(8, 159, 95)).toBe('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/8/159/95.png');
  });

  it('bounds a tile so that its centre maps back to it', () => {
    for (const [z, x, y] of [[3, 5, 2], [11, 1300, 760], [13, 5115, 3063]]) {
      const [s, w, n, e] = tileBounds(z, x, y);
      expect(n).toBeGreaterThan(s);
      expect(e).toBeGreaterThan(w);
      expect(tileOf((s + n) / 2, (w + e) / 2, z)).toEqual([x, y]);
    }
  });

  it('wraps longitude and clamps the poles', () => {
    expect(tileOf(10, 180, 2)[0]).toBe(0);
    expect(tileOf(10, -180, 2)[0]).toBe(0);
    expect(tileOf(10, 179.9, 2)[0]).toBe(3);
    expect(tileOf(10, -179.9, 2)[0]).toBe(0);
    expect(tileOf(89.9, 0, 4)[1]).toBe(0);
    expect(tileOf(-89.9, 0, 4)[1]).toBe(15);
  });

  it('packs tile keys losslessly', () => {
    for (const t of [[0, 0, 0], [13, 8191, 4095], [15, 32767, 32767], [7, 3, 99]] as const) {
      expect(keyToTile(tileKey(t[0], t[1], t[2]))).toEqual([...t]);
    }
  });

  it('picks the zoom whose pixels match the grid, capped', () => {
    expect(metresPerPixel(0, 0)).toBeCloseTo(156543, -1);
    expect(zoomForSpacing(150, 0, 20)).toBe(10);
    expect(zoomForSpacing(10, 41.7, 11)).toBe(11);
    expect(zoomForSpacing(10, 41.7, 13)).toBe(13);
    expect(zoomForSpacing(1e7, 0, 13)).toBe(0);
  });

  it('the bake frame round-trips and matches the scene at its origin', () => {
    const f = bakeFrame(41.6935274, 44.8104684);
    expect(f.toGeo(0, 0)).toEqual([41.6935274, 44.8104684]);
    const [lat, lon] = f.toGeo(12345, -6789);
    const [x, z] = f.toLocal(lat, lon);
    expect(x).toBeCloseTo(12345, 6);
    expect(z).toBeCloseTo(-6789, 6);
    // North is −Z.
    expect(f.toGeo(0, -1000)[0]).toBeGreaterThan(41.6935274);
  });
});

describe('the store and its sampler', () => {
  const make = (over: Partial<ConstructorParameters<typeof TerrariumStore<Float32Array>>[0]> = {}) => {
    const loads: string[] = [];
    const store = new TerrariumStore<Float32Array>({
      load: (z, x, y) => { loads.push(`${z}/${x}/${y}`); return Promise.resolve(synthTile(x, y, () => z * 100)); },
      decode: (g) => g,
      maxTiles: 4,
      maxConcurrent: 2,
      ...over,
    });
    return { store, loads };
  };

  it('reproduces a linear ramp exactly with Catmull-Rom, across a tile edge', () => {
    const { store } = make({ maxTiles: 100 });
    const z = 3;
    const ramp = (gx: number, gy: number) => gx * 2 + gy * 0.5;
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) store.put(tileKey(z, tx, ty), synthTile(tx, ty, ramp));
    for (const [lat, lon] of [[10, 20], [41.7, 44.8], [0.001, 0.001], [-30, -135.01]]) {
      const [px, py] = lonLatToPixel(lat, lon, z);
      expect(store.sampleAt(lat, lon, z)).toBeCloseTo(ramp(px, py), 6);
    }
    // Exactly on a tile boundary (between pixel 255 of one tile and 0 of the next).
    const lonEdge = (TILE_PX / (8 * TILE_PX)) * 360 - 180;
    const [px, py] = lonLatToPixel(5, lonEdge, z);
    expect(store.sampleAt(5, lonEdge, z)).toBeCloseTo(ramp(px, py), 6);
  });

  it('falls back to a coarser tile and reports the one it wanted', () => {
    const { store } = make();
    store.put(tileKey(0, 0, 0), synthTile(0, 0, () => 250));
    const missing = new Set<number>();
    expect(store.sample(41.69, 44.81, 11, missing)).toBeCloseTo(250, 6);
    const [tx, ty] = tileOf(41.69, 44.81, 11);
    expect(missing.has(tileKey(11, tx, ty))).toBe(true);
    // Nothing at all: the fallback.
    const empty = make().store;
    expect(empty.sample(0, 0, 5, undefined, -7)).toBe(-7);
  });

  it('loads what is asked for, highest priority first, a few at a time, and announces arrivals', async () => {
    const { store, loads } = make();
    const arrived: number[] = [];
    store.onArrive((k) => arrived.push(k));
    store.request(tileKey(5, 1, 1), 1);
    store.request(tileKey(5, 2, 2), 5);
    store.request(tileKey(5, 3, 3), 3);
    store.request(tileKey(5, 3, 3), 3);
    store.pump();
    expect(loads).toEqual(['5/2/2', '5/3/3']);
    expect(store.stats().inflight).toBe(2);
    await flush();
    store.pump();
    // One decode at least per pump; with time to spare, all of them.
    expect(store.stats().streamed).toBe(2);
    expect(arrived).toEqual([tileKey(5, 2, 2), tileKey(5, 3, 3)]);
    expect(loads).toEqual(['5/2/2', '5/3/3', '5/1/1']);
    await flush();
    store.pump(() => false);
    expect(store.has(tileKey(5, 1, 1))).toBe(true);
    // Already here: not asked for again.
    store.request(tileKey(5, 2, 2), 9);
    store.pump();
    expect(loads.length).toBe(3);
  });

  it('keeps an LRU of decoded tiles, with the coarsest pinned', () => {
    const { store } = make();
    store.put(tileKey(0, 0, 0), new Float32Array(TILE_PX * TILE_PX));
    for (let i = 0; i < 6; i++) store.put(tileKey(9, i, 0), new Float32Array(TILE_PX * TILE_PX));
    // maxTiles 4: 9/0/0 and 9/1/0 went; 0/0/0 is pinned.
    expect(store.has(tileKey(9, 0, 0))).toBe(false);
    expect(store.has(tileKey(9, 1, 0))).toBe(false);
    expect(store.has(tileKey(9, 5, 0))).toBe(true);
    expect(store.has(tileKey(0, 0, 0))).toBe(true);
    // Use keeps a tile.
    store.get(tileKey(9, 2, 0));
    store.put(tileKey(9, 6, 0), new Float32Array(TILE_PX * TILE_PX));
    expect(store.has(tileKey(9, 2, 0))).toBe(true);
    expect(store.has(tileKey(9, 3, 0))).toBe(false);
  });

  it('does not ask again for a tile that failed, until the retry time', async () => {
    let t = 0;
    let calls = 0;
    const store = new TerrariumStore<Float32Array>({
      load: () => { calls++; return Promise.reject(new Error('404')); },
      decode: (g) => g, maxTiles: 4, maxConcurrent: 2, retryMs: 1000, now: () => t,
    });
    const arrived: number[] = [];
    store.onArrive((k) => arrived.push(k));
    const k = tileKey(6, 1, 1);
    store.request(k, 1);
    store.pump();
    await flush();
    store.pump();
    expect(arrived).toEqual([k]);
    expect(store.stats().failed).toBe(1);
    store.request(k, 1);
    store.pump();
    expect(calls).toBe(1);
    t = 2000;
    store.request(k, 1);
    store.pump();
    expect(calls).toBe(2);
  });

  it('ignores loads that land after dispose', async () => {
    const { store } = make();
    store.request(tileKey(4, 1, 1), 1);
    store.pump();
    store.dispose();
    await flush();
    store.pump();
    expect(store.stats().tiles).toBe(0);
    expect(store.stats().streamed).toBe(0);
  });
});

describe('GIBS imagery addressing (EPSG:4326)', () => {
  it('level 0 is two 180° tiles, rows from the north', () => {
    expect(gibsSpan(0)).toBe(180);
    expect(gibsBounds(0, 0, 0)).toEqual([-180, -90, 0, 90]);
    expect(gibsBounds(0, 1, 0)).toEqual([0, -90, 180, 90]);
    expect(gibsBounds(3, 9, 2)).toEqual([22.5, 22.5, 45, 45]);
    expect(gibsUrl(3, 9, 2)).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/3/2/9.jpeg');
  });

  it('finds the finest tile holding a whole box, and none across a seam', () => {
    // A box round Tbilisi.
    const t = gibsTileFor(41.5, 44.6, 41.9, 45.0, 7)!;
    expect(t.z).toBe(7);
    const [w, s, e, n] = gibsBounds(t.z, t.x, t.y);
    expect(w).toBeLessThanOrEqual(44.6); expect(e).toBeGreaterThanOrEqual(45.0);
    expect(s).toBeLessThanOrEqual(41.5); expect(n).toBeGreaterThanOrEqual(41.9);
    // Straddling a level-7 edge (43.59375°) that is not a level-6 one: level 6.
    const c = gibsTileFor(41.5, 43.5, 41.9, 43.7, 7)!;
    expect(c.z).toBe(6);
    // 45° is an edge at every level from 3 down: nothing holds a box across it.
    expect(gibsTileFor(41.5, 44.9, 41.9, 45.1, 7)).toBeNull();
    // Too big for level 3: none.
    expect(gibsTileFor(-10, -10, 10, 10, 7)).toBeNull();
  });

  it('matches levels to grid spacing', () => {
    expect(gibsLevelFor(0.0045)).toBe(7);
    expect(gibsLevelFor(1)).toBe(0);
  });
});
