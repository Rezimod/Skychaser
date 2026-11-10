import * as A from 'astronomy-engine';

/** A body that moves against the stars, of date, topocentric; it drifts by dra/ddec degrees an hour. */
export type SkyBody = { id: 'Moon' | 'Mars' | 'Jupiter' | 'Saturn'; ra: number; dec: number; dra: number; ddec: number; mag: number };

/** Everything the home page's night sky needs, for one night from one roof. */
export type NightSkyData = {
  lat: number;
  /** Local sidereal time at the start of the night, degrees. */
  lst0: number;
  /** Years since J2000, for precessing the catalogue. */
  years: number;
  bodies: SkyBody[];
  /** The Sun at the start (of date), to turn the Moon's lit side toward it. */
  sun: { ra: number; dec: number };
  /** The Moon's lit fraction. */
  moonLit: number;
};

const equ = (body: A.Body, t: Date, obs: A.Observer) => {
  const e = A.Equator(body, t, obs, true, true);
  return { ra: e.ra * 15, dec: e.dec };
};

export function nightSky(start: Date, lat: number, lon: number): NightSkyData {
  const obs = new A.Observer(lat, lon, 450);
  const later = new Date(start.getTime() + 2 * 3600e3);
  const bodies = (['Moon', 'Mars', 'Jupiter', 'Saturn'] as const).map((id) => {
    const a = equ(A.Body[id], start, obs);
    const b = equ(A.Body[id], later, obs);
    const dra = ((b.ra - a.ra + 540) % 360) - 180;
    return { id, ra: a.ra, dec: a.dec, dra: dra / 2, ddec: (b.dec - a.dec) / 2, mag: A.Illumination(A.Body[id], start).mag };
  });
  return {
    lat,
    lst0: (A.SiderealTime(start) * 15 + lon + 360) % 360,
    years: (start.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86400e3),
    bodies,
    sun: equ(A.Body.Sun, start, obs),
    moonLit: A.Illumination(A.Body.Moon, start).phase_fraction,
  };
}
