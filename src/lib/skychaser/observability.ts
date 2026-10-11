/**
 * Can Live Telescope V1 photograph what this card shows?
 *
 * A card's observation_status is decided here, from the instrument and the
 * site, not typed by hand. The rule is checked in order and the first failure
 * is the reason given, most physical first:
 *
 *   1. Never high enough. A fixed object whose meridian altitude from the site
 *      stays under the safety envelope's floor (20°) is never worked.
 *   2. Too small to resolve. If the card is about a detail — a disc, a crater,
 *      a pair — that detail must be at least as large as the finer of the two
 *      real limits, which at Tbilisi is always the air: Dawes' limit for 150 mm
 *      is 0.77", typical seeing is 2.6". Europa's disc, about 1" at its best,
 *      is a point.
 *   3. Too faint to record. The integrated magnitude must be inside
 *      limitingMagnitude() for the deepest stack the node takes unattended
 *      (60 x 8 s) under the node's Bortle class.
 *   4. Too diffuse for the city. An extended object's mean surface brightness
 *      may be at most 3.5 mag/arcsec² fainter than the sky — at Bortle 8, a sky
 *      of about 18.5, that is 22.0. The Orion Nebula passes on its bright core;
 *      the Pinwheel and Triangulum galaxies do not.
 *   5. Too large for the field. An object more than three times the widest
 *      field the node can take (the f/6.3 reducer, about 41') is only ever a
 *      fragment. The Andromeda Galaxy is 178'.
 *   6. Not carried. The node photographs only what its capture path knows
 *      (SIM_TARGET_BY_ID). The one reason a code change can lift, and so the
 *      last one reported.
 *
 * Passing all six is `eligible`. `dedicated` — a showcase object the node
 * photographs as a matter of course — is withheld while the node is not
 * active: an instrument that has not yet taken a frame has no showcase. Once
 * active, it is granted only to a bright-regime target whose subject spans at
 * least ten resolution elements (26" at Tbilisi), so the frame shows structure
 * and does not wait on a dark, transparent night.
 */

import { fieldOfView, resolvingPowerArcsec, DEFAULT_SEEING_ARCSEC, TRAIN_BY_ID } from '@/lib/observatory/optics';
import { LIMITS } from '@/lib/observatory/safety';
import { SIM_TARGET_BY_ID, unattendedStack } from '@/lib/observatory/sim-targets';
import { limitingMagnitude } from '@/lib/observatory/sky-field';
import type { ObservatoryNode } from '@/lib/observatory/types';

export type ObservationStatus = 'dedicated' | 'eligible' | 'not_available';

export type ObservabilitySubject = {
  /** What the telescope is pointed at — 'jupiter' for Europa, 'moon' for a crater. */
  targetId: string;
  /** J2000 declination of a fixed object; null for a body that moves. */
  decDeg: number | null;
  /**
   * The smallest angular size the card's subject must be resolved at, in
   * arcseconds: a disc's diameter, a crater's, a double's separation. Null for
   * a point source or an object seen whole.
   */
  resolveArcsec: number | null;
  /** Integrated visual magnitude, where detection is in question. */
  magnitude: number | null;
  /** Catalogue axes of an extended fixed object, in arcminutes. */
  sizeArcmin: { major: number; minor: number } | null;
};

export type Observability = { status: ObservationStatus; reason: string };

/** Mean surface brightness may be at most this much fainter than the sky. */
export const MAX_CONTRAST_DEFICIT_MAG = 3.5;
/** A fragment no card can honestly show: larger than this many widest fields. */
export const MAX_FIELDS_ACROSS = 3;
/** Resolution elements a subject must span to be a showcase. */
export const DEDICATED_ELEMENTS = 10;

const KM_PER_AU = 149_597_870.7;
const ARCSEC_PER_RAD = 206_264.806;
/** Mean Earth–Moon distance. */
export const MOON_DISTANCE_KM = 384_400;

/** Angular size of `km` seen from `distanceKm`, in arcseconds. */
export function arcsecFromKm(km: number, distanceKm: number): number {
  return (km / distanceKm) * ARCSEC_PER_RAD;
}

