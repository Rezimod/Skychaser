// The jetpack, held to what it claims: the tank never runs dry; it lights
// only once the key has been held a fifth of a second, so a tap is a jump;
// in flight the key climbs, the descend key sinks and neither hovers; every
// world can be flown and Jupiter feels heavier than the Moon; the ceiling
// and the edge of the envelope turn the crew back rather than stopping them
// dead; off the ground they may land on — and over a giant's sea of cloud —
// the pack will not let them sink, and left alone it brings them home.

import { describe, expect, it } from 'vitest';
import { feltGravity, gaitProfile, LUNAR_G } from '@/lib/solar-system/gait-profile';
import {
  confineToDeck, deckCameraFloor, flightEnvelope, flightTuning, JET, jetThrust, makeJetpack, OPEN_SKY,
  type FlightBody, type FlightControl, type FlightEnvelope,
} from '@/lib/solar-system/suit-jetpack';
import { makeLocomotion, type WalkInput } from '@/lib/solar-system/suit-locomotion';
import { WORLDS, type WorldId } from '@/lib/solar-system/world-profiles';
import { TERRAIN_WALK_RADIUS } from '@/lib/solar-system/moon-terrain';

const DT = 1 / 120;
const SUITED: WorldId[] = (Object.keys(WORLDS) as WorldId[]).filter((id) => !WORLDS[id].breathable);
const feltOf = (id: WorldId) => feltGravity(WORLDS[id].gravity);
const envOf = (id: WorldId) => flightEnvelope(WORLDS[id].walkRadius, feltOf(id), WORLDS[id].deck ?? null);

const ctl = (over: Partial<FlightControl> = {}): FlightControl => ({ moveX: 0, moveZ: 0, climb: false, descend: false, boost: false, ...over });

/** The pack alone over flat ground at `groundY`, integrated the way the locomotion does. */
function flyer(g: number, env: FlightEnvelope = OPEN_SKY, groundAt: (x: number, z: number) => number = () => 0, start: Partial<FlightBody> = {}) {
  const jet = makeJetpack(g);
  const b: FlightBody = { x: 0, y: 5, z: 0, vx: 0, vy: 0, vz: 0, ...start };
  const push = { x: 0, y: 0, z: 0 };
  let maxDecelH = 0;
  const run = (seconds: number, c: FlightControl, each?: () => void) => {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      jet.fly(DT, c, b, groundAt(b.x, b.z), env, push);
      const h0 = Math.hypot(b.vx, b.vz);
      b.vx += push.x * DT; b.vz += push.z * DT; b.vy += (push.y - g) * DT;
      maxDecelH = Math.max(maxDecelH, (h0 - Math.hypot(b.vx, b.vz)) / DT);
      b.x += b.vx * DT; b.y += b.vy * DT; b.z += b.vz * DT;
      confineToDeck(b, { x: b.vx, z: b.vz }, env);
      const gy = groundAt(b.x, b.z);
      if (b.y < gy) { b.y = gy; b.vy = Math.max(0, b.vy); }
      each?.();
    }
  };
  return { jet, b, run, maxDecel: () => maxDecelH };
}

describe('the jetpack never runs dry', () => {
  it('flies for two minutes on end, climbing, hovering and cruising, and the tank reads full', () => {
    const f = flyer(feltGravity(LUNAR_G));
    f.run(40, ctl({ climb: true }));
    f.run(40, ctl());
    f.run(40, ctl({ moveZ: 1, boost: true }));
    expect(f.jet.state.fuel).toBe(1);
    expect(f.jet.state.flying).toBe(true);
    // Still lifting at the end, as hard as at the start.
    const y = f.b.y;
    f.run(2, ctl({ climb: true }));
    expect(f.b.y).toBeGreaterThan(y + 5);
  });
});

