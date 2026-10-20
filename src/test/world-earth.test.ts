// Tbilisi — the parts with rules: the descent under a full g, the expedition
// and what it saves, the landmarks standing on the baked ground, and the Sun
// where the sky says it is.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Body } from 'astronomy-engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLander } from '@/lib/solar-system/moon-lander';
import { makeInteractions } from '@/lib/solar-system/moon-interactions';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import { EARTH_DESCENT } from '@/lib/solar-system/world-earth';
import { LANDING_SITES, WORLDS, isWorldId } from '@/lib/solar-system/world-profiles';
import { makeHeightAt, parseCity, parseTerrain, type EarthData, type Manifest } from '@/lib/solar-system/world-earth-data';
import { makeLandmarks } from '@/lib/solar-system/world-earth-landmarks';
import {
  ALIGN_SECONDS, EXPEDITION_KEY, LOOK_SECONDS, PART_SECONDS, PARTS, SPOT_SECONDS, bearingTo, loadExpedition, makeTbilisiExpedition,
  type ExpeditionEvent, type ExpeditionSites,
} from '@/lib/solar-system/world-earth-expedition';
import { DUSK_ALT, bodyAzAlt, duskFor, pickTarget, tbilisiClock } from '@/lib/solar-system/world-earth-tonight';
import { cellKey } from '@/lib/solar-system/world-earth-city';

describe('the city\'s spatial hash', () => {
  it('gives every cell in the walkable grid its own integer key', () => {
    const seen = new Set<number>();
    let integers = 0;
    for (let i = -200; i <= 200; i++) for (let j = -200; j <= 200; j++) {
      const k = cellKey(i, j);
      if (Number.isInteger(k)) integers += 1;
      seen.add(k);
    }
    expect(integers).toBe(401 * 401);
    expect(seen.size).toBe(401 * 401);
    expect(cellKey(3, 4)).toBe(cellKey(3, 4));
    expect(cellKey(3, 4)).not.toBe(cellKey(4, 3));
  });
});

const flat = () => 0;
const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
const DT = 1 / 60;

