import { Body, Illumination, SearchAltitude } from '@/lib/solar-system/astronomy';
import { TBILISI, bodyAzAlt } from '@/lib/solar-system/world-earth-tonight';

const PLANETS: [Body, string][] = [
  [Body.Mercury, 'Mercury'], [Body.Venus, 'Venus'], [Body.Mars, 'Mars'], [Body.Jupiter, 'Jupiter'],
  [Body.Saturn, 'Saturn'], [Body.Uranus, 'Uranus'], [Body.Neptune, 'Neptune'],
];
/** The sky counts as dark enough for planets once the Sun is this far down. */
const SUN_DOWN = -6;
/** A planet counts as up once it clears this altitude, above haze and rooftops. */
const MIN_ALT = 10;
const STEP_MS = 10 * 60_000;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export type TonightPlanet = {
  name: string;
  from: Date;
  to: Date;
  best: Date;
  alt: number;
  dir: string;
  mag: number;
  /** Needs a telescope or binoculars: fainter than the eye sees from a city. */
  scope: boolean;
};

/** The dark hours from now or this evening until dawn, over Tbilisi. */
export function tonightWindow(now: Date): { start: Date; end: Date } {
  const start = bodyAzAlt(Body.Sun, now).alt <= SUN_DOWN ? now : SearchAltitude(Body.Sun, TBILISI, -1, now, 1.2, SUN_DOWN)!.date;
  const end = SearchAltitude(Body.Sun, TBILISI, +1, start, 1.2, SUN_DOWN)!.date;
  return { start, end };
}

/** Each planet above 10° in a dark sky tonight, in the order they are best seen. */
export function planetsTonight(now = new Date()): { start: Date; end: Date; planets: TonightPlanet[] } {
  const { start, end } = tonightWindow(now);
  const planets: TonightPlanet[] = [];
  for (const [body, name] of PLANETS) {
    let from: Date | null = null, to: Date | null = null, best = start, top = -90, az = 0;
    for (let t = start.getTime(); t <= end.getTime(); t += STEP_MS) {
      const d = new Date(t);
      const p = bodyAzAlt(body, d);
      if (p.alt < MIN_ALT) continue;
      from ??= d;
      to = d;
      if (p.alt > top) { top = p.alt; best = d; az = p.az; }
    }
    if (!from || !to) continue;
    const mag = Illumination(body, best).mag;
    planets.push({ name, from, to, best, alt: Math.round(top), dir: COMPASS[Math.round(az / 45) % 8], mag: Math.round(mag * 10) / 10, scope: mag > 5.5 });
  }
  planets.sort((a, b) => a.best.getTime() - b.best.getTime());
  return { start, end, planets };
}
