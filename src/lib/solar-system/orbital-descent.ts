// The way down from orbit, flown in the surface scene itself.
//
// The ship starts in a low circular orbit a long way uprange of the landing
// site, with the curve of the world and its horizon under it, and comes all
// the way down to the height where the powered descent (moon-lander.ts)
// takes over, directly over the pad and moving the way the lander expects
// to be moving. Over a world with air that is an orbit, a retro burn to
// drop out of it, the entry — plasma, heating, the air shaking the hull —
// and a glide that ends in a flare on the engines. Over the Moon the entry
// is a long braking burn instead, and the glide is the approach.
//
// It is not an integrator. A free-flying re-entry from 400 km covers eight
// thousand kilometres and half an hour; this is a corridor — a smooth curve
// of height against distance to go, with a speed along it — and the ship
// rides it, steered off it within limits by the pilot and pulled back onto
// it by the guidance, so that it always arrives where the lander starts.
// What the HUD shows is still true: the height above the reference sphere,
// the speed along the path, and the rate the clock is running at. The clock
// runs fast (up to ×20 in orbit) and eases to real time below ten
// kilometres or so, which is how ninety seconds of play holds the whole
// way down. The time warp is exposed so the glass can say so.
//
// Positions are local metres round the site (planet-frame.ts: east +X, up +Y,
// north −Z). Far from the site the flat frame's y is not height — at 400 km
// out the Earth has fallen away 12.5 km under it — so every position here is
// built on the sphere: from the planet's centre, along the radial through
// the ground point, at the height the corridor asks for. "Down" is that
// radial, and `altitudeOf` reads back the same height the corridor flew.
//
// Pure: three.js maths only, deterministic for a given sequence of steps.

import * as THREE from 'three';
import {
  PLANET_BODIES, airDensity, altitudeOf, globeToLocal, localUpAt, orbitalSpeed, siteBasis,
  type GlobeWorld, type PlanetBody, type SiteBasis,
} from '@/lib/solar-system/planet-frame';

/** The legs of the way down. `entry` and `glide` are the air worlds';
 *  `braking` and `approach` the Moon's; `done` is the handover. */
export type OrbitalPhase = 'orbit' | 'deorbit' | 'entry' | 'braking' | 'glide' | 'approach' | 'done';
/** The legs of the way back up. */
export type AscentPhase = 'climb' | 'ascent' | 'orbit' | 'done';

export interface OrbitalInput {
  /** Nose up (+) or down (−), −1…1: raises or lowers the path within limits. */
  pitch: number;
  /** Cross-range, −1…1: right (+) or left (−) of the ground track. */
  cross: number;
  /** The engines against the flight, 0…1: slower along the path. */
  throttle: number;
}

/** Where the powered descent begins, and how it is moving then, local metres. */
export interface Handover {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** The pad the descent is aimed at, local metres. */
  padX: number;
  padZ: number;
}

export interface OrbitalTelemetry {
  phase: OrbitalPhase | AscentPhase;
  /** 0…1 through the current phase, by distance along the path. */
  phaseT: number;
  /** 0…1 through the whole profile. */
  progress: number;
  /** Seconds of play since the start, and of simulated flight. */
  wallSeconds: number;
  simSeconds: number;
  /** Height above the reference sphere, m. */
  altitude: number;
  /** Speed along the path, m/s; vertical speed, up positive. */
  speed: number;
  vertical: number;
  /** Ground distance to the pad (descent) or from it (ascent), km. */
  downrangeKm: number;
  /** 0…1: heating on the hull, from density × speed³. Zero without air. */
  heat: number;
  /** 0…1: the air shaking the hull — dense entry and the transonic crossing. */
  turbulence: number;
  /** Speed over the local speed of sound; 0 where there is no air. */
  mach: number;
  /** How fast the clock is running, ×1…×20. */
  timeWarp: number;
  /** 0…1: how hard the engines are burning. */
  burn: number;
  /** Times the ship has come down through Mach 1: the scene thuds on each. */
  booms: number;
  /** The pilot's authority, 0…1: guidance takes it all in the last stretch. */
  authority: number;
  /** Metres off the corridor: above (+) it and to the right (+) of it. */
  offPath: number;
  crossRange: number;
  done: boolean;
}

export interface OrbitalFlight {
  world: GlobeWorld;
  telemetry: OrbitalTelemetry;
  /** Local metres, and m/s. */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** The planet's radial at the ship, local frame: "up" out here. */
  up: THREE.Vector3;
  /** Horizontal unit direction of travel along the ground track. */
  track: THREE.Vector3;
  /** The hull's orientation: its +Z (nose) and +Y (roof) in the local frame. */
  attitude: THREE.Quaternion;
  /** The heading (rad about +Y, as `rotation.y`) the hull ends on, level. */
  finalYaw: number;
  /** Seconds of play the nominal profile takes, untouched. */
  nominalSeconds: number;
  update: (dt: number, input?: OrbitalInput) => void;
  /** Straight to the end: the handover (descent) or orbit (ascent). */
  skip: () => void;
}

export interface OrbitalDescent extends OrbitalFlight {
  /** Development: jump to the top of the entry (or the braking burn). */
  skipToEntry: () => void;
}

