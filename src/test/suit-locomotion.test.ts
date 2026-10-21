// The cosmonaut's movement, held to what it claims: a game character's
// gaits on any world, every number of them worked from gravity — the walk
// capped by the pendulum, the jog a lope where it must be, a jump that
// hangs on the Moon and hops on Proxima b, landings sorted by what the legs
// can absorb, boots that stay where they are planted, coyote time and a
// buffered jump, steps taken in stride and ledges fallen off.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  classifyLanding, gaitProfile, makeLocomotion, EARTH_G, JET, JUMP_MIN_APEX, LUNAR_G, turnRate, type Collider, type GaitProfile, type WalkInput,
} from '@/lib/solar-system/suit-locomotion';
import { STEP_UP, STEP_DOWN, vaultProbe } from '@/lib/solar-system/suit-collision';
import { MARS, PROXIMA_B } from '@/lib/solar-system/world-profiles';
import type { DustHandle } from '@/lib/solar-system/moon-fx';

const DT = 1 / 120;
const flat = () => 0;
const input = (over: Partial<WalkInput> = {}): WalkInput => ({ moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false, ...over });

function walker(profile: GaitProfile, heightAt: (x: number, z: number) => number = flat, colliders: Collider[] = []) {
  const position = { x: 0, y: heightAt(0, 0), z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  const loco = makeLocomotion(position, velocity, profile);
  loco.settleFeet();
  const run = (seconds: number, over: Partial<WalkInput> = {}, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) { loco.update(DT, input(over), heightAt, colliders, 999); each?.(); }
  };
  return { loco, position, velocity, run };
}

/** Time in the air and the apex of a jump taken from where the walker is. */
function hop(w: ReturnType<typeof walker>, over: Partial<WalkInput> = {}) {
  let guard = 0;
  while (!w.loco.state.grounded && guard++ < 1000) w.run(DT, over);
  const y0 = w.position.y;
  w.loco.update(DT, input({ ...over, jump: true }), flat, [], 999);
  let air = DT; let apex = 0;
  while (w.loco.state.jumping || air < 0.05) {
    w.run(DT, over);
    air += DT;
    apex = Math.max(apex, w.position.y - y0);
    if (air > 10) break;
  }
  return { air, apex };
}

const moon = gaitProfile(LUNAR_G, true);
const mars = gaitProfile(MARS.gravity, true);
const proxima = gaitProfile(PROXIMA_B.gravity, true);
const earth = gaitProfile(EARTH_G, false);

