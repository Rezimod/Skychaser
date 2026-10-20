// What a person's legs can do under a given gravity, worked out rather than
// tuned. Everything the locomotion needs comes from g, the leg, the mass of
// the body and of what it is wearing, and how hard legs can push; the only
// numbers of a game's own are the speeds an Earth-bound character jogs,
// runs and sprints at, a floor under the jump so a heavy world still gives
// a hop, and how long a landing takes to soak up. No world has a number of
// its own here.
//
// The walk is an inverted pendulum and cannot go faster than √(Fr·g·leg)
// with Fr ≈ 0.5; past that the body must leave the ground. A game jog sits
// above that limit on the Moon and Mars, so there the default gait is a
// lope with real flight between strides; on a heavy world it is a fast
// walk. The legs push about 2.4 g of the body's own weight through a
// fixed depth, so a jump's take-off speed is √(2·(F/m − g)·d): the Moon
// hangs, Mars hops, Proxima b barely leaves the ground. Landing is the
// same push run backwards, which sets the soft / roll / hard thresholds.
//
// One design choice sits on top of all that: on a light world the legs feel
// a gravity eased a third of the way (geometrically) toward Earth's. The true
// numbers played like wading: a 0.8 m/s walk and a 1.3 m jump hanging 2.5 s
// on the Moon. Felt, the Moon is ≈ 3 m/s² and Mars ≈ 5: still a lope and a
// jump that hangs over a second, but a game's. `g` is the gravity the crew
// moves under; `worldG` is the world's own, for the HUD, for whether a
// sprint is a bound, and for everything that is not the crew.

export const EARTH_G = 9.81;
export const LUNAR_G = 1.62;
export const MARS_G = 3.72;
const LEG = 0.9;
const BODY_KG = 80;
const EVA_KG = 77;
const SOFT_KG = 15;
/** Legs push this many Earth body-weights, through this much knee travel. */
const PUSH_G = 2.4;
const PUSH_DEPTH = { suited: 0.25, soft: 0.35 };
const LAND_SOFT = { suited: 0.3, soft: 0.45 };
const LAND_ROLL = { suited: 0.6, soft: 0.9 };
/** Lugged boots on regolith, and what planting a foot adds to plain friction. */
const BOOT_MU = 0.8;
const PLANT = 2.5;
/** The one design floor: a jump is never less than this high. */
export const JUMP_MIN_APEX = 0.15;
/** An Earth-bound game character's speeds, m/s; every world scales from them. */
const JOG_E = 3.2;
const RUN_E = 4.4;
const SPRINT_E = 5.8;
export const PIVOT_ANGLE = (135 * Math.PI) / 180;
/** What a running start adds to a jump's take-off, at most, m/s. */
const RUN_HOP_MAX = 0.4;
/** Below about a third of Earth's gravity a skip costs less than a run
 *  (Pavei et al. 2015), and the Apollo crews bounded: a sprint there is a
 *  two-footed hop whose flight is this much longer than a stride's. */
const BOUND_G = 0.3;
const BOUND_FLIGHT = 1.6;