export interface OrbitalOptions {
  /** How far the hull's plumes lean aft of straight down, rad (moon-lander
   *  VehicleSpec.thrust): a retro burn points them along the flight path. */
  thrustTilt?: number;
}

/** One point on a corridor. `g` is ground distance, km — to the site going
 *  down, from the pad going up — and `h` height, km, above the reference
 *  sphere (or above the handover height, where `rel` is set). `aoa` is the
 *  hull's pitch off the flight path, degrees, or 'retro' for engines along
 *  it; `phase` names the stretch from this knot to the next. */
interface Knot {
  g: number;
  h: number;
  v: number;
  /** The clock here: ×1 is real time. */
  w: number;
  aoa: number | 'retro';
  burn: number;
  phase: OrbitalPhase | AscentPhase;
  rel?: boolean;
}

interface WorldFlight {
  /** Local speed of sound in the lower air, m/s; 0 for none. */
  sound: number;
  /** Where guidance starts taking the stick back: full authority above
   *  `lockHigh` m, none below `lockLow` m (heights over the handover). */
  lockLow: number;
  lockHigh: number;
  /** Length of the last straight into the handover, m of path. */
  gate: number;
  /** Bank limit for the cross-range turn, rad. */
  bank: number;
  descent: (vOrbit: number) => Knot[];
  ascent: (vOrbit: number) => Knot[];
}