describe('the gait profile, from gravity', () => {
  it('walks no faster than the pendulum allows, and jogs above it where it can', () => {
    for (const p of [moon, mars, proxima, earth]) {
      expect(p.walkLimit).toBeCloseTo(Math.sqrt(0.5 * p.g * p.leg), 6);
      expect(p.walk).toBeLessThan(p.walkLimit);
      expect(p.walk).toBeLessThan(p.jog);
      expect(p.jog).toBeLessThan(p.run);
      expect(p.run).toBeLessThan(p.sprint);
    }
    // The Moon and Mars lope at a jog; Proxima b's jog is a fast walk and its run is a run.
    expect(moon.jog).toBeGreaterThan(moon.walkLimit);
    expect(mars.jog).toBeGreaterThan(mars.walkLimit);
    expect(proxima.jog).toBeLessThan(proxima.walkLimit);
    expect(proxima.run).toBeGreaterThan(proxima.walkLimit);
    // Playable on every world, heaviest slowest.
    expect(moon.jog).toBeGreaterThan(2.2);
    expect(moon.sprint).toBeGreaterThan(4);
    expect(proxima.sprint).toBeLessThan(mars.sprint);
    expect(proxima.jog).toBeLessThan(moon.jog);
  });

  it('jumps by the legs and gravity: the Moon hangs, Mars hops, Proxima b barely leaves the ground', () => {
    // Under the felt gravity (gait-profile's header): lunar, but not wading.
    const apex = (p: GaitProfile) => (p.hop * p.hop) / (2 * p.g);
    const air = (p: GaitProfile) => (2 * p.hop) / p.g;
    expect(apex(moon)).toBeGreaterThan(0.6);
    expect(apex(moon)).toBeLessThan(0.9);
    expect(air(moon)).toBeGreaterThan(1.2);
    expect(air(moon)).toBeLessThan(1.6);
    expect(apex(mars)).toBeGreaterThan(0.25);
    expect(apex(mars)).toBeLessThan(0.45);
    expect(apex(proxima)).toBeCloseTo(JUMP_MIN_APEX, 3);
    expect(air(proxima)).toBeLessThan(0.4);
    expect(apex(earth)).toBeGreaterThan(0.3);
    expect(apex(earth)).toBeLessThan(0.5);
  });

  it('brakes and turns with the grip the world gives', () => {
    expect(moon.brake).toBeLessThan(mars.brake);
    expect(mars.brake).toBeLessThan(proxima.brake);
    expect(moon.accel).toBeLessThan(mars.accel);
    expect(turnRate(moon, moon.sprint)).toBeLessThan(turnRate(proxima, proxima.sprint));
    expect(turnRate(moon, 0)).toBeGreaterThan(turnRate(moon, moon.jog));
    expect(moon.air).toBeGreaterThan(mars.air);
    expect(mars.air).toBeGreaterThan(proxima.air);
    expect(moon.stamina).toBeGreaterThan(proxima.stamina);
    expect(moon.recover).toBeLessThan(proxima.recover);
  });

  it('runs at the cadence of its gravity: the lunar lope is slow and long in the air', () => {
    expect(moon.cadenceRun).toBeLessThan(mars.cadenceRun);
    expect(mars.cadenceRun).toBeLessThan(proxima.cadenceRun);
    expect(moon.flight).toBeGreaterThan(0.4);
    expect(proxima.flight).toBeLessThan(0.25);
  });

  it('sorts landings by what the legs can absorb on that world', () => {
    for (const p of [moon, mars, proxima, earth]) {
      // Your own standing jump always lands soft.
      expect(classifyLanding(p, p.hop)).toBe('soft');
      expect(p.softLand).toBeLessThan(p.rollLand);
      expect(p.rollLand).toBeLessThan(p.hardLand);
      expect(classifyLanding(p, p.rollLand * 0.99)).toBe('roll');
      expect(classifyLanding(p, p.hardLand * 0.99)).toBe('hard');
      expect(classifyLanding(p, p.hardLand * 1.5)).toBe('fall');
    }
    // An 80 cm drop is soft on the Moon, a roll on Mars and a hard landing on Proxima b.
    const drop = (p: GaitProfile, h: number) => classifyLanding(p, Math.sqrt(2 * p.g * h));
    expect(drop(moon, 0.8)).toBe('soft');
    expect(drop(mars, 0.8)).toBe('roll');
    expect(drop(proxima, 0.8)).toBe('hard');
  });
});