describe('lighting the pack', () => {
  it('waits for the key to be held a fifth of a second: a tap of jump is a jump', () => {
    const jet = makeJetpack(3);
    let lit = false;
    for (let t = 0; t < JET.arm * 0.8; t += DT) lit ||= jet.hold(DT, true, false);
    expect(lit).toBe(false);
    // Let go and pressed again: the wait starts over.
    jet.hold(DT, false, false);
    for (let t = 0; t < JET.arm * 0.8; t += DT) lit ||= jet.hold(DT, true, false);
    expect(lit).toBe(false);
    let ignitions = 0; let clicked = false;
    for (let t = 0; t < 1; t += DT) if (jet.hold(DT, true, false)) { ignitions += 1; clicked = jet.state.ignited; }
    expect(ignitions).toBe(1);
    expect(clicked).toBe(true);
    expect(jet.state.flying).toBe(true);
  });

  it('never lights without a pack', () => {
    const jet = makeJetpack(3);
    jet.enabled = false;
    let lit = false;
    for (let t = 0; t < 2; t += DT) lit ||= jet.hold(DT, true, true);
    expect(lit).toBe(false);
    expect(jet.state.flying).toBe(false);
    expect(jet.state.fuel).toBe(1);
  });
});

describe('flight on every world', () => {
  it('climbs on the key, holds a hover without it, and sinks on descend — everywhere a suit is worn', () => {
    for (const id of SUITED) {
      const g = feltOf(id);
      const T = flightTuning(g);
      const f = flyer(g, OPEN_SKY, () => 0, { y: 20 });
      f.run(3, ctl({ climb: true }));
      expect(f.b.vy, id).toBeGreaterThan(T.climb * 0.9);
      expect(f.b.vy, id).toBeLessThan(T.climb * 1.05);
      // Let go: the climb stops within a few metres, then the hover holds.
      const at = f.b.y;
      f.run(3, ctl());
      expect(f.b.y - at, id).toBeLessThan(6);
      const held = f.b.y;
      f.run(4, ctl());
      expect(Math.abs(f.b.y - held), id).toBeLessThan(0.2);
      expect(Math.abs(f.b.vy), id).toBeLessThan(0.05);
      f.run(2, ctl({ descend: true }));
      expect(f.b.vy, id).toBeLessThan(-T.descend * 0.8);
      expect(f.b.y, id).toBeLessThan(held - 5);
    }
  });

  it('flies forward at its cruise, nearly twice that on boost, and comes to a stop on letting go', () => {
    for (const id of SUITED) {
      const g = feltOf(id);
      const T = flightTuning(g);
      const f = flyer(g, OPEN_SKY);
      f.run(5, ctl({ moveZ: 1 }));
      expect(f.b.vz, id).toBeGreaterThan(T.cruise * 0.95);
      f.run(5, ctl({ moveZ: 1, boost: true }));
      expect(f.b.vz, id).toBeGreaterThan(T.boost * 0.95);
      expect(T.boost / T.cruise).toBeCloseTo(1.8, 6);
      f.run(5, ctl());
      expect(Math.hypot(f.b.vx, f.b.vz), id).toBeLessThan(0.2);
      // It brakes no harder than the pack can push.
      expect(f.maxDecel(), id).toBeLessThanOrEqual(T.accel + 1e-6);
    }
  });

  it('feels heavier on Jupiter than on the Moon, but always flies', () => {
    const moon = flightTuning(feltGravity(LUNAR_G));
    const jupiter = flightTuning(feltOf('jupiter'));
    expect(jupiter.climb).toBeLessThan(moon.climb);
    expect(jupiter.cruise).toBeLessThan(moon.cruise);
    expect(jupiter.accel).toBeLessThan(moon.accel);
    expect(jupiter.lift).toBeLessThan(moon.lift);
    expect(jupiter.lift).toBeGreaterThan(4);
    expect(jetThrust(jupiter.g)).toBeGreaterThan(jupiter.g * 1.15);
    // Hanging there costs Jupiter most of what the pack has; the Moon barely opens the valve.
    const hover = (g: number) => { const f = flyer(g, OPEN_SKY, () => 0, { y: 30 }); f.run(3, ctl()); return f.jet.state.thrust; };
    expect(hover(jupiter.g)).toBeGreaterThan(0.7);
    expect(hover(moon.g)).toBeLessThan(0.3);
  });

  it('settles softly onto ground it may land on: a hover low down sinks, and the last metres ease off', () => {
    for (const id of SUITED) {
      const g = feltOf(id);
      const P = gaitProfile(WORLDS[id].gravity, true);
      const f = flyer(g, OPEN_SKY, () => 0, { y: 30 });
      let touch = -1;
      f.run(20, ctl({ descend: true }), () => { if (touch < 0 && f.b.y <= 1e-6) touch = -f.b.vy; });
      // The integrator here zeroes the fall on contact: the speed the step before tells the impact.
      const g2 = flyer(g, OPEN_SKY, () => 0, { y: 30 });
      let lastVy = 0;
      g2.run(20, ctl({ descend: true }), () => { if (g2.b.y > 1e-6) lastVy = g2.b.vy; });
      expect(-lastVy, id).toBeLessThan(P.softLand);
      expect(-lastVy, id).toBeLessThan(2.2);
      // Let go a metre up: down it comes, gently.
      const s = flyer(g, OPEN_SKY, () => 0, { y: 0.8 });
      s.run(3, ctl());
      expect(s.b.y, id).toBeLessThan(0.01);
    }
  });
});

