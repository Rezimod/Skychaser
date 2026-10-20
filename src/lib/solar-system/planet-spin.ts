import type { SolarBodyId } from '@/lib/solar-system/ephemeris';

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;

/**
 * Sidereal rotation periods (ms). Negative = retrograde (westward).
 * Used so spin phase tracks simulation time (`epochMs`) when playback is on.
 */
const SIDEREAL_ROTATION_MS: Record<SolarBodyId, number> = {
  sun: MS_DAY * 25.38,
  mercury: MS_DAY * 58.646,
  venus: -MS_DAY * 243.018,
  earth: MS_DAY * 0.99726968,
  mars: MS_DAY * 1.02595675,
  jupiter: 9.9258 * MS_HOUR,
  saturn: 10.656 * MS_HOUR,
  uranus: -17.24 * MS_HOUR,
  neptune: 16.11 * MS_HOUR,
  pluto: -MS_DAY * 6.3872304,
};

/**
 * Axial tilt (obliquity to orbit, degrees), folded into [0, 90] — bodies whose
 * IAU obliquity exceeds 90° (Venus 177.4°, Uranus 97.8°, Pluto 122.5°) carry
 * the flip as a negative rotation period above instead, so tilt + spin sign
 * together reproduce the true pole orientation and spin direction.
 */
export const AXIAL_TILT_DEG: Record<SolarBodyId, number> = {
  sun: 7.25,
  mercury: 0.03,
  venus: 2.64,
  earth: 23.44,
  mars: 25.19,
  jupiter: 3.13,
  saturn: 26.73,
  uranus: 82.23,
  neptune: 28.32,
  pluto: 57.47,
};

/** Phase in radians for Y-axis rotation at `epochMs`. */
export function siderealSpinY(id: SolarBodyId, epochMs: number): number {
  const T = SIDEREAL_ROTATION_MS[id];
  if (!T || T === 0) return 0;
  const sign = T < 0 ? -1 : 1;
  const period = Math.abs(T);
  return sign * ((epochMs / period) * Math.PI * 2);
}