describe('the suit in one-sixth g', () => {
  it('hops most of a metre and hangs over a second, on the ballistic arc', () => {
    const w = walker(moon);
    const { air, apex } = hop(w);
    expect(air).toBeCloseTo((2 * moon.hop) / moon.g, 1);
    expect(apex).toBeCloseTo((moon.hop * moon.hop) / (2 * moon.g), 1);
    expect(apex).toBeGreaterThan(0.6);
  });

  it('lopes at a jog: real flights between strides, a foot at a time', () => {
    const w = walker(moon);
    let flights = 0; let was = false;
    w.run(6, { moveZ: 0.6 }, () => { if (w.loco.state.airborne && !was) flights += 1; was = w.loco.state.airborne; });
    expect(w.loco.state.gait).toBe('jog');
    expect(w.loco.state.speed).toBeGreaterThan(moon.jog * 0.9);
    expect(flights).toBeGreaterThan(3);
    expect(flights).toBeLessThan(12);
  });

  it('picks the gait from the stick, and sprints on stamina', () => {
    const w = walker(moon);
    w.run(3, { moveZ: 0.2 });
    expect(w.loco.state.speed).toBeLessThan(moon.walk * 1.05);
    expect(w.loco.state.gait).toBe('walk');
    w.run(3, { moveZ: 1 });
    expect(w.loco.state.speed).toBeGreaterThan(moon.jog * 0.9);
    expect(w.loco.state.speed).toBeLessThan(moon.run * 1.05);
    w.run(4, { moveZ: 1, sprint: true });
    expect(w.loco.state.speed).toBeGreaterThan(moon.run);
    expect(w.loco.state.sprinting).toBe(true);
    // The whole sprint, from the key going down, lasts about the profile's stamina.
    let t = 4;
    while (w.loco.state.sprinting && t < 30) { w.run(DT, { moveZ: 1, sprint: true }); t += DT; }
    expect(t).toBeGreaterThan(moon.stamina * 0.8);
    expect(t).toBeLessThan(moon.stamina * 1.1);
    expect(w.loco.state.stamina).toBeLessThan(0.05);
    // Winded: the key does nothing until the legs have some of their wind back.
    w.run(0.3, { moveZ: 1, sprint: true });
    expect(w.loco.state.sprinting).toBe(false);
    w.run(moon.recover * 1.1, { moveZ: 1 });
    expect(w.loco.state.stamina).toBeGreaterThan(0.95);
  });

  it('starts on an acceleration curve and stops in a plant, never from full speed at once', () => {
    const w = walker(moon);
    w.run(DT * 3, { moveZ: 1 });
    expect(w.loco.state.speed).toBeLessThan(moon.jog * 0.3);
    expect(w.loco.state.mode).toBe('start');
    w.run(2, { moveZ: 1 });
    expect(w.loco.state.mode).toBe('move');
    const z0 = w.position.z;
    let t = 0;
    while ((w.loco.state.speed > 0.05 || w.loco.state.airborne) && t < 10) { w.run(DT); t += DT; }
    expect(w.position.z - z0).toBeGreaterThan(0.5);
    expect(w.position.z - z0).toBeLessThan(moon.jog * moon.jog / (2 * moon.brake) + 1.6);
    expect(w.loco.state.mode).toBe('idle');
  });

  it('plants a pivot turn on a sharp reversal and comes round without falling', () => {
    const w = walker(moon);
    w.run(3, { moveZ: 1 });
    let pivoted = false; let t = 0; let fell = false;
    while (t < 2 && Math.abs(Math.atan2(w.velocity.x, w.velocity.z)) < Math.PI - 0.3) {
      w.run(DT, { moveZ: -1 }); t += DT;
      pivoted ||= w.loco.state.mode === 'pivot';
      fell ||= w.loco.state.fallen || w.loco.state.stumble > 0;
    }
    expect(pivoted).toBe(true);
    expect(fell).toBe(false);
    expect(t).toBeLessThan(1.2);
  });

  it('turns no faster than grip allows at speed, and quickly standing still', () => {
    const w = walker(moon);
    w.run(3, { moveZ: 1 });
    const yaw0 = w.loco.yaw;
    w.run(0.25, { moveX: 1 });
    expect(Math.abs(w.loco.yaw - yaw0)).toBeLessThanOrEqual(turnRate(moon, 0) * 0.25 + 1e-6);
    const s = walker(moon);
    let t = 0;
    while (Math.abs(Math.abs(s.loco.yaw) - Math.PI) > 0.1 && t < 6) { s.run(DT, { moveZ: -0.3 }); t += DT; }
    expect(t).toBeLessThan(1);
  });

  it('keeps a planted boot exactly where it was put', () => {
    for (const moveZ of [0.3, 1]) {
      const w = walker(moon);
      const last = w.loco.feet.map((f) => ({ x: f.x, z: f.z, planted: f.planted }));
      let worst = 0; let planted = 0;
      w.run(6, { moveZ }, () => {
        w.loco.feet.forEach((f, i) => {
          if (f.planted && last[i].planted) { worst = Math.max(worst, Math.hypot(f.x - last[i].x, f.z - last[i].z) / DT); planted += 1; }
          last[i] = { x: f.x, z: f.z, planted: f.planted };
        });
      });
      expect(planted).toBeGreaterThan(100);
      expect(worst).toBeLessThan(1e-6);
    }
  });

  it('slides past about thirty degrees and holds below it', () => {
    for (const [grade, slides] of [[0.4, false], [0.8, true]] as const) {
      const w = walker(moon, (x) => x * grade);
      w.run(2);
      expect(w.loco.state.sliding).toBe(slides);
    }
  });
});