// ── The corridors. Heights and speeds are chosen to read right, not
// integrated: the entry comes down through the part of the air where the
// heating peaks (Earth ~50 km at 5 km/s, Mars ~45 km at 2.5 km/s), crosses
// the speed of sound around ten kilometres, and the last kilometre or two
// is a flare on the engines onto the pad. `w` is the clock at each knot:
// fast where nothing changes quickly (a coast in orbit), slower where the
// air is doing its work, and real time for the flare. ──
const FLIGHTS: Record<GlobeWorld, WorldFlight> = {
  earth: {
    sound: 300, lockLow: 700, lockHigh: 4000, gate: 150, bank: 0.45,
    descent: (vo) => [
      { g: 2700, h: 400, v: vo, w: 20, aoa: 4, burn: 0, phase: 'orbit' },
      { g: 1800, h: 400, v: vo, w: 20, aoa: 4, burn: 0, phase: 'deorbit' },
      { g: 1560, h: 399, v: vo - 8, w: 16, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 1330, h: 384, v: vo - 110, w: 16, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 980, h: 210, v: vo - 50, w: 20, aoa: 40, burn: 0, phase: 'deorbit' },
      { g: 690, h: 100, v: vo + 40, w: 12, aoa: 40, burn: 0, phase: 'entry' },
      { g: 450, h: 68, v: 6900, w: 8, aoa: 40, burn: 0, phase: 'entry' },
      { g: 265, h: 48, v: 4300, w: 5.5, aoa: 38, burn: 0, phase: 'entry' },
      { g: 140, h: 34, v: 2100, w: 5, aoa: 32, burn: 0, phase: 'entry' },
      { g: 64, h: 23, v: 880, w: 7.5, aoa: 22, burn: 0, phase: 'glide' },
      { g: 27, h: 13, v: 360, w: 7, aoa: 12, burn: 0, phase: 'glide' },
      { g: 9, h: 5.5, v: 215, w: 5, aoa: 8, burn: 0, phase: 'glide' },
      { g: 2.6, h: 1.6, v: 130, w: 3, aoa: 10, burn: 0.1, phase: 'glide', rel: true },
      { g: 0.55, h: 0.45, v: 70, w: 1.4, aoa: 55, burn: 0.75, phase: 'glide', rel: true },
    ],
    ascent: (vo) => [
      { g: 0.12, h: 0.9, v: 150, w: 3, aoa: 4, burn: 1, phase: 'ascent', rel: true },
      { g: 2.5, h: 5.5, v: 340, w: 6, aoa: 4, burn: 1, phase: 'ascent' },
      { g: 14, h: 15, v: 760, w: 9, aoa: 4, burn: 1, phase: 'ascent' },
      { g: 50, h: 32, v: 1700, w: 13, aoa: 3, burn: 1, phase: 'ascent' },
      { g: 150, h: 62, v: 3300, w: 17, aoa: 2, burn: 1, phase: 'ascent' },
      { g: 400, h: 115, v: 5700, w: 20, aoa: 2, burn: 1, phase: 'orbit' },
      { g: 820, h: 230, v: 7250, w: 20, aoa: 2, burn: 0.8, phase: 'orbit' },
      { g: 1300, h: 400, v: vo, w: 20, aoa: 2, burn: 0, phase: 'orbit' },
    ],
  },
  mars: {
    sound: 240, lockLow: 450, lockHigh: 3000, gate: 60, bank: 0.45,
    descent: (vo) => [
      { g: 1480, h: 250, v: vo, w: 16, aoa: 4, burn: 0, phase: 'orbit' },
      { g: 1080, h: 250, v: vo, w: 16, aoa: 4, burn: 0, phase: 'deorbit' },
      { g: 950, h: 249, v: vo - 5, w: 18, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 800, h: 240, v: vo - 60, w: 18, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 560, h: 160, v: vo - 20, w: 20, aoa: 35, burn: 0, phase: 'deorbit' },
      { g: 400, h: 110, v: vo + 30, w: 12, aoa: 35, burn: 0, phase: 'entry' },
      { g: 255, h: 66, v: 3280, w: 7, aoa: 35, burn: 0, phase: 'entry' },
      { g: 140, h: 40, v: 2150, w: 6, aoa: 33, burn: 0, phase: 'entry' },
      { g: 62, h: 24, v: 900, w: 6.5, aoa: 26, burn: 0, phase: 'entry' },
      { g: 25, h: 13, v: 400, w: 8.5, aoa: 16, burn: 0, phase: 'glide' },
      { g: 8, h: 5.5, v: 230, w: 6.5, aoa: 10, burn: 0, phase: 'glide' },
      { g: 2.2, h: 1.7, v: 140, w: 3.8, aoa: 12, burn: 0.15, phase: 'glide', rel: true },
      { g: 0.32, h: 0.28, v: 45, w: 1.5, aoa: 60, burn: 0.8, phase: 'glide', rel: true },
    ],
    ascent: (vo) => [
      { g: 0.06, h: 0.5, v: 70, w: 3, aoa: 4, burn: 1, phase: 'ascent', rel: true },
      { g: 2, h: 4, v: 260, w: 6, aoa: 4, burn: 1, phase: 'ascent' },
      { g: 16, h: 13, v: 720, w: 9, aoa: 3, burn: 1, phase: 'ascent' },
      { g: 65, h: 32, v: 1550, w: 13, aoa: 3, burn: 1, phase: 'ascent' },
      { g: 190, h: 72, v: 2600, w: 16, aoa: 2, burn: 1, phase: 'orbit' },
      { g: 420, h: 150, v: 3250, w: 16, aoa: 2, burn: 0.7, phase: 'orbit' },
      { g: 720, h: 250, v: vo, w: 16, aoa: 2, burn: 0, phase: 'orbit' },
    ],
  },
  moon: {
    sound: 0, lockLow: 250, lockHigh: 1800, gate: 60, bank: 0.35,
    descent: (vo) => [
      { g: 1400, h: 100, v: vo, w: 20, aoa: 4, burn: 0, phase: 'orbit' },
      { g: 1180, h: 100, v: vo, w: 20, aoa: 4, burn: 0, phase: 'deorbit' },
      { g: 1120, h: 99.6, v: vo - 3, w: 20, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 1060, h: 97.5, v: vo - 22, w: 24, aoa: 'retro', burn: 1, phase: 'deorbit' },
      { g: 800, h: 38, v: vo + 5, w: 30, aoa: 10, burn: 0, phase: 'deorbit' },
      { g: 560, h: 16, v: vo + 45, w: 26, aoa: 'retro', burn: 0.2, phase: 'braking' },
      { g: 520, h: 15, v: vo + 30, w: 28, aoa: 'retro', burn: 1, phase: 'braking' },
      { g: 260, h: 11.5, v: 1150, w: 27, aoa: 'retro', burn: 1, phase: 'braking' },
      { g: 70, h: 6.5, v: 470, w: 21, aoa: 'retro', burn: 0.95, phase: 'braking' },
      { g: 6, h: 2, v: 140, w: 10, aoa: 'retro', burn: 0.9, phase: 'approach', rel: true },
      { g: 1.6, h: 0.55, v: 48, w: 5, aoa: 100, burn: 0.7, phase: 'approach', rel: true },
      { g: 0.16, h: 0.075, v: 20, w: 1.6, aoa: 95, burn: 0.6, phase: 'approach', rel: true },
    ],
    ascent: (vo) => [
      { g: 0.04, h: 0.25, v: 34, w: 3, aoa: 4, burn: 1, phase: 'ascent', rel: true },
      { g: 1.4, h: 1.8, v: 170, w: 6, aoa: 4, burn: 1, phase: 'ascent' },
      { g: 20, h: 7.5, v: 600, w: 12, aoa: 3, burn: 1, phase: 'ascent' },
      { g: 95, h: 24, v: 1200, w: 18, aoa: 2, burn: 1, phase: 'orbit' },
      { g: 260, h: 58, v: 1540, w: 20, aoa: 2, burn: 0.6, phase: 'orbit' },
      { g: 470, h: 100, v: vo, w: 20, aoa: 2, burn: 0, phase: 'orbit' },
    ],
  },
};

/** The local speed of sound a world's Mach number is read against, m/s; 0 for none. */
export function soundSpeed(world: GlobeWorld): number {
  return FLIGHTS[world].sound;
}

const DEG = Math.PI / 180;
const SAMPLES_PER_SEGMENT = 480;
/** No simulated step longer than this, s, however fast the clock runs. */
const MAX_SIM_STEP = 0.2;

/** Monotone cubic slopes (harmonic mean of the neighbouring secants, zero at
 *  a turn), so the curve through the knots never overshoots them: heights
 *  never rise on the way down and the distance to go never grows. */
