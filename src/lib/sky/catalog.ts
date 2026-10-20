// Stellar deep-sky catalog.
//
// Source of truth for every fixed celestial target Stellar can guide a user
// to. Planets, Sun, and Moon are computed live by astronomy-engine in the
// finder API and aren't listed here — but their type/difficulty/instrument
// metadata IS, in `PLANET_META`, so the UI can treat them uniformly.
//
// Coordinates are stored as J2000 RA (hours) / Dec (degrees). They are
// precessed to equator-of-date at render time (see precessJ2000ToDate) so
// catalog stars/DSOs line up with the of-date planets/Sun; the ~0.4° J2000
// drift is perceptible in an AR finder.
//
// Naming: every entry has an `id` (lowercase ascii, slash-free, e.g. 'm31',
// 'sirius'). Display names + recognition copy live in i18n under
// `sky.catalog.<id>.name` / `.recognize` for EN + KA.

import {
  AstroTime, Spherical, VectorFromSphere, RotateVector,
  Rotation_EQJ_EQD, EquatorFromVector,
} from 'astronomy-engine';

export type CatalogType =
  | 'planet'
  | 'star'
  | 'double'
  | 'cluster'
  | 'nebula'
  | 'galaxy'
  | 'moon'
  | 'sun';

export type CatalogDifficulty = 'easy' | 'medium' | 'hard';
export type CatalogInstrument = 'naked' | 'binoculars' | 'telescope';

/** Static catalog entry — anything with fixed RA/Dec. */
export interface CatalogTarget {
  id: string;
  type: CatalogType;
  difficulty: CatalogDifficulty;
  instrument: CatalogInstrument;
  /** J2000 right ascension in hours, 0..24. */
  ra: number;
  /** J2000 declination in degrees, -90..+90. */
  dec: number;
  /** Apparent visual magnitude. Lower = brighter. */
  magnitude: number;
  /** English short constellation name (e.g. 'Lyra'). */
  constellation: string;
  /** Optional anchor for star-hop hint: id of a brighter, easier-to-find body. */
  hopFromId?: string;
  /** Display fallback if i18n key is missing. */
  fallbackName: string;
}

/** Runtime metadata for the planets/sun/moon computed by astronomy-engine. */
export interface DynamicMeta {
  type: CatalogType;
  difficulty: CatalogDifficulty;
  instrument: CatalogInstrument;
  fallbackName: string;
}

export const PLANET_META: Record<string, DynamicMeta> = {
  sun:     { type: 'sun',    difficulty: 'easy',   instrument: 'naked',      fallbackName: 'Sun' },
  moon:    { type: 'moon',   difficulty: 'easy',   instrument: 'naked',      fallbackName: 'Moon' },
  venus:   { type: 'planet', difficulty: 'easy',   instrument: 'naked',      fallbackName: 'Venus' },
  jupiter: { type: 'planet', difficulty: 'easy',   instrument: 'naked',      fallbackName: 'Jupiter' },
  mars:    { type: 'planet', difficulty: 'easy',   instrument: 'naked',      fallbackName: 'Mars' },
  saturn:  { type: 'planet', difficulty: 'medium', instrument: 'naked',      fallbackName: 'Saturn' },
  mercury: { type: 'planet', difficulty: 'medium', instrument: 'naked',      fallbackName: 'Mercury' },
  uranus:  { type: 'planet', difficulty: 'hard',   instrument: 'binoculars', fallbackName: 'Uranus' },
  neptune: { type: 'planet', difficulty: 'hard',   instrument: 'telescope',  fallbackName: 'Neptune' },
};

/* ============================================================
   === Static targets — bright stars, doubles, DSOs           ===
   ============================================================ */

export const CATALOG: CatalogTarget[] = [
  /* Two brightest stars visible from northern latitudes. */
  { id: 'sirius',     type: 'star',   difficulty: 'easy',   instrument: 'naked',
    ra: 6.752,  dec: -16.716, magnitude: -1.46, constellation: 'Canis Major',
    fallbackName: 'Sirius' },
  { id: 'arcturus',   type: 'star',   difficulty: 'easy',   instrument: 'naked',
    ra: 14.261, dec: 19.182,  magnitude: -0.05, constellation: 'Boötes',
    fallbackName: 'Arcturus' },

  /* Andromeda — the only galaxy a beginner can find with binoculars. */
  { id: 'm31',        type: 'galaxy', difficulty: 'medium', instrument: 'binoculars',
    ra: 0.712,  dec: 41.269,  magnitude: 3.4,  constellation: 'Andromeda',
    hopFromId: 'mirach',
    fallbackName: 'Andromeda Galaxy' },

  /* Two most popular nebulae: Orion (winter, naked-eye-ish) + Ring (summer, scope). */
  { id: 'm42',        type: 'nebula', difficulty: 'medium', instrument: 'binoculars',
    ra: 5.591,  dec: -5.391,  magnitude: 4.0,  constellation: 'Orion',
    hopFromId: 'rigel',
    fallbackName: 'Orion Nebula' },
  { id: 'm57',        type: 'nebula', difficulty: 'hard',   instrument: 'telescope',
    ra: 18.886, dec: 33.029,  magnitude: 8.8,  constellation: 'Lyra',
    hopFromId: 'vega',
    fallbackName: 'Ring Nebula' },
];

export const CATALOG_BY_ID = new Map(CATALOG.map((t) => [t.id, t]));

/* ============================================================
   === Coordinate math (RA/Dec → Az/Alt, rise/set, transit)   ===
   ============================================================ */

