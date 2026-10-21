// The jetpack's tank and thrust, held to what they claim: it lights only in
// the air and only after the first tenth of a second, wants a little fuel to
// ignite but burns to empty once lit, refills on the ground after a pause,
// and pushes hard enough on every world to climb — easing toward its climb
// speed rather than running away.

import { describe, expect, it } from 'vitest';
import { feltGravity, gaitProfile, LUNAR_G } from '@/lib/solar-system/gait-profile';
import { JET, jetThrust, makeJetpack } from '@/lib/solar-system/suit-jetpack';
import { MARS, PROXIMA_B } from '@/lib/solar-system/world-profiles';

const DT = 1 / 120;
const g = feltGravity(LUNAR_G);
/** Run the pack for `seconds`, held or not, in the air or on the ground; returns the last acceleration. */
function run(jet: ReturnType<typeof makeJetpack>, seconds: number, want: boolean, grounded: boolean, vy = 0) {
  let a = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) a = jet.update(DT, want, grounded, g, vy);
  return a;
}

describe('the jetpack tank', () => {
  it('burns at its rate while lit, and not at all on the ground or unheld', () => {
    const jet = makeJetpack();
    // Half a second in the air unheld: nothing burned, and the pack is armed.
    run(jet, 0.5, false, false);
    expect(jet.state.fuel).toBe(1);
    run(jet, 1, true, false);
    expect(jet.state.fuel).toBeCloseTo(1 - JET.burn, 2);
    expect(jet.state.jetting).toBe(true);
    // Held on the ground it does nothing.
    const f = jet.state.fuel;
    run(jet, 0.3, true, true);
    expect(jet.state.jetting).toBe(false);
    expect(jet.state.fuel).toBeGreaterThanOrEqual(f);
  });

  it('waits a tenth of a second in the air before it lights: a tap of jump is a jump', () => {
    const jet = makeJetpack();
    const a0 = jet.update(DT, true, false, g, 2);
    expect(a0).toBe(0);
    run(jet, JET.arm * 0.8, true, false);
    expect(jet.state.jetting).toBe(false);
    run(jet, JET.arm * 0.5, true, false);
    expect(jet.state.jetting).toBe(true);
  });

  it('clicks once as it lights, then burns to empty and goes out', () => {
    const jet = makeJetpack();
    let ignitions = 0;
    for (let t = 0; t < 6; t += DT) { jet.update(DT, true, false, g, 0); if (jet.state.ignited) ignitions += 1; }
    expect(ignitions).toBe(1);
    expect(jet.state.fuel).toBe(0);
    expect(jet.state.jetting).toBe(false);
    expect(jet.state.throttle).toBeLessThan(0.02);
  });

  it('needs a little in the tank to ignite, but keeps burning below that once lit', () => {
    const jet = makeJetpack();
    jet.state.fuel = JET.ignite * 0.9;
    run(jet, 0.5, true, false);
    expect(jet.state.jetting).toBe(false);
    expect(jet.state.fuel).toBeCloseTo(JET.ignite * 0.9, 6);
    jet.reset();
    jet.state.fuel = JET.ignite * 1.1;
    run(jet, JET.arm + DT * 2, true, false);
    expect(jet.state.jetting).toBe(true);
    run(jet, 0.1, true, false);
    expect(jet.state.fuel).toBeLessThan(JET.ignite);
    expect(jet.state.jetting).toBe(true);
  });

  it('refills on the ground only after the pause, then at its rate', () => {
    const jet = makeJetpack();
    run(jet, 3, true, false);
    const spent = jet.state.fuel;
    expect(spent).toBeLessThan(0.3);
    run(jet, JET.regenDelay * 0.9, false, true);
    expect(jet.state.fuel).toBeCloseTo(spent, 6);
    run(jet, 1, false, true);
    expect(jet.state.fuel).toBeCloseTo(spent + JET.regen * (1 - JET.regenDelay * 0.1), 1);
    run(jet, 3, false, true);
    expect(jet.state.fuel).toBe(1);
    // Off the ground again the pause starts over.
    run(jet, 1, true, false);
    run(jet, JET.regenDelay * 0.5, false, true);
    run(jet, DT, false, false);
    run(jet, JET.regenDelay * 0.7, false, true);
    expect(jet.state.fuel).toBeLessThan(1 - JET.burn * 0.8);
  });

  it('remembers a flight until the boots are down, for the landing dust', () => {
    const jet = makeJetpack();
    run(jet, 0.5, true, false);
    expect(jet.state.flown).toBe(true);
    run(jet, 0.5, false, false);
    expect(jet.state.flown).toBe(true);
    run(jet, DT, false, true);
    expect(jet.state.flown).toBe(false);
  });

  it('never lights without a pack', () => {
    const jet = makeJetpack();
    jet.enabled = false;
    run(jet, 1, true, false);
    expect(jet.state.jetting).toBe(false);
    expect(jet.state.fuel).toBe(1);
  });
});

describe('the jetpack thrust', () => {
  it('lifts on every world, hardest against the heaviest', () => {
    for (const gv of [LUNAR_G, MARS.gravity, PROXIMA_B.gravity]) {
      const felt = gaitProfile(gv, true).g;
      expect(jetThrust(felt)).toBeGreaterThan(felt * 1.5);
    }
    expect(jetThrust(gaitProfile(PROXIMA_B.gravity, true).g)).toBeGreaterThan(jetThrust(gaitProfile(LUNAR_G, true).g));
  });

  it('pushes at full thrust when falling, and only holds the fall off once at the climb speed', () => {
    const jet = makeJetpack();
    run(jet, JET.arm + DT, true, false);
    expect(jet.update(DT, true, false, g, -3)).toBeCloseTo(jetThrust(g), 5);
    expect(jet.update(DT, true, false, g, JET.climb)).toBeCloseTo(g, 5);
    expect(jet.update(DT, true, false, g, JET.climb * 2)).toBeCloseTo(g, 5);
    const half = jet.update(DT, true, false, g, JET.climb / 2);
    expect(half).toBeGreaterThan(g);
    expect(half).toBeLessThan(jetThrust(g));
  });
});
