// The jetpack, as numbers: when it lights, what it pushes, and where it will
// let the crew go. Nothing here knows about meshes, flames or keys; the
// locomotion asks it once a step for the push to add to the body, and the
// suit's animation, sound and glass read its state. It is pure so the rules
// of flight can be tested on their own, the way the gait profile is.
//
// The rules a player feels. The tank never runs dry: the pack is a mode of
// moving, not a resource. It lights once the jump key (or its own key) has
// been held for a fifth of a second, so a tap of jump is still just a jump;
// lit with the boots on the ground it lifts off. From then on the crew
// flies: the key held climbs, the descend key sinks, neither hovers, and
// the stick flies them about at a cruise that Shift (or the stick at its
// rim) nearly doubles. Low over ground they may land on, a hover settles
// and the last metres of a descent ease off, so a touchdown is always soft.
//
// Every number comes from the gravity the crew moves under: a light world
// climbs and turns quickly with a small flame, Jupiter is slow to answer and
// burns hard just to hang there, and every world can be flown.
//
// Where they may go is the envelope: a ceiling, a horizontal radius whose
// edge turns them back rather than stopping them, and the ground they may
// set down on. Off that ground the pack will not let them lower than a few
// metres above it, and left alone there it carries them gently back. Over a
// giant the "ground" past the outpost's deck is a sea of cloud: the floor
// there is a few metres above its tops, and the deck's own rim is a wall to
// anyone below its top.

export const JET = {
  /** The key held this long before the pack lights, s: a tap of jump is a jump. */
  arm: 0.2,
  /** Lit with the boots down, the pack lifts the crew off at this, m/s. */
  liftOff: 2.2,
  /** Hovering lower than this over landable ground settles to it, m, at this speed, m/s. */
  settle: 1.1,
  settleSpeed: 1.3,
  /** A descent over landable ground is never faster than flare + altitude × flareRate, m/s. */
  flare: 0.9,
  flareRate: 1.1,
  /** How quickly the pack closes on the velocity it wants, s: vertical, horizontal. */
  tauV: 0.3,
  tauH: 0.45,
  /** Idle off landable ground, the suit brings the crew back at this, m/s. */
  drift: 2.5,
  /** Off landable ground the pack holds the crew this high over it, m. */
  hover: 3,
  /** Over a giant, the floor off the deck is this far above the cloud tops, m. */
  seaClear: 6,
  /** Under the ceiling the climb fades over this many metres. */
  ceilingBand: 20,
  /** In flight a footprint with no top of its own is a wall this high, m. */
  wallTop: 12,
  /** The landable radius sits this far inside the walk fence, m. */
  landInset: 0.5,
} as const;

