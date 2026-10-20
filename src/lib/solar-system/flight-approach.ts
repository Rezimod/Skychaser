// The way down starts in the ship, not on a loading screen.
//
// Ask for the surface with a world under the nose and the ship flies the
// arrival itself: it turns onto the body and runs in (transit), comes off
// the gas and swings around to the side the Earth is on so the crew see
// home behind the mare (approach), then hits the air — a shell of plasma
// round the hull, the frame shaking, the world's name across the glass
// (entry) — and comes out of it low and cooling, the ground hazing up
// under the nose (glide), where the surface takes the ship. An airless
// world has no air to hit: the same leg is a retro burn, the engines
// flaring against the fall, and the title card comes up over that instead.
//
// This file is the profile only — where the ship should be at a given
// second, as a distance in body radii, how far around it has swung, how
// far the nose has come down, and how hot, how lit and how titled the
// moment is. player-ship.ts turns that into a pose and the deck paints
// the curves; the surface loads underneath it all.
//
// The Moon, Mars and Earth are flown all the way down from orbit in the
// surface scene itself (orbital-descent.ts): the entry, the plasma and the
// title card are there. For them the arrival here ends at orbit insertion —
// transit, approach, and a short burn onto a low orbit (`orbit`) — calm,
// with nothing on the hull. Proxima b keeps the whole run here.

import { isGlobeWorld } from '@/lib/solar-system/planet-frame';

export type ApproachPhase = 'transit' | 'approach' | 'entry' | 'burn' | 'glide' | 'orbit' | 'done';
/** Which run: the entry through air, the burn over vacuum, or — for the
 *  worlds flown down from orbit in their own scene — orbit insertion. */
export type ApproachProfile = 'air' | 'airless' | 'orbit';

export interface ApproachLeg {
  phase: ApproachPhase;
  seconds: number;
  /** How far down to the handover height the leg gets, 0…1 — a fraction of
   *  the way rather than a height, so the run is the same eleven seconds
   *  whether it was asked for from a low pass or from halfway across the
   *  system. */
  drop: number;
  /** How far around the body the ship has swung by the end, 0…1. */
  swing: number;
  /** How far the nose has come down from along-track to straight down, 0…1. */
  pitch: number;
}

/** Fourteen seconds: long enough to read as a journey, short enough that
 *  nobody who has seen it twice resents it — and it can be skipped. The
 *  nose ends well down but not vertical: the ship comes out of the glide
 *  flying low over the ground, the way the surface then shows it. */
export const APPROACH_LEGS: ApproachLeg[] = [
  { phase: 'transit', seconds: 3.5, drop: 0.5, swing: 0.3, pitch: 0 },
  { phase: 'approach', seconds: 3.5, drop: 0.8, swing: 0.8, pitch: 0.3 },
  { phase: 'entry', seconds: 4, drop: 0.95, swing: 1, pitch: 0.7 },
  { phase: 'glide', seconds: 3, drop: 1, swing: 1, pitch: 0.6 },
];
/** The same run over a world with no air: the entry is a burn. */
export const AIRLESS_LEGS: ApproachLeg[] = APPROACH_LEGS.map((l) => (l.phase === 'entry' ? { ...l, phase: 'burn' } : l));
export const APPROACH_SECONDS = APPROACH_LEGS.reduce((s, l) => s + l.seconds, 0);
/** The run to orbit insertion, on the same fourteen-second clock: in, round
 *  to the side home is on, and onto a low orbit with the nose along the
 *  track and a little down, the world filling the lower half of the glass. */
export const ORBIT_LEGS: ApproachLeg[] = [
  { phase: 'transit', seconds: 4, drop: 0.5, swing: 0.3, pitch: 0 },
  { phase: 'approach', seconds: 5, drop: 0.85, swing: 0.85, pitch: 0.12 },
  { phase: 'orbit', seconds: 5, drop: 1, swing: 1, pitch: 0.1 },
];
/** Where orbit insertion leaves the ship, in body radii: above the drawn
 *  air of every world the orrery shows, so the orbit reads as space. */
export const ORBIT_END_RADII = 1.16;
/** Where the ship hands the crew to the surface: just over it, low enough
 *  that the surface scene's own descent picks up where the glide left off. */
export const APPROACH_END_RADII = 1.02;
/** Top of the air over each landing site, as a multiple of its radius
 *  (1 = airless) — the flight world's bodies carry the same number for the
 *  planets the orrery draws; this is the source for the sites it does not. */
export const SITE_ATMOSPHERE: Record<string, number> = { moon: 1, mars: 1.15, proximaB: 1.12, earth: 1.1 };
/** Whether the way down to `site` has air to burn in. The site's own table
 *  wins over the body the flight world found, so the Moon is airless even
 *  where a body of that id says otherwise. */
export function isAirlessSite(site: string, bodyAtmosphere?: number): boolean {
  const a = SITE_ATMOSPHERE[site] ?? bodyAtmosphere ?? 1;
  return a <= 1.0001;
}
/** The profile for a site: orbit insertion for the worlds flown down from
 *  orbit in their own scene, and otherwise the entry or the burn. */
export function approachProfileFor(site: string, bodyAtmosphere?: number): ApproachProfile {
  if (isGlobeWorld(site)) return 'orbit';
  return isAirlessSite(site, bodyAtmosphere) ? 'airless' : 'air';
}
/** `true`/`false` are the older airless flag: the burn, or the entry. */
const profileOf = (p: boolean | ApproachProfile | undefined): ApproachProfile => (p === true ? 'airless' : p === false || p === undefined ? 'air' : p);
export const legsFor = (airless: boolean | ApproachProfile): ApproachLeg[] => {
  const p = profileOf(airless);
  return p === 'orbit' ? ORBIT_LEGS : p === 'airless' ? AIRLESS_LEGS : APPROACH_LEGS;
};
/** The run never starts from further out than this, so crossing the system
 *  is the same eleven seconds as dropping out of orbit. */