export function arcsecFromKmAtAu(km: number, au: number): number {
  return arcsecFromKm(km, au * KM_PER_AU);
}

/**
 * Zenith sky brightness in mag/arcsec² for a Bortle class — a straight line
 * through the usual table: class 1 about 22.0, class 4 about 20.5, class 8
 * about 18.5.
 */
export function skyBrightness(bortle: number): number {
  return 22.0 - 0.5 * (bortle - 1);
}

/** Mean surface brightness of an elliptical object, mag/arcsec². */
export function meanSurfaceBrightness(magnitude: number, majorArcmin: number, minorArcmin: number): number {
  const areaArcsec2 = (Math.PI / 4) * majorArcmin * minorArcmin * 3600;
  return magnitude + 2.5 * Math.log10(areaArcsec2);
}

/** The finer of the two limits the site never beats: the aperture and the air. */
export function resolutionLimitArcsec(node: ObservatoryNode): number {
  return Math.max(resolvingPowerArcsec(node.instrument), DEFAULT_SEEING_ARCSEC);
}

export function observability(subject: ObservabilitySubject, node: ObservatoryNode): Observability {
  const limit = resolutionLimitArcsec(node);

  if (subject.decDeg !== null) {
    const highest = 90 - Math.abs(node.lat - subject.decDeg);
    if (highest < LIMITS.minAltitudeDeg) {
      return {
        status: 'not_available',
        reason: `Never climbs high enough in the sky: ${highest.toFixed(0)}° at best, and the Live Telescope needs ${LIMITS.minAltitudeDeg}°.`,
      };
    }
  }

  if (subject.resolveArcsec !== null && subject.resolveArcsec < limit) {
    return {
      status: 'not_available',
      reason: `Too small to see from Earth’s surface: ${formatArcsec(subject.resolveArcsec)} across, and the air blurs anything under ${limit.toFixed(1)}″.`,
    };
  }

  if (subject.magnitude !== null) {
    const { exposureSec, subs } = unattendedStack('faint');
    const faintest = limitingMagnitude(exposureSec, subs, node.bortle);
    if (subject.magnitude > faintest) {
      return {
        status: 'not_available',
        reason: `Too faint: magnitude ${subject.magnitude.toFixed(1)}, and the Live Telescope reaches ${faintest.toFixed(1)} under a city sky.`,
      };
    }
  }

  if (subject.sizeArcmin && subject.magnitude !== null) {
    const surface = meanSurfaceBrightness(subject.magnitude, subject.sizeArcmin.major, subject.sizeArcmin.minor);
    const floor = skyBrightness(node.bortle) + MAX_CONTRAST_DEFICIT_MAG;
    if (surface > floor) {
      return {
        status: 'not_available',
        reason: `Spread too thin to show through a city sky (surface brightness ${surface.toFixed(1)}; it needs ${floor.toFixed(1)}).`,
      };
    }
  }

  if (subject.sizeArcmin) {
    const widest = fieldOfView(node.instrument, TRAIN_BY_ID.get('reducer')!).widthArcmin;
    if (subject.sizeArcmin.major > MAX_FIELDS_ACROSS * widest) {
      return {
        status: 'not_available',
        reason: `Too big to fit: ${subject.sizeArcmin.major}′ across, more than ${MAX_FIELDS_ACROSS} times the Live Telescope’s widest view.`,
      };
    }
  }

  const target = SIM_TARGET_BY_ID.get(subject.targetId);
  if (!target) {
    return { status: 'not_available', reason: `Not on the Live Telescope’s list of targets yet.` };
  }

  if (
    node.status === 'active' &&
    target.brightness === 'bright' &&
    subject.resolveArcsec !== null &&
    subject.resolveArcsec >= DEDICATED_ELEMENTS * limit
  ) {
    return { status: 'dedicated', reason: `A showcase: bright and large, the Live Telescope will photograph it often after first light in November.` };
  }

  return { status: 'eligible', reason: 'The Live Telescope can photograph it after first light in November.' };
}

function formatArcsec(arcsec: number): string {
  return arcsec < 0.1 ? `${arcsec.toFixed(3)}″` : `${arcsec.toFixed(1)}″`;
}