/** How the pack flies under one gravity. */
export interface FlightTuning {
  /** The gravity the crew moves under (felt), m/s². */
  g: number;
  /** Net upward acceleration the pack can give over gravity, m/s². */
  lift: number;
  /** Downward push the attitude jets can add to gravity to stop a climb, m/s². */
  brake: number;
  /** Climb and descent speeds, m/s. */
  climb: number;
  descend: number;
  /** Horizontal speeds: cruise on the stick, boost on Shift or the stick's rim, m/s. */
  cruise: number;
  boost: number;
  /** Horizontal acceleration and braking, m/s². */
  accel: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The pack under gravity `g` (the felt one, m/s²). */
export function flightTuning(g: number): FlightTuning {
  // How heavy this world feels against Earth's: 0.56 on the Moon, 1.59 on Jupiter.
  const w = Math.sqrt(Math.max(0.1, g) / 9.81);
  const cruise = 12 / (0.55 + 0.45 * w);
  return {
    g,
    lift: 8 / w,
    brake: Math.max(0, 8 - g),
    climb: clamp(9 - 2 * w, 5.5, 8.5),
    descend: clamp(6 + 2 * w, 6, 10),
    cruise,
    boost: cruise * 1.8,
    accel: 11 / w,
  };
}

/** The most the pack can push upward under gravity `g`, m/s². */
export function jetThrust(g: number): number {
  return g + flightTuning(g).lift;
}

/** Where the crew may fly. Heights are y in the scene, the site datum at 0. */
export interface FlightEnvelope {
  /** Horizontal radius round the site; its last stretch turns the crew back, m. */
  radius: number;
  /** The crew may set down inside this radius, m. */
  landRadius: number;
  /** The highest the crew may climb, y. Never less than 40 m over the ground under them. */
  ceiling: number;
  /** A giant's floating deck: its rim, its top, and the floor off it over the cloud sea. */
  deck: { radius: number; top: number; floor: number } | null;
}

/** No limits at all: a test's open field, or a caller that has not said. */
export const OPEN_SKY: FlightEnvelope = { radius: 1e9, landRadius: 1e9, ceiling: 1e9, deck: null };

/**
 * The envelope for a world. On ground the crew may fly half as far again as
 * the walk fence and land inside it; over a giant's deck twice as far, out
 * over the clouds. The ceiling falls with gravity: about 290 m on the Moon,
 * 270 on Mars and Mercury, 220 on Venus, 195 on Proxima b, 150 over the giants.
 */
export function flightEnvelope(walkRadius: number, g: number, deck?: { radius: number; seaDepth: number } | null): FlightEnvelope {
  const landRadius = Math.max(1, walkRadius - JET.landInset);
  if (deck) {
    return {
      radius: walkRadius * 2,
      landRadius,
      ceiling: 150,
      deck: { radius: deck.radius, top: 0, floor: -deck.seaDepth + JET.seaClear },
    };
  }
  return { radius: walkRadius * 1.5, landRadius, ceiling: Math.round(clamp(330 - 12 * g, 180, 300)), deck: null };
}

export interface JetState {
  /** 0…1 in the tank. The pack never runs dry: always 1, kept for the readouts that ask. */
  fuel: number;
  /** In flight: the pack is lit and carrying the crew. */
  flying: boolean;
  /** Lit this step (the same as flying; the older name the glass and the crowd read). */
  jetting: boolean;
  /** Eased 0…1: what the flame, the roar and the light follow. */
  throttle: number;
  /** 0…1: how hard the pack is pushing this step, of all it can. */
  thrust: number;
  /** Lit this step and not the last: the ignition click. */
  ignited: boolean;
  /** The pack has been lit since the boots last left the ground: this landing comes off a flight. */
  flown: boolean;
  /** Seconds the key has been held. */
  holdT: number;
  /** Seconds in the air, and on the ground. */
  airT: number;
  groundT: number;
}

/** What the crew asks of the pack in flight: world-space stick, |m| ≤ 1, and the vertical keys. */
export interface FlightControl {
  moveX: number;
  moveZ: number;
  climb: boolean;
  descend: boolean;
  boost: boolean;
}

/** The body the pack carries. */
export interface FlightBody {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

export interface Jetpack {
  state: JetState;
  /** No pack on this suit (a world with air): it never lights. */
  enabled: boolean;
  tuning: FlightTuning;
  /** Gravity changed: the pack's numbers follow. */
  setGravity: (g: number) => void;
  /**
   * The key, every step the crew is not flying. Returns true on the step the
   * pack lights: the caller lifts off and starts calling `fly`.
   */
  hold: (dt: number, held: boolean, grounded: boolean) => boolean;
  /**
   * One step of flight. Writes the push the pack gives into `out` (m/s²,
   * gravity not included: the caller adds it) and returns `out`.
   */
  fly: (dt: number, c: FlightControl, b: FlightBody, groundY: number, env: FlightEnvelope, out: { x: number; y: number; z: number }) => { x: number; y: number; z: number };
  /** The boots are down: the flight is over and the pack goes out. */
  land: () => void;
  reset: () => void;
}

export function makeJetpack(g = 3): Jetpack {
  const state: JetState = {
    fuel: 1, flying: false, jetting: false, throttle: 0, thrust: 0, ignited: false, flown: false, holdT: 0, airT: 0, groundT: 9,
  };
  /** The flame eases toward what the push asks, quicker up than down. */
  const ease = (dt: number, to: number) => {
    state.throttle += (to - state.throttle) * (1 - Math.exp(-dt * (to > state.throttle ? 12 : 6)));
    if (state.throttle < 1e-3) state.throttle = 0;
  };
  const jet: Jetpack = {
    state,
    enabled: true,
    tuning: flightTuning(g),
    setGravity(gv) { jet.tuning = flightTuning(gv); },
    hold(dt, held, grounded) {
      state.ignited = false;
      state.fuel = 1;
      if (grounded) { state.groundT += dt; state.airT = 0; state.flown = false; } else { state.groundT = 0; state.airT += dt; }
      state.holdT = held && jet.enabled ? state.holdT + dt : 0;
      state.thrust = 0;
      ease(dt, 0);
      if (state.flying || state.holdT < JET.arm) return false;
      state.flying = true; state.jetting = true; state.ignited = true; state.flown = true;
      return true;
    },
    fly(dt, c, b, groundY, env, out) {
      const T = jet.tuning;
      state.ignited = false;
      state.fuel = 1;
      state.groundT = 0;
      state.airT += dt;
      const r = Math.hypot(b.x, b.z);
      const alt = b.y - groundY;
      const canLand = r <= env.landRadius;
      // ── Where the stick wants to go. ──
      let mx = c.moveX; let mz = c.moveZ;
      const m = Math.hypot(mx, mz);
      if (m > 1) { mx /= m; mz /= m; }
      const top = c.boost ? T.boost : T.cruise;
      let wx = mx * top; let wz = mz * top;
      const idle = m < 0.05 && !c.climb && !c.descend;
      // Left alone off the ground it may land on, the suit brings the crew back over it.
      if (idle && !canLand && r > 1e-3) { wx = (-b.x / r) * JET.drift; wz = (-b.z / r) * JET.drift; }
      // The edge of the envelope: the outward part of the wish fades to nothing
      // over the last stretch, and past the edge it turns into a push home.
      // The stretch is long enough for the pack to stop a boost in it.
      const band = Math.max(15, env.radius * 0.2, (T.boost * T.boost) / (1.6 * T.accel));
      const inner = env.radius - band;
      if (r > inner && r > 1e-3) {
        const ux = b.x / r; const uz = b.z / r;
        const s = (r - inner) / band;
        const allowed = Math.max(0, 1 - s) * top;
        const outward = wx * ux + wz * uz;
        if (outward > allowed) { wx -= (outward - allowed) * ux; wz -= (outward - allowed) * uz; }
        if (s > 1) { const back = Math.min(4, (r - env.radius) * 0.5 + 0.5); wx -= ux * back; wz -= uz * back; }
      }
      // ── Up, down or hold. ──
      let wy = c.climb && !c.descend ? T.climb : c.descend && !c.climb ? -T.descend : 0;
      // The fastest the crew may come down toward something `h` metres below
      // and still be stopped by `stop` m/s at it, on what the pack can brake.
      const approach = (h: number, stop: number, rate: number) => {
        const d = Math.max(0, h);
        return Math.min(stop + d * rate, Math.sqrt(stop * stop + 2 * 0.6 * T.lift * d));
      };
      if (canLand) {
        // Low over the ground with nothing held up, a hover settles onto it;
        // and a descent eases off over the last metres.
        if (!c.climb && wy <= 0 && alt < JET.settle) wy = -JET.settleSpeed;
        if (wy < 0) wy = Math.max(wy, -approach(alt, JET.flare, JET.flareRate));
      } else {
        const overSea = !!env.deck && r > env.deck.radius;
        const floor = overSea && env.deck ? env.deck.floor : groundY + JET.hover;
        const above = b.y - floor;
        if (wy < 0) wy = Math.max(wy, -approach(above, 0, 1.2));
        if (above < 0) wy = Math.max(wy, Math.min(3, -above * 1.5));
        // Coming home to a deck from under its rim: up over the top first.
        if (idle && env.deck && b.y < env.deck.top + 2) wy = Math.max(wy, 1.5);
      }
      const ceiling = Math.max(env.ceiling, groundY + 40);
      if (wy > 0) wy *= clamp((ceiling - b.y) / JET.ceilingBand, 0, 1);
      if (b.y > ceiling) wy = Math.min(wy, -Math.min(4, (b.y - ceiling) * 0.6 + 0.3));
      // ── The push that gets there. ──
      let ax = (wx - b.vx) / JET.tauH; let az = (wz - b.vz) / JET.tauH;
      const ah = Math.hypot(ax, az);
      if (ah > T.accel) { ax *= T.accel / ah; az *= T.accel / ah; }
      const ay = clamp(T.g + (wy - b.vy) / JET.tauV, -T.brake, T.g + T.lift);
      out.x = ax; out.y = ay; out.z = az;
      // The flame follows the push: a light world's hover is a small blue
      // flame, Jupiter's is a roar, and a hard climb or turn opens it up.
      state.thrust = clamp(Math.hypot(ax, Math.max(0, ay), az) / (T.g + T.lift), 0, 1);
      state.flying = true; state.jetting = true;
      ease(dt, 0.25 + 0.75 * state.thrust);
      return out;
    },
    land() {
      state.flying = false; state.jetting = false; state.thrust = 0; state.holdT = 0;
    },
    reset() {
      state.fuel = 1; state.flying = false; state.jetting = false; state.throttle = 0; state.thrust = 0; state.ignited = false;
      state.flown = false; state.holdT = 0; state.airT = 0; state.groundT = 9;
    },
  };
  return jet;
}

/** A giant's deck is solid below its top: someone flying under the rim is held outside it. */
export function confineToDeck(p: { x: number; y: number; z: number }, v: { x: number; z: number }, env: FlightEnvelope, bodyRadius = 0.55) {
  const d = env.deck;
  if (!d || p.y >= d.top - 0.15) return false;
  const r = Math.hypot(p.x, p.z);
  const min = d.radius + bodyRadius;
  if (r >= min) return false;
  const ux = r > 1e-4 ? p.x / r : 1; const uz = r > 1e-4 ? p.z / r : 0;
  p.x = ux * min; p.z = uz * min;
  const vn = v.x * ux + v.z * uz;
  if (vn < 0) { v.x -= vn * ux; v.z -= vn * uz; }
  return true;
}

/** Where the chase camera may be over a giant: above the deck while the crew
 *  is on or over it; while they are below its top, the deck's whole column is
 *  solid and the clouds a little under the soft floor are the floor elsewhere. */
export function deckCameraFloor(deck: { radius: number; seaDepth: number }, apron: number, crewY: () => number) {
  const r2 = (deck.radius + 0.5) ** 2;
  const a2 = apron * apron;
  const sea = -deck.seaDepth + 1.5;
  return (x: number, z: number) => {
    const d2 = x * x + z * z;
    if (d2 <= r2) return 0;
    return crewY() > -0.5 && d2 <= a2 ? 0 : sea;
  };
}
