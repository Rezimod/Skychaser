import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AIRLESS_LEGS, APPROACH_END_RADII, APPROACH_LEGS, APPROACH_MAX_RADII, APPROACH_MIN_RADII, APPROACH_SECONDS, approachPose,
  approachProfileFor, descentBurn, entryHeat, isAirlessSite, ORBIT_END_RADII, ORBIT_LEGS, titleCard,
} from '@/lib/solar-system/flight-approach';
import { SURFACE_ASSETS, SURFACE_GROUPS, assetsFor, shipAssetFor } from '@/lib/solar-system/surface-assets';

const START = 18;
/** When the third leg — the entry, or the burn — starts and ends. */
const ENTRY_AT = APPROACH_LEGS[0].seconds + APPROACH_LEGS[1].seconds;
const GLIDE_AT = ENTRY_AT + APPROACH_LEGS[2].seconds;

describe('the arrival profile', () => {
  it('runs the legs in order and ends where the surface takes the ship', () => {
    expect(approachPose(0, START).phase).toBe('transit');
    expect(approachPose(3, START).phase).toBe('transit');
    expect(approachPose(4, START).phase).toBe('approach');
    expect(approachPose(ENTRY_AT + 1, START).phase).toBe('entry');
    expect(approachPose(GLIDE_AT + 1, START).phase).toBe('glide');
    expect(approachPose(APPROACH_SECONDS, START).done).toBe(true);
    expect(approachPose(APPROACH_SECONDS + 30, START).phase).toBe('done');
    expect(approachPose(APPROACH_SECONDS, START).radii).toBeCloseTo(APPROACH_END_RADII, 5);
    expect(APPROACH_END_RADII).toBeCloseTo(1.02, 5);
  });

  it('over an airless world the entry is a burn, on the same clock', () => {
    expect(approachPose(ENTRY_AT + 1, START, true).phase).toBe('burn');
    expect(approachPose(GLIDE_AT + 1, START, true).phase).toBe('glide');
    expect(AIRLESS_LEGS.map((l) => l.seconds)).toEqual(APPROACH_LEGS.map((l) => l.seconds));
    for (let t = 0; t <= APPROACH_SECONDS; t += 0.5) {
      expect(approachPose(t, START, true).radii).toBeCloseTo(approachPose(t, START).radii, 9);
    }
    expect(isAirlessSite('moon')).toBe(true);
    expect(isAirlessSite('mars')).toBe(false);
    expect(isAirlessSite('proximaB')).toBe(false);
    expect(isAirlessSite('earth', 1.1)).toBe(false);
    // A site the table does not know takes the body's own air.
    expect(isAirlessSite('ceres', 1)).toBe(true);
    expect(isAirlessSite('titan', 1.3)).toBe(false);
  });

  it('closes on the world, swings around it and brings the nose down, all without going backwards', () => {
    let last = approachPose(0, START);
    let lowest = 1;
    for (let t = 0.1; t <= APPROACH_SECONDS; t += 0.1) {
      const now = approachPose(t, START);
      expect(now.radii).toBeLessThanOrEqual(last.radii + 1e-9);
      expect(now.swing).toBeGreaterThanOrEqual(last.swing - 1e-9);
      expect(now.t).toBeGreaterThanOrEqual(last.t - 1e-9);
      lowest = Math.min(lowest, now.pitch);
      last = now;
    }
    expect(last.swing).toBeCloseTo(1, 2);
    // The nose comes down through the entry and lifts a little for the
    // glide, so the ship arrives flying over the ground rather than into it.
    expect(approachPose(GLIDE_AT, START).pitch).toBeCloseTo(0.7, 2);
    expect(last.pitch).toBeCloseTo(0.6, 2);
    expect(last.pitch).toBeGreaterThan(0.5);
    expect(lowest).toBe(0);
  });

  it('heats through the entry, cools through the glide, and never heats in vacuum', () => {
    expect(entryHeat(0)).toBe(0);
    expect(entryHeat(ENTRY_AT - 0.1)).toBe(0);
    expect(entryHeat(ENTRY_AT + 1.5)).toBeCloseTo(1, 5);
    expect(entryHeat(GLIDE_AT + 1)).toBeLessThan(entryHeat(GLIDE_AT - 1));
    expect(entryHeat(APPROACH_SECONDS)).toBeLessThan(0.05);
    let last = 0;
    for (let t = 0; t <= ENTRY_AT + 1.5; t += 0.05) { expect(entryHeat(t)).toBeGreaterThanOrEqual(last - 1e-9); last = entryHeat(t); }
    for (let t = 0; t <= APPROACH_SECONDS; t += 0.25) expect(entryHeat(t, true)).toBe(0);
  });

  it('flares the engines against the fall: the whole burn in vacuum, the end of the glide in air', () => {
    expect(descentBurn(ENTRY_AT - 0.1, true)).toBe(0);
    expect(descentBurn(ENTRY_AT + 1, true)).toBeCloseTo(1, 5);
    expect(descentBurn(APPROACH_SECONDS, true)).toBeGreaterThan(0.3);
    expect(descentBurn(APPROACH_SECONDS, true)).toBeLessThan(descentBurn(GLIDE_AT, true));
    expect(descentBurn(ENTRY_AT + 1)).toBe(0);
    expect(descentBurn(APPROACH_SECONDS)).toBeGreaterThan(0.3);
    expect(descentBurn(APPROACH_SECONDS)).toBeLessThan(descentBurn(APPROACH_SECONDS, true));
  });

  it('puts the title up a beat into the entry and takes it down before the ground', () => {
    expect(titleCard(0)).toBe(0);
    expect(titleCard(ENTRY_AT)).toBe(0);
    expect(titleCard(ENTRY_AT + 1.5)).toBeCloseTo(1, 5);
    expect(titleCard(GLIDE_AT)).toBeCloseTo(1, 5);
    expect(titleCard(APPROACH_SECONDS - 0.5)).toBe(0);
    expect(titleCard(APPROACH_SECONDS)).toBe(0);
    for (let t = 0; t <= APPROACH_SECONDS; t += 0.1) {
      const k = titleCard(t);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
    }
  });

  it('is the same fourteen seconds from across the system as it is from a low pass', () => {
    expect(approachPose(0, 900).radii).toBe(APPROACH_MAX_RADII);
    expect(approachPose(0, 1.1).radii).toBe(APPROACH_MIN_RADII);
    // Armed from where the land key actually comes up — a couple of radii out.
    const low = approachPose(0, 2.4);
    expect(low.radii).toBeCloseTo(2.4, 5);
    for (const start of [900, 2.4, 1.1]) {
      const end = approachPose(APPROACH_SECONDS, start);
      expect(end.done).toBe(true);
      expect(end.radii).toBeCloseTo(APPROACH_END_RADII, 5);
    }
  });

  it('skipping is the end of the profile, not a jump into the ground', () => {
    const skipped = approachPose(APPROACH_SECONDS, START);
    expect(skipped.done).toBe(true);
    expect(skipped.radii).toBeGreaterThan(1);
    expect(skipped.radii).toBeLessThan(1.1);
    expect(approachPose(-5, START).phase).toBe('transit');
  });
});

