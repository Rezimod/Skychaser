// The way down from orbit, as numbers: where it starts, that it arrives
// exactly where the lander's powered descent begins (so the lander can take
// it on and set it down), what the air does on the way (heat, turbulence,
// the speed of sound), how far the pilot can lean on it, the skip, the
// clock, and the way back up.

import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  formatAltitude, formatRange, formatSpeed, formatVertical, makeOrbitalAscent, makeOrbitalDescent, orbitTitle,
  type OrbitalDescent, type OrbitalInput,
} from '@/lib/solar-system/orbital-descent';
import {
  PLANET_BODIES, altitudeOf, localUpAt, orbitalSpeed, siteBasis, type GlobeWorld,
} from '@/lib/solar-system/planet-frame';
import { makeLander, type DescentStart, type LanderHandle } from '@/lib/solar-system/moon-lander';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import { makeSurfaceFlight } from '@/lib/solar-system/surface-flight';

const DT = 1 / 60;
const WORLDS: GlobeWorld[] = ['moon', 'mars', 'earth'];
/** The powered descents the scenes start: the Moon's and Mars's default, Earth's own (world-earth EARTH_DESCENT). */
const EARTH_DESCENT: DescentStart = { alt: 600, descent: 38, offsetX: -35, offsetZ: -52, driftX: 2, driftZ: 3 };
/** Ground under the pad: the Moon's mare, Jezero, Tbilisi at about 480 m above the sea. */
const GROUND: Record<GlobeWorld, number> = { moon: 0, mars: 0, earth: 480 };
const PAD: Record<GlobeWorld, [number, number]> = { moon: [0, 26], mars: [12, 40], earth: [-20, 30] };

beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };

function landerFor(world: GlobeWorld, kind: 'kestrel' | 'lander' = 'kestrel'): { lander: LanderHandle; ground: (x: number, z: number) => number } {
  const ground = () => GROUND[world];
  const [px, pz] = PAD[world];
  const g = PLANET_BODIES[world].gravity;
  const lander = makeLander(px, pz, ground, dust, true, undefined, g, world === 'earth' ? EARTH_DESCENT : undefined, { kind });
  return { lander, ground };
}

function descentFor(world: GlobeWorld, kind: 'kestrel' | 'lander' = 'kestrel'): { d: OrbitalDescent; lander: LanderHandle; ground: (x: number, z: number) => number } {
  const { lander, ground } = landerFor(world, kind);
  const d = makeOrbitalDescent(world, {
    position: lander.start.position.clone(), velocity: lander.start.velocity.clone(), padX: lander.pad.x, padZ: lander.pad.z,
  }, { thrustTilt: lander.thrustTilt });
  return { d, lander, ground };
}

/** Fly a descent to the end, calling `each` every step. */
function flyOut(d: OrbitalDescent, input?: (t: number) => OrbitalInput, each?: () => void, dts?: () => number): number {
  let t = 0;
  while (!d.telemetry.done && t < 400) {
    const dt = dts ? dts() : DT;
    d.update(dt, input?.(t));
    t += dt;
    each?.();
  }
  return t;
}