function monotoneSlopes(y: number[]): number[] {
  const n = y.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push(y[i + 1] - y[i]);
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] > 0 ? (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]) : 0;
  return m;
}

function hermite(y0: number, y1: number, m0: number, m1: number, t: number): number {
  const t2 = t * t; const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A corridor, sampled densely along its length: ground distance, height,
 *  speed, hull pitch and burn at every sample, and the length of path from
 *  the first knot to each (m, with the ground distance measured at the
 *  height flown, so the speed along it is the true speed). */
class Corridor {
  readonly s: Float64Array;
  readonly g: Float64Array;
  readonly h: Float64Array;
  readonly v: Float64Array;
  readonly aoa: Float64Array;
  readonly burn: Float64Array;
  readonly warp: Float64Array;
  readonly phase: Uint8Array;
  readonly phases: (OrbitalPhase | AscentPhase)[] = [];
  /** Path length at which each named phase begins and ends. */
  readonly spans = new Map<string, [number, number]>();
  readonly length: number;

  constructor(knots: { g: number; h: number; v: number; w: number; aoa: number; burn: number; phase: OrbitalPhase | AscentPhase }[], radius: number) {
    const n = knots.length;
    const total = (n - 1) * SAMPLES_PER_SEGMENT + 1;
    this.s = new Float64Array(total);
    this.g = new Float64Array(total);
    this.h = new Float64Array(total);
    this.v = new Float64Array(total);
    this.aoa = new Float64Array(total);
    this.burn = new Float64Array(total);
    this.warp = new Float64Array(total);
    this.phase = new Uint8Array(total);
    const G = knots.map((k) => k.g); const H = knots.map((k) => k.h); const V = knots.map((k) => k.v);
    const mg = monotoneSlopes(G); const mh = monotoneSlopes(H); const mv = monotoneSlopes(V);
    let i = 0;
    for (let k = 0; k < n - 1; k++) {
      const a = knots[k]; const b = knots[k + 1];
      let idx = this.phases.indexOf(a.phase);
      if (idx < 0) { idx = this.phases.length; this.phases.push(a.phase); }
      const last = k === n - 2;
      for (let j = 0; j < SAMPLES_PER_SEGMENT + (last ? 1 : 0); j++) {
        const t = j / SAMPLES_PER_SEGMENT;
        this.g[i] = hermite(G[k], G[k + 1], mg[k], mg[k + 1], t);
        this.h[i] = hermite(H[k], H[k + 1], mh[k], mh[k + 1], t);
        this.v[i] = Math.max(1, hermite(V[k], V[k + 1], mv[k], mv[k + 1], t));
        const e = smooth(t);
        this.aoa[i] = a.aoa + (b.aoa - a.aoa) * e;
        this.burn[i] = a.burn + (b.burn - a.burn) * e;
        this.warp[i] = a.w + (b.w - a.w) * e;
        this.phase[i] = idx;
        if (i > 0) {
          const dg = (this.g[i] - this.g[i - 1]) * (radius + 0.5 * (this.h[i] + this.h[i - 1])) / radius;
          this.s[i] = this.s[i - 1] + Math.hypot(dg, this.h[i] - this.h[i - 1]);
        }
        i++;
      }
    }
    this.length = this.s[total - 1];
    for (let j = 0; j < total; j++) {
      const name = this.phases[this.phase[j]];
      const span = this.spans.get(name);
      if (!span) this.spans.set(name, [this.s[j], this.s[j]]);
      else span[1] = this.s[j];
    }
    // Each phase runs up to where the next begins.
    for (let p = 0; p < this.phases.length - 1; p++) {
      const span = this.spans.get(this.phases[p])!;
      span[1] = this.spans.get(this.phases[p + 1])![0];
    }
  }

  /** The sample just before path length `s`, and how far on toward the next. */
  locate(s: number): [number, number] {
    const arr = this.s;
    if (s <= 0) return [0, 0];
    if (s >= this.length) return [arr.length - 2, 1];
    let lo = 0; let hi = arr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= s) lo = mid; else hi = mid;
    }
    const span = arr[hi] - arr[lo];
    return [lo, span > 0 ? (s - arr[lo]) / span : 0];
  }

  read(arr: Float64Array, s: number): number {
    const [i, f] = this.locate(s);
    return arr[i] + (arr[i + 1] - arr[i]) * f;
  }

  /** d(ground)/ds and d(height)/ds at `s`: the path's direction. */
  slope(s: number): [number, number] {
    const [i] = this.locate(s);
    const ds = this.s[i + 1] - this.s[i];
    if (ds <= 0) return [0, -1];
    return [(this.g[i + 1] - this.g[i]) / ds, (this.h[i + 1] - this.h[i]) / ds];
  }

  phaseAt(s: number): OrbitalPhase | AscentPhase {
    const [i, f] = this.locate(s);
    return this.phases[this.phase[f >= 1 ? i + 1 : i]];
  }
}

/** Nominal seconds of play for a corridor, stepping the way the sim does. */
function playSeconds(c: Corridor): number {
  let s = 0; let t = 0;
  const dt = 1 / 30;
  while (s < c.length && t < 900) {
    s += c.read(c.v, s) * dt * c.read(c.warp, s);
    t += dt;
  }
  return t;
}

