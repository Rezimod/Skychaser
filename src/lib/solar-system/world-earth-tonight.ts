// What is really in the sky over Tbilisi: the Sun and Moon for the scene's
// light, dusk for the rooftop, and the thing worth pointing a telescope at
// tonight. Everything comes from astronomy-engine for the app's own default
// observer — the same numbers /sky shows.

import { Body, Equator, Horizon, Illumination, MoonPhase, Observer, SearchAltitude } from 'astronomy-engine';
import { DEFAULT_OBSERVER } from '@/lib/observer-location';
import { BRIGHT_STARS } from '@/lib/sky/stars';
import { raDecToAzAlt } from '@/lib/sky/catalog';

export const TBILISI = new Observer(DEFAULT_OBSERVER.lat, DEFAULT_OBSERVER.lon, 490);
/** Tbilisi keeps UTC+4 all year. */
export const TBILISI_UTC_OFFSET_H = 4;
/** The rooftop session starts once the Sun is this far down: planets out, the city lit. */
export const DUSK_ALT = -8;

export interface AzAlt { az: number; alt: number }

export function bodyAzAlt(body: Body, date: Date, observer = TBILISI): AzAlt {
  const eq = Equator(body, date, observer, true, true);
  const hor = Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { az: hor.azimuth, alt: hor.altitude };
}

/** Scene direction for an azimuth (from north, clockwise) and altitude: x east, y up, −z north. */
export function azAltToDir(az: number, alt: number, out: { x: number; y: number; z: number }) {
  const a = (az * Math.PI) / 180; const e = (alt * Math.PI) / 180;
  out.x = Math.sin(a) * Math.cos(e);
  out.y = Math.sin(e);
  out.z = -Math.cos(a) * Math.cos(e);
  return out;
}

export function moonState(date: Date) {
  const pos = bodyAzAlt(Body.Moon, date);
  const ill = Illumination(Body.Moon, date);
  return { ...pos, phaseAngle: MoonPhase(date), fraction: ill.phase_fraction };
}

/** When the scene should be for the rooftop: now if it is already dark enough, otherwise this evening's dusk. */
export function duskFor(now: Date): Date {
  if (bodyAzAlt(Body.Sun, now).alt <= DUSK_ALT) return now;
  const found = SearchAltitude(Body.Sun, TBILISI, -1, now, 1.2, DUSK_ALT);
  return found ? found.date : now;
}

export type TargetKind = 'planet' | 'moon' | 'star';
export interface SkyTarget {
  id: string;
  kind: TargetKind;
  az: number;
  alt: number;
  mag: number;
  /** Apparent diameter, arcseconds (0 for a star). */
  size: number;
  /** Lit fraction of the disc, 0…1. */
  phase: number;
}

/** Equatorial diameters, km — for the apparent size in the eyepiece. */
const DIAMETER_KM: Partial<Record<Body, number>> = {
  [Body.Mercury]: 4879, [Body.Venus]: 12104, [Body.Mars]: 6779, [Body.Jupiter]: 139820, [Body.Saturn]: 116460, [Body.Moon]: 3474.8,
};
const AU_KM = 149597870.7;
/** What an Astroman customer with a new scope would want first. */
const PREFERENCE: [Body, string, TargetKind][] = [
  [Body.Saturn, 'saturn', 'planet'], [Body.Jupiter, 'jupiter', 'planet'], [Body.Moon, 'moon', 'moon'],
  [Body.Mars, 'mars', 'planet'], [Body.Venus, 'venus', 'planet'], [Body.Mercury, 'mercury', 'planet'],
];

/**
 * The best thing up at `date` above the real skyline: `horizon(az)` is the
 * altitude of the ground and roofs in that direction, degrees. Falls back to
 * the brightest star that clears it.
 */
export function pickTarget(date: Date, horizon: (az: number) => number = () => 0): SkyTarget {
  const clears = (az: number, alt: number) => alt >= Math.max(10, horizon(az) + 3);
  for (const [body, id, kind] of PREFERENCE) {
    const { az, alt } = bodyAzAlt(body, date);
    if (!clears(az, alt)) continue;
    const ill = Illumination(body, date);
    // A moon too thin to see in a lit city sky is no first light.
    if (kind === 'moon' && ill.phase_fraction < 0.08) continue;
    const km = ill.geo_dist * AU_KM;
    const size = ((DIAMETER_KM[body] ?? 0) / km) * 206264.806;
    return { id, kind, az, alt, mag: ill.mag, size, phase: ill.phase_fraction };
  }
  let best: SkyTarget | null = null;
  for (const s of BRIGHT_STARS) {
    const { azimuth, altitude } = raDecToAzAlt(s.ra, s.dec, TBILISI.latitude, TBILISI.longitude, date);
    if (!clears(azimuth, altitude)) continue;
    if (!best || s.mag < best.mag) best = { id: s.id, kind: 'star', az: azimuth, alt: altitude, mag: s.mag, size: 0, phase: 1 };
  }
  // Polaris never sets from Tbilisi; this is only reached under a fully blocked sky.
  return best ?? { id: 'polaris', kind: 'star', az: 0.6, alt: 42, mag: 1.98, size: 0, phase: 1 };
}

/** Local Tbilisi clock time, "HH:MM". */
export function tbilisiClock(date: Date): string {
  const d = new Date(date.getTime() + TBILISI_UTC_OFFSET_H * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