describe('jumping like a game', () => {
  it('gives coyote time off a ledge and buffers a jump pressed early', () => {
    // A ledge at z = 2: walk off it, ask for the jump a tenth of a second late.
    const ledge = (_x: number, z: number) => (z > 2 ? -3 : 0);
    const w = walker(moon, ledge);
    w.run(1.5, { moveZ: 0.2 });
    while (w.loco.state.grounded) w.run(DT, { moveZ: 0.2 });
    w.run(0.08, { moveZ: 0.2 });
    expect(w.loco.state.jumping).toBe(false);
    w.loco.update(DT, input({ moveZ: 0.2, jump: true }), ledge, [], 999);
    expect(w.loco.state.jumping).toBe(true);
    // Too late is too late.
    const late = walker(moon, ledge);
    late.run(1.5, { moveZ: 0.2 });
    while (late.loco.state.grounded) late.run(DT, { moveZ: 0.2 });
    late.run(0.2, { moveZ: 0.2 });
    late.loco.update(DT, input({ moveZ: 0.2, jump: true }), ledge, [], 999);
    expect(late.loco.state.jumping).toBe(false);
    expect(late.loco.state.mode).toBe('fall');
    // Pressed before touchdown, the jump fires on landing.
    const c = walker(proxima);
    c.loco.update(DT, input({ jump: true }), flat, [], 999);
    for (let i = 0; i < 20; i++) c.run(DT);
    expect(c.loco.state.airborne).toBe(true);
    c.loco.update(DT, input({ jump: true }), flat, [], 999);
    let t = 0; let again = false;
    while (t < 1 && !again) { c.run(DT); t += DT; again = c.loco.state.jumping && c.position.y < 0.02 && c.velocity.y > 1; }
    expect(again).toBe(true);
  });

  it('keeps its momentum in a running jump and steers a little in the air, more on the Moon', () => {
    const far = (p: GaitProfile) => {
      const w = walker(p);
      w.run(4, { moveZ: 1 });
      // Asked mid-stride, the jump waits for the boots to come down.
      const takeOff = () => {
        w.loco.update(DT, input({ moveZ: 1, jump: true }), flat, [], 999);
        for (let i = 0; i < 240 && !w.loco.state.jumping; i++) w.run(DT, { moveZ: 1 });
        expect(w.loco.state.jumping).toBe(true);
      };
      takeOff();
      const z0 = w.position.z;
      while (w.loco.state.jumping) w.run(DT, { moveZ: 1 });
      const length = w.position.z - z0;
      w.run(1, { moveZ: 1 });
      takeOff();
      let drift = 0;
      while (w.loco.state.jumping) { w.run(DT, { moveX: 1, moveZ: 1 }); drift = w.position.x; }
      return { length, drift };
    };
    const m = far(moon); const e = far(earth);
    expect(m.length).toBeGreaterThan(e.length * 1.6);
    expect(e.length).toBeLessThan(4);
    expect(m.drift).toBeGreaterThan(e.drift * 2);
  });

  it('lands soft from its own jump, rolls from a fair drop, stumbles from a bad one and falls from a terrible one', () => {
    const drop = (p: GaitProfile, h: number) => {
      const cliff = (_x: number, z: number) => (z > 1 ? -h : 0);
      const w = walker(p, cliff);
      w.run(0.5, { moveZ: 0.2 });
      let t = 0;
      while (t < 10 && !w.loco.state.landing) { w.run(DT, { moveZ: 0.2 }); t += DT; }
      return w.loco.state.landing;
    };
    const w = walker(moon);
    w.run(3, { moveZ: 1 });
    w.loco.update(DT, input({ moveZ: 1, jump: true }), flat, [], 999);
    let landing = '';
    while (!landing) { w.run(DT, { moveZ: 1 }); landing = w.loco.state.landing; }
    expect(landing).toBe('soft');
    expect(drop(mars, 0.8)).toBe('roll');
    expect(drop(mars, 3.5)).toBe('hard');
    expect(drop(mars, 12)).toBe('fall');
    expect(drop(proxima, 1.2)).toBe('hard');
    expect(drop(moon, 0.6)).toBe('soft');
  });
});