describe('the descent into Tbilisi', () => {
  it('guidance sets the lander down under a full g from 600 m', () => {
    const lander = makeLander(0, 20, flat, dust, true, undefined, WORLDS.earth.gravity, EARTH_DESCENT);
    expect(lander.telemetry.altitude).toBe(600);
    for (let i = 0; i < 60 * 120 && !lander.telemetry.landed; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(lander.telemetry.landed).toBe(true);
    expect(lander.telemetry.assist).toBe(true);
    expect(lander.telemetry.touchdown).toBeLessThan(3.5);
    expect(lander.telemetry.offset).toBeLessThan(40);
  });

  it('Earth is a landing site, anywhere low over it', () => {
    expect(isWorldId('earth')).toBe(true);
    expect(LANDING_SITES.earth).toBeGreaterThan(0);
    expect(WORLDS.earth.gravity).toBeCloseTo(9.81);
    expect(WORLDS.earth.breathable).toBe(true);
  });
});

describe('the Tbilisi expedition', () => {
  const sites: ExpeditionSites = {
    bridgeWest: { x: -300, z: 50 },
    cableBottom: { x: 20, z: 170 },
    cableTop: { x: -270, z: 610 },
    sameba: { x: 500, z: -440 },
    tvTower: { x: -2120, z: -250 },
    bridgeOfPeace: { x: -220, z: 60 },
    rooftopDoor: { x: 670, z: -1030 },
    telescope: { x: 675, z: -1034, y: 497 },
  };
  beforeEach(() => localStorage.clear());

  const setup = () => {
    const exp = makeTbilisiExpedition(sites, false);
    const io = makeInteractions();
    for (const i of exp.interactables) io.add(i);
    const events: ExpeditionEvent[] = [];
    exp.onEvent = (k) => events.push(k);
    const crew = { x: 0, z: 0, heading: 0, riding: false, onRoof: false };
    const run = (seconds: number, held = false) => {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        io.update(DT, { x: crew.x, z: crew.z, yaw: 0, driving: false, press: held && i === 0, held });
        exp.update(DT, crew);
      }
    };
    return { exp, io, events, crew, run };
  };

  it('walks through all five acts and keeps its place on the device', () => {
    const { exp, events, crew, run } = setup();
    expect(exp.telemetry.stage).toBe('bridge');
    run(0.1);
    expect(exp.telemetry.objective).toBe('bridge');
    expect(exp.telemetry.bearing).toBeCloseTo(bearingTo(0, 0, -300, 50));

    // 1: across the bridge.
    crew.x = -298; crew.z = 48;
    run(0.1);
    expect(exp.telemetry.stage).toBe('cable');
    expect(loadExpedition().stage).toBe('cable');

    // 2: board, ride, arrive.
    crew.x = 20; crew.z = 172;
    run(0.2, true);
    expect(events).toContain('board');
    crew.riding = true;
    run(0.1);
    expect(exp.telemetry.objective).toBe('riding');
    crew.riding = false;
    exp.arrived();
    expect(exp.telemetry.stage).toBe('overlook');

    // 3: look straight at each landmark long enough.
    crew.x = -270; crew.z = 610;
    for (const id of ['sameba', 'tvTower', 'bridgeOfPeace'] as const) {
      crew.heading = bearingTo(crew.x, crew.z, sites[id].x, sites[id].z);
      run(SPOT_SECONDS + 0.2);
    }
    expect(exp.telemetry.found.sort()).toEqual(['bridgeOfPeace', 'sameba', 'tvTower']);
    expect(exp.telemetry.stage).toBe('rooftop');

    // 4: up the stairwell, put it together, face north and align.
    crew.x = 670; crew.z = -1030;
    run(0.2, true);
    expect(events).toContain('roofUp');
    crew.onRoof = true; crew.x = 675; crew.z = -1034;
    run(0.1);
    for (let p = 0; p < PARTS.length; p++) run(PART_SECONDS + 0.2, true);
    expect(exp.telemetry.parts).toBe(PARTS.length);
    expect(loadExpedition().parts).toBe(PARTS.length);
    crew.heading = 90;
    run(ALIGN_SECONDS + 0.5, true);
    expect(exp.telemetry.stage).toBe('rooftop');
    crew.heading = 2;
    run(ALIGN_SECONDS + 0.5, true);
    expect(exp.telemetry.stage).toBe('firstLight');
    expect(events).toContain('dusk');

    // 5: slew to tonight's target and look.
    exp.setTarget({ id: 'jupiter', kind: 'planet', az: 120, alt: 35, mag: -2.4, size: 42, phase: 0.99 });
    run(12, true);
    expect(exp.telemetry.eyepiece).toBe(true);
    expect(exp.telemetry.scopeAz).toBeCloseTo(120, 0);
    expect(exp.telemetry.scopeAlt).toBeCloseTo(35, 0);
    run(LOOK_SECONDS + 0.5);
    expect(exp.telemetry.stage).toBe('done');
    expect(JSON.parse(localStorage.getItem(EXPEDITION_KEY)!).stage).toBe('done');
    expect(makeTbilisiExpedition(sites, false).telemetry.complete).toBe(true);
  });

  it('shrugs off a corrupt save', () => {
    localStorage.setItem(EXPEDITION_KEY, '{"stage":"moonbase","found":["kremlin",3],"parts":99}');
    const saved = loadExpedition();
    expect(saved).toEqual({ stage: 'bridge', found: [], parts: PARTS.length, aligned: false });
  });
});