interface Frame {
  body: PlanetBody;
  basis: SiteBasis;
  /** Reference radius, m, and the planet's centre in the local frame. */
  radius: number;
  centre: THREE.Vector3;
  /** Radial through the reference point, the horizontal axis the ground
   *  distance is measured along, and the cross-range axis to its right. */
  up0: THREE.Vector3;
  axis: THREE.Vector3;
  side: THREE.Vector3;
}

/** The frame a corridor is flown in: centred on the ground point under
 *  (x, z), its axis along `axisHint`, the side axis to the right of the way
 *  the ship travels (+1 along the axis, −1 against it). */
function frameAt(world: GlobeWorld, x: number, z: number, axisHint: THREE.Vector3, travel: 1 | -1): Frame {
  const body = PLANET_BODIES[world];
  const basis = siteBasis(body);
  const centre = globeToLocal(basis, new THREE.Vector3(0, 0, 0));
  const up0 = localUpAt(basis, new THREE.Vector3(x, body.datumKm * 1000, z));
  const axis = axisHint.clone().addScaledVector(up0, -axisHint.dot(up0));
  if (axis.lengthSq() < 1e-10) axis.set(1, 0, 0).addScaledVector(up0, -up0.x);
  axis.normalize();
  // Right of the direction of travel: forward × up.
  const side = new THREE.Vector3().crossVectors(axis, up0).multiplyScalar(travel).normalize();
  return { body, basis, radius: body.radiusKm * 1000, centre, up0, axis, side };
}

/**
 * The shared engine: a ship riding a corridor through a frame, with the
 * pilot's offsets and the guidance that bounds them. The corridor says
 * which way the ground distance runs; the velocity follows its slope.
 */