const DEG = Math.PI / 180;
const HOUR_TO_DEG = 15;
const SOLAR_TO_SIDEREAL = 1.0027379093;

function julianDate(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

/** Greenwich Mean Sidereal Time, degrees. */
function gmst(d: Date): number {
  const jd = julianDate(d);
  const t = (jd - 2451545) / 36525;
  let g =
    280.46061837 +
    360.98564736629 * (jd - 2451545) +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  g = ((g % 360) + 360) % 360;
  return g;
}

/** Local Sidereal Time, degrees. */
function lstDeg(d: Date, lonDeg: number): number {
  return ((gmst(d) + lonDeg) % 360 + 360) % 360;
}

export interface AzAlt {
  azimuth: number;
  altitude: number;
}

/**
 * Saemundsson's refraction model (Meeus 16.4) — degrees of apparent altitude
 * gain for a true altitude `altDeg`. Standard 1010 mbar / 10°C atmosphere.
 * Matches the model used for bright stars in `lib/sky/stars.ts` and the
 * 'normal' mode of astronomy-engine's `Horizon` (used for planets). Without
 * this, catalog stars/DSOs are drawn ~0.5° below where they actually appear,
 * which puts Sirius and Arcturus visibly offset from their bright-star copy.
 */
function refractionDeg(altDeg: number): number {
  if (altDeg < -1) return 0;
  const a = altDeg + 10.3 / (altDeg + 5.11);
  const r = 1.02 / Math.tan(a * DEG); // arc minutes
  return r / 60;
}

/**
 * Precess J2000 equatorial coords to equator-of-date so catalog stars/DSOs
 * align with the of-date Sun/planets (astronomy-engine). ~0.4° drift since
 * 2000 — perceptible in an AR finder. Proper motion is still ignored (µas/yr,
 * negligible for the naked-eye catalog).
 */
export function precessJ2000ToDate(
  raHours: number,
  decDeg: number,
  date: Date,
): { raHours: number; decDeg: number } {
  const time = new AstroTime(date);
  const vec = VectorFromSphere(new Spherical(decDeg, raHours * HOUR_TO_DEG, 1), time);
  const eq = EquatorFromVector(RotateVector(Rotation_EQJ_EQD(time), vec));
  return { raHours: eq.ra, decDeg: eq.dec };
}

export function raDecToAzAlt(
  raHours: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  date: Date,
): AzAlt {
  const od = precessJ2000ToDate(raHours, decDeg, date);
  const lst = lstDeg(date, lonDeg);
  const haDeg = ((lst - od.raHours * HOUR_TO_DEG) % 360 + 540) % 360 - 180;
  const ha = haDeg * DEG;
  const dec = od.decDeg * DEG;
  const lat = latDeg * DEG;

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAlt = Math.cos(alt);
  const sinAz = -Math.cos(dec) * Math.sin(ha) / cosAlt;
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (cosAlt * Math.cos(lat));
  let az = Math.atan2(sinAz, cosAz) / DEG;
  az = ((az % 360) + 360) % 360;

  const trueAlt = alt / DEG;
  const apparentAlt = trueAlt + refractionDeg(trueAlt);
  return { azimuth: az, altitude: apparentAlt };
}

export interface RiseSet {
  /** Next rise after `now`, or null if circumpolar / never up. */
  rise: Date | null;
  /** Next set after `now`, or null if circumpolar / never up. */
  set: Date | null;
  /** Always-up (true) or never-up (false) at this latitude — undefined for normal targets. */
  circumpolar?: 'always' | 'never';
}

/**
 * Analytic rise/set for a fixed RA/Dec target. Treats refraction with a
 * standard −0.5667° horizon dip (matching astronomy-engine's 'normal' mode).
 * Uses a sidereal-day approximation (good to ~4 minutes per day, far below
 * what the finder UI shows).
 */
export function computeRiseSet(
  raHours: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  now: Date,
): RiseSet {
  const HORIZON_DIP_DEG = -0.5667;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const h0 = HORIZON_DIP_DEG * DEG;

  const cosH = (Math.sin(h0) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cosH < -1) return { rise: null, set: null, circumpolar: 'always' };
  if (cosH > 1)  return { rise: null, set: null, circumpolar: 'never' };

  const Hdeg = Math.acos(cosH) / DEG;          // hour-angle, degrees
  const Hh = Hdeg / HOUR_TO_DEG;               // hour-angle, hours

  const lst = lstDeg(now, lonDeg);
  // Current hour angle wrapped to (-12, +12] hours
  const haNowDeg = ((lst - raHours * HOUR_TO_DEG) % 360 + 540) % 360 - 180;
  const haNowH = haNowDeg / HOUR_TO_DEG;

  // Hours until each event (in sidereal hours, then converted to solar).
  // Rise occurs when HA = -Hh (target ascending through the horizon).
  // Set  occurs when HA = +Hh (descending).
  const wrap24 = (x: number) => ((x % 24) + 24) % 24;
  const dRiseSidereal = wrap24(-Hh - haNowH);
  const dSetSidereal  = wrap24( Hh - haNowH);

  const dRiseMs = (dRiseSidereal / SOLAR_TO_SIDEREAL) * 3600_000;
  const dSetMs  = (dSetSidereal  / SOLAR_TO_SIDEREAL) * 3600_000;

  return {
    rise: new Date(now.getTime() + dRiseMs),
    set:  new Date(now.getTime() + dSetMs),
  };
}
