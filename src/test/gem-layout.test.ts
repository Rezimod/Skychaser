// The gems' layout: the same for every player and the server, on every
// world; inside the walk; some only the jetpack reaches; clear of the pads,
// the lake, the giants' balloons; on Tbilisi, on open ground and not in the
// river. The numbers it copies from the scenes still match them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ENVELOPE_AT, ENVELOPE_BEARINGS, GEM_FLY_ONLY_ALT, GEM_GROUND_ALT, GEM_INFO, GEM_KINDS, GEM_LANDING, GEM_MAX_ALT, GEM_WALK_RADIUS, GEM_WORLDS,
  PROXIMA_VILLAGE, PROXIMA_WATER, findGem, gemLayout, insideEnvelope, isDeckGemWorld, isGemWorld, scoreOf, worldGemTotals, type GemWorld,
} from '@/lib/solar-system/gem-layout';
import { WORLDS, WORLD_IDS } from '@/lib/solar-system/world-profiles';
import { TERRAIN_WALK_RADIUS, PAD_CENTER } from '@/lib/solar-system/moon-terrain';
import { landingPad } from '@/lib/solar-system/world-outpost';
import { EARTH_WALK_RADIUS } from '@/lib/solar-system/world-earth';
import { insideRing, makeHeightAt, parseCity, parseTerrain, type Manifest } from '@/lib/solar-system/world-earth-data';

describe('the gem layout', () => {
  it('covers the Moon and every world the surface scene builds', () => {
    expect([...GEM_WORLDS].sort()).toEqual(['moon', ...WORLD_IDS].sort());
    expect(isGemWorld('moon')).toBe(true);
    expect(isGemWorld('pluto')).toBe(false);
  });

  it('is the same every time and in a fresh module (the server builds it on its own)', async () => {
    const first = GEM_WORLDS.map((w) => JSON.stringify(gemLayout(w)));
    expect(GEM_WORLDS.map((w) => JSON.stringify(gemLayout(w)))).toEqual(first);
    vi.resetModules();
    const again = await import('@/lib/solar-system/gem-layout');
    expect(GEM_WORLDS.map((w) => JSON.stringify(again.gemLayout(w)))).toEqual(first);
  });

  it.each(GEM_WORLDS)('%s: gems of known kinds, unique ids, at least one diamond', (w) => {
    const list = gemLayout(w);
    expect(list.length).toBeGreaterThanOrEqual(24);
    expect(new Set(list.map((g) => g.id)).size).toBe(list.length);
    for (const g of list) {
      expect(GEM_KINDS).toContain(g.kind);
      expect(g.id).toMatch(/^g\d{2}$/);
      expect(findGem(w, g.id)).toBe(g);
    }
    expect(list.some((g) => g.kind === 'diamond')).toBe(true);
    expect(worldGemTotals(w).count).toBe(list.length);
    expect(worldGemTotals(w).points).toBe(list.reduce((s, g) => s + GEM_INFO[g.kind].points, 0));
  });

  it.each(GEM_WORLDS)('%s: inside the walk and the flight, with a share only the jetpack reaches', (w) => {
    const list = gemLayout(w);
    const R = GEM_WALK_RADIUS[w];
    for (const g of list) {
      expect(Math.hypot(g.x, g.z), g.id).toBeLessThanOrEqual(R - 3);
      expect(g.alt, g.id).toBeGreaterThanOrEqual(GEM_GROUND_ALT);
      expect(g.alt, g.id).toBeLessThanOrEqual(GEM_MAX_ALT);
      if (g.tier === 'high') expect(g.alt, g.id).toBeGreaterThanOrEqual(GEM_FLY_ONLY_ALT);
      if (g.tier === 'near') expect(g.alt).toBe(GEM_GROUND_ALT);
    }
    const high = list.filter((g) => g.tier === 'high');
    expect(high.length / list.length).toBeGreaterThanOrEqual(0.25);
    // Some on the ground near the landing site, some far, some high.
    expect(list.some((g) => g.tier === 'near' && Math.hypot(g.x - GEM_LANDING[w].x, g.z - GEM_LANDING[w].z) < 80)).toBe(true);
    if (!isDeckGemWorld(w)) expect(list.filter((g) => g.tier === 'far').length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...high.map((g) => g.alt))).toBeGreaterThan(20);
  });

  it('keeps the ground gems off the landing pads and out of Proxima b’s lake and village', () => {
    for (const w of GEM_WORLDS) {
      if (w === 'earth') continue;
      for (const g of gemLayout(w)) {
        if (g.tier === 'high') continue;
        expect(Math.hypot(g.x - GEM_LANDING[w].x, g.z - GEM_LANDING[w].z), `${w} ${g.id}`).toBeGreaterThan(13);
      }
    }
    for (const g of gemLayout('proximaB').filter((s) => s.tier !== 'high')) {
      expect(Math.hypot(g.x - PROXIMA_WATER.x, g.z - PROXIMA_WATER.z)).toBeGreaterThan(PROXIMA_WATER.r);
      expect(Math.hypot(g.x - PROXIMA_VILLAGE.x, g.z - PROXIMA_VILLAGE.z)).toBeGreaterThan(PROXIMA_VILLAGE.r);
    }
  });

  it('on the giants: on the deck or over it, never inside a balloon', () => {
    for (const w of GEM_WORLDS.filter(isDeckGemWorld)) {
      const list = gemLayout(w);
      for (const g of list) {
        expect(Math.hypot(g.x, g.z)).toBeLessThan(WORLDS[w as 'jupiter'].deck!.radius - 4);
        expect(insideEnvelope(g.x, g.alt, g.z)).toBe(false);
      }
      // A gem on the crown of each envelope, and most of the rest in the air.
      for (const deg of ENVELOPE_BEARINGS) {
        const a = (deg * Math.PI) / 180;
        expect(list.some((g) => Math.hypot(g.x - Math.cos(a) * ENVELOPE_AT.r, g.z - Math.sin(a) * ENVELOPE_AT.r) < 1 && g.alt > ENVELOPE_AT.y + ENVELOPE_AT.ry)).toBe(true);
      }
      expect(list.filter((g) => g.alt > 8).length).toBeGreaterThanOrEqual(18);
    }
  });

  it('prices the rarer kinds higher, and scores a set of ids once each', () => {
    expect(GEM_INFO.diamond.points).toBeGreaterThan(GEM_INFO.ruby.points);
    expect(GEM_INFO.ruby.points).toBeGreaterThan(GEM_INFO.gold.points);
    const [a, b] = gemLayout('mars');
    expect(scoreOf('mars', [a.id, b.id, a.id, 'nope'])).toBe(GEM_INFO[a.kind].points + GEM_INFO[b.kind].points);
  });
});