export interface GaitProfile {
  /** The gravity the crew moves and falls under (felt; see the header). */
  g: number;
  /** The world's true gravity. */
  worldG: number;
  suited: boolean;
  /** Weight relative to an Earth-bound body, suit included. */
  weight: number;
  leg: number;
  /** The walk–run transition, m/s: above it the body must fly between strides. */
  walkLimit: number;
  walk: number;
  jog: number;
  run: number;
  sprint: number;
  crouch: number;
  /** Ground acceleration and braking the boots can give, m/s². */
  accel: number;
  brake: number;
  /** Below the walk–run transition a foot can be put down wherever it is
   *  needed and lands with more than the body's weight on it: starting and
   *  stopping there are this quick, m/s². */
  catchStep: number;
  /** Friction coefficient of the boots, and what the legs can add to it sideways, m/s². */
  grip: number;
  lateral: number;
  /** Steering from arm swing and lean in the air, m/s². */
  air: number;
  /** Take-off speed of a standing jump, and what a running one adds per m/s of ground speed (capped). */
  hop: number;
  runHop: number;
  runHopMax: number;
  /** Touchdown speeds, m/s: up to soft is absorbed, up to roll is a roll, up to hard a stumble, past it a fall. */
  softLand: number;
  rollLand: number;
  hardLand: number;
  /** Steps a second walking and running; a running stride's stance and flight, s. */
  cadenceWalk: number;
  cadenceRun: number;
  stance: number;
  flight: number;
  /** A sprint is a two-footed bound here, and its flight, s. */
  bound: boolean;
  boundFlight: number;
  /** Facing turn rate standing, rad/s; its fall-off with speed is grip-limited in turnRate(). */
  turnStill: number;
  /** A standing turn step's length, s. */
  turnStep: number;
  kneeMax: number;
  /** Step length the legs can reach, m. */
  reach: number;
  /** Seconds a sprint lasts, and seconds to recover it; a stumble's length; getting up. */
  stamina: number;
  recover: number;
  stumble: number;
  getUp: number;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The gravity the legs feel: a light world eased a third of the way (geometrically) toward Earth's. */
export function feltGravity(g: number): number {
  return g >= EARTH_G ? g : Math.pow(g, 0.65) * Math.pow(EARTH_G, 0.35);
}

export function gaitProfile(worldG: number, suited = true): GaitProfile {
  const g = feltGravity(worldG);
  const kg = BODY_KG + (suited ? EVA_KG : SOFT_KG);
  const weight = (g / EARTH_G) * (kg / BODY_KG);
  const s = (0.85 + 0.15 * Math.sqrt(g / EARTH_G)) * (suited ? 0.95 : 1) * Math.min(1, 1 / Math.sqrt(weight));
  const jog = JOG_E * s;
  const walkLimit = Math.sqrt(0.5 * g * LEG);
  const push = PUSH_G * EARTH_G * (BODY_KG / kg);
  const up = Math.max(0, push - g);
  const hop = Math.max(Math.sqrt(2 * up * (suited ? PUSH_DEPTH.suited : PUSH_DEPTH.soft)), Math.sqrt(2 * g * JUMP_MIN_APEX));
  const absorb = Math.max(push - g, 0.2 * push);
  // Your own jump, running flat out, always lands soft: the legs that threw you catch you.
  const softLand = Math.max(Math.sqrt(2 * absorb * (suited ? LAND_SOFT.suited : LAND_SOFT.soft)), Math.sqrt(2 * g * 1.5 * JUMP_MIN_APEX), hop + RUN_HOP_MAX + 0.05);
  const rollLand = Math.max(Math.sqrt(2 * absorb * (suited ? LAND_ROLL.suited : LAND_ROLL.soft)), 1.5 * softLand);
  const cadenceRun = 0.85 * Math.sqrt(g / LEG);
  const duty = 0.4 * Math.pow(g / EARTH_G, 0.3);
  const sw = Math.sqrt(weight);
  const flight = (1 - duty) / cadenceRun;
  const brake = BOOT_MU * g + PLANT;
  return {
    g, worldG, suited, weight, leg: LEG, walkLimit,
    walk: Math.min(0.9 * walkLimit, 0.55 * jog),
    jog,
    run: RUN_E * s,
    sprint: SPRINT_E * s,
    crouch: Math.min(0.9 * walkLimit, 0.4 * jog),
    accel: Math.min(0.6 * push, 1.6 * BOOT_MU * g + PLANT),
    brake,
    catchStep: Math.min(0.6 * push, 2 * brake),
    grip: BOOT_MU,
    lateral: 3,
    air: Math.min(2.5, 0.9 * Math.sqrt(EARTH_G / g)),
    hop,
    runHop: 0.12,
    runHopMax: RUN_HOP_MAX,
    softLand, rollLand, hardLand: 2 * rollLand,
    cadenceWalk: 0.575 * Math.sqrt(g / LEG),
    cadenceRun,
    stance: duty / cadenceRun,
    flight,
    // Whether a sprint is a bound is the world's own gravity, felt or not.
    bound: worldG < BOUND_G * EARTH_G,
    boundFlight: flight * BOUND_FLIGHT,
    turnStill: 10 * (suited ? 0.8 : 1),
    turnStep: clamp(0.16 + 0.06 * sw, 0.16, 0.3),
    kneeMax: suited ? 1.25 : 2.1,
    reach: suited ? 0.78 : 1.0,
    stamina: 6 / sw,
    recover: 4 * sw,
    stumble: 0.6 * sw,
    getUp: sw,
  };
}

/** How fast the facing may turn at ground speed v: quick standing, grip-limited at a run. */
export function turnRate(p: GaitProfile, v: number): number {
  return Math.min(p.turnStill / (1 + v / 2), (p.grip * p.g + p.lateral) / Math.max(v, 0.1));
}

export type Landing = 'soft' | 'roll' | 'hard' | 'fall';

/** How long the legs take to soak up a soft touchdown at `impact` m/s, s:
 *  a step off a kerb is gone at once, a drop at the edge of soft takes most
 *  of half a second, and control comes back over it. */
export function landRecovery(p: GaitProfile, impact: number): number {
  return 0.08 + 0.3 * clamp(impact / p.softLand, 0, 1);
}

/** What a touchdown at `impact` m/s does to the crew on this world. */
export function classifyLanding(p: GaitProfile, impact: number): Landing {
  if (impact <= p.softLand) return 'soft';
  if (impact <= p.rollLand) return 'roll';
  if (impact <= p.hardLand) return 'hard';
  return 'fall';
}