function makeFlight(
  world: GlobeWorld, frame: Frame, corridor: Corridor, finalYaw: number, opts: OrbitalOptions,
  cfg: { heatScale: number; heatRef: number; qRef: number; levelFrom: number; ascent: boolean },
): OrbitalFlight & { goTo: (s: number) => void } {
  const f = FLIGHTS[world];
  const endH = corridor.h[corridor.h.length - 1];
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const up = new THREE.Vector3();
  const track = new THREE.Vector3();
  const attitude = new THREE.Quaternion();
  const level = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), finalYaw);
  const telemetry: OrbitalTelemetry = {
    phase: corridor.phases[0], phaseT: 0, progress: 0, wallSeconds: 0, simSeconds: 0,
    altitude: 0, speed: 0, vertical: 0, downrangeKm: 0, heat: 0, turbulence: 0, mach: 0,
    timeWarp: 1, burn: 0, booms: 0, authority: 1, offPath: 0, crossRange: 0, done: false,
  };
  /** Along the corridor, m; the pilot's offsets: height (m), cross-range
   *  (m), and the fraction of speed given up to the engines. */
  let s = 0;
  let dh = 0; let dhRate = 0;
  let cr = 0; let crRate = 0;
  let brake = 0;
  let bank = 0;
  let pitchTrim = 0;
  let lastMach = 0;
  const tg = new THREE.Vector3();
  const rad = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const vdir = new THREE.Vector3();
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const qRoll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);

  /** How much of the stick the pilot has at this point on the path. */
  const authorityAt = (hNom: number) => {
    const over = hNom - endH;
    return THREE.MathUtils.smoothstep(over, f.lockLow, f.lockHigh);
  };

  /** Put the ship at path length `s` with the current offsets, and read the numbers off it. */
  const place = (dtSim: number) => {
    const g = corridor.read(corridor.g, s);
    const hNom = corridor.read(corridor.h, s);
    const h = hNom + dh;
    const R = frame.radius;
    const theta = g / R;
    // The ground point's radial, turned off the track by the cross-range.
    rad.copy(frame.up0).multiplyScalar(Math.cos(theta)).addScaledVector(frame.axis, Math.sin(theta)).addScaledVector(frame.side, cr / R).normalize();
    position.copy(frame.centre).addScaledVector(rad, R + h);
    up.copy(rad);
    // Along the ground, the way the ground distance grows.
    tg.copy(frame.axis).multiplyScalar(Math.cos(theta)).addScaledVector(frame.up0, -Math.sin(theta));
    tg.addScaledVector(rad, -tg.dot(rad)).normalize();
    const [dgds, dhds] = corridor.slope(s);
    const speed = corridor.read(corridor.v, s) * (1 - brake);
    velocity.copy(tg).multiplyScalar(speed * dgds * (R + h) / R).addScaledVector(rad, speed * dhds);
    velocity.addScaledVector(frame.side, crRate).addScaledVector(rad, dhRate);
    track.copy(velocity).addScaledVector(rad, -velocity.dot(rad));
    if (track.lengthSq() < 1e-8) track.copy(tg).multiplyScalar(cfg.ascent ? 1 : -1);
    track.normalize();

    const altitude = altitudeOf(frame.body, frame.basis, position);
    const rho = airDensity(frame.body, altitude);
    const v = velocity.length();
    telemetry.altitude = altitude;
    telemetry.speed = v;
    telemetry.vertical = velocity.dot(rad);
    telemetry.downrangeKm = Math.hypot(g, cr) / 1000;
    telemetry.timeWarp = corridor.read(corridor.warp, s);
    telemetry.heat = cfg.heatRef > 0 ? THREE.MathUtils.clamp(1.12 * Math.pow((rho * v * v * v) / cfg.heatRef, 0.7), 0, 1) * cfg.heatScale : 0;
    const mach = f.sound > 0 && rho > 0 ? v / f.sound : 0;
    const transonic = Math.exp(-(((mach - 1) / 0.2) ** 2)) * Math.min(1, rho / 0.05);
    const q = cfg.qRef > 0 ? Math.pow((rho * v * v) / cfg.qRef, 0.8) : 0;
    telemetry.turbulence = rho > 0 ? THREE.MathUtils.clamp(0.9 * q + 0.6 * transonic, 0, 1) * (cfg.ascent ? 0.6 : 1) : 0;
    if (!cfg.ascent && dtSim > 0 && lastMach >= 1 && mach < 1 && mach > 0) telemetry.booms += 1;
    lastMach = mach;
    telemetry.mach = mach;
    telemetry.burn = Math.min(1, corridor.read(corridor.burn, s) + brake * 3.2);
    telemetry.offPath = dh;
    telemetry.crossRange = cr;
    telemetry.authority = authorityAt(hNom);
    const phase = corridor.phaseAt(s);
    telemetry.phase = s >= corridor.length ? 'done' : phase;
    const span = corridor.spans.get(phase)!;
    telemetry.phaseT = span[1] > span[0] ? THREE.MathUtils.clamp((s - span[0]) / (span[1] - span[0]), 0, 1) : 1;
    telemetry.progress = corridor.length > 0 ? Math.min(1, s / corridor.length) : 1;

    // ── The hull: nose along the flight path, pitched off it by the
    // profile's angle (belly into the air on the entry, engines along the
    // path for a burn), rolled into a cross-range turn. The frame is the
    // vertical plane of the track, so it holds when the path is straight
    // down at the end. ──
    const vh = velocity.dot(track);
    const vv = velocity.dot(rad);
    const gamma = Math.atan2(vv, Math.max(1e-6, vh));
    vdir.copy(track).multiplyScalar(Math.cos(gamma)).addScaledVector(rad, Math.sin(gamma));
    nrm.copy(track).multiplyScalar(-Math.sin(gamma)).addScaledVector(rad, Math.cos(gamma));
    const a = corridor.read(corridor.aoa, s) * DEG + pitchTrim;
    bz.copy(vdir).multiplyScalar(Math.cos(a)).addScaledVector(nrm, Math.sin(a));
    by.copy(vdir).multiplyScalar(-Math.sin(a)).addScaledVector(nrm, Math.cos(a));
    bx.crossVectors(by, bz);
    m4.makeBasis(bx, by, bz);
    attitude.setFromRotationMatrix(m4);
    qRoll.setFromAxisAngle(zAxis, bank);
    attitude.multiply(qRoll);
    // The last of the way down comes level on the heading the lander keeps.
    if (cfg.levelFrom < corridor.length) {
      const k = THREE.MathUtils.smoothstep(s, cfg.levelFrom, corridor.length);
      if (k > 0) attitude.slerp(level, k);
    }
  };

  const flight = {
    world,
    telemetry,
    position, velocity, up, track, attitude,
    finalYaw,
    nominalSeconds: playSeconds(corridor),
    update(dt: number, input?: OrbitalInput) {
      if (telemetry.done) return;
      dt = Math.max(0, dt);
      telemetry.wallSeconds += dt;
      const auth = authorityAt(corridor.read(corridor.h, s));
      const pitch = THREE.MathUtils.clamp(input?.pitch ?? 0, -1, 1) * auth;
      const cross = THREE.MathUtils.clamp(input?.cross ?? 0, -1, 1) * auth;
      const throttle = THREE.MathUtils.clamp(input?.throttle ?? 0, 0, 1) * auth;
      const dhWas = dh; const crWas = cr;
      // The engines against the flight give up to a quarter of the speed.
      brake += (throttle * 0.25 - brake) * (1 - Math.exp(-dt * 1.4));
      const dtSim = dt * corridor.read(corridor.warp, s);
      const steps = Math.max(1, Math.ceil(dtSim / MAX_SIM_STEP));
      const h = dtSim / steps;
      for (let i = 0; i < steps && s < corridor.length; i++) {
        s = Math.min(corridor.length, s + corridor.read(corridor.v, s) * (1 - brake) * h);
      }
      // The pilot's reach, and the funnel guidance holds it in: a tenth of
      // the height still to lose (no more than 4 km) up or down, and
      // cross-range at up to 3 % of the speed, never more than 6 % of the
      // path still to fly — so both close to nothing at the handover, and
      // close smoothly, whoever has the stick.
      const hNom = corridor.read(corridor.h, s);
      const dhMax = Math.min(4000, 0.1 * Math.max(0, hNom - endH));
      const crMax = Math.min(25_000, 0.06 * (corridor.length - s));
      dh += (pitch * dhMax - dh) * (1 - Math.exp(-dt * 0.9));
      dh = THREE.MathUtils.clamp(dh, -dhMax, dhMax);
      if (Math.abs(cross) > 0.02) cr += cross * Math.min(250, 0.03 * corridor.read(corridor.v, s)) * dtSim;
      else cr *= Math.exp(-dt / 2.5);
      cr = THREE.MathUtils.clamp(cr, -crMax, crMax);
      dhRate = dtSim > 0 ? (dh - dhWas) / dtSim : 0;
      crRate = dtSim > 0 ? (cr - crWas) / dtSim : 0;
      // The hull answers the stick: a few degrees of pitch, a bank into the turn.
      pitchTrim += (pitch * 6 * DEG - pitchTrim) * (1 - Math.exp(-dt * 2));
      bank += (cross * f.bank - bank) * (1 - Math.exp(-dt * 2));
      telemetry.simSeconds += dtSim;
      place(dtSim);
      if (s >= corridor.length) {
        telemetry.done = true;
        telemetry.phase = 'done';
        telemetry.heat = 0;
        telemetry.turbulence = 0;
      }
    },
    skip() {
      flight.goTo(corridor.length);
      telemetry.done = true;
      telemetry.phase = 'done';
    },
    goTo(to: number) {
      s = THREE.MathUtils.clamp(to, 0, corridor.length);
      dh = dhRate = cr = crRate = brake = bank = pitchTrim = 0;
      lastMach = 0;
      place(0);
    },
  };
  place(0);
  lastMach = telemetry.mach;
  return flight;
}