describe('the way down from orbit', () => {
  it.each(WORLDS)('%s starts in a low circular orbit, hundreds of kilometres uprange, with the planet curving away under it', (world) => {
    const body = PLANET_BODIES[world];
    const { d } = descentFor(world);
    const t = d.telemetry;
    expect(t.phase).toBe('orbit');
    expect(t.altitude).toBeCloseTo(body.orbitKm * 1000, -1);
    expect(t.speed).toBeCloseTo(orbitalSpeed(body, body.orbitKm * 1000), -1);
    expect(t.downrangeKm).toBeGreaterThan(600);
    expect(t.timeWarp).toBeGreaterThanOrEqual(16);
    // Out here the flat frame's y is not height: the sphere has fallen away
    // under it, and "up" is the radial through the ship, not +Y.
    const basis = siteBasis(body);
    expect(altitudeOf(body, basis, d.position)).toBeCloseTo(t.altitude, 0);
    expect(d.position.y).toBeLessThan(t.altitude - 10_000);
    const radial = localUpAt(basis, d.position, new THREE.Vector3());
    expect(d.up.dot(radial)).toBeGreaterThan(0.99999);
    expect(d.up.y).toBeLessThan(0.999);
    // Level flight along the orbit.
    expect(Math.abs(t.vertical)).toBeLessThan(5);
  });

  it.each(WORLDS)('%s arrives exactly where and how the powered descent begins', (world) => {
    const { d, lander } = descentFor(world);
    flyOut(d);
    expect(d.telemetry.done).toBe(true);
    expect(d.telemetry.phase).toBe('done');
    expect(d.position.distanceTo(lander.start.position)).toBeLessThan(0.5);
    expect(d.velocity.distanceTo(lander.start.velocity)).toBeLessThan(1);
    expect(d.telemetry.timeWarp).toBeCloseTo(1, 3);
    // Level on the heading it came in on.
    const level = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.finalYaw);
    expect(Math.abs(d.attitude.dot(level))).toBeGreaterThan(0.9999);
    // Nose along the last of the track, toward the pad.
    const nose = new THREE.Vector3(Math.sin(d.finalYaw), 0, Math.cos(d.finalYaw));
    const toPad = new THREE.Vector3(lander.pad.x - lander.start.position.x, 0, lander.pad.z - lander.start.position.z).normalize();
    expect(nose.dot(toPad)).toBeGreaterThan(0.9);
  });

  it.each(WORLDS)('%s hands over to a lander that sets it down gently on the pad', (world) => {
    const { d, lander, ground } = descentFor(world);
    flyOut(d);
    lander.handover(d.position, d.velocity, d.finalYaw);
    expect(lander.yaw).toBeCloseTo(d.finalYaw, 9);
    expect(lander.telemetry.landed).toBe(false);
    const start = lander.telemetry.altitude;
    expect(start).toBeGreaterThan(100);
    for (let i = 0; i < 60 * 120 && !lander.telemetry.landed; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, ground);
    expect(lander.telemetry.landed).toBe(true);
    expect(lander.telemetry.touchdown).toBeLessThan(2.5);
    expect(lander.telemetry.offset).toBeLessThan(20);
    // The crew step off beside the hull, on the heading it landed on.
    const off = Math.hypot(lander.telemetry.egressX - lander.position.x, lander.telemetry.egressZ - lander.position.z);
    expect(off).toBeGreaterThan(lander.hull);
    expect(off).toBeLessThan(lander.hull + 6);
    lander.dispose();
  });

  it('takes a minute and a half of play or so, Earth the longest', () => {
    const secs: Record<string, number> = {};
    for (const w of WORLDS) {
      const { d } = descentFor(w);
      secs[w] = flyOut(d);
      expect(secs[w]).toBeGreaterThan(65);
      expect(secs[w]).toBeLessThan(105);
      expect(d.nominalSeconds).toBeCloseTo(secs[w], 0);
    }
    expect(secs.earth).toBeGreaterThan(secs.mars);
    expect(secs.earth).toBeGreaterThan(secs.moon);
  });

  it('flies the legs in order: an entry and a glide through air, a braking burn and an approach over the Moon', () => {
    const legs = (w: GlobeWorld) => {
      const { d } = descentFor(w);
      const seen: string[] = [d.telemetry.phase];
      flyOut(d, undefined, () => { if (seen[seen.length - 1] !== d.telemetry.phase) seen.push(d.telemetry.phase); });
      return seen;
    };
    expect(legs('earth')).toEqual(['orbit', 'deorbit', 'entry', 'glide', 'done']);
    expect(legs('mars')).toEqual(['orbit', 'deorbit', 'entry', 'glide', 'done']);
    expect(legs('moon')).toEqual(['orbit', 'deorbit', 'braking', 'approach', 'done']);
  });

  it.each(WORLDS)('%s keeps "down" the planet\'s radial all the way, and the height it reports is the true one', (world) => {
    const body = PLANET_BODIES[world];
    const basis = siteBasis(body);
    const { d } = descentFor(world);
    const radial = new THREE.Vector3();
    let n = 0;
    flyOut(d, undefined, () => {
      if (n++ % 90 !== 0) return;
      expect(altitudeOf(body, basis, d.position)).toBeCloseTo(d.telemetry.altitude, 1);
      localUpAt(basis, d.position, radial);
      expect(d.up.dot(radial)).toBeGreaterThan(0.999999);
      // The speed on the glass is the speed of the ship.
      expect(d.velocity.length()).toBeCloseTo(d.telemetry.speed, 6);
    });
  });

  it('heats nothing over the Moon, nothing above the air, and fully in the entry', () => {
    const moon = descentFor('moon').d;
    flyOut(moon, undefined, () => {
      expect(moon.telemetry.heat).toBe(0);
      expect(moon.telemetry.turbulence).toBe(0);
      expect(moon.telemetry.mach).toBe(0);
    });
    expect(moon.telemetry.booms).toBe(0);
    for (const w of ['mars', 'earth'] as const) {
      const top = PLANET_BODIES[w].atmosphereKm * 1000;
      const { d } = descentFor(w);
      let peak = 0; let peakPhase = '';
      flyOut(d, undefined, () => {
        const t = d.telemetry;
        if (t.altitude >= top) expect(t.heat).toBe(0);
        expect(t.heat).toBeGreaterThanOrEqual(0);
        expect(t.heat).toBeLessThanOrEqual(1);
        if (t.heat > peak) { peak = t.heat; peakPhase = t.phase; }
      });
      expect(peak).toBeGreaterThan(0.95);
      expect(peakPhase).toBe('entry');
      // One sonic boom on the way down, as the ship comes through Mach 1.
      expect(d.telemetry.booms).toBe(1);
    }
  });

  it('shakes hardest in the thick of the entry and through the speed of sound', () => {
    for (const w of ['mars', 'earth'] as const) {
      const { d } = descentFor(w);
      let inEntry = 0; let transonic = 0; let inOrbit = 0; let atEnd = 1;
      flyOut(d, undefined, () => {
        const t = d.telemetry;
        if (t.phase === 'entry') inEntry = Math.max(inEntry, t.turbulence);
        if (t.mach > 0.9 && t.mach < 1.1) transonic = Math.max(transonic, t.turbulence);
        if (t.phase === 'orbit' || t.phase === 'deorbit') inOrbit = Math.max(inOrbit, t.turbulence);
        atEnd = t.turbulence;
        expect(t.turbulence).toBeLessThanOrEqual(1);
      });
      expect(inEntry).toBeGreaterThan(0.8);
      expect(transonic).toBeGreaterThan(0.6);
      expect(inOrbit).toBe(0);
      expect(atEnd).toBeLessThan(0.1);
    }
  });

  it('runs the clock fast in orbit and at real time for the last of it', () => {
    for (const w of WORLDS) {
      const { d } = descentFor(w);
      let lo = 99; let hi = 0; let belowTwoKm = 99;
      flyOut(d, undefined, () => {
        const t = d.telemetry;
        lo = Math.min(lo, t.timeWarp); hi = Math.max(hi, t.timeWarp);
        if (t.phase !== 'done' && t.altitude - GROUND[w] < 1500) belowTwoKm = Math.min(belowTwoKm, t.timeWarp);
      });
      expect(hi).toBeGreaterThanOrEqual(16);
      expect(hi).toBeLessThanOrEqual(30);
      expect(lo).toBeGreaterThanOrEqual(1);
      expect(belowTwoKm).toBeLessThan(1.1);
      // Honest: the simulated seconds are the wall seconds times the clock.
      expect(d.telemetry.simSeconds).toBeGreaterThan(d.telemetry.wallSeconds * 3);
    }
  });

  it('turns the hull so the engines face along the path for the retro burn, and belly into the air for the entry', () => {
    const { d } = descentFor('earth', 'lander');
    let burnDot = -1; let entryDot = 1;
    const plume = new THREE.Vector3();
    const dir = new THREE.Vector3();
    flyOut(d, undefined, () => {
      const t = d.telemetry;
      dir.copy(d.velocity).normalize();
      // The lander's plume points down its own −Y.
      plume.set(0, -1, 0).applyQuaternion(d.attitude);
      if (t.phase === 'deorbit' && t.burn > 0.95) burnDot = Math.max(burnDot, plume.dot(dir));
      if (t.phase === 'entry' && t.heat > 0.9) entryDot = Math.min(entryDot, plume.dot(dir));
    });
    expect(burnDot).toBeGreaterThan(0.97);
    // The belly (−Y) faces into the flow, well off the nose (angle of attack ~40°).
    expect(entryDot).toBeGreaterThan(0.4);
    expect(entryDot).toBeLessThan(0.85);
  });
});