// The Moon, Mars and Earth are flown down from orbit in their own scene
// (orbital-descent): the orrery's arrival for them ends at orbit insertion.
describe('the arrival to orbit insertion', () => {
  it('is the profile for the worlds flown down from orbit, and only for them', () => {
    expect(approachProfileFor('moon')).toBe('orbit');
    expect(approachProfileFor('mars')).toBe('orbit');
    expect(approachProfileFor('earth', 1.1)).toBe('orbit');
    expect(approachProfileFor('proximaB')).toBe('air');
    expect(approachProfileFor('ceres', 1)).toBe('airless');
  });

  it('runs transit, approach and orbit on the same clock and ends above the drawn air', () => {
    expect(ORBIT_LEGS.map((l) => l.phase)).toEqual(['transit', 'approach', 'orbit']);
    expect(ORBIT_LEGS.reduce((a, l) => a + l.seconds, 0)).toBe(APPROACH_SECONDS);
    expect(approachPose(1, START, 'orbit').phase).toBe('transit');
    expect(approachPose(6, START, 'orbit').phase).toBe('approach');
    expect(approachPose(12, START, 'orbit').phase).toBe('orbit');
    const end = approachPose(APPROACH_SECONDS, START, 'orbit');
    expect(end.done).toBe(true);
    expect(end.radii).toBeCloseTo(ORBIT_END_RADII, 5);
    // Above the top of the air the flight world draws round Earth (1.1) and Mars (1.15).
    expect(ORBIT_END_RADII).toBeGreaterThan(1.15);
    let last = approachPose(0, START, 'orbit');
    for (let t = 0.1; t <= APPROACH_SECONDS; t += 0.1) {
      const now = approachPose(t, START, 'orbit');
      expect(now.radii).toBeLessThanOrEqual(last.radii + 1e-9);
      expect(now.radii).toBeGreaterThan(ORBIT_END_RADII - 1e-9);
      // Flying along the orbit, not pitched at the ground.
      expect(now.pitch).toBeLessThan(0.2);
      last = now;
    }
  });

  it('never heats, puts up no title card, and burns only for the insertion', () => {
    const insertAt = ORBIT_LEGS[0].seconds + ORBIT_LEGS[1].seconds;
    for (let t = 0; t <= APPROACH_SECONDS; t += 0.25) {
      expect(entryHeat(t, 'orbit')).toBe(0);
      expect(titleCard(t, 'orbit')).toBe(0);
    }
    expect(descentBurn(insertAt - 0.1, 'orbit')).toBe(0);
    expect(descentBurn(insertAt + 1.5, 'orbit')).toBeGreaterThan(0.5);
    expect(descentBurn(APPROACH_SECONDS, 'orbit')).toBe(0);
    // The older flag still means what it did.
    expect(entryHeat(ENTRY_AT + 1.5, false)).toBeCloseTo(entryHeat(ENTRY_AT + 1.5, 'air'), 9);
    expect(descentBurn(ENTRY_AT + 1, true)).toBeCloseTo(descentBurn(ENTRY_AT + 1, 'airless'), 9);
  });
});

