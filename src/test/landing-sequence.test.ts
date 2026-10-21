// The landing as a sequence: the ship flies the arrival in the orrery —
// plasma over an atmosphere, a burn over vacuum, the title card on the
// profile's clock, or, for the Moon, Mars and Earth (flown down from orbit
// in their own scene), a calm orbit insertion — and the same ship comes down
// on the surface, whichever hull it is, with the telemetry the landing HUD
// reads unchanged from the lander's.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  createFlightSession, createPlayerShip, type FlightBody, type FlightSession, type FlightWorld, type PlayerShipHandle,
} from '@/lib/solar-system/player-ship';
import { APPROACH_LEGS, APPROACH_SECONDS, ORBIT_END_RADII, titleCard } from '@/lib/solar-system/flight-approach';
import { makeLander, type DescentKind, type LanderTelemetry } from '@/lib/solar-system/moon-lander';
import { buildShip } from '@/lib/solar-system/player-ship';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import type { AlienHandle } from '@/lib/solar-system/aliens';

const EARTH_R = 0.028;
const DT = 1 / 60;

// jsdom has no 2D canvas; the sprite textures only need a context that
// swallows calls, and the audio layer already guards a missing AudioContext.
beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

const aliens = {
  group: new THREE.Group(), enemies: [], damage: () => false, spawnSparks: () => undefined,
  setHostile: () => undefined, update: () => undefined, dispose: () => undefined,
} as unknown as AlienHandle;

function body(id: string, x: number, radius: number, radiusKm: number, surfaceG: number, atmosphere: number, kind: FlightBody['kind'] = 'planet'): FlightBody {
  return { id, kind, position: new THREE.Vector3(x, 0, 0), radius, radiusKm, surfaceG, atmosphere };
}

function makeWorld(): FlightWorld {
  // Earth's air as the flight world draws it (SolarSystemCanvas ATMOSPHERE).
  const earth = body('earth', 1, EARTH_R, 6371, 9.81, 1.1);
  // The Moon a few tenths out along +X: airless, and far from Earth's air.
  const moon = body('moon', 1.3, EARTH_R * 0.27, 1737, 1.62, 1, 'moon');
  // Worlds whose whole arrival is still flown here: one with air, one without.
  const proxima = body('proximaB', 3, EARTH_R, 6371, 9.81, 1.25);
  const ceres = body('ceres', 2.2, EARTH_R * 0.07, 470, 0.28, 1, 'moon');
  return {
    bodies: [body('sun', 0, 0.152, 696_000, 274, 1.3, 'star'), earth, moon, proxima, ceres],
    pois: [],
    home: { position: new THREE.Vector3(1, 0, EARTH_R * 5), lookAt: earth.position.clone(), yaw: 0 },
    jump: { name: 'alphaCentauri', distanceLy: 4.37, position: new THREE.Vector3(-14, -25, 8), lookAt: new THREE.Vector3(-15, -26, 8), yaw: 0 },
    systemName: 'sol',
  };
}