describe('the pilot on the way down', () => {
  it.each(WORLDS)('%s: whatever the stick does, the ship stays in the corridor and still arrives at the handover', (world) => {
    const pushes: OrbitalInput[] = [
      { pitch: 1, cross: 1, throttle: 1 },
      { pitch: -1, cross: -1, throttle: 0 },
    ];
    for (const push of pushes) {
      const { d, lander } = descentFor(world);
      const nominal = descentFor(world).d.nominalSeconds;
      const secs = flyOut(d, () => push, () => {
        const t = d.telemetry;
        expect(Math.abs(t.offPath)).toBeLessThanOrEqual(4000 + 1e-6);
        expect(Math.abs(t.crossRange)).toBeLessThanOrEqual(25_000 + 1e-6);
        expect(t.authority).toBeGreaterThanOrEqual(0);
        expect(t.authority).toBeLessThanOrEqual(1);
      });
      expect(d.telemetry.done).toBe(true);
      expect(d.position.distanceTo(lander.start.position)).toBeLessThan(0.5);
      expect(d.velocity.distanceTo(lander.start.velocity)).toBeLessThan(2);
      // Braking on the engines makes it slower; flying clean does not.
      if (push.throttle > 0) expect(secs).toBeGreaterThan(nominal + 2);
      else expect(secs).toBeLessThan(nominal + 1);
    }
  });

  it('moves the ship off the corridor where the pilot has authority, and gives it all back to guidance at the end', () => {
    const { d } = descentFor('earth');
    let maxOff = 0; let maxCross = 0; let lateAuth = 1;
    flyOut(d, () => ({ pitch: 1, cross: 1, throttle: 0 }), () => {
      const t = d.telemetry;
      maxOff = Math.max(maxOff, t.offPath);
      maxCross = Math.max(maxCross, t.crossRange);
      if (t.altitude - GROUND.earth < 1100 && t.phase !== 'done') lateAuth = Math.min(lateAuth, t.authority);
    });
    expect(maxOff).toBeGreaterThan(1000);
    expect(maxCross).toBeGreaterThan(1000);
    expect(lateAuth).toBeLessThan(0.05);
    expect(d.telemetry.offPath).toBeCloseTo(0, 3);
    expect(d.telemetry.crossRange).toBeCloseTo(0, 3);
  });

  it('clamps the stick: a push past full is a full push', () => {
    const a = descentFor('mars').d;
    const b = descentFor('mars').d;
    for (let i = 0; i < 1200; i++) {
      a.update(DT, { pitch: 1, cross: -1, throttle: 1 });
      b.update(DT, { pitch: 7, cross: -30, throttle: 4 });
    }
    expect(a.position.distanceTo(b.position)).toBe(0);
    const c = descentFor('mars').d;
    const e = descentFor('mars').d;
    for (let i = 0; i < 600; i++) {
      c.update(DT, { pitch: 0, cross: 0, throttle: 0 });
      e.update(DT, { pitch: 0, cross: 0, throttle: -3 });
    }
    expect(c.position.distanceTo(e.position)).toBe(0);
  });
});