/** The profile's knots with the retro sentinel and the relative heights resolved, m. */
function resolve(knots: Knot[], endH: number, opts: OrbitalOptions): { g: number; h: number; v: number; w: number; aoa: number; burn: number; phase: OrbitalPhase | AscentPhase }[] {
  // A retro burn points the plumes along the flight path: the hull pitched
  // a right angle off it, and on past that by however far its plumes lean aft.
  const retro = 90 + (opts.thrustTilt ?? 0) / DEG;
  return knots.map((k) => ({
    g: k.g * 1000,
    h: k.rel ? endH + k.h * 1000 : k.h * 1000,
    v: k.v,
    w: k.w,
    aoa: k.aoa === 'retro' ? retro : k.aoa,
    burn: k.burn,
    phase: k.phase,
  }));
}

/** The peak of density × speed³ and of density × speed² along a corridor:
 *  heat and turbulence are read as fractions of what the nominal entry
 *  reaches, so the plasma is full at its worst whatever the world. */
function peaks(c: Corridor, body: PlanetBody): { heat: number; q: number } {
  let heat = 0; let q = 0;
  for (let i = 0; i < c.s.length; i++) {
    const rho = airDensity(body, c.h[i]);
    heat = Math.max(heat, rho * c.v[i] ** 3);
    q = Math.max(q, rho * c.v[i] ** 2);
  }
  return { heat, q };
}

const descentPeaks = new Map<GlobeWorld, { heat: number; q: number }>();

/** The nominal entry's peaks for a world, from a corridor to a handover
 *  over the site: the ascent reads its heat against the same scale. */
function nominalPeaks(world: GlobeWorld): { heat: number; q: number } {
  let pk = descentPeaks.get(world);
  if (pk) return pk;
  const f = FLIGHTS[world];
  const body = PLANET_BODIES[world];
  const vo = orbitalSpeed(body, f.descent(0)[0].h * 1000);
  const knots = resolve(f.descent(vo), 150, {});
  knots.push({ g: 60, h: 150, v: 15, w: 1, aoa: 90, burn: 0.6, phase: knots[knots.length - 1].phase });
  pk = peaks(new Corridor(knots, body.radiusKm * 1000), body);
  descentPeaks.set(world, pk);
  return pk;
}

/**
 * The way down, for `world`, ending at `handover`: the lander's start, in
 * the surface scene's frame. The ground track comes in along the line from
 * the pad out through the handover point, so the last of it runs straight
 * on into the powered descent.
 */