describe('the capsule against the world', () => {
  it('steps up a kerb, is stopped by a wall, follows a small drop and falls off a ledge', () => {
    const kerb = (_x: number, z: number) => (z > 1 ? STEP_UP - 0.05 : 0);
    const k = walker(moon, kerb);
    k.run(4, { moveZ: 0.2 });
    expect(k.position.z).toBeGreaterThan(1.2);
    expect(k.position.y).toBeCloseTo(STEP_UP - 0.05, 3);
    const wall = (_x: number, z: number) => (z > 1 ? 1.0 : 0);
    const b = walker(moon, wall);
    b.run(3, { moveZ: 0.2 });
    expect(b.position.z).toBeLessThan(1.01);
    expect(b.position.y).toBe(0);
    const down = (_x: number, z: number) => (z > 1 ? -(STEP_DOWN - 0.05) : 0);
    const d = walker(moon, down);
    let left = false;
    d.run(4, { moveZ: 0.2 }, () => { left ||= d.loco.state.airborne; });
    expect(left).toBe(false);
    expect(d.position.y).toBeCloseTo(-(STEP_DOWN - 0.05), 3);
    const ledge = (_x: number, z: number) => (z > 1 ? -2 : 0);
    const l = walker(moon, ledge);
    let fell = false;
    l.run(4, { moveZ: 0.2 }, () => { fell ||= l.loco.state.mode === 'fall'; });
    expect(fell).toBe(true);
    expect(l.position.y).toBeCloseTo(-2, 3);
  });

  it('slides along a footprint instead of sticking to it', () => {
    const post: Collider = { x: 0.3, z: 3, r: 0.5 };
    const w = walker(moon, flat, [post]);
    w.run(4, { moveZ: 1 });
    expect(w.position.z).toBeGreaterThan(5);
    expect(Math.abs(w.position.x)).toBeGreaterThan(0.3);
  });

  it('vaults a crate in its way, and not a wall', () => {
    const crate: Collider = { x: 0, z: 2.5, r: 0.7, h: 0.7 };
    const probe = vaultProbe({ x: 0, y: 0, z: 1.2 }, 0, 1, [crate], flat, 0.9);
    expect(probe).not.toBeNull();
    expect(probe!.toZ).toBeGreaterThan(crate.z + crate.r);
    expect(vaultProbe({ x: 0, y: 0, z: 1.2 }, 0, 1, [{ x: 0, z: 2.5, r: 0.7 }], flat, 0.9)).toBeNull();
    expect(vaultProbe({ x: 0, y: 0, z: 1.2 }, 0, 1, [{ ...crate, h: 1.4 }], flat, 0.9)).toBeNull();
    // Running into it is a vault; the crew comes out the far side on its feet.
    const w = walker(moon, flat, [crate]);
    let vaulted = false;
    w.run(4, { moveZ: 1 }, () => { vaulted ||= w.loco.state.mode === 'vault'; });
    expect(vaulted).toBe(true);
    expect(w.position.z).toBeGreaterThan(crate.z + crate.r);
    // On its feet, still loping (a stride's flight is not a fall).
    expect(w.loco.state.fallen).toBe(false);
    expect(w.loco.state.mode).not.toBe('fall');
  });

  it('stops at a roof', () => {
    const w = walker(gaitProfile(LUNAR_G, false));
    w.loco.ceilingAt = () => 3.2;
    const { apex } = hop(w);
    expect(apex).toBeLessThan(3.2 - 1.8);
  });
});

describe('Earth gravity, helmet off', () => {
  it('is an ordinary jog and run, and hops a fraction of the Moon', () => {
    const w = walker(earth);
    w.run(0.3, { moveZ: 1 });
    expect(w.loco.state.speed).toBeGreaterThan(1.5);
    w.run(2, { moveZ: 1 });
    expect(w.loco.state.speed).toBeGreaterThan(earth.jog * 0.9);
    const e = hop(walker(earth));
    const m = hop(walker(moon));
    expect(e.air).toBeLessThan(0.7);
    expect(m.air / e.air).toBeGreaterThan(2.2);
  });
});