describe('the envelope', () => {
  it('gives every world a ceiling between 150 and 300 m, lower the heavier it is, and lets the crew fly past the fence', () => {
    const ceilings: Record<string, number> = {};
    for (const id of SUITED) {
      const env = envOf(id);
      ceilings[id] = env.ceiling;
      expect(env.ceiling, id).toBeGreaterThanOrEqual(150);
      expect(env.ceiling, id).toBeLessThanOrEqual(300);
      const fence = WORLDS[id].walkRadius;
      expect(env.landRadius, id).toBeLessThan(fence);
      expect(env.radius / fence, id).toBeGreaterThanOrEqual(1.5);
      expect(env.radius / fence, id).toBeLessThanOrEqual(2);
      expect(!!env.deck, id).toBe(!!WORLDS[id].deck);
    }
    expect(ceilings.mars).toBeLessThan(flightEnvelope(TERRAIN_WALK_RADIUS, feltGravity(LUNAR_G)).ceiling);
    expect(ceilings.proximaB).toBeLessThan(ceilings.mars);
  });

  it('turns a climb back under the ceiling rather than stopping it at a wall', () => {
    for (const id of ['mars', 'jupiter'] as WorldId[]) {
      const g = feltOf(id);
      const env = envOf(id);
      const f = flyer(g, env, () => 0, { y: env.ceiling - 60 });
      let top = -Infinity; let jerk = 0; let lastVy = 0;
      f.run(60, ctl({ climb: true }), () => { top = Math.max(top, f.b.y); jerk = Math.max(jerk, Math.abs(f.b.vy - lastVy) / DT); lastVy = f.b.vy; });
      expect(top, id).toBeLessThanOrEqual(env.ceiling + 0.5);
      expect(f.b.y, id).toBeGreaterThan(env.ceiling - 3);
      // No wall: the climb never changes faster than the pack can change it.
      expect(jerk, id).toBeLessThan(jetThrust(g) + 1);
    }
  });

  it('turns the crew back at the edge of the envelope, and brings them home when they stop', () => {
    for (const id of ['moon', 'venus', 'saturn'] as const) {
      const g = id === 'moon' ? feltGravity(LUNAR_G) : feltOf(id);
      const env = id === 'moon' ? flightEnvelope(TERRAIN_WALK_RADIUS, g) : envOf(id);
      const f = flyer(g, env, () => 0, { y: 20 });
      let far = 0;
      f.run(60, ctl({ moveX: 1, boost: true }), () => { far = Math.max(far, Math.hypot(f.b.x, f.b.z)); });
      expect(far, id).toBeGreaterThan(env.landRadius);
      expect(far, id).toBeLessThan(env.radius + 6);
      expect(Math.hypot(f.b.x, f.b.z), id).toBeLessThanOrEqual(env.radius + 0.5);
      // Let go out there: the suit flies them back over ground they may land on.
      f.run(120, ctl());
      expect(Math.hypot(f.b.x, f.b.z), id).toBeLessThan(env.landRadius);
    }
  });

  it('will not set the crew down off the ground they may land on: it holds them a few metres up', () => {
    const g = feltOf('mars');
    const env = envOf('mars');
    const f = flyer(g, env, () => 0, { x: env.landRadius + 20, y: 30 });
    let low = Infinity;
    f.run(8, ctl({ descend: true, moveX: 0.01 }), () => { low = Math.min(low, f.b.y); });
    expect(low).toBeGreaterThan(JET.hover - 0.5);
  });

  it('over a giant, never sinks into the clouds, and drifts back up and over the deck when left alone', () => {
    for (const id of ['jupiter', 'neptune'] as WorldId[]) {
      const g = feltOf(id);
      const env = envOf(id);
      const deck = WORLDS[id].deck!;
      const sea = -deck.seaDepth;
      const groundAt = (x: number, z: number) => (x * x + z * z <= deck.radius * deck.radius ? 0 : sea);
      const f = flyer(g, env, groundAt, { y: 5 });
      // Off the rail and down as far as the pack will go.
      f.run(10, ctl({ moveX: 1 }));
      expect(f.b.x, id).toBeGreaterThan(deck.radius + 10);
      let low = Infinity;
      f.run(20, ctl({ descend: true, moveX: 0.02 }), () => { low = Math.min(low, f.b.y); });
      expect(low, id).toBeGreaterThan(sea + JET.seaClear - 1);
      expect(low, id).toBeLessThan(-30);
      // Let go: up past the rim and back over the deck, never through it.
      let inside = false;
      f.run(90, ctl(), () => {
        const r = Math.hypot(f.b.x, f.b.z);
        if (r < deck.radius) { expect(f.b.y, id).toBeGreaterThanOrEqual(-0.2); inside = true; }
      });
      expect(inside, id).toBe(true);
      expect(Math.hypot(f.b.x, f.b.z), id).toBeLessThan(env.landRadius);
    }
  });

  it('holds someone below a deck outside its rim', () => {
    const env = envOf('uranus');
    const p = { x: 10, y: -5, z: 0 }; const v = { x: -3, z: 1 };
    expect(confineToDeck(p, v, env)).toBe(true);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(env.deck!.radius + 0.55, 6);
    expect(v.x).toBe(0);
    expect(v.z).toBe(1);
    const q = { x: 10, y: 1, z: 0 };
    expect(confineToDeck(q, { x: 0, z: 0 }, env)).toBe(false);
    expect(q.x).toBe(10);
  });

  it('keeps the chase camera over the deck from above, and out of its column from below', () => {
    const deck = WORLDS.saturn.deck!;
    let crewY = 0;
    const floor = deckCameraFloor(deck, deck.radius + 30, () => crewY);
    expect(floor(0, 0)).toBe(0);
    expect(floor(deck.radius + 10, 0)).toBe(0);
    expect(floor(deck.radius + 40, 0)).toBeLessThan(-deck.seaDepth + 2);
    crewY = -30;
    expect(floor(0, 0)).toBe(0);
    expect(floor(deck.radius + 10, 0)).toBeLessThan(-deck.seaDepth + 2);
  });
});