export function makeOrbitalDescent(world: GlobeWorld, handover: Handover, opts: OrbitalOptions = {}): OrbitalDescent {
  const f = FLIGHTS[world];
  // The track comes from the side the handover is on: the lander starts off
  // the pad and drifts back over it.
  const hint = new THREE.Vector3(handover.position.x - handover.padX, 0, handover.position.z - handover.padZ);
  if (hint.lengthSq() < 1e-6) hint.set(-handover.velocity.x, 0, -handover.velocity.z);
  if (hint.lengthSq() < 1e-6) hint.set(0, 0, 1);
  const frame = frameAt(world, handover.padX, handover.padZ, hint, -1);
  const R = frame.radius;
  const w = handover.position.clone().sub(frame.centre);
  const theta = Math.atan2(w.dot(frame.axis), w.dot(frame.up0));
  const endG = theta * R;
  const endH = w.length() - R;
  // The last straight: back along the handover velocity from the handover.
  const rEnd = w.clone().normalize();
  const tEnd = frame.axis.clone().multiplyScalar(Math.cos(theta)).addScaledVector(frame.up0, -Math.sin(theta)).normalize();
  const v = handover.velocity;
  const speed = Math.max(1, v.length());
  const towardSite = -v.dot(tEnd);
  const down = -v.dot(rEnd);
  const gateG = endG + f.gate * Math.max(0.02, towardSite / speed);
  const gateH = endH + f.gate * Math.max(0.2, down / speed);
  const vo = orbitalSpeed(frame.body, f.descent(0)[0].h * 1000);
  const knots = resolve(f.descent(vo), endH, opts);
  // Keep the knots in order above the gate whatever the pad's height.
  for (const k of knots) k.g = Math.max(k.g, gateG + 30);
  knots.push({ g: gateG, h: gateH, v: speed * 1.15, w: 1, aoa: 90, burn: 0.75, phase: knots[knots.length - 1].phase });
  knots.push({ g: endG, h: endH, v: speed, w: 1, aoa: 90, burn: 0.6, phase: knots[knots.length - 1].phase });
  const corridor = new Corridor(knots, R);
  const pk = nominalPeaks(world);
  // The heading the hull ends on: level, nose along the last of the track.
  const along = tEnd.clone().multiplyScalar(-1);
  along.y = 0;
  if (along.lengthSq() < 1e-8) along.set(0, 0, -1);
  along.normalize();
  const finalYaw = Math.atan2(along.x, along.z);
  const levelFrom = corridor.length - (f.gate + 0.35 * (knots[knots.length - 3].h - endH));
  const flight = makeFlight(world, frame, corridor, finalYaw, opts, {
    heatScale: 1, heatRef: pk.heat, qRef: pk.q, levelFrom, ascent: false,
  });
  const entryPhase: OrbitalPhase = world === 'moon' ? 'braking' : 'entry';
  return Object.assign(flight, {
    skipToEntry() {
      const span = corridor.spans.get(entryPhase);
      if (span) flight.goTo(span[0]);
    },
  });
}

/**
 * The way back up: from where the lander's own climb leaves off (its
 * position and velocity), out along `heading` (horizontal, local) through
 * the air to orbit height. Shorter than the way down — about half a minute
 * of play — and done when orbit is reached.
 */
export function makeOrbitalAscent(world: GlobeWorld, from: { position: THREE.Vector3; velocity: THREE.Vector3 }, heading: THREE.Vector3, opts: OrbitalOptions = {}): OrbitalFlight {
  const f = FLIGHTS[world];
  const frame = frameAt(world, from.position.x, from.position.z, heading, 1);
  const R = frame.radius;
  const w = from.position.clone().sub(frame.centre);
  const h0 = w.length() - R;
  const v0 = Math.max(4, from.velocity.length());
  const vo = orbitalSpeed(frame.body, f.ascent(0)[f.ascent(0).length - 1].h * 1000);
  const rest = resolve(f.ascent(vo), h0, opts);
  // Straight up off the pad the hull is level: a right angle nose-down off
  // a vertical path, pitching over onto the path as it bends downrange.
  const knots = [{ g: 0, h: h0, v: v0, w: 1, aoa: -90, burn: 1, phase: 'climb' as AscentPhase }, ...rest];
  // The first leg is the climb straight up off the pad; the knots after it
  // must stay above wherever that left the ship.
  for (let i = 1; i < knots.length; i++) knots[i].h = Math.max(knots[i].h, knots[i - 1].h + 1);
  const corridor = new Corridor(knots, R);
  const pk = nominalPeaks(world);
  const yaw = Math.atan2(frame.axis.x, frame.axis.z);
  return makeFlight(world, frame, corridor, yaw, opts, {
    heatScale: 0.35, heatRef: pk.heat, qRef: pk.q, levelFrom: Infinity, ascent: true,
  });
}

// ── The numbers as the glass reads them. ──

/** Height: kilometres high up (one decimal under ten), metres near the ground. */
export function formatAltitude(m: number): string {
  if (m >= 10_000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(0, Math.round(m))} m`;
}

/** Speed: km/s while it is orbital, m/s once the air has taken most of it. */
export function formatSpeed(ms: number): string {
  const a = Math.abs(ms);
  if (a >= 1000) return `${(a / 1000).toFixed(2)} km/s`;
  return `${Math.round(a)} m/s`;
}

/** Vertical speed, signed: climbing +, sinking −. */
export function formatVertical(ms: number): string {
  const sign = ms > 0.5 ? '+' : ms < -0.5 ? '−' : '';
  return `${sign}${formatSpeed(ms)}`;
}

/** Ground distance: whole kilometres far out, metres at the end. */
export function formatRange(km: number): string {
  if (km >= 10) return `${Math.round(km)} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

/** The world's name across the glass over the orbit, 0…1: up a moment
 *  after the scene opens, held through the orbit, gone early in the burn. */
export function orbitTitle(t: Pick<OrbitalTelemetry, 'phase' | 'phaseT' | 'wallSeconds'>): number {
  if (t.phase === 'orbit') return THREE.MathUtils.smoothstep(t.wallSeconds, 0.8, 2.4);
  if (t.phase === 'deorbit') return 1 - THREE.MathUtils.smoothstep(t.phaseT, 0, 0.3);
  return 0;
}
