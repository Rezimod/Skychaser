// The other worlds — the pieces with rules rather than pixels: the descent
// under a heavier pull, the villagers' manners, and which worlds a ship
// may go down to.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeLander } from '@/lib/solar-system/moon-lander';
import { makeInteractions } from '@/lib/solar-system/moon-interactions';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import { makeAliens, GREETINGS_TO_LEAD, NOTICE_RANGE, POLITE_DISTANCE, LOSE_RANGE } from '@/lib/solar-system/world-aliens';
import { EARTH, LANDING_SITES, MARS, PROXIMA_B, isWorldId } from '@/lib/solar-system/world-profiles';
import { cloudSteps } from '@/lib/solar-system/world-clouds';
import { gaitProfile, LUNAR_G } from '@/lib/solar-system/suit-locomotion';

const flat = () => 0;
const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
const lights: LightPool = { lights: [], request: vi.fn(), flush: vi.fn() };
const DT = 1 / 60;

describe('the descent on a heavier world', () => {
  it.each([['Mars', MARS.gravity], ['Proxima b', PROXIMA_B.gravity]])('guidance still sets it down on %s', (_, g) => {
    const lander = makeLander(0, 20, flat, dust, true, undefined, g);
    // A pilot who never touches the engine: the computer has to take it.
    for (let i = 0; i < 60 * 90 && !lander.telemetry.landed; i++) lander.update(DT, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(lander.telemetry.landed).toBe(true);
    expect(lander.telemetry.assist).toBe(true);
    expect(lander.telemetry.touchdown).toBeLessThan(3.5);
    expect(lander.telemetry.offset).toBeLessThan(40);
  });

  it('a full-throttle pilot can climb away on Proxima b', () => {
    const lander = makeLander(0, 20, flat, dust, true, undefined, PROXIMA_B.gravity);
    for (let i = 0; i < 60 * 8; i++) lander.update(DT, { throttle: 1, moveX: 0, moveY: 0 }, flat);
    expect(lander.telemetry.landed).toBe(false);
    expect(lander.telemetry.descent).toBe(0);
  });
});

describe('the villagers', () => {
  const village = { x: 0, z: 0, r: 20, stone: { x: 0, z: 0 } };
  const setup = () => {
    const onEvent = vi.fn();
    const aliens = makeAliens({ heightAt: flat, colliders: [], village, lite: true, onEvent });
    const io = makeInteractions();
    for (const i of aliens.interactables) io.add(i);
    let t = 0;
    const crew = { x: 200, z: 200 };
    const run = (seconds: number, press = false) => {
      for (let i = 0; i < seconds * 60; i++) {
        io.update(DT, { x: crew.x, z: crew.z, yaw: 0, driving: false, press: press && i === 0, held: false });
        aliens.update(DT, t, crew.x, crew.z, lights);
        t += DT;
      }
    };
    return { aliens, io, crew, run, onEvent };
  };

  it('mind their own business until a suit comes near', () => {
    const { aliens, run } = setup();
    run(20);
    expect(aliens.telemetry.states.every((s) => s === 'wander' || s === 'wait')).toBe(true);
    expect(aliens.telemetry.nearest).toBeGreaterThan(NOTICE_RANGE);
    expect(aliens.telemetry.phrase).toBe('');
  });

  it('notice, walk over, stop a polite distance off, and say hello', () => {
    const { aliens, crew, run, onEvent } = setup();
    crew.x = 24; crew.z = 0;
    run(1);
    expect(aliens.telemetry.states).toContain('notice');
    expect(onEvent).toHaveBeenCalledWith('notice');
    run(40);
    expect(onEvent).toHaveBeenCalledWith('greet');
    expect(aliens.telemetry.states.some((s) => s === 'follow' || s === 'greet')).toBe(true);
    // Nobody crowds the crew.
    expect(aliens.telemetry.nearest).toBeGreaterThan(POLITE_DISTANCE - 0.6);
  });

  it('follow a crew that walks, and go home when it is gone', () => {
    const { aliens, crew, run } = setup();
    crew.x = 24; crew.z = 0;
    run(45);
    crew.x = 60;
    run(30);
    expect(aliens.telemetry.nearest).toBeLessThan(12);
    crew.x = 60 + LOSE_RANGE + 40;
    run(60);
    expect(aliens.telemetry.states.every((s) => s === 'home' || s === 'wait' || s === 'wander')).toBe(true);
  });

  it('three greetings and one of them leads you to the stone', () => {
    const { aliens, io, crew, run, onEvent } = setup();
    crew.x = 24; crew.z = 0;
    run(45);
    for (let k = 0; k < GREETINGS_TO_LEAD; k++) {
      run(1);
      expect(io.prompt.active).toBe(true);
      expect(io.prompt.label).toBe('greet');
      run(4, true);
    }
    expect(aliens.telemetry.greetings).toBe(GREETINGS_TO_LEAD);
    expect(aliens.telemetry.states).toContain('lead');
    // Walk to the stone with them.
    crew.x = 2; crew.z = 2;
    for (let i = 0; i < 60 && !aliens.telemetry.atStone; i++) run(1);
    expect(aliens.telemetry.atStone).toBe(true);
    expect(onEvent).toHaveBeenCalledWith('stone');
    expect(aliens.telemetry.phrase).toBe('gift');
  });
});

describe('walking on a heavier world', () => {
  it('is slower, shorter in the air and quicker to stop than the Moon, with no numbers of its own', () => {
    const moon = gaitProfile(LUNAR_G, true); const mars = gaitProfile(MARS.gravity, true); const prox = gaitProfile(PROXIMA_B.gravity, true);
    expect(mars.hop * mars.hop / (2 * mars.g)).toBeLessThan(moon.hop * moon.hop / (2 * moon.g));
    expect(prox.hop * prox.hop / (2 * prox.g)).toBeLessThan(mars.hop * mars.hop / (2 * mars.g));
    expect(prox.sprint).toBeLessThan(mars.sprint);
    expect(prox.brake).toBeGreaterThan(mars.brake);
    expect(mars.brake).toBeGreaterThan(moon.brake);
    expect(prox.cadenceRun).toBeGreaterThan(mars.cadenceRun);
  });
});

describe('the air and the sky over the other worlds', () => {
  it('Mars scatters red and eats blue; Proxima b scatters blue under a red star', () => {
    expect(MARS.atmosphere.rayleigh[0]).toBeGreaterThan(MARS.atmosphere.rayleigh[2]);
    expect(MARS.atmosphere.absorb[2]).toBeGreaterThan(MARS.atmosphere.absorb[0]);
    expect(PROXIMA_B.atmosphere.rayleigh[2]).toBeGreaterThan(PROXIMA_B.atmosphere.rayleigh[0]);
    for (const p of [MARS, PROXIMA_B]) {
      expect(p.atmosphere.hazeBeta).toBeGreaterThan(0);
      expect(p.atmosphere.mieG).toBeGreaterThan(0);
      expect(p.atmosphere.mieG).toBeLessThan(1);
      expect(p.clouds).not.toBeNull();
      expect(p.formations).not.toBeNull();
      expect(p.crystals).not.toBeNull();
    }
  });

  it('only Proxima b has the ringed giant, about twenty-four degrees across; Mars keeps its two moons', () => {
    expect(MARS.giant).toBeNull();
    expect(MARS.sky.moons.map((m) => m.id)).toEqual(['phobos', 'deimos']);
    expect(PROXIMA_B.giant?.angularDeg).toBeCloseTo(24, 0);
    expect(PROXIMA_B.giant!.ringOuter).toBeGreaterThan(PROXIMA_B.giant!.ringInner);
    expect(PROXIMA_B.giant!.dir.y).toBeGreaterThan(0.15);
  });

  it('Earth brings none of it: its sky and air are the real ones', () => {
    expect(EARTH.clouds).toBeNull();
    expect(EARTH.giant).toBeNull();
    expect(EARTH.formations).toBeNull();
    expect(EARTH.crystals).toBeNull();
  });

  it('the cloud march steps with the preset: none, coarse, full', () => {
    expect(cloudSteps(0)).toBe(0);
    expect(cloudSteps(1)).toBe(4);
    expect(cloudSteps(2)).toBe(10);
  });
});

describe('where a ship may go down', () => {
  it('knows the four surfaces and nothing else', () => {
    expect(Object.keys(LANDING_SITES).sort()).toEqual(['earth', 'mars', 'moon', 'proximaB']);
    expect(isWorldId('mars')).toBe(true);
    expect(isWorldId('earth')).toBe(true);
    expect(isWorldId('moon')).toBe(false);
    expect(isWorldId('venus')).toBe(false);
  });
});
