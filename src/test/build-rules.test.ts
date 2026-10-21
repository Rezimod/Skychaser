import { describe, expect, it } from 'vitest';
import {
  BUILD_SITES, CAPS, GRID, MODULE_SPECS, checkPlacement, extent, inSite, isQuarterYaw, moduleSpec, quarterOf, rectOf, rectsOverlap, snap, yawOfQuarter,
} from '@/lib/solar-system/build-rules';
import { CATALOG } from '@/lib/solar-system/build-catalog';
import { PAD_CENTER, TERRAIN_WALK_RADIUS } from '@/lib/solar-system/moon-terrain';
import { TELESCOPE_SITE } from '@/lib/solar-system/moon-base-zones';
import { SINKHOLE } from '@/lib/solar-system/moon-sinkhole';
import { ANOMALY_SITE, SURVEY_SITE } from '@/lib/solar-system/moon-mission';
import { SAMPLE_ROCKS, SEISMO_POINT } from '@/lib/solar-system/moon-jobs';
import { WORLDS } from '@/lib/solar-system/world-profiles';

const Q = Math.PI / 2;
const habitat = moduleSpec('habitat')!;

describe('the catalogue', () => {
  it('has a builder and a grid-sized footprint for every module', () => {
    expect(CATALOG.map((c) => c.id)).toEqual(MODULE_SPECS.map((m) => m.id));
    for (const m of MODULE_SPECS) {
      expect(m.w % GRID).toBe(0);
      expect(m.d % GRID).toBe(0);
      expect(m.h).toBeGreaterThan(0);
      expect(typeof CATALOG.find((c) => c.id === m.id)?.build).toBe('function');
    }
    expect(moduleSpec('reactor')).toBeNull();
  });
});

describe('snapping', () => {
  it('turns in quarters and swaps the footprint', () => {
    expect(quarterOf(0)).toBe(0);
    expect(quarterOf(Q * 3)).toBe(3);
    expect(quarterOf(-Q)).toBe(3);
    expect(quarterOf(Q * 5)).toBe(1);
    expect(yawOfQuarter(2)).toBeCloseTo(Math.PI);
    expect(extent(habitat, 0)).toEqual({ w: 6, d: 4 });
    expect(extent(habitat, Q)).toEqual({ w: 4, d: 6 });
    expect(isQuarterYaw(Q)).toBe(true);
    expect(isQuarterYaw(0.3)).toBe(false);
    expect(isQuarterYaw(Number.NaN)).toBe(false);
  });

  it('puts every edge on a grid line, so pieces tile flush', () => {
    for (const m of MODULE_SPECS) {
      for (const yaw of [0, Q]) {
        const s = snap(m, 71.3, -3.7, yaw);
        const r = rectOf(m, s.x, s.z, yaw);
        for (const edge of [r.minX, r.maxX, r.minZ, r.maxZ]) expect(Math.abs(edge / GRID - Math.round(edge / GRID))).toBeLessThan(1e-9);
        expect(Math.abs(s.x - 71.3)).toBeLessThanOrEqual(GRID / 2);
      }
    }
  });

  it('lets pieces touch but not overlap', () => {
    const a = rectOf(habitat, 80, 0, 0);
    expect(rectsOverlap(a, rectOf(moduleSpec('corridor')!, 85, 0, 0))).toBe(false);
    expect(rectsOverlap(a, rectOf(moduleSpec('corridor')!, 84, 0, 0))).toBe(true);
    expect(rectsOverlap(a, rectOf(habitat, 80, 4, 0))).toBe(false);
    expect(rectsOverlap(a, rectOf(habitat, 80, 2, Q))).toBe(true);
  });
});