describe('flight through the locomotion', () => {
  const flat = () => 0;
  const input = (over: Partial<WalkInput> = {}): WalkInput => ({ moveX: 0, moveZ: 0, jump: false, run: false, crouch: false, work: false, ...over });
  const crew = (worldG: number, env: FlightEnvelope, walkRadius = 999) => {
    const position = { x: 0, y: 0, z: 0 }; const velocity = { x: 0, y: 0, z: 0 };
    const loco = makeLocomotion(position, velocity, gaitProfile(worldG, true));
    loco.envelope = env;
    loco.settleFeet();
    const run = (seconds: number, over: Partial<WalkInput> = {}, each?: () => void) => {
      for (let i = 0; i < Math.round(seconds / DT); i++) { loco.update(DT, input(over), flat, [], walkRadius); each?.(); }
    };
    return { loco, position, velocity, run };
  };

  it('a tap of jump is a jump; holding it takes off, and the flight is held until the boots are set down', () => {
    const c = crew(LUNAR_G, OPEN_SKY);
    c.loco.update(DT, input({ jump: true, jet: true }), flat, [], 999);
    c.run(JET.arm * 0.5, { jet: true });
    c.run(4);
    expect(c.loco.state.flying).toBe(false);
    expect(c.loco.state.grounded).toBe(true);
    // Hold it.
    c.loco.update(DT, input({ jump: true, jet: true }), flat, [], 999);
    c.run(1.5, { jet: true });
    expect(c.loco.state.flying).toBe(true);
    expect(c.loco.state.mode).toBe('fly');
    expect(c.loco.state.gait).toBe('air');
    const y = c.position.y;
    expect(y).toBeGreaterThan(3);
    c.run(3);
    expect(c.loco.state.flying).toBe(true);
    expect(Math.abs(c.position.y - y)).toBeLessThan(6);
    // Down, and set down softly.
    let landing = '';
    c.run(10, { descend: true }, () => { if (c.loco.state.landing) landing = c.loco.state.landing; });
    expect(c.loco.state.flying).toBe(false);
    expect(c.loco.state.grounded).toBe(true);
    expect(landing).toBe('soft');
    expect(c.loco.state.jetFuel).toBe(1);
  });

  it('lifts off from standing on the jet key alone', () => {
    const c = crew(WORLDS.jupiter.gravity, OPEN_SKY);
    c.run(1.5, { jet: true });
    expect(c.loco.state.flying).toBe(true);
    expect(c.position.y).toBeGreaterThan(1.5);
    expect(c.loco.state.jetK).toBeGreaterThan(0.6);
  });

  it('leans into the travel and banks into a turn', () => {
    const c = crew(LUNAR_G, OPEN_SKY);
    c.run(1, { jet: true });
    c.run(3, { moveZ: 1, sprint: true });
    expect(c.loco.state.flyPitch).toBeGreaterThan(0.5);
    expect(c.loco.state.flySpeed).toBeGreaterThan(0.9);
    let bank = 0;
    c.run(1, { moveX: 1 }, () => { bank = Math.max(bank, Math.abs(c.loco.state.flyBank)); });
    expect(bank).toBeGreaterThan(0.15);
  });

  it('flies past the walk fence but sets down only inside it, and walks back in without a jump', () => {
    const env = flightEnvelope(40, feltGravity(LUNAR_G));
    const c = crew(LUNAR_G, env, 40);
    c.run(1, { jet: true });
    c.run(6, { moveX: 1 });
    expect(Math.hypot(c.position.x, c.position.z)).toBeGreaterThan(41);
    // Down out there: the pack holds them up and, idle, brings them back in, where they may set down.
    c.run(30, { descend: true });
    expect(c.loco.state.flying).toBe(true);
    expect(c.position.y).toBeGreaterThan(JET.hover - 0.5);
    c.run(40);
    expect(Math.hypot(c.position.x, c.position.z)).toBeLessThan(env.landRadius);
    c.run(10, { descend: true });
    expect(c.loco.state.flying).toBe(false);
    expect(Math.hypot(c.position.x, c.position.z)).toBeLessThanOrEqual(40);
    let last = c.position.x;
    let worst = 0;
    c.run(3, { moveX: -1 }, () => { worst = Math.max(worst, Math.abs(c.position.x - last)); last = c.position.x; });
    expect(worst).toBeLessThan(0.1);
  });

  it('passes over a wall when high enough, and slides along it low down', () => {
    const position = { x: 0, y: 0, z: 0 }; const velocity = { x: 0, y: 0, z: 0 };
    const loco = makeLocomotion(position, velocity, gaitProfile(LUNAR_G, true));
    loco.settleFeet();
    const wall = [{ x: 0, z: 12, r: 3, top: 6 }];
    for (let i = 0; i < 240; i++) loco.update(DT, input({ jet: true }), flat, wall, 999);
    expect(position.y).toBeGreaterThan(7);
    for (let i = 0; i < 360; i++) loco.update(DT, input({ moveZ: 1 }), flat, wall, 999);
    expect(position.z).toBeGreaterThan(16);
  });
});