describe('what the arrival loads while it flies', () => {
  it('asks for the Moon files, and for nothing on the worlds built out of code', () => {
    expect(assetsFor('moon').length).toBeGreaterThan(0);
    expect(assetsFor('mars')).toEqual([]);
    expect(assetsFor('proximaB')).toEqual([]);
    for (const item of assetsFor('moon')) expect(SURFACE_GROUPS).toContain(item.group as (typeof SURFACE_GROUPS)[number]);
  });

  it('asks for the ship the crew are flying, on every world, the way the descent acquires it', () => {
    const source = readFileSync('src/lib/solar-system/moon-lander.ts', 'utf8');
    for (const kind of ['kestrel', 'xfoil', 'cruiser'] as const) {
      const ship = shipAssetFor(kind);
      expect(ship).not.toBeNull();
      expect(ship!.keepNodes).toBe(true);
      expect(ship!.group).toBe('vehicle');
      expect(source).toContain(`'${ship!.url}'`);
      for (const site of ['moon', 'mars', 'proximaB', 'earth']) {
        expect(assetsFor(site, kind).map((a) => a.url)).toContain(ship!.url);
      }
    }
    // The Endurance is a station-sized ring: the crew take the lander down from it.
    expect(shipAssetFor('endurance')!.url).toContain('lander');
    expect(assetsFor('mars', 'endurance').map((a) => a.url)).toContain('/explore/models/lander.glb');
  });

  // The cache is keyed on the url *and* on whether the node tree is kept, so
  // a prefetch that disagrees with the scene loads the same file twice.
  it('acquires every file the way the scene that uses it does', () => {
    const sources = [
      'src/lib/solar-system/moon-lander.ts', 'src/lib/solar-system/moon-base.ts',
      'src/lib/solar-system/moon-base-zones.ts', 'src/lib/solar-system/moon-rover-mesh.ts',
      'src/lib/solar-system/moon-suit-mesh.ts',
    ].map((f) => readFileSync(f, 'utf8')).join('\n');
    // `const X_MODEL = '/explore/models/x.glb'` … `acquireModel(X_MODEL, true)`
    const names = new Map<string, string>();
    for (const m of sources.matchAll(/const (\w+) = '(\/explore\/models\/[\w-]+\.glb)'/g)) names.set(m[1], m[2]);
    const keepFor = new Map<string, boolean>();
    for (const m of sources.matchAll(/acquireModel\((\w+)(,\s*(true|false))?\)/g)) {
      const url = names.get(m[1]);
      if (url) keepFor.set(url, m[3] === 'true');
    }
    for (const item of Object.values(SURFACE_ASSETS).flat()) {
      expect(keepFor.has(item.url), `${item.url} is not acquired by any surface`).toBe(true);
      expect(keepFor.get(item.url), `${item.url} prefetch keepNodes`).toBe(item.keepNodes);
    }
  });
});
