// What the rooftop telescope shows: a 70 mm f/10 refractor with a 5 mm
// eyepiece, 140×, a 52° apparent field — so the true field is about a third
// of a degree, and Jupiter is a small bright disc, as it is. Everything in
// the view is placed in the field as it stands in the sky over Tbilisi:
// "up" is the zenith, azimuth grows to the right. Jupiter's four moons come
// from astronomy-engine; Saturn's ring tilt too; the bright limb of the Moon,
// Venus or Mercury faces where the Sun really is.

import { AstroTime, Body, EquatorFromVector, GeoVector, Horizon, Illumination, JupiterMoons, Vector } from 'astronomy-engine';
import { TBILISI, bodyAzAlt, type SkyTarget } from '@/lib/solar-system/world-earth-tonight';

export const FOCAL_MM = 700;
export const EYEPIECE_MM = 5;
export const MAGNIFICATION = FOCAL_MM / EYEPIECE_MM;
export const FIELD_ARCSEC = (52 / MAGNIFICATION) * 3600;

export interface FieldObject {
  id: string;
  /** Offset from the field centre, arcsec: x toward increasing azimuth, y toward the zenith. */
  x: number;
  y: number;
  /** Apparent diameter, arcsec (0 for a point). */
  size: number;
  mag: number;
}

export interface EyepieceView {
  target: SkyTarget;
  objects: FieldObject[];
  /** Direction in the field toward the Sun, radians from up toward +x: the lit limb. */
  sunAngle: number;
  /** Saturn: ring opening (sin of tilt) and the angle of the rings' long axis from +x, radians. */
  ringOpen: number;
  axisAngle: number;
  phase: number;
}

const ARCSEC = 3600;
const toRad = Math.PI / 180;

/** Position angle on the sky, in the alt-az frame, from one point to another: 0 is up, +π/2 toward +azimuth. */
function fieldAngle(az1: number, alt1: number, az2: number, alt2: number): number {
  const dAz = (az2 - az1) * toRad; const a1 = alt1 * toRad; const a2 = alt2 * toRad;
  return Math.atan2(Math.sin(dAz) * Math.cos(a2), Math.cos(a1) * Math.sin(a2) - Math.sin(a1) * Math.cos(a2) * Math.cos(dAz));
}

function horizonOfVector(v: Vector, date: Date) {
  const eq = EquatorFromVector(v);
  const h = Horizon(date, TBILISI, eq.ra, eq.dec, 'normal');
  return { az: h.azimuth, alt: h.altitude };
}

/** The pole direction of a planet (J2000 RA/Dec, degrees) as a unit EQJ vector. */
const pole = (raDeg: number, decDeg: number, t: AstroTime) => new Vector(
  Math.cos(decDeg * toRad) * Math.cos(raDeg * toRad), Math.cos(decDeg * toRad) * Math.sin(raDeg * toRad), Math.sin(decDeg * toRad), t,
);

export function eyepieceView(target: SkyTarget, date: Date): EyepieceView {
  const objects: FieldObject[] = [{ id: target.id, x: 0, y: 0, size: target.size, mag: target.mag }];
  const sun = bodyAzAlt(Body.Sun, date);
  const sunAngle = fieldAngle(target.az, target.alt, sun.az, sun.alt);
  let ringOpen = 0; let axisAngle = 0;
  const body = ({ jupiter: Body.Jupiter, saturn: Body.Saturn } as Record<string, Body>)[target.id];
  if (body) {
    const g = GeoVector(body, date, true);
    const here = horizonOfVector(g, date);
    const len = Math.hypot(g.x, g.y, g.z);
    // A point a little way toward the planet's north pole gives the pole's direction in the field.
    const p = body === Body.Jupiter ? pole(268.057, 64.495, g.t) : pole(40.589, 83.537, g.t);
    const nudge = len * 1e-4;
    const toward = horizonOfVector(new Vector(g.x + p.x * nudge, g.y + p.y * nudge, g.z + p.z * nudge, g.t), date);
    axisAngle = fieldAngle(here.az, here.alt, toward.az, toward.alt) + Math.PI / 2;
    if (body === Body.Saturn) ringOpen = Math.abs(Math.sin((Illumination(Body.Saturn, date).ring_tilt ?? 0) * toRad));
    if (body === Body.Jupiter) {
      const moons = JupiterMoons(date);
      for (const [id, sv, mag] of [['io', moons.io, 5.0], ['europa', moons.europa, 5.3], ['ganymede', moons.ganymede, 4.6], ['callisto', moons.callisto, 5.7]] as const) {
        const m = horizonOfVector(new Vector(g.x + sv.x, g.y + sv.y, g.z + sv.z, g.t), date);
        const x = (((m.az - here.az + 540) % 360) - 180) * Math.cos(here.alt * toRad) * ARCSEC;
        const y = (m.alt - here.alt) * ARCSEC;
        objects.push({ id, x, y, size: 0, mag });
      }
    }
  }
  return { target, objects, sunAngle, ringOpen, axisAngle, phase: target.phase };
}