describe('the entry, flown from orbit', () => {
  let session: FlightSession;
  let ship: PlayerShipHandle;
  let world: FlightWorld;
  let camera: THREE.PerspectiveCamera;
  let clock = 0;
  const step = (n: number) => { for (let i = 0; i < n; i++) { clock += DT; ship.update(DT, clock, camera, aliens, world); } };

  beforeEach(() => {
    session = createFlightSession();
    world = makeWorld();
    camera = new THREE.PerspectiveCamera(42, 1, 0.02, 64000);
    ship = createPlayerShip(session);
    ship.spawn(world.home);
    clock = 0;
  });
  afterEach(() => ship.dispose());

  /** Fly the whole arrival to `site`, recording the legs, the heat and the ship's own parts. */
  const fly = (site: string) => {
    const tel = session.telemetry;
    // Start from a low pass over the world, as the land key comes up.
    const b = world.bodies.find((x) => x.id === site)!;
    if (b.id !== 'earth') ship.spawn({ position: b.position.clone().add(new THREE.Vector3(0, 0, b.radius * 5)), lookAt: b.position.clone(), yaw: 0 });
    const parts = ship.parts;
    session.input.approachRequest = site;
    const phases: string[] = [];
    const heatBy: Record<string, number> = {};
    let streaksLit = false;
    let coreUnderBurn = 0;
    let coreBefore = 0;
    for (let t = 0; t < APPROACH_SECONDS + 1 && tel.approachPhase !== 'done'; t += DT) {
      step(1);
      const ph = tel.approachPhase;
      if (ph && phases[phases.length - 1] !== ph) phases.push(ph);
      heatBy[ph] = Math.max(heatBy[ph] ?? 0, tel.heat);
      if (parts.streaks.some((s) => s.visible)) streaksLit = true;
      if (ph === 'transit') coreBefore = Math.max(coreBefore, parts.plumeCoreMat?.opacity ?? 0);
      if (ph === 'burn') coreUnderBurn = Math.max(coreUnderBurn, parts.plumeCoreMat?.opacity ?? 0);
    }
    return { phases, heatBy, streaksLit, coreUnderBurn, coreBefore };
  };

  it('over Proxima b it is an entry: the legs in order, the hull hot through it and cool by the ground', () => {
    const run = fly('proximaB');
    expect(run.phases).toEqual(['transit', 'approach', 'entry', 'glide', 'done']);
    expect(run.heatBy.transit ?? 0).toBeLessThan(0.05);
    expect(run.heatBy.entry).toBeGreaterThan(0.8);
    expect(run.heatBy.glide).toBeLessThan(run.heatBy.entry);
    expect(session.telemetry.heat).toBeLessThan(0.15);
    expect(run.streaksLit).toBe(true);
    // The arrival is scripted: no hull damage for the air it flew through.
    expect(session.telemetry.crashed).toBe(false);
  });

  it('over an airless world it is a burn: no plasma, and the engines up against the fall', () => {
    const run = fly('ceres');
    expect(run.phases).toEqual(['transit', 'approach', 'burn', 'glide', 'done']);
    for (const ph of ['transit', 'approach', 'burn', 'glide']) expect(run.heatBy[ph] ?? 0).toBeLessThan(0.02);
    expect(run.streaksLit).toBe(false);
    expect(run.coreUnderBurn).toBeGreaterThan(run.coreBefore + 0.2);
  });

  // The Moon, Mars and Earth are flown all the way down from orbit in the
  // surface scene (orbital-descent): here the arrival ends at orbit
  // insertion — calm, nothing on the hull, the engines lit for the burn onto
  // the orbit, and the ship left above the air the orrery draws.
  it.each(['earth', 'moon'])('over %s it ends at orbit insertion: no plasma, an insertion burn, above the air', (site) => {
    const run = fly(site);
    expect(run.phases).toEqual(['transit', 'approach', 'orbit', 'done']);
    for (const ph of ['transit', 'approach', 'orbit']) expect(run.heatBy[ph] ?? 0).toBeLessThan(0.02);
    expect(run.streaksLit).toBe(false);
    expect(session.telemetry.alert).not.toBe('entry');
    const b = world.bodies.find((x) => x.id === site)!;
    const radii = ship.group.position.distanceTo(b.position) / b.radius;
    expect(radii).toBeGreaterThan(ORBIT_END_RADII - 0.02);
    expect(radii).toBeGreaterThan(b.atmosphere);
    expect(session.telemetry.crashed).toBe(false);
    // Orbit insertion carries no title card in the orrery: the scene shows it.
    for (let t = 0; t <= APPROACH_SECONDS; t += 0.5) expect(titleCard(t, 'orbit')).toBe(0);
  });

  it('the deck reads the title card off the same clock the ship flies', () => {
    const px = world.bodies.find((x) => x.id === 'proximaB')!;
    ship.spawn({ position: px.position.clone().add(new THREE.Vector3(0, 0, px.radius * 5)), lookAt: px.position.clone(), yaw: 0 });
    session.input.approachRequest = 'proximaB';
    const tel = session.telemetry;
    let seen = 0;
    let atEntryStart = -1;
    for (let t = 0; t < APPROACH_SECONDS + 1 && tel.approachPhase !== 'done'; t += DT) {
      step(1);
      const k = titleCard(tel.approachT * APPROACH_SECONDS);
      seen = Math.max(seen, k);
      if (tel.approachPhase === 'entry' && atEntryStart < 0) atEntryStart = k;
    }
    expect(atEntryStart).toBeLessThan(0.05);
    expect(seen).toBeCloseTo(1, 3);
    expect(titleCard(tel.approachT * APPROACH_SECONDS)).toBe(0);
  });

  it('the profile is skippable from any leg and still ends where the surface takes over', () => {
    session.input.approachRequest = 'earth';
    step(Math.round((APPROACH_LEGS[0].seconds + 1) / DT));
    expect(session.telemetry.approachPhase).toBe('approach');
    session.input.approachSkip = true;
    step(2);
    expect(session.telemetry.approachPhase).toBe('done');
  });
});