describe('the jetpack in the air', () => {
  /** Jump, then hold the jet from the top of the arc for `seconds`. */
  const flight = (w: ReturnType<typeof walker>, seconds: number, over: Partial<WalkInput> = {}) => {
    w.loco.update(DT, input({ jump: true }), flat, [], 999);
    let apexVy = 9;
    while (w.velocity.y > 0 && w.velocity.y <= apexVy) { apexVy = w.velocity.y; w.run(DT); }
    let maxVy = -9; let maxY = 0;
    for (let t = 0; t < seconds; t += DT) {
      w.run(DT, { jet: true, ...over });
      maxVy = Math.max(maxVy, w.velocity.y);
      maxY = Math.max(maxY, w.position.y);
    }
    return { maxVy, maxY };
  };

  it('raises velocity.y and climbs to its speed on the Moon; a plain jump only falls from the apex', () => {
    const w = walker(moon);
    const { maxVy, maxY } = flight(w, 1.5);
    expect(w.loco.state.jetting).toBe(true);
    expect(w.loco.state.gait).toBe('air');
    expect(maxVy).toBeGreaterThan(2.5);
    expect(maxVy).toBeLessThan(JET.climb * 1.05);
    expect(maxY).toBeGreaterThan((moon.hop * moon.hop) / (2 * moon.g) + 2);
    const plain = walker(moon);
    const p = flight(plain, 1.5, { jet: false });
    expect(p.maxVy).toBeLessThanOrEqual(0.05);
    expect(plain.loco.state.jetting).toBe(false);
  });

  it('still lifts on Mars and Proxima b', () => {
    for (const p of [mars, proxima]) {
      const w = walker(p);
      const { maxVy } = flight(w, 1);
      expect(maxVy).toBeGreaterThan(1.2);
      expect(w.loco.state.jetting).toBe(true);
    }
  });

  it('gives nothing without fuel, and the tank comes back on the ground', () => {
    const w = walker(moon);
    w.loco.jet.state.fuel = 0;
    const { maxVy } = flight(w, 1);
    expect(maxVy).toBeLessThanOrEqual(0.05);
    expect(w.loco.state.jetting).toBe(false);
    let t = 0;
    while ((!w.loco.state.grounded || t < 0.2) && t < 10) { w.run(DT); t += DT; }
    expect(w.loco.state.grounded).toBe(true);
    w.run(JET.regenDelay + 1 / JET.regen + 0.2);
    expect(w.loco.state.jetFuel).toBe(1);
  });

  it('never lights on the ground, in a lope\'s stride, or while the jump key is merely tapped', () => {
    const w = walker(moon);
    w.run(1, { jet: true });
    expect(w.loco.state.jetting).toBe(false);
    expect(w.loco.state.jetFuel).toBe(1);
    // A jog's flights are short hops between steps: the held key stays quiet through them.
    let lit = false;
    w.run(4, { moveZ: 0.6, jet: true }, () => { lit ||= w.loco.state.jetting; });
    expect(lit).toBe(false);
    expect(w.loco.state.jetFuel).toBe(1);
    // One step of jump with the key let go the step after: a jump, no burn.
    const j = walker(moon);
    j.loco.update(DT, input({ jump: true, jet: true }), flat, [], 999);
    j.run(2);
    expect(j.loco.state.jetFuel).toBe(1);
  });

  it('burns from the throttle, eased, so the flame and the roar never snap', () => {
    const w = walker(moon);
    w.loco.update(DT, input({ jump: true }), flat, [], 999);
    w.run(0.3, { jet: true });
    expect(w.loco.state.jetK).toBeGreaterThan(0.5);
    expect(w.loco.state.jetK).toBeLessThan(1);
    w.run(DT, { jet: false });
    expect(w.loco.state.jetting).toBe(false);
    expect(w.loco.state.jetK).toBeGreaterThan(0.3);
  });
});

