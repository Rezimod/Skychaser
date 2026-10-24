import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createFlightSession,
  createPlayerShip,
  FLIGHT_UNIT,
  type FlightBody,
  type FlightSession,
  type FlightWorld,
  type PlayerShipHandle,
} from '@/lib/solar-system/player-ship';
import { CAPTURE_RS, DARK_SEC, FALL_SEC, NO_RETURN_RS, tidalAt, wellPull } from '@/lib/solar-system/black-hole-fall';
import type { AlienHandle } from '@/lib/solar-system/aliens';

const DT = 1 / 60;
const RS = 0.4;
const EARTH_R = 0.028;
const CENTER = new THREE.Vector3(52, 16, 58);

beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

const aliens = {
  group: new THREE.Group(),
  enemies: [],
  damage: () => false,
  spawnSparks: () => undefined,
  setHostile: () => undefined,
  update: () => undefined,
  dispose: () => undefined,
} as unknown as AlienHandle;

function makeWorld(): FlightWorld {
  const earth: FlightBody = { id: 'earth', kind: 'planet', position: new THREE.Vector3(1, 0, 0), radius: EARTH_R, radiusKm: 6371, surfaceG: 9.81, atmosphere: 1.25 };
  const sun: FlightBody = { id: 'sun', kind: 'star', position: new THREE.Vector3(), radius: 0.152, radiusKm: 696_000, surfaceG: 274, atmosphere: 1.3 };
  // As makeGargantua builds it.
  const hole: FlightBody = { id: 'gargantua', kind: 'blackhole', position: CENTER.clone(), radius: RS, radiusKm: 2.95e8, surfaceG: 30, atmosphere: 3.2 };
  const home = CENTER.clone().add(new THREE.Vector3(0, 0, 30 * RS));
  return {
    bodies: [sun, earth, hole],
    pois: [],
    home: { position: home, lookAt: CENTER.clone(), yaw: 0 },
    jump: { name: 'sol', distanceLy: 1000, position: new THREE.Vector3(1, 0, 0.2), lookAt: new THREE.Vector3(1, 0, 0), yaw: 0 },
    systemName: 'gargantua',
  };
}

let session: FlightSession;
let ship: PlayerShipHandle;
let world: FlightWorld;
let camera: THREE.PerspectiveCamera;
let clock = 0;

const step = () => {
  clock += DT;
  ship.update(DT, clock, camera, aliens, world);
};
const dist = () => ship.group.position.distanceTo(CENTER);
/** Put the ship `radii` horizon radii out, nose pointing away from the hole. */
const placeAt = (radii: number) => {
  const out = new THREE.Vector3(0.3, 0.2, 1).normalize();
  const at = CENTER.clone().addScaledVector(out, radii * RS);
  ship.spawn({ position: at, lookAt: at.clone().add(out), yaw: 0 });
};

beforeEach(() => {
  session = createFlightSession();
  world = makeWorld();
  camera = new THREE.PerspectiveCamera(46, 1, 0.001, 1400);
  ship = createPlayerShip(session);
  clock = 0;
});

afterEach(() => ship.dispose());

