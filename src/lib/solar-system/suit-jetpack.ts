// The jetpack, as numbers: a tank, a burn, a refill and a thrust. Nothing
// here knows about meshes, flames or keys; suit-locomotion asks it once a
// step what push to add to the body, and the suit's animation, sound and
// glass read its state. It is pure so the fuel rules can be tested on their
// own, the way the gait profile is.
//
// The rules a player feels: the pack only lights in the air, and not on the
// first tenth of a second of a jump, so a tap of the jump key is still just a
// jump; it needs a little in the tank to ignite but burns to empty once lit,
// so a low tank gives a last short push rather than nothing; it refills on
// the ground after a moment's pause, so a landing followed at once by another
// jump starts near empty. The thrust is worked from the gravity the crew
// moves under so the climb feels alike on every world: a strong net lift at
// first, easing off as the body reaches its climb speed rather than running
// away upward.

export const JET = {
  /** Tank burned a second while lit, 0…1. */
  burn: 0.28,
  /** Tank refilled a second on the ground, 0…1, once the pause is over. */
  regen: 0.35,
  /** How long after touching down the refill waits, s. */
  regenDelay: 0.6,
  /** The least in the tank that will ignite. */
  ignite: 0.08,
  /** Airborne this long before the pack will light: a tap of jump is a jump. */
  arm: 0.1,
  /** The climb speed the thrust eases toward, m/s. */
  climb: 3.5,
} as const;

/** Upward acceleration the pack can give under gravity `g` (the felt one), m/s². */
export function jetThrust(g: number): number {
  return g * 1.9 + 2;
}

export interface JetState {
  /** 0…1 in the tank. */
  fuel: number;
  /** Lit this step. */
  jetting: boolean;
  /** Eased 0…1: what the flame, the roar and the light follow. */
  throttle: number;
  /** Lit this step and not the last: the ignition click. */
  ignited: boolean;
  /** The pack has been lit since the boots last left the ground: this landing comes off a flight. */
  flown: boolean;
  /** Seconds on the ground, and seconds in the air. */
  groundT: number;
  airT: number;
}

export interface Jetpack {
  state: JetState;
  /** No pack on this suit: it never lights and the tank reads full. */
  enabled: boolean;
  /**
   * One step. `want` is the key held; `grounded` whether the boots were on
   * the ground at the start of the step; `vy` the body's vertical speed.
   * Returns the upward acceleration to apply this step, m/s², or 0.
   */
  update: (dt: number, want: boolean, grounded: boolean, g: number, vy: number) => number;
  reset: () => void;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function makeJetpack(): Jetpack {
  const state: JetState = { fuel: 1, jetting: false, throttle: 0, ignited: false, flown: false, groundT: 9, airT: 0 };
  const jet: Jetpack = {
    state,
    enabled: true,
    update(dt, want, grounded, g, vy) {
      const was = state.jetting;
      state.ignited = false;
      if (grounded) {
        state.groundT += dt;
        state.airT = 0;
        state.flown = false;
        if (state.groundT >= JET.regenDelay) state.fuel = Math.min(1, state.fuel + JET.regen * dt);
      } else {
        state.groundT = 0;
        state.airT += dt;
      }
      // Lit while there is anything left; a cold pack wants a little more than that.
      const enough = was ? state.fuel > 0 : state.fuel >= JET.ignite;
      const lit = jet.enabled && want && !grounded && state.airT >= JET.arm && enough;
      state.jetting = lit;
      state.ignited = lit && !was;
      if (lit) state.flown = true;
      let accel = 0;
      if (lit) {
        // Burn what this step can, and push for the fraction it could.
        const burn = JET.burn * dt;
        const k = burn > 0 ? Math.min(1, state.fuel / burn) : 1;
        state.fuel = Math.max(0, state.fuel - burn);
        const full = jetThrust(g);
        // Net lift fades as the body nears the climb speed; past it the pack only holds the fall off.
        const ease = clamp((JET.climb - vy) / JET.climb, 0, 1);
        accel = (g + (full - g) * ease) * k;
      }
      state.throttle += ((lit ? 1 : 0) - state.throttle) * (1 - Math.exp(-dt * (lit ? 14 : 8)));
      if (state.throttle < 1e-3) state.throttle = 0;
      return accel;
    },
    reset() {
      state.fuel = 1; state.jetting = false; state.throttle = 0; state.ignited = false; state.flown = false; state.groundT = 9; state.airT = 0;
    },
  };
  return jet;
}