describe('the suit on the mesh', () => {
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}) });
  const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };

  it('puts the boot soles on the planted feet: no skating', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    for (const [g, suited, moveZ] of [[LUNAR_G, true, 1], [EARTH_G, false, 0.3]] as const) {
      const c = makeCosmonaut(dust, true, g, suited);
      c.settle();
      const sole = new THREE.Vector3();
      let worst = 0; let n = 0;
      for (let i = 0; i < 900; i++) {
        c.update(DT, input({ moveZ }), flat, [], 999);
        c.present(1);
        c.group.updateMatrixWorld(true);
        if (i < 300) continue;
        c.feet.forEach((f, k) => {
          if (!f.planted) return;
          c.ankles[k].localToWorld(sole.set(0, -0.12, 0));
          worst = Math.max(worst, Math.hypot(sole.x - f.x, sole.y - f.y, sole.z - f.z));
          n += 1;
        });
      }
      expect(n).toBeGreaterThan(100);
      expect(worst).toBeLessThan(0.03);
      c.dispose();
    }
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('carries the jet to the suit: the state, the flame and the sparks', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    const scene = new THREE.Scene();
    const c = makeCosmonaut(dust, true);
    scene.add(c.group);
    c.settle();
    c.update(DT, input({ jump: true }), flat, [], 999);
    for (let i = 0; i < 60; i++) { c.update(DT, input({ jet: true }), flat, [], 999); c.present(1); }
    expect(c.state.jetting).toBe(true);
    expect(c.state.anim).toBe('jet');
    expect(c.state.jetFuel).toBeLessThan(1);
    expect(c.state.jetK).toBeGreaterThan(0.5);
    // The sparks ride under the suit's group but stay in world space: their
    // world matrix is identity when they draw, whatever the suit has done.
    const sparks = c.group.children.find((o) => o.name === 'jet-sparks') as THREE.Points;
    expect(sparks).toBeDefined();
    c.group.position.set(3, 1, -2);
    c.group.updateMatrixWorld(true);
    sparks.onBeforeRender(null as never, scene, null as never, sparks.geometry, sparks.material as THREE.Material, null as never);
    expect(sparks.matrixWorld.equals(new THREE.Matrix4())).toBe(true);
    const flame = c.group.getObjectByName('nozzle')!.children.find((o) => o.children.length > 0)!;
    expect(flame.scale.y).toBeGreaterThan(0.3);
    // Down again: the landing after a flight kicks up a bigger cloud than a step.
    (dust.burst as ReturnType<typeof vi.fn>).mockClear();
    let t = 0;
    while (!c.state.grounded && t < 10) { c.update(DT, input(), flat, [], 999); t += DT; }
    expect(dust.burst).toHaveBeenCalled();
    const counts = (dust.burst as ReturnType<typeof vi.fn>).mock.calls.map((a) => (a[0] as { count: number }).count);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(34);
    expect(c.state.jetting).toBe(false);
    c.dispose();
    expect(c.group.children.find((o) => o.name === 'jet-sparks')).toBeUndefined();
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('has no jet without a pack (a world with air)', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    const c = makeCosmonaut(dust, true, EARTH_G, false, true);
    c.settle();
    c.update(DT, input({ jump: true }), flat, [], 999);
    for (let i = 0; i < 40; i++) c.update(DT, input({ jet: true }), flat, [], 999);
    expect(c.state.jetting).toBe(false);
    expect(c.state.jetFuel).toBe(1);
    c.dispose();
    HTMLCanvasElement.prototype.getContext = getContext;
  });

  it('switches gravity both ways', async () => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
    const { makeCosmonaut } = await import('@/lib/solar-system/moon-cosmonaut');
    const c = makeCosmonaut(dust, true);
    expect(c.state.gravity).toBeCloseTo(LUNAR_G);
    c.setGravity(EARTH_G, false);
    expect(c.state.gravity).toBeCloseTo(EARTH_G);
    expect(c.profile.suited).toBe(false);
    c.setGravity(LUNAR_G, true);
    expect(c.profile.worldG).toBeCloseTo(LUNAR_G);
    expect(c.state.gravity).toBeCloseTo(LUNAR_G);
    c.dispose();
    HTMLCanvasElement.prototype.getContext = getContext;
  });
});