describe('the skips and the clock', () => {
  it.each(WORLDS)('%s: the skip goes straight to the handover', (world) => {
    const { d, lander } = descentFor(world);
    for (let i = 0; i < 120; i++) d.update(DT);
    d.skip();
    expect(d.telemetry.done).toBe(true);
    expect(d.position.distanceTo(lander.start.position)).toBeLessThan(0.5);
    d.update(DT);
    expect(d.telemetry.done).toBe(true);
  });

  it('the development skip lands at the top of the entry, or of the braking burn', () => {
    const earth = descentFor('earth').d;
    earth.skipToEntry();
    expect(earth.telemetry.phase).toBe('entry');
    expect(earth.telemetry.altitude).toBeGreaterThan(90_000);
    expect(earth.telemetry.altitude).toBeLessThan(110_000);
    const moon = descentFor('moon').d;
    moon.skipToEntry();
    expect(moon.telemetry.phase).toBe('braking');
    expect(moon.telemetry.altitude).toBeLessThan(20_000);
  });

  it('is deterministic for a given sequence of steps', () => {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const steps = Array.from({ length: 4000 }, () => 1 / 30 + rnd() / 40);
    const inputs = Array.from({ length: 4000 }, () => ({ pitch: rnd() * 2 - 1, cross: rnd() * 2 - 1, throttle: rnd() }));
    const run = () => {
      const d = descentFor('earth').d;
      const out: number[] = [];
      for (let i = 0; i < steps.length && !d.telemetry.done; i++) {
        d.update(steps[i], inputs[i]);
        if (i % 50 === 0) out.push(d.position.x, d.position.y, d.position.z, d.telemetry.heat, d.telemetry.turbulence);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('the way back up', () => {
  it.each(WORLDS)('%s climbs from the top of the lander\'s climb to orbit in about half a minute', (world) => {
    const body = PLANET_BODIES[world];
    const { lander, ground } = landerFor(world);
    lander.settle(ground);
    lander.launch();
    for (let i = 0; i < 60 * 6; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, ground);
    const heading = new THREE.Vector3(Math.sin(lander.yaw), 0, Math.cos(lander.yaw));
    const a = makeOrbitalAscent(world, { position: lander.position.clone(), velocity: lander.velocity.clone() }, heading, { thrustTilt: lander.thrustTilt });
    // It picks up where the lander is, moving the way it was.
    expect(a.position.distanceTo(lander.position)).toBeLessThan(0.5);
    expect(a.telemetry.phase).toBe('climb');
    const seen: string[] = [];
    let t = 0; let peakHeat = 0;
    while (!a.telemetry.done && t < 120) {
      a.update(DT);
      t += DT;
      if (seen[seen.length - 1] !== a.telemetry.phase) seen.push(a.telemetry.phase);
      peakHeat = Math.max(peakHeat, a.telemetry.heat);
    }
    expect(seen).toEqual(['climb', 'ascent', 'orbit', 'done']);
    expect(t).toBeGreaterThan(25);
    expect(t).toBeLessThan(45);
    expect(a.telemetry.altitude).toBeCloseTo(body.orbitKm * 1000, -2);
    expect(a.telemetry.speed).toBeCloseTo(orbitalSpeed(body, body.orbitKm * 1000), -1);
    // Going up through the air is not an entry: a glow at most.
    expect(peakHeat).toBeLessThan(0.4);
    // Downrange, the way the nose pointed.
    const away = a.position.clone().sub(lander.position);
    away.addScaledVector(a.up, -away.dot(a.up));
    expect(away.normalize().dot(heading)).toBeGreaterThan(0.9);
    lander.dispose();
  });
});

describe('the numbers on the glass', () => {
  it('reads kilometres and km/s high up, metres and m/s near the ground', () => {
    expect(formatAltitude(400_000)).toBe('400 km');
    expect(formatAltitude(4_520)).toBe('4.5 km');
    expect(formatAltitude(612.4)).toBe('612 m');
    expect(formatSpeed(7669)).toBe('7.67 km/s');
    expect(formatSpeed(245.6)).toBe('246 m/s');
    expect(formatVertical(-38)).toBe('−38 m/s');
    expect(formatVertical(120)).toBe('+120 m/s');
    expect(formatVertical(0.1)).toBe('0 m/s');
    expect(formatRange(2250.4)).toBe('2250 km');
    expect(formatRange(3.24)).toBe('3.2 km');
    expect(formatRange(0.063)).toBe('63 m');
  });

  it('puts the world\'s name up over the orbit and takes it down early in the burn', () => {
    expect(orbitTitle({ phase: 'orbit', phaseT: 0, wallSeconds: 0 })).toBe(0);
    expect(orbitTitle({ phase: 'orbit', phaseT: 0.5, wallSeconds: 3 })).toBe(1);
    expect(orbitTitle({ phase: 'deorbit', phaseT: 0.1, wallSeconds: 8 })).toBeGreaterThan(0);
    expect(orbitTitle({ phase: 'deorbit', phaseT: 0.5, wallSeconds: 10 })).toBe(0);
    expect(orbitTitle({ phase: 'entry', phaseT: 0.1, wallSeconds: 20 })).toBe(0);
  });
});

describe('the flight in a surface scene', () => {
  it.each(WORLDS)('%s flies the ship, the plasma and the camera down, and hands the lander over in place', (world) => {
    const { lander, ground } = landerFor(world);
    const scene = new THREE.Scene();
    scene.add(lander.group);
    const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 4000);
    const booms: number[] = [];
    let roar = 0;
    const flight = makeSurfaceFlight({
      world, lander, scene, camera, lite: true, baseFov: () => 60,
      sounds: { reentry: (k) => { roar = Math.max(roar, k); }, boom: () => booms.push(1) },
    });
    expect(flight.leg).toBe('descent');
    let step = flight.update(DT, { moveX: 0, moveY: 0, throttle: 0 });
    expect(step).toBe('flying');
    // The ship is where the flight is, the camera near it, looking level with the planet's up.
    expect(lander.position.distanceTo(camera.position)).toBeLessThan(lander.chase * 6);
    expect(camera.up.y).toBeLessThan(0.9999);
    let hot = false;
    for (let i = 0; i < 60 * 130 && step === 'flying'; i++) {
      step = flight.update(DT, { moveX: 0, moveY: 0, throttle: 0 });
      if (flight.telemetry.heat > 0.9) hot = scene.getObjectByName('entry-fx')!.visible || hot;
    }
    expect(step).toBe('handover');
    expect(lander.position.distanceTo(lander.start.position)).toBeLessThan(0.5);
    expect(lander.telemetry.landed).toBe(false);
    expect(camera.up.y).toBe(1);
    expect(scene.getObjectByName('entry-fx')!.visible).toBe(false);
    if (world === 'moon') { expect(roar).toBe(0); expect(booms).toEqual([]); }
    else { expect(hot).toBe(true); expect(roar).toBeGreaterThan(0.9); expect(booms).toEqual([1]); }
    // The descent camera can take the yaw the chase ended on.
    expect(Number.isFinite(flight.cameraYaw())).toBe(true);
    for (let i = 0; i < 60 * 120 && !lander.telemetry.landed; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, ground);
    expect(lander.telemetry.landed).toBe(true);
    // And back up: the climb, then the flight to orbit.
    lander.launch();
    for (let i = 0; i < 60 * 6; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, ground);
    flight.beginAscent();
    expect(flight.leg).toBe('ascent');
    step = 'flying';
    for (let i = 0; i < 60 * 60 && step === 'flying'; i++) step = flight.update(DT, { moveX: 0, moveY: 0, throttle: 0 });
    expect(step).toBe('orbit');
    expect(flight.telemetry.altitude).toBeCloseTo(PLANET_BODIES[world].orbitKm * 1000, -2);
    flight.dispose();
    lander.dispose();
  });

  it('stops cleanly for the skip to the ground', () => {
    const { lander } = landerFor('earth');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const flight = makeSurfaceFlight({ world: 'earth', lander, scene, camera, lite: true, baseFov: () => 60 });
    flight.skipToEntry();
    for (let i = 0; i < 300; i++) flight.update(DT, { moveX: 0, moveY: 0, throttle: 0 });
    expect(flight.telemetry.heat).toBeGreaterThan(0.3);
    flight.stop();
    expect(flight.update(DT, { moveX: 0, moveY: 0, throttle: 0 })).toBe('idle');
    expect(scene.getObjectByName('entry-fx')!.visible).toBe(false);
    expect(camera.up.y).toBe(1);
    flight.dispose();
    lander.dispose();
  });
});
