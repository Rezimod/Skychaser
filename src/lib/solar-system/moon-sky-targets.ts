// What is actually up over Stellar Base right now.
//
// The base is on the near side, so Earth hangs almost fixed overhead: that
// direction is the local vertical. Everything else — the planets from
// astronomy-engine, and two deep-sky objects at their catalogue coordinates —
// is placed by its geocentric direction, which from the Moon is the same
// direction to well under a degree for anything past Venus. The altitude of a
// target is then 90° minus its angle from that vertical, and anything above
// the horizon (and out of the Sun's glare) can be observed from the platform.

import { Body, GeoVector, Vector } from 'astronomy-engine';

export type SkyTargetId = 'earth' | 'jupiter' | 'saturn' | 'mars' | 'venus' | 'm42' | 'm31';

export interface SkyTarget {
  id: SkyTargetId;
  /** Degrees above the base's horizon. */
  altitude: number;
  /** Degrees from the Sun: under 15° it is lost in the glare. */
  elongation: number;
}

/** J2000 right ascension (hours) and declination (degrees). */
const DEEP_SKY: Record<'m42' | 'm31', [number, number]> = {
  m42: [5.5881, -5.391],
  m31: [0.7123, 41.269],
};
const PLANETS: [SkyTargetId, Body][] = [
  ['jupiter', Body.Jupiter], ['saturn', Body.Saturn], ['mars', Body.Mars], ['venus', Body.Venus],
];

const unit = (v: { x: number; y: number; z: number }) => {
  const d = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / d, y: v.y / d, z: v.z / d };
};
const angle = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  const u = unit(a); const v = unit(b);
  return (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y + u.z * v.z))) * 180) / Math.PI;
};
function fromRaDec(raHours: number, decDeg: number) {
  const ra = (raHours / 12) * Math.PI;
  const dec = (decDeg / 180) * Math.PI;
  return { x: Math.cos(dec) * Math.cos(ra), y: Math.cos(dec) * Math.sin(ra), z: Math.sin(dec) };
}
/** Geocentric direction to a body, in equatorial J2000. */
function towards(body: Body, date: Date): Vector {
  return GeoVector(body, date, false);
}

/** Everything the platform could look at, brightest first by altitude. */
export function skyTargets(date: Date): SkyTarget[] {
  // Earth is straight up from the near side; the Moon's geocentric vector
  // points at the Moon, so the way back to Earth is the other way about.
  const moon = towards(Body.Moon, date);
  const up = { x: -moon.x, y: -moon.y, z: -moon.z };
  const sun = towards(Body.Sun, date);
  const out: SkyTarget[] = [{ id: 'earth', altitude: 90, elongation: angle(up, sun) }];
  for (const [id, body] of PLANETS) {
    const v = towards(body, date);
    out.push({ id, altitude: 90 - angle(up, v), elongation: angle(v, sun) });
  }
  for (const id of ['m42', 'm31'] as const) {
    const v = fromRaDec(...DEEP_SKY[id]);
    out.push({ id, altitude: 90 - angle(up, v), elongation: angle(v, sun) });
  }
  return out.sort((a, b) => b.altitude - a.altitude);
}

/** The ones worth pointing at: up, and clear of the Sun. */
export function observable(date: Date, limit = 3): SkyTarget[] {
  return skyTargets(date).filter((t) => t.altitude > 8 && t.elongation > 15).slice(0, limit);
}