describe('the landmarks on the baked ground', () => {
  let data: EarthData;
  beforeAll(() => {
    const dir = path.resolve(__dirname, '../../public/explore/tbilisi');
    const buf = (f: string) => { const b = readFileSync(path.join(dir, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
    const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as Manifest;
    data = { manifest, grids: parseTerrain(buf('terrain.bin')), ...parseCity(buf('city.bin')) };
    // jsdom has no 2D canvas: the balcony lattice only needs something to draw on.
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  });
  afterAll(() => vi.restoreAllMocks());

  it('the baked city is Tbilisi', () => {
    expect(data.buildings.length).toBeGreaterThan(20000);
    expect(data.manifest.origin.lat).toBeCloseTo(41.69, 1);
    expect(data.manifest.origin.lon).toBeCloseTo(44.81, 1);
    const heightAt = makeHeightAt(data.grids);
    // The Mtkvari runs downhill to the south-east through the city.
    const river = data.manifest.river;
    expect(river[0][2]).toBeGreaterThan(river[river.length - 1][2]);
    // Mtatsminda stands well above the river.
    const tv = data.manifest.landmarks.tvTower.at!;
    expect(heightAt(tv[0], tv[1])).toBeGreaterThan(heightAt(0, 0) + 250);
  });

  it('every landmark stands on the ground under it, neither floating nor buried', () => {
    const heightAt = makeHeightAt(data.grids);
    const lm = makeLandmarks(data, heightAt, true);
    const L = data.manifest.landmarks;
    const deck = L.bridgeOfPeace.deck!;
    const footprint: Record<string, [number, number][]> = {
      kartlisDeda: L.kartlisDeda!.outline,
      sameba: L.sameba.outline!,
      // A bridge stands on its banks, not on the river bed.
      bridgeOfPeace: [deck[0], deck[deck.length - 1]],
    };
    for (const id of ['kartlisDeda', 'sameba', 'tvTower', 'ferrisWheel', 'bridgeOfPeace', 'narikala']) {
      const s = lm.sites[id];
      expect(s, id).toBeDefined();
      const pts = footprint[id] ?? [[s.x, s.z]];
      const ground = pts.map(([x, z]) => heightAt(x, z));
      expect(s.base, `${id} buried`).toBeGreaterThanOrEqual(Math.min(...ground) - 0.5);
      expect(s.base, `${id} floating`).toBeLessThanOrEqual(Math.max(...ground) + 1.5);
    }
    expect(lm.sites.kartlisDeda.top - lm.sites.kartlisDeda.base).toBeCloseTo(20);
    expect(lm.sites.sameba.top - lm.sites.sameba.base).toBeCloseTo(87);
    expect(lm.sites.tvTower.top - lm.sites.tvTower.base).toBeCloseTo(274.5);
    // The fortress is on the ridge, above the river it guards.
    expect(lm.sites.narikala.base).toBeGreaterThan(heightAt(0, 0) + 30);
    for (const [id, s] of Object.entries(lm.sites)) if (id.startsWith('bath-')) expect(Math.abs(s.base - heightAt(s.x, s.z))).toBeLessThan(12);
    lm.dispose();
  });
});

describe('the sky over Tbilisi', () => {
  it('puts the Sun at the solstice noon altitude the latitude gives', () => {
    // Tbilisi keeps UTC+4 but lies 15° west of that meridian: local noon is near 13:02, 09:02 UTC.
    const noon = bodyAzAlt(Body.Sun, new Date('2026-06-21T09:02:30Z'));
    expect(noon.alt).toBeCloseTo(90 - 41.7151 + 23.44, 0);
    expect(Math.abs(noon.az - 180)).toBeLessThan(2);
    const equinox = bodyAzAlt(Body.Sun, new Date('2026-03-20T09:07:00Z'));
    expect(Math.abs(equinox.alt - (90 - 41.7151))).toBeLessThan(0.8);
    // A June evening at nine: the Sun has set in the north-west.
    const evening = bodyAzAlt(Body.Sun, new Date('2026-06-21T17:00:00Z'));
    expect(evening.alt).toBeLessThan(0);
    expect(evening.az).toBeGreaterThan(290);
    expect(evening.az).toBeLessThan(320);
  });

  it('dusk is after sunset the same evening, and the target clears the skyline', () => {
    const afternoon = new Date('2026-09-16T11:00:00Z');
    const dusk = duskFor(afternoon);
    expect(dusk.getTime()).toBeGreaterThan(afternoon.getTime());
    expect(dusk.getTime() - afternoon.getTime()).toBeLessThan(12 * 3600_000);
    // Within a degree: SearchAltitude works without refraction, the sky map with it.
    expect(Math.abs(bodyAzAlt(Body.Sun, dusk).alt - DUSK_ALT)).toBeLessThan(1);
    expect(tbilisiClock(dusk)).toMatch(/^(19|20):\d\d$/);
    const skyline = (az: number) => (az > 150 && az < 210 ? 12 : 4);
    const target = pickTarget(dusk, skyline);
    expect(target.alt).toBeGreaterThanOrEqual(Math.max(10, skyline(target.az) + 3));
  });
});
