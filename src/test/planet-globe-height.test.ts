// The globe's ground: deterministic, band-limited to the grid that draws it,
// levelled to the landing site, and inside the bounds the horizon culling
// leans on. Pure maths, no WebGL.

import { describe, expect, it } from 'vitest';
import { PLANET_BODIES } from '@/lib/solar-system/planet-frame';
import {
  noise3, hash3, bandWeight, fbm, craterProfile, craterDepthM, craterField, gatherCraters, cratersAt,
  makeProceduralHeight, makeEarthHeight, moonRegion, marsRegion, latLonToDir, dirToLatLon, angleBetween,
  siteAxes, localToDir, dirToLocal, mareMaskFromLuminance, HEIGHT_BOUNDS, SITE_SHAPING, type Crater,
} from '@/lib/solar-system/planet-globe-height';

const offset = (lat: number, lon: number, northKm: number, eastKm: number, rKm: number) =>
  [lat + (northKm / rKm) * (180 / Math.PI), lon + (eastKm / (rKm * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI)] as const;

describe('noise and hashing', () => {
  it('is deterministic and bounded', () => {
    expect(noise3(1.3, -2.7, 5.1)).toBe(noise3(1.3, -2.7, 5.1));
    expect(hash3(4, -9, 12, 7)).toBe(hash3(4, -9, 12, 7));
    expect(hash3(4, -9, 12, 7)).not.toBe(hash3(4, -9, 12, 8));
    let lo = Infinity; let hi = -Infinity;
    for (let i = 0; i < 20000; i++) {
      const v = noise3(i * 0.137, i * 0.071 - 40, i * 0.019 + 3);
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    expect(lo).toBeGreaterThan(-1.2);
    expect(hi).toBeLessThan(1.2);
    expect(hi - lo).toBeGreaterThan(1);
  });

  it('is continuous and zero on the lattice', () => {
    expect(noise3(3, 4, 5)).toBeCloseTo(0, 12);
    const a = noise3(1.5, 2.5, 3.5); const b = noise3(1.5 + 1e-6, 2.5, 3.5);
    expect(Math.abs(a - b)).toBeLessThan(1e-4);
  });

  it('band-limits: nothing under two cells, everything past five', () => {
    expect(bandWeight(100, 60)).toBe(0);
    expect(bandWeight(500, 100)).toBe(1);
    const mid = bandWeight(350, 100);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    // A coarse grid gets fewer octaves: its fbm is smoother than a fine one's.
    const rough = (d: number) => {
      let s = 0;
      for (let i = 0; i < 200; i++) s += Math.abs(fbm(i * 0.05, 3, 7, 10, 500, d) - fbm((i + 1) * 0.05, 3, 7, 10, 500, d));
      return s;
    };
    expect(rough(2000)).toBeLessThan(rough(20));
  });
});

describe('craters', () => {
  it('have a bowl, a raised rim and an ejecta blanket that ends at 2.2 radii', () => {
    const d = craterDepthM(2);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThanOrEqual(4000);
    expect(craterDepthM(200)).toBeLessThanOrEqual(4000);
    expect(craterProfile(0, d, 1, 2)).toBeCloseTo(-d, 6);
    const rim = craterProfile(1, d, 1, 2);
    expect(rim).toBeGreaterThan(0);
    // Continuous across the rim.
    expect(Math.abs(craterProfile(0.9999, d, 1, 2) - craterProfile(1.0001, d, 1, 2))).toBeLessThan(rim * 0.01);
    expect(craterProfile(1.6, d, 1, 2)).toBeGreaterThan(0);
    expect(craterProfile(2.2, d, 1, 2)).toBe(0);
    expect(craterProfile(3, d, 1, 2)).toBe(0);
  });

  it('gathering round a patch finds exactly what a direct lookup at each point finds', () => {
    const s = { rMin: 1.4, rMax: 4.5, density: 0.9, freshMin: 0.35, seed: 401 };
    const R = 1737.4;
    const c = latLonToDir(-20, 33);
    const list: Crater[] = [];
    gatherCraters(s, c[0] * R, c[1] * R, c[2] * R, 30, null, list);
    expect(list.length).toBeGreaterThan(0);
    const w = bandWeight(s.rMin * 1000, 50);
    for (let i = 0; i < 60; i++) {
      const [la, lo] = offset(-20, 33, (i % 8) * 3 - 12, Math.floor(i / 8) * 3 - 12, R);
      const d = latLonToDir(la, lo);
      const q = [d[0] * R, d[1] * R, d[2] * R];
      const direct = craterField(q[0], q[1], q[2], s, 50, 1);
      expect(cratersAt(list, q[0], q[1], q[2], 50) * w).toBeCloseTo(direct, 6);
    }
  });

  it('a crater scale the grid cannot draw adds nothing', () => {
    const s = { rMin: 0.045, rMax: 0.14, density: 0.85, freshMin: 0.5, seed: 709 };
    expect(craterField(1000, 200, 1400, s, 500, 1)).toBe(0);
  });
});

describe('the Moon and Mars', () => {
  const moon = makeProceduralHeight('moon', PLANET_BODIES.moon);
  const mars = makeProceduralHeight('mars', PLANET_BODIES.mars);

  it('are deterministic', () => {
    const d = latLonToDir(12.3, -45.6);
    expect(moon.sample(d[0], d[1], d[2], 100)).toBe(makeProceduralHeight('moon', PLANET_BODIES.moon).sample(d[0], d[1], d[2], 100));
    expect(mars.sample(d[0], d[1], d[2], 100)).toBe(mars.sample(d[0], d[1], d[2], 100));
  });

  it('a region sampler agrees with the point sampler inside its patch', () => {
    for (const [f, lat, lon] of [[moon, -30, 40], [mars, -8, 290], [mars, 18.6, 226]] as const) {
      const c = latLonToDir(lat, lon);
      const ang = 0.005;
      const r = f.region(c[0], c[1], c[2], ang, 60);
      for (let i = 0; i < 25; i++) {
        const [la, lo] = offset(lat, lon, ((i % 5) - 2) * 2.5, (Math.floor(i / 5) - 2) * 2.5, PLANET_BODIES[f.world].radiusKm);
        const d = latLonToDir(la, lo);
        expect(angleBetween(d[0], d[1], d[2], c[0], c[1], c[2])).toBeLessThan(ang);
        expect(r(d[0], d[1], d[2])).toBeCloseTo(f.sample(d[0], d[1], d[2], 60), 6);
      }
    }
  });

  it('stay inside the bounds horizon culling uses', () => {
    for (const f of [moon, mars]) {
      const b = HEIGHT_BOUNDS[f.world];
      expect(f.min).toBe(b.min);
      for (let i = 0; i < 1500; i++) {
        const d = latLonToDir(Math.asin(2 * ((i * 0.618034) % 1) - 1) * (180 / Math.PI), (i * 137.508) % 360 - 180);
        const h = f.sample(d[0], d[1], d[2], i % 2 ? 2000 : 200);
        expect(h).toBeGreaterThanOrEqual(b.min);
        expect(h).toBeLessThanOrEqual(b.max);
      }
    }
  });

  it('are flat at the site datum out to the flat radius, and rough again past the blend', () => {
    for (const f of [moon, mars]) {
      const body = PLANET_BODIES[f.world];
      const datum = body.datumKm * 1000;
      const { lat, lon } = body.site;
      for (const km of [0, 1.5, 4, SITE_SHAPING.flatKm - 0.1]) {
        for (const bearing of [0, 1.3, 2.9, 4.4]) {
          const [la, lo] = offset(lat, lon, km * Math.cos(bearing), km * Math.sin(bearing), body.radiusKm);
          const d = latLonToDir(la, lo);
          expect(f.sample(d[0], d[1], d[2], 10)).toBeCloseTo(datum, 6);
        }
      }
      let spread = 0;
      for (let i = 0; i < 40; i++) {
        const [la, lo] = offset(lat, lon, 30 + i * 3, i * 2, body.radiusKm);
        const d = latLonToDir(la, lo);
        spread = Math.max(spread, Math.abs(f.sample(d[0], d[1], d[2], 50) - datum));
      }
      expect(spread).toBeGreaterThan(20);
    }
  });

  it('Mars has its shields high, its basins and its canyon low', () => {
    const R = PLANET_BODIES.mars.radiusKm;
    const at = (lat: number, lon: number, d = 5000) => marsRegion(...latLonToDir(lat, lon), 0, d, R)(...latLonToDir(lat, lon));
    // Olympus Mons' flank, just off the caldera, stands kilometres over the plains round it.
    expect(at(18.65 + 1.5, 226.2)).toBeGreaterThan(10000);
    expect(at(18.65 + 1.5, 226.2) - at(18.65 + 12, 226.2)).toBeGreaterThan(9000);
    expect(at(-42.4, 70.5)).toBeLessThan(-4000);
    // Valles Marineris: the floor is kilometres under the plateau either side.
    const floor = at(-9.5, 289);
    expect(at(-9.5 + 3, 289) - floor).toBeGreaterThan(3000);
    expect(at(-9.5 - 3, 289) - floor).toBeGreaterThan(3000);
    // The northern lowlands sit under the southern highlands.
    let north = 0; let south = 0;
    for (let i = 0; i < 36; i++) { north += at(62, i * 10 - 180, 20000); south += at(-35, i * 10 - 180, 20000); }
    expect(south / 36 - north / 36).toBeGreaterThan(2000);
  });

  it('Mars grows dunes only on a fine grid', () => {
    const R = PLANET_BODIES.mars.radiusKm;
    const c = latLonToDir(-20, 150);
    const fine = marsRegion(c[0], c[1], c[2], 0.001, 20, R);
    const coarse = marsRegion(c[0], c[1], c[2], 0.001, 400, R);
    let diff = 0;
    for (let i = 0; i < 50; i++) {
      const d = latLonToDir(-20 + i * 0.001, 150);
      diff = Math.max(diff, Math.abs(fine(d[0], d[1], d[2]) - coarse(d[0], d[1], d[2])));
    }
    expect(diff).toBeGreaterThan(1);
  });

  it('the maria sink and lose craters where the mask says mare', () => {
    const R = PLANET_BODIES.moon.radiusKm;
    const c = latLonToDir(10, 20);
    const high = moonRegion(c[0], c[1], c[2], 0.05, 3000, R, () => 0);
    const mare = moonRegion(c[0], c[1], c[2], 0.05, 3000, R, () => 1);
    let sumH = 0; let sumM = 0; let varH = 0; let varM = 0;
    const n = 200;
    const hs: number[] = []; const ms: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = latLonToDir(10 + (i % 20) * 0.1, 20 + Math.floor(i / 20) * 0.1);
      hs.push(high(d[0], d[1], d[2])); ms.push(mare(d[0], d[1], d[2]));
    }
    for (let i = 0; i < n; i++) { sumH += hs[i]; sumM += ms[i]; }
    for (let i = 0; i < n; i++) { varH += (hs[i] - sumH / n) ** 2; varM += (ms[i] - sumM / n) ** 2; }
    expect(sumM / n).toBeLessThan(sumH / n - 500);
    expect(varM).toBeLessThan(varH);
  });

  it('a chunk-sized region builds fast enough for the frame budget', () => {
    const R = PLANET_BODIES.moon.radiusKm;
    const c = latLonToDir(-30, 60);
    const r = moonRegion(c[0], c[1], c[2], 0.0005, 30, R);
    // Warm the JIT, then time a 35 × 35 grid.
    for (let i = 0; i < 2000; i++) r(...latLonToDir(-30 + (i % 40) * 1e-4, 60));
    const t0 = performance.now();
    for (let j = 0; j < 35; j++) for (let i = 0; i < 35; i++) r(...latLonToDir(-30 + j * 1e-3, 60 + i * 1e-3));
    expect(performance.now() - t0).toBeLessThan(60);
  });
});

describe('frames and masks', () => {
  it('local metres and directions round-trip, and the site is local 0,0', () => {
    for (const w of ['moon', 'mars', 'earth'] as const) {
      const body = PLANET_BODIES[w];
      const ax = siteAxes(body.site.lat, body.site.lon);
      const Rm = body.radiusKm * 1000;
      const s = localToDir(ax, Rm, 0, 0);
      expect(angleBetween(...s, ...latLonToDir(body.site.lat, body.site.lon))).toBeLessThan(1e-12);
      for (const [x, z] of [[1500, -800], [-12000, 4000], [150000, 90000]]) {
        const d = localToDir(ax, Rm, x, z);
        const [bx, bz] = dirToLocal(ax, Rm, ...d);
        expect(bx).toBeCloseTo(x, 3);
        expect(bz).toBeCloseTo(z, 3);
      }
      // North is −Z: a point at −Z is at a higher latitude (for a site off the pole).
      const n = localToDir(ax, Rm, 0, -10000);
      expect(dirToLatLon(...n)[0]).toBeGreaterThan(body.site.lat);
    }
  });

  it('reads the maria from an albedo map: dark is mare, bright is not', () => {
    const w = 8; const h = 4;
    const lum = new Float32Array(w * h).fill(0.6);
    // A dark block in the northern-east quarter (rows 0–1, columns 4–7: longitudes 0…180).
    for (let y = 0; y < 2; y++) for (let x = 4; x < 8; x++) lum[y * w + x] = 0.2;
    const mask = mareMaskFromLuminance(lum, w, h);
    expect(mask(60, 90)).toBeGreaterThan(0.9);
    expect(mask(-60, -90)).toBeLessThan(0.1);
  });

  it('Earth passes its zoom and missing tiles through', () => {
    const seen: number[] = [];
    const f = makeEarthHeight((_x, _y, _z, zoom, ctx) => { seen.push(zoom); ctx?.missing.add(42); return -120; });
    const ctx = { zoom: 9, missing: new Set<number>() };
    expect(f.sample(1, 0, 0, 100, ctx)).toBe(-120);
    expect(seen).toEqual([9]);
    expect(ctx.missing.has(42)).toBe(true);
    expect(f.floor).toBe(0);
  });
});