export const APPROACH_MAX_RADII = 42;
/** Nor from closer in than the handover height: there has to be a way down. */
export const APPROACH_MIN_RADII = 1.25;

export interface ApproachPose {
  phase: ApproachPhase;
  /** 0…1 through the current leg. */
  legT: number;
  /** 0…1 through the whole arrival. */
  t: number;
  /** Where the ship is, in body radii from its centre. */
  radii: number;
  /** 0…1 from the direction the ship was in to the one it lands from. */
  swing: number;
  /** 0…1 from flying along the track to looking straight down. */
  pitch: number;
  done: boolean;
}

const smooth = (x: number) => x * x * (3 - 2 * x);
const unit = (x: number) => Math.min(1, Math.max(0, x));
/** 0…1 through [a, b], eased. */
const ramp = (x: number, a: number, b: number) => smooth(unit((x - a) / (b - a)));

/** When the third leg — the entry, the burn or the insertion — begins and ends, and when the whole run ends. */
function marks(profile: ApproachProfile = 'air'): { entryStart: number; entryEnd: number; end: number } {
  const legs = legsFor(profile);
  const entryStart = legs[0].seconds + legs[1].seconds;
  const entryEnd = entryStart + legs[2].seconds;
  return { entryStart, entryEnd, end: legs.reduce((s, l) => s + l.seconds, 0) };
}

/** The plasma, 0…1: nothing until the air, a fast rise through the first
 *  second of the entry, full through its middle, and cooling off through
 *  the glide so the hull is dark again by the time the ground is close.
 *  Airless worlds never heat. */
export function entryHeat(elapsed: number, airless: boolean | ApproachProfile = false): number {
  if (profileOf(airless) !== 'air') return 0;
  const { entryStart, entryEnd, end } = marks();
  const rise = ramp(elapsed, entryStart, entryStart + 1.2);
  const cool = 1 - ramp(elapsed, entryEnd - 0.4, end - 0.8);
  return rise * cool;
}

/** How hard the engines flare against the fall, 0…1. In vacuum the whole
 *  third leg is a retro burn; in air the engines only come up for the last
 *  of the glide, once the plasma has done the braking. */
export function descentBurn(elapsed: number, airless: boolean | ApproachProfile = false): number {
  const profile = profileOf(airless);
  if (profile === 'orbit') {
    // The insertion: the engines come up as the ship swings onto the
    // orbit and go quiet before the end, coasting when the surface takes it.
    const { entryStart, entryEnd } = marks('orbit');
    return 0.7 * ramp(elapsed, entryStart, entryStart + 0.8) * (1 - ramp(elapsed, entryEnd - 2.2, entryEnd - 0.8));
  }
  const { entryStart, entryEnd, end } = marks();
  if (profile === 'airless') {
    const up = ramp(elapsed, entryStart, entryStart + 0.7);
    const ease = 1 - 0.4 * ramp(elapsed, entryEnd, end);
    return up * ease;
  }
  return 0.5 * ramp(elapsed, entryEnd - 0.6, entryEnd + 1.2);
}

/** The world's name across the glass, 0…1 opacity: up a beat into the
 *  entry, held while the air does its work, gone before the ground fills
 *  the windscreen. */
export function titleCard(elapsed: number, profile: ApproachProfile = 'air'): number {
  // Orbit insertion carries no card here: the surface scene puts it up over the orbit.
  if (profile === 'orbit') return 0;
  const { entryStart, end } = marks();
  const on = ramp(elapsed, entryStart + 0.3, entryStart + 1.3);
  const off = 1 - ramp(elapsed, end - 1.9, end - 0.5);
  return on * off;
}

/** Where the arrival is at `elapsed` seconds, having begun `startRadii` out. */
export function approachPose(elapsed: number, startRadii: number, airless: boolean | ApproachProfile = false): ApproachPose {
  const profile = profileOf(airless);
  const endRadii = profile === 'orbit' ? ORBIT_END_RADII : APPROACH_END_RADII;
  const from = Math.min(APPROACH_MAX_RADII, Math.max(profile === 'orbit' ? ORBIT_END_RADII + 0.05 : APPROACH_MIN_RADII, startRadii));
  const height = (drop: number) => from + (endRadii - from) * drop;
  const total = marks(profile).end;
  const clock = Math.max(0, elapsed);
  let t0 = 0;
  let drop = 0;
  let swing = 0;
  let pitch = 0;
  for (const leg of legsFor(airless)) {
    const legT = Math.min(1, Math.max(0, (clock - t0) / leg.seconds));
    if (legT < 1) {
      const e = smooth(legT);
      return {
        phase: leg.phase,
        legT,
        t: Math.min(1, clock / total),
        radii: height(drop + (leg.drop - drop) * e),
        swing: swing + (leg.swing - swing) * e,
        pitch: pitch + (leg.pitch - pitch) * e,
        done: false,
      };
    }
    t0 += leg.seconds;
    drop = leg.drop;
    swing = leg.swing;
    pitch = leg.pitch;
  }
  return { phase: 'done', legT: 1, t: 1, radii: height(drop), swing, pitch, done: true };
}