describe('the numbers the layout shares with the scenes', () => {
  it('walk radii and landing pads', () => {
    expect(GEM_WALK_RADIUS.moon).toBe(TERRAIN_WALK_RADIUS);
    expect(GEM_LANDING.moon).toEqual({ x: PAD_CENTER.x, z: PAD_CENTER.y + 26 });
    expect(GEM_WALK_RADIUS.earth).toBe(EARTH_WALK_RADIUS);
    for (const w of WORLD_IDS) {
      if (w !== 'earth') expect(GEM_WALK_RADIUS[w]).toBeCloseTo(WORLDS[w].walkRadius, 6);
      expect(GEM_LANDING[w]).toEqual(landingPad(WORLDS[w]));
    }
    const water = WORLDS.proximaB.ground.water!;
    expect(PROXIMA_WATER).toEqual({ x: water.x, z: water.z, r: water.r });
  });

  it('the giants’ envelopes', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/solar-system/world-outpost.ts'), 'utf8');
    expect(src).toContain(`const ENVELOPES = [${ENVELOPE_BEARINGS.join(', ')}];`);
    expect(src).toContain(`const ENVELOPE_AT = { r: ${ENVELOPE_AT.r}, y: ${ENVELOPE_AT.y}, size: [${ENVELOPE_AT.rx}, ${ENVELOPE_AT.ry}, ${ENVELOPE_AT.rx}] as const };`);
  });
});

describe('Tbilisi’s gems, on the baked city', () => {
  const dir = path.join(process.cwd(), 'public/explore/tbilisi');
  const buf = (f: string) => { const b = readFileSync(path.join(dir, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
  const city = parseCity(buf('city.bin'));
  const heightAt = makeHeightAt(parseTerrain(buf('terrain.bin')));
  const deck = manifest.landmarks.bridgeOfPeace.deck!;
  const nearDeck = (x: number, z: number) => deck.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 30);
  const inBuilding = (x: number, z: number) => city.buildings.some((b) => {
    const outer = b.rings.find((r) => !r.inner);
    return !!outer && Math.abs(outer.pts[0][0] - x) < 400 && Math.abs(outer.pts[0][1] - z) < 400 && insideRing(x, z, outer.pts);
  });
  const inWater = (x: number, z: number) => city.water.some((w) => w.rings.some((r) => !r.inner && insideRing(x, z, r.pts)));

  it('puts the ones on foot on open ground, not in a building or the river (the bridge’s is on its deck)', () => {
    for (const g of gemLayout('earth' as GemWorld)) {
      if (g.tier === 'high' || g.alt > 1) continue;
      if (nearDeck(g.x, g.z)) continue;
      expect(inBuilding(g.x, g.z), g.id).toBe(false);
      expect(inWater(g.x, g.z), g.id).toBe(false);
    }
  });

  it('keeps the park’s share round the landing site', () => {
    const park = gemLayout('earth').filter((g) => g.tier === 'near');
    expect(park.length).toBeGreaterThanOrEqual(10);
    for (const g of park) expect(Math.hypot(g.x, g.z)).toBeLessThan(220);
  });

  it('sets the rooftop’s gem just over the roof', () => {
    const roof = manifest.rooftop!;
    const g = gemLayout('earth').find((s) => Math.hypot(s.x - roof.x, s.z - roof.z) < 3)!;
    expect(g).toBeTruthy();
    const y = heightAt(g.x, g.z) + g.alt;
    expect(y - (roof.base + roof.height)).toBeGreaterThan(0.3);
    expect(y - (roof.base + roof.height)).toBeLessThan(2.5);
  });
});