describe('black hole: the well', () => {
  it('tides grow monotonically toward the horizon, from nothing at the edge of the well', () => {
    expect(tidalAt(CAPTURE_RS * RS, RS)).toBeCloseTo(0, 6);
    expect(tidalAt(RS, RS)).toBeCloseTo(1, 6);
    let last = -1;
    for (let r = CAPTURE_RS; r >= 1; r -= 0.05) {
      const k = tidalAt(r * RS, RS);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
  });

  it('pulls inverse-square, capped, and nothing outside the well', () => {
    expect(wellPull(CAPTURE_RS * RS + 0.01, RS)).toBe(0);
    expect(wellPull(2 * RS, RS)).toBeGreaterThan(wellPull(3 * RS, RS));
    expect(wellPull(1.01 * RS, RS)).toBeLessThanOrEqual(wellPull(0.5 * RS, RS));
    expect(Number.isFinite(wellPull(0, RS))).toBe(true);
  });

  it('a ship drifting in the well is drawn past the point of no return', () => {
    placeAt(3.2);
    session.input.thrust = 0;
    let fell = false;
    for (let i = 0; i < 60 * 30 && !fell; i++) {
      step();
      fell = session.telemetry.swallow === 'fall';
    }
    expect(fell).toBe(true);
  });

  it('outside the point of no return the drive can still fight it', () => {
    placeAt(3);
    const start = dist();
    session.input.thrust = 1;
    for (let i = 0; i < 60 * 20; i++) step();
    expect(dist()).toBeGreaterThan(start);
    expect(session.telemetry.swallow).not.toBe('fall');
    expect(session.telemetry.crashed).toBe(false);
  });
});

describe('black hole: the fall', () => {
  it('past the point of no return full throttle and boost cannot get the ship out', () => {
    placeAt(NO_RETURN_RS * 0.97);
    session.input.thrust = 1;
    session.input.boost = true;
    session.input.modeRequest = 'fast';
    const tel = session.telemetry;
    let last = dist();
    let lastTidal = -1;
    let minD = Infinity;
    let maxStretch = 1;
    let minSqueeze = 1;
    let fallFrames = 0;
    for (let i = 0; i < Math.ceil((FALL_SEC + 0.5) / DT) && tel.swallow !== 'dark'; i++) {
      step();
      expect(['fall', 'dark']).toContain(tel.swallow);
      fallFrames += 1;
      const d = dist();
      expect(d).toBeLessThanOrEqual(last + 1e-9);
      expect(tel.tidal).toBeGreaterThanOrEqual(lastTidal - 1e-9);
      expect(tel.crashed).toBe(false);
      expect(tel.alert).toBe('horizon');
      last = d;
      lastTidal = tel.tidal;
      minD = Math.min(minD, d);
      maxStretch = Math.max(maxStretch, ship.parts.hull.scale.z);
      minSqueeze = Math.min(minSqueeze, ship.parts.hull.scale.x);
    }
    expect(tel.swallow).toBe('dark');
    // It reaches the horizon, in the time the fall is meant to take.
    expect(minD).toBeLessThanOrEqual(RS * 1.01);
    expect(fallFrames * DT).toBeGreaterThan(FALL_SEC - 0.2);
    expect(fallFrames * DT).toBeLessThan(FALL_SEC + 0.2);
    // Spaghettified: drawn out along the radial, crushed across it.
    expect(maxStretch).toBeGreaterThan(6);
    expect(minSqueeze).toBeLessThan(0.3);
    // The nose ends up on the hole.
    const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(ship.group.quaternion);
    const toHole = CENTER.clone().sub(ship.group.position).normalize();
    expect(nose.dot(toHole)).toBeGreaterThan(0.9);
  });

  it('past the horizon the ship is spat back out at home by the Earth, whole', () => {
    ship.spawn(world.home);
    // Through the shields and into the hull.
    ship.takeDamage(session.telemetry.maxShield + 50);
    expect(session.telemetry.hp).toBeLessThan(session.telemetry.maxHp);
    placeAt(NO_RETURN_RS * 0.99);
    ship.takeDamage(session.telemetry.maxShield + 50);
    const tel = session.telemetry;
    const frames = Math.ceil((FALL_SEC + DARK_SEC + 0.5) / DT);
    let sawDark = false;
    for (let i = 0; i < frames && tel.swallow !== 'spat'; i++) {
      step();
      if (tel.swallow === 'dark') {
        sawDark = true;
        expect(ship.group.visible).toBe(false);
      }
    }
    expect(sawDark).toBe(true);
    expect(tel.swallow).toBe('spat');
    expect(tel.crashed).toBe(false);
    expect(tel.hp).toBe(tel.maxHp);
    expect(tel.shield).toBe(tel.maxShield);
    expect(ship.group.visible).toBe(true);
    expect(ship.parts.hull.scale.toArray()).toEqual([1, 1, 1]);
    // Home is by the Earth, in Sol — not the black hole system's arrival.
    const earth = world.bodies.find((b) => b.id === 'earth')!;
    expect(ship.group.position.distanceTo(earth.position)).toBeLessThan(0.2);
    expect(ship.group.position.distanceTo(CENTER)).toBeGreaterThan(10);
    expect(tel.jumpFlash).toBeGreaterThan(0.3);
    // It flies on, and the message clears after a few seconds.
    session.input.thrust = 1;
    for (let i = 0; i < 60 * 6; i++) step();
    expect(tel.swallow).toBe('');
    expect(tel.tidal).toBe(0);
    expect(tel.speed).toBeGreaterThan(0.3);
    expect(tel.speed).toBeLessThan(2 * (1.3 * FLIGHT_UNIT) / FLIGHT_UNIT);
  });
});
