// A small catalog of bright stars + the Big Four constellation patterns.
// Used to give the AR overlay something more than empty sky between planets.
//
// Coordinates are J2000 RA (hours) / Dec (degrees) and visual magnitude.
// They are precessed to equator-of-date at render time (see raDecToAzAlt) so
// bright stars align with the of-date planets/Sun in the AR overlay.

import { precessJ2000ToDate } from './catalog';

export interface Star {
  id: string;
  name: string;
  ra: number;   // hours, 0..24
  dec: number;  // degrees, -90..+90
  mag: number;  // visual magnitude (lower = brighter)
}

export const BRIGHT_STARS: Star[] = [
  { id: 'sirius',     name: 'Sirius',     ra: 6.752,  dec: -16.716, mag: -1.46 },
  { id: 'canopus',    name: 'Canopus',    ra: 6.399,  dec: -52.696, mag: -0.74 },
  { id: 'rigil',      name: 'Rigil Kent.',ra: 14.660, dec: -60.834, mag: -0.27 },
  { id: 'arcturus',   name: 'Arcturus',   ra: 14.261, dec:  19.182, mag: -0.05 },
  { id: 'vega',       name: 'Vega',       ra: 18.616, dec:  38.784, mag:  0.03 },
  { id: 'capella',    name: 'Capella',    ra: 5.278,  dec:  45.998, mag:  0.08 },
  { id: 'rigel',      name: 'Rigel',      ra: 5.243,  dec:  -8.202, mag:  0.13 },
  { id: 'procyon',    name: 'Procyon',    ra: 7.655,  dec:   5.225, mag:  0.34 },
  { id: 'achernar',   name: 'Achernar',   ra: 1.629,  dec: -57.237, mag:  0.46 },
  { id: 'betelgeuse', name: 'Betelgeuse', ra: 5.919,  dec:   7.407, mag:  0.50 },
  { id: 'hadar',      name: 'Hadar',      ra: 14.064, dec: -60.373, mag:  0.61 },
  { id: 'altair',     name: 'Altair',     ra: 19.846, dec:   8.868, mag:  0.77 },
  { id: 'aldebaran',  name: 'Aldebaran',  ra: 4.598,  dec:  16.509, mag:  0.85 },
  { id: 'antares',    name: 'Antares',    ra: 16.490, dec: -26.432, mag:  0.96 },
  { id: 'spica',      name: 'Spica',      ra: 13.420, dec: -11.161, mag:  0.98 },
  { id: 'pollux',     name: 'Pollux',     ra: 7.755,  dec:  28.026, mag:  1.14 },
  { id: 'fomalhaut',  name: 'Fomalhaut',  ra: 22.961, dec: -29.622, mag:  1.16 },
  { id: 'deneb',      name: 'Deneb',      ra: 20.690, dec:  45.280, mag:  1.25 },
  { id: 'mimosa',     name: 'Mimosa',     ra: 12.795, dec: -59.689, mag:  1.30 },
  { id: 'regulus',    name: 'Regulus',    ra: 10.139, dec:  11.967, mag:  1.40 },
  { id: 'adhara',     name: 'Adhara',     ra: 6.977,  dec: -28.972, mag:  1.50 },
  { id: 'shaula',     name: 'Shaula',     ra: 17.560, dec: -37.104, mag:  1.62 },
  { id: 'castor',     name: 'Castor',     ra: 7.577,  dec:  31.888, mag:  1.58 },
  { id: 'gacrux',     name: 'Gacrux',     ra: 12.519, dec: -57.113, mag:  1.63 },
  { id: 'bellatrix',  name: 'Bellatrix',  ra: 5.418,  dec:   6.350, mag:  1.64 },
  { id: 'elnath',     name: 'Elnath',     ra: 5.438,  dec:  28.608, mag:  1.65 },
  { id: 'miaplacidus',name: 'Miaplacidus',ra: 9.220,  dec: -69.717, mag:  1.69 },
  { id: 'alnilam',    name: 'Alnilam',    ra: 5.604,  dec:  -1.202, mag:  1.69 },
  { id: 'alnitak',    name: 'Alnitak',    ra: 5.679,  dec:  -1.943, mag:  1.74 },
  { id: 'mintaka',    name: 'Mintaka',    ra: 5.533,  dec:  -0.299, mag:  2.25 },
  { id: 'alnair',     name: 'Alnair',     ra: 22.137, dec: -46.961, mag:  1.74 },
  { id: 'alioth',     name: 'Alioth',     ra: 12.900, dec:  55.960, mag:  1.77 },
  { id: 'dubhe',      name: 'Dubhe',      ra: 11.062, dec:  61.751, mag:  1.79 },
  { id: 'merak',      name: 'Merak',      ra: 11.031, dec:  56.382, mag:  2.37 },
  { id: 'phecda',     name: 'Phecda',     ra: 11.897, dec:  53.694, mag:  2.44 },
  { id: 'megrez',     name: 'Megrez',     ra: 12.257, dec:  57.033, mag:  3.32 },
  { id: 'alkaid',     name: 'Alkaid',     ra: 13.792, dec:  49.313, mag:  1.85 },
  { id: 'mizar',      name: 'Mizar',      ra: 13.399, dec:  54.925, mag:  2.27 },
  { id: 'kochab',     name: 'Kochab',     ra: 14.845, dec:  74.156, mag:  2.07 },
  { id: 'polaris',    name: 'Polaris',    ra: 2.530,  dec:  89.264, mag:  1.97 },
  { id: 'schedar',    name: 'Schedar',    ra: 0.675,  dec:  56.537, mag:  2.24 },
  { id: 'caph',       name: 'Caph',       ra: 0.153,  dec:  59.150, mag:  2.28 },
  { id: 'gamma_cas',  name: 'Cih',        ra: 0.945,  dec:  60.717, mag:  2.39 },
  { id: 'ruchbah',    name: 'Ruchbah',    ra: 1.430,  dec:  60.235, mag:  2.68 },
  { id: 'segin',      name: 'Segin',      ra: 1.907,  dec:  63.670, mag:  3.35 },
  { id: 'sadr',       name: 'Sadr',       ra: 20.371, dec:  40.257, mag:  2.23 },
  { id: 'gienah',     name: 'Gienah',     ra: 20.770, dec:  33.970, mag:  2.48 },
  { id: 'fawaris',    name: 'Fawaris',    ra: 19.749, dec:  45.131, mag:  2.87 },
  { id: 'albireo',    name: 'Albireo',    ra: 19.512, dec:  27.960, mag:  3.05 },
  // Andromeda — anchor stars used by the M31 star-hop.
  { id: 'alpheratz',  name: 'Alpheratz',  ra: 0.140,  dec:  29.090, mag:  2.06 },
  { id: 'mirach',     name: 'Mirach',     ra: 1.162,  dec:  35.621, mag:  2.05 },
  { id: 'almach',     name: 'Almach',     ra: 2.065,  dec:  42.330, mag:  2.10 },
  // Orion second foot — completes the figure (was missing).
  { id: 'saiph',      name: 'Saiph',      ra: 5.795,  dec:  -9.670, mag:  2.06 },
  // Lyra parallelogram.
  { id: 'sheliak',    name: 'Sheliak',    ra: 18.834, dec:  33.363, mag:  3.45 },
  { id: 'sulafat',    name: 'Sulafat',    ra: 18.983, dec:  32.689, mag:  3.24 },
  // Ursa Minor — pair with Polaris + Kochab.
  { id: 'pherkad',    name: 'Pherkad',    ra: 15.345, dec:  71.834, mag:  3.05 },
  // Leo lion figure.
  { id: 'denebola',   name: 'Denebola',   ra: 11.818, dec:  14.572, mag:  2.11 },
  { id: 'algieba',    name: 'Algieba',    ra: 10.333, dec:  19.842, mag:  2.08 },
  { id: 'zosma',      name: 'Zosma',      ra: 11.235, dec:  20.524, mag:  2.56 },
  // Scorpius head — pair with Antares + Shaula.
  { id: 'dschubba',   name: 'Dschubba',   ra: 16.005, dec: -22.622, mag:  2.32 },
];