describe('the ship as the descent vehicle', () => {
  const flat = () => 0;
  const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
  const KINDS: (DescentKind | undefined)[] = [undefined, 'lander', 'kestrel', 'xfoil', 'cruiser', 'endurance'];
  const keysOf = (t: LanderTelemetry) => Object.keys(t).sort();

  it('exposes the same telemetry whichever hull comes down, and reads the height under the gear', () => {
    const reference = keysOf(makeLander(0, 0, flat, dust, true).telemetry);
    for (const kind of KINDS) {
      const l = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind });
      expect(keysOf(l.telemetry)).toEqual(reference);
      expect(l.telemetry.altitude).toBe(138);
      expect(l.telemetry.landed).toBe(false);
      expect(l.chase).toBeGreaterThan(10);
      expect(l.hull).toBeGreaterThan(3);
      l.dispose();
    }
  });

  it('names the hull it is, sends the Endurance crew down in the lander, and points a ship at the camera', () => {
    const kestrel = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind: 'kestrel' });
    const endurance = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind: 'endurance' });
    const plain = makeLander(0, 0, flat, dust, true);
    expect(kestrel.kind).toBe('kestrel');
    expect(kestrel.group.name).toBe('ship');
    expect(kestrel.yaw).toBeCloseTo(Math.PI, 5);
    expect(endurance.kind).toBe('endurance');
    expect(endurance.group.name).toBe('lander');
    expect(endurance.yaw).toBe(0);
    expect(endurance.chase).toBe(plain.chase);
    expect(plain.kind).toBe('lander');
    for (const l of [kestrel, endurance, plain]) l.dispose();
  });

  it.each(['kestrel', 'xfoil', 'cruiser'] as const)('guidance sets the %s down gently, standing on its gear, with the crew out beside it', (kind) => {
    const l = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind });
    for (let i = 0; i < 60 * 90 && !l.telemetry.landed; i++) l.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(l.telemetry.landed).toBe(true);
    expect(l.telemetry.assist).toBe(true);
    expect(l.telemetry.touchdown).toBeLessThan(2.5);
    expect(l.telemetry.altitude).toBe(0);
    // The origin stands over the ground by the gear's height, never in it.
    expect(l.position.y).toBeGreaterThan(1);
    expect(l.position.y).toBeLessThan(4);
    // The crew step off clear of the hull, but within a few strides of it.
    const off = Math.hypot(l.telemetry.egressX - l.position.x, l.telemetry.egressZ - l.position.z);
    expect(off).toBeGreaterThan(l.hull);
    // Outside the hull, and far enough out that the chase camera behind the
    // crew is not pressed against it.
    expect(off).toBeLessThan(l.hull + 6);
    l.dispose();
  });

  it('lights its plumes with the throttle and puts them out on the ground', () => {
    const l = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind: 'kestrel' });
    const mats = new Set<THREE.Material>();
    l.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && (m.material as THREE.Material).transparent) mats.add(m.material as THREE.Material); });
    expect(mats.size).toBeGreaterThan(0);
    const brightest = () => Math.max(...[...mats].map((m) => m.opacity));
    for (let i = 0; i < 30; i++) l.update(DT, { throttle: 1, moveX: 0, moveY: 0 }, flat);
    expect(brightest()).toBeGreaterThan(0.3);
    l.settle(flat);
    expect(l.telemetry.landed).toBe(true);
    expect(brightest()).toBe(0);
    l.dispose();
  });

  it('settles straight onto the ground for the skip, and lifts off again on the key', () => {
    const l = makeLander(0, 0, flat, dust, true, undefined, undefined, undefined, { kind: 'xfoil' });
    l.position.set(3, 200, -2);
    l.settle(flat);
    expect(l.telemetry.landed).toBe(true);
    expect(l.telemetry.altitude).toBe(0);
    expect(l.position.y).toBeCloseTo(1.9, 5);
    expect(l.telemetry.egressX).not.toBe(3);
    l.launch();
    for (let i = 0; i < 60 * 12 && l.telemetry.climb <= 7.5; i++) l.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(l.telemetry.climb).toBeGreaterThan(7.5);
    expect(l.telemetry.altitude).toBeGreaterThan(30);
    l.dispose();
  });
});

describe('the ship in flight carries the entry and the plumes', () => {
  it('every hull has plasma streaks, a plume core material and cores alongside its plumes', () => {
    for (const kind of ['kestrel', 'xfoil', 'cruiser', 'endurance'] as const) {
      const parts = buildShip(kind);
      expect(parts.streaks.length).toBeGreaterThan(4);
      expect(parts.streakMat).not.toBeNull();
      expect(parts.plumeCoreMat).not.toBeNull();
      expect(parts.streakMat!.opacity).toBe(0);
      for (const s of parts.streaks) expect(s.visible).toBe(false);
      // The code-built Endurance has its engines now; the model hulls get theirs when the file lands.
      if (kind === 'endurance') expect(parts.plumeCores.length).toBe(parts.plumes.length);
      parts.release?.();
    }
  });
});