describe('sites', () => {
  const colony = BUILD_SITES.moon.colony;
  const at = (world: 'moon' | 'mars', scope: 'private' | 'colony', x: number, z: number, yaw = 0) => {
    const s = snap(habitat, x, z, yaw);
    return checkPlacement(world, scope, { module: 'habitat', x: s.x, z: s.z, yaw }, []);
  };

  it('keeps the colony and private builds apart, and clear of Stellar Base', () => {
    expect(at('moon', 'colony', colony.x, colony.z)).toBeNull();
    expect(at('moon', 'private', colony.x, colony.z)).toBe('site');
    expect(at('moon', 'colony', 0, -6)).toBe('site');
    expect(at('moon', 'private', 0, -6)).toBe('site');
    expect(at('moon', 'private', 30, 20)).toBe('site');
    expect(at('moon', 'private', -20, 110)).toBeNull();
    expect(at('moon', 'private', 0, 170)).toBe('site');
    expect(at('mars', 'colony', BUILD_SITES.mars.colony.x, BUILD_SITES.mars.colony.z)).toBeNull();
    expect(at('mars', 'private', 0, -52)).toBe('site');
    expect(at('mars', 'private', -110, 40)).toBeNull();
  });

  it('never lets the two scopes share ground, on either world', () => {
    for (const world of ['moon', 'mars'] as const) {
      const c = BUILD_SITES[world].colony;
      for (let a = 0; a < 16; a++) {
        const x = c.x + Math.cos(a) * (c.r + 1); const z = c.z + Math.sin(a) * (c.r + 1);
        const r = rectOf(habitat, x, z, 0);
        expect(inSite(world, 'colony', r) && inSite(world, 'private', r)).toBe(false);
      }
    }
  });

  it('refuses a piece off the grid, turned off a quarter, or unknown', () => {
    expect(checkPlacement('moon', 'colony', { module: 'habitat', x: colony.x + 0.5, z: colony.z, yaw: 0 }, [])).toBe('coords');
    expect(checkPlacement('moon', 'colony', { module: 'habitat', x: 90, z: 8, yaw: 0.4 }, [])).toBe('coords');
    expect(checkPlacement('moon', 'colony', { module: 'habitat', x: Number.POSITIVE_INFINITY, z: 8, yaw: 0 }, [])).toBe('coords');
    expect(checkPlacement('moon', 'colony', { module: 'laser', x: 90, z: 8, yaw: 0 }, [])).toBe('module');
  });

  it('refuses a piece on top of another', () => {
    const s = snap(habitat, colony.x, colony.z, 0);
    const first = { module: 'habitat', x: s.x, z: s.z, yaw: 0 };
    expect(checkPlacement('moon', 'colony', first, [first])).toBe('overlap');
    expect(checkPlacement('moon', 'colony', { ...first, z: s.z + 4 }, [first])).toBeNull();
  });

  it('matches the scene: the keep-outs sit on what they protect, inside the walk', () => {
    const moon = BUILD_SITES.moon;
    const has = (x: number, z: number) => moon.keepOut.some((c) => Math.hypot(c.x - x, c.z - z) < 1e-6);
    expect(has(PAD_CENTER.x, PAD_CENTER.y)).toBe(true);
    expect(has(TELESCOPE_SITE.x, TELESCOPE_SITE.z)).toBe(true);
    expect(has(SINKHOLE.x, SINKHOLE.z)).toBe(true);
    expect(has(SURVEY_SITE.x, SURVEY_SITE.y)).toBe(true);
    expect(has(ANOMALY_SITE.x, ANOMALY_SITE.y)).toBe(true);
    expect(has(SEISMO_POINT.x, SEISMO_POINT.z)).toBe(true);
    for (const r of SAMPLE_ROCKS) expect(has(r.x, r.z)).toBe(true);
    expect(moon.reach).toBeLessThan(TERRAIN_WALK_RADIUS);
    expect(BUILD_SITES.mars.reach).toBeLessThan(WORLDS.mars.walkRadius);
    for (const world of ['moon', 'mars'] as const) {
      const s = BUILD_SITES[world];
      expect(Math.hypot(s.colony.x, s.colony.z) + s.colony.r).toBeLessThanOrEqual(s.reach);
      for (const k of s.keepOut) expect(Math.hypot(k.x - s.colony.x, k.z - s.colony.z)).toBeGreaterThan(k.r + s.colony.r);
    }
  });

  it('has caps the server and the HUD share', () => {
    expect(CAPS).toEqual({ private: 60, colony: 40, colonyTotal: 2000 });
  });
});