/** Stick figures grouped by constellation, so the SkyMap can highlight a
 *  whole figure when the active target lives inside it. */
export const CONSTELLATION_GROUPS: Record<string, Array<[string, string]>> = {
  orion: [
    ['betelgeuse', 'bellatrix'],
    ['betelgeuse', 'alnitak'],
    ['bellatrix', 'mintaka'],
    ['mintaka', 'alnilam'],
    ['alnilam', 'alnitak'],
    // Belt-to-foot connections: west belt (Mintaka) to west foot (Rigel),
    // east belt (Alnitak) to east foot (Saiph). Earlier we had
    // alnitak→rigel which drew a crossing diagonal through the figure.
    ['mintaka', 'rigel'],
    ['alnitak', 'saiph'],
  ],
  ursaMajor: [
    ['dubhe', 'merak'],
    ['merak', 'phecda'],
    ['phecda', 'megrez'],
    ['megrez', 'alioth'],
    ['alioth', 'mizar'],
    ['mizar', 'alkaid'],
    ['megrez', 'dubhe'],
  ],
  ursaMinor: [
    ['polaris', 'kochab'],
    ['kochab', 'pherkad'],
    ['pherkad', 'polaris'],
  ],
  cassiopeia: [
    ['caph', 'schedar'],
    ['schedar', 'gamma_cas'],
    ['gamma_cas', 'ruchbah'],
    ['ruchbah', 'segin'],
  ],
  cygnus: [
    ['deneb', 'sadr'],
    ['sadr', 'albireo'],
    // East wing → ε Cyg (Gienah). West wing → δ Cyg (Fawaris).
    // Earlier we had two lines to "Aljanah" + "Gienah" which were the same
    // star (both ε Cyg) — one wing was effectively missing.
    ['sadr', 'gienah'],
    ['sadr', 'fawaris'],
  ],
  andromeda: [
    ['alpheratz', 'mirach'],
    ['mirach', 'almach'],
  ],
  lyra: [
    // Vega apex + Sheliak/Sulafat parallelogram. The IAU figure has two
    // more stars (Zeta + Delta Lyr) too faint to keep in the bright-star
    // catalog — three lines render the recognisable kite.
    ['vega', 'sheliak'],
    ['sheliak', 'sulafat'],
    ['sulafat', 'vega'],
  ],
  leo: [
    ['regulus', 'algieba'],
    ['algieba', 'zosma'],
    ['zosma', 'denebola'],
    ['denebola', 'regulus'],
  ],
  scorpius: [
    ['dschubba', 'antares'],
    ['antares', 'shaula'],
  ],
};

