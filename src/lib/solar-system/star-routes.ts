// The hyperdrive's routes: the systems a ship can drop into and how far
// apart they are. Alpha Centauri is the real 4.37 light years; the third
// system is the black hole — Gargantua from Interstellar, a galaxy away
// through the wormhole, and the deck calls it simply "the black hole", so
// the id stays `gargantua` and only the translations carry the name.

export const STAR_SYSTEMS = ['sol', 'alphaCentauri', 'gargantua'] as const;
export type StarSystemId = (typeof STAR_SYSTEMS)[number];

const CENTAURI_LY = 4.37;
const GARGANTUA_LY = 10_000_000_000;

export function lightYearsBetween(a: string, b: string): number {
  if (a === b) return 0;
  return a === 'gargantua' || b === 'gargantua' ? GARGANTUA_LY : CENTAURI_LY;
}

/** The chosen destination, unless it is where the ship already is — then the
 *  default hop: out to Alpha Centauri from home, home from anywhere else. */
export function resolveDestination(current: string, chosen: string): StarSystemId {
  if (chosen !== current && (STAR_SYSTEMS as readonly string[]).includes(chosen)) return chosen as StarSystemId;
  return current === 'sol' ? 'alphaCentauri' : 'sol';
}

/** Walk the destination through every system except the one the ship is in. */
export function stepDestination(current: string, chosen: string, dir: number): StarSystemId {
  const pool = STAR_SYSTEMS.filter((s) => s !== current);
  const i = pool.indexOf(resolveDestination(current, chosen));
  return pool[(i + (dir >= 0 ? 1 : -1) + pool.length) % pool.length];
}
