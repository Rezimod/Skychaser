// Free flight inside a world after a dive: the pilot's ship, flown anywhere
// over the site, landed where the crew may step out (or by the computer at
// the pad), or flown back up out of the air.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeFreeFlight, topSpeed, type FreeFlight, type FreeInput, type FreeStep } from '@/lib/solar-system/atmo-flight';

const DT = 1 / 60;
const flat = () => 0;
const IDLE: FreeInput = { moveX: 0, moveY: 0, throttle: 0 };

function earthFlight(alt = 22_000, speed = 900): FreeFlight {
  return makeFreeFlight('earth',
    { position: new THREE.Vector3(-30_000 * 0.2, alt, -8000), velocity: new THREE.Vector3(speed * 0.6, -speed * 0.1, speed * 0.79) },
    { ground: flat, landRadius: 150, pad: { x: 0, z: 26 }, floor: 90, flyRadius: 14_000 });
}

function fly(f: FreeFlight, seconds: number, input: FreeInput | ((t: number) => FreeInput), until?: (s: FreeStep) => boolean): FreeStep {
  let step: FreeStep = 'flying';
  for (let t = 0; t < seconds; t += DT) {
    step = f.step(DT, typeof input === 'function' ? input(t) : input);
    expect(Number.isFinite(f.position.x + f.position.y + f.position.z)).toBe(true);
    if (step !== 'flying' || until?.(step)) break;
  }
  return step;
}

describe('free flight inside the air', () => {
  it('keeps flying with nothing pressed: holds its pace, never into the ground, back from the edge', () => {
    const f = earthFlight(3000, 300);
    const step = fly(f, 240, IDLE);
    expect(step).toBe('flying');
    expect(f.agl).toBeGreaterThanOrEqual(89);
    expect(Math.hypot(f.position.x, f.position.z)).toBeLessThan(18_000);
    expect(f.telemetry.phase).toBe('flight');
  });

  it('speeds up on the stick to its top speed for the height, and brakes to a hover', () => {
    const f = earthFlight(2000, 100);
    fly(f, 30, { moveX: 0, moveY: 1, throttle: 0 });
    expect(f.telemetry.speed).toBeGreaterThan(topSpeed(f.agl) * 0.85);
    fly(f, 30, { moveX: 0, moveY: -1, throttle: 0 });
    expect(f.telemetry.speed).toBeLessThan(5);
    const y = f.position.y;
    fly(f, 5, IDLE);
    expect(Math.abs(f.position.y - y)).toBeLessThan(3);
  });

  it('turns with the stick, and banks into the turn', () => {
    const f = earthFlight(2000, 200);
    const before = f.track.clone();
    fly(f, 2, { moveX: 1, moveY: 0, throttle: 0 });
    expect(before.angleTo(f.track)).toBeGreaterThan(0.5);
    // Turning right from a heading: the new heading is to the right (clockwise seen from above).
    expect(before.clone().cross(f.track).y).toBeLessThan(0);
  });

  it('climbs on the engine key and goes down on the descend key', () => {
    const f = earthFlight(2000, 200);
    const y0 = f.position.y;
    fly(f, 6, { moveX: 0, moveY: 0, throttle: 1 });
    expect(f.position.y).toBeGreaterThan(y0 + 100);
    const y1 = f.position.y;
    fly(f, 6, { moveX: 0, moveY: 0, throttle: 0, descend: true });
    expect(f.position.y).toBeLessThan(y1 - 100);
  });

  it('cannot come down low away from where the crew may step out (over the rooftops)', () => {
    const f = makeFreeFlight('earth', { position: new THREE.Vector3(3000, 400, 3000), velocity: new THREE.Vector3(0, 0, -50) },
      { ground: flat, landRadius: 150, pad: { x: 0, z: 26 }, floor: 90 });
    fly(f, 20, { moveX: 0, moveY: -1, throttle: 0, descend: true });
    expect(f.agl).toBeGreaterThan(80);
  });

  it('sets down by itself low and slow over ground it may land on, where it is', () => {
    const f = makeFreeFlight('mars', { position: new THREE.Vector3(40, 60, 60), velocity: new THREE.Vector3(0, 0, 0) },
      { ground: flat, landRadius: 300, pad: { x: 0, z: 26 }, floor: 40 });
    const step = fly(f, 60, { moveX: 0, moveY: 0, throttle: 0, descend: true });
    expect(step).toBe('landed');
    expect(f.agl).toBeLessThan(0.5);
    expect(Math.hypot(f.position.x - 40, f.position.z - 60)).toBeLessThan(15);
  });

  it('flies itself to the base on Land at base, and the stick takes it back', () => {
    const f = earthFlight(4000, 400);
    f.landAtBase(true);
    const step = fly(f, 400, IDLE);
    expect(step).toBe('handover');
    expect(Math.hypot(f.position.x, f.position.z - 26)).toBeLessThan(270);
    const g = earthFlight(4000, 400);
    g.landAtBase(true);
    fly(g, 1, { moveX: 1, moveY: 0, throttle: 0 });
    expect(g.autopilot).toBe(false);
  });

  it('leaves for space through the top of the air, climbing', () => {
    const f = earthFlight(20_000, 1500);
    const step = fly(f, 600, { moveX: 0, moveY: 1, throttle: 1 });
    expect(step).toBe('orbit');
  });

  it('burns in the thick air only when flown very fast low down', () => {
    const f = earthFlight(22_000, 900);
    fly(f, 1, IDLE);
    expect(f.telemetry.heat).toBeLessThan(0.3);
    const m = makeFreeFlight('moon', { position: new THREE.Vector3(0, 5000, 0), velocity: new THREE.Vector3(0, 0, 800) },
      { ground: flat, landRadius: 300, pad: { x: 0, z: 26 } });
    fly(m, 1, { moveX: 0, moveY: 1, throttle: 0 });
    expect(m.telemetry.heat).toBe(0);
  });
});