/** Flat list of all stick-figure segments — kept for AR overlay back-compat. */
export const CONSTELLATION_LINES: Array<[string, string]> = Object.values(CONSTELLATION_GROUPS).flat();

/**
 * For each bright star id, the constellation it belongs to (or null). Used
 * to find the "active" constellation when the user picks a hop anchor that
 * sits in a known stick figure.
 */
export const STAR_TO_CONSTELLATION: Record<string, string | undefined> = (() => {
  const out: Record<string, string | undefined> = {};
  for (const [name, lines] of Object.entries(CONSTELLATION_GROUPS)) {
    for (const [a, b] of lines) {
      out[a] = name;
      out[b] = name;
    }
  }
  return out;
})();

/* === Coordinate math === */

const DEG = Math.PI / 180;
const HOUR_TO_DEG = 15;

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

/** Local Sidereal Time, degrees, given observer longitude (east-positive). */
function lst(d: Date, lonDeg: number): number {
  return ((gmst(d) + lonDeg) % 360 + 360) % 360;
}

export interface AzAlt {
  azimuth: number;
  altitude: number;
}

/**
 * Saemundsson's refraction model (Meeus 16.4) — degrees of apparent altitude
 * gain for a true altitude `altDeg`. Standard 1010 mbar / 10°C atmosphere.
 * Used so star positions in the dome and the AR projection match what the
 * eye actually sees through a real atmosphere — without it, low stars are
 * drawn ~0.5° below their visible position.
 */
function refractionDeg(altDeg: number): number {
  if (altDeg < -1) return 0;
  const a = altDeg + 10.3 / (altDeg + 5.11);
  const r = 1.02 / Math.tan(a * DEG); // arc minutes
  return r / 60;
}

/**
 * Convert an equatorial RA/Dec coordinate to local horizontal alt/az for a
 * given observer location and time. Includes atmospheric refraction so the
 * altitude matches the apparent position rather than the geometric one.
 */
export function raDecToAzAlt(
  raHours: number,
  decDeg: number,
  latDeg: number,
  lonDeg: number,
  date: Date,
): AzAlt {
  const od = precessJ2000ToDate(raHours, decDeg, date);
  const lst_deg = lst(date, lonDeg);
  const ha_deg = ((lst_deg - od.raHours * HOUR_TO_DEG) % 360 + 540) % 360 - 180;
  const ha = ha_deg * DEG;
  const dec = od.decDeg * DEG;
  const lat = latDeg * DEG;

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  const cosAlt = Math.cos(alt);
  let az: number;
  if (cosAlt < 1e-9) {
    // Body sits at the zenith — azimuth is undefined there. Pin it to 0
    // rather than dividing by ~0 (which yields Infinity/NaN).
    az = 0;
  } else {
    // At the poles cos(lat) → 0, which would blow up the cosAz denominator.
    // Floor it at an epsilon so the result stays finite.
    const cosLat = Math.max(Math.cos(lat), 1e-9);
    const sinAz = -Math.cos(dec) * Math.sin(ha) / cosAlt;
    const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (cosAlt * cosLat);
    az = Math.atan2(sinAz, cosAz) / DEG;
    az = ((az % 360) + 360) % 360;
  }

  const trueAlt = alt / DEG;
  const apparentAlt = trueAlt + refractionDeg(trueAlt);
  return { azimuth: az, altitude: apparentAlt };
}

export interface PositionedStar extends Star {
  azimuth: number;
  altitude: number;
}

/** Pre-compute alt/az for every star at the given observer & time. */
export function positionStars(
  latDeg: number,
  lonDeg: number,
  date: Date,
): PositionedStar[] {
  return BRIGHT_STARS.map((s) => {
    const { azimuth, altitude } = raDecToAzAlt(s.ra, s.dec, latDeg, lonDeg, date);
    return { ...s, azimuth, altitude };
  });
}
