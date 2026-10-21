// What the glass is allowed to show, and when.
//
// The Moon HUD is a spacecraft panel, not a dashboard: a reading earns its
// place by being about to matter. The suit's numbers appear when they are low
// or when the crew asks for them; speed and height appear while there is
// motion to read. These rules are pure so they can be tested without a scene,
// and so the paint loop stays a series of small decisions rather than a pile
// of conditions.

/** Per cent oxygen at which the suit puts itself on the glass. */
export const O2_LOW = 25;
/** Per cent suit power that does the same. */
export const POWER_LOW = 30;
/** Either of them this low is not a warning any more. */
export const CRITICAL = 10;
/** How long the suit stays up after something changed it. */
export const GLANCE_SECONDS = 8;

export interface SuitGlance {
  /** Per cent. */
  o2: number;
  power: number;
  /** Seconds since the last pressure change, or a large number. */
  sinceChange: number;
  /** The crew is looking out of their own helmet: the suit is in front of them. */
  firstPerson: boolean;
  /** The jetpack's tank, 0…1, and whether it is lit; left out where there is no pack. */
  jetFuel?: number;
  jetting?: boolean;
}

export type SuitLevel = 'ok' | 'low' | 'critical';

export function suitLevel(g: { o2: number; power: number }): SuitLevel {
  if (g.o2 <= CRITICAL || g.power <= CRITICAL) return 'critical';
  if (g.o2 <= O2_LOW || g.power <= POWER_LOW) return 'low';
  return 'ok';
}

/** The jetpack meter matters while the pack is lit or the tank is still filling. */
export const JET_LOW = 0.15;
export function jetShown(g: { jetFuel?: number; jetting?: boolean }): boolean {
  return !!g.jetting || (g.jetFuel !== undefined && g.jetFuel < 0.995);
}

/** Low, just changed, asked for, or the jet in use. Otherwise the suit keeps quiet. */
export function suitShown(g: SuitGlance): boolean {
  return suitLevel(g) !== 'ok' || g.sinceChange < GLANCE_SECONDS || g.firstPerson || jetShown(g);
}

export interface MotionGlance {
  driving: boolean;
  /** m/s. */
  speed: number;
  airborne: boolean;
  /** Metres over the ground. */
  altitude: number;
}

/** Speed while there is any, height while there is air under the boots. */
export function motionShown(m: MotionGlance): { speed: boolean; altitude: boolean } {
  return {
    speed: m.driving || m.speed > 1.2,
    altitude: m.airborne && m.altitude > 0.4,
  };
}
