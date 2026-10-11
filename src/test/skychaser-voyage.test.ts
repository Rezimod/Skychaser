import { describe, expect, it } from 'vitest';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { VOYAGE_DESTINATIONS, destinationsFor, type Destination } from '@/lib/skychaser/voyage';
import { MEAN_RADIUS_KM } from '@/lib/solar-system/ephemeris';
import { MOON_SPECS } from '@/lib/solar-system/scene-extras';
import { PROBE_SPECS } from '@/lib/solar-system/probes';
import { NEARBY_STARS, OTHER_GALAXIES } from '@/lib/solar-system/galactic-scene';
import { STAR_SYSTEMS } from '@/lib/solar-system/star-routes';
import { isGameScene } from '@/game/save';

/** Every id the game flies to or lands on, by the kind of destination it is. */
const flyable = new Set<string>([
  ...Object.keys(MEAN_RADIUS_KM),
  'moon',
  ...MOON_SPECS.map((m) => m.name.toLowerCase()),
  ...PROBE_SPECS.map((p) => p.id),
]);
const stars = new Set(NEARBY_STARS.map((s) => s.id));
const systems = new Set<string>([...STAR_SYSTEMS.filter((s) => s !== 'sol' && s !== 'gargantua'), ...NEARBY_STARS.filter((s) => s.planets).map((s) => s.id)]);
const galaxies = new Set(OTHER_GALAXIES.map((g) => g.id));

function resolves({ kind, gameId, spot }: Destination): boolean {
  if (spot !== undefined) return false; // no surface has named spots yet
  switch (kind) {
    case 'body': return flyable.has(gameId);
    case 'surface': return gameId !== 'orbit' && isGameScene(gameId);
    case 'star': return stars.has(gameId);
    case 'system': return systems.has(gameId);
    case 'galaxy': return galaxies.has(gameId);
    case 'blackhole': return gameId === 'gargantua';
  }
}

describe('the destination table', () => {
  const entries = Object.entries(VOYAGE_DESTINATIONS);

  it.each(entries)('%s is a First Light card', (designation) => {
    expect(SET_001_CARD_BY_DESIGNATION.has(designation)).toBe(true);
  });

  it.each(entries)('%s resolves to something the game knows', (_, d) => {
    expect(resolves(d)).toBe(true);
  });

  it('covers the cards the plan names, less the ones the game cannot reach', () => {
    expect(entries).toHaveLength(37);
  });
});

describe('a holder’s destinations', () => {
  const edition = (designation: string, editionNumber: number) => ({
    designation, name: designation, editionNumber, editionSize: 30, rarity: 'rare',
  });

  it('are the held cards that have a destination, one per edition', () => {
    const got = destinationsFor([edition('M42', 3), edition('MARS', 7), edition('SIRIUS', 2)]);
    expect(got.map((d) => [d.designation, d.gameId, d.editionNumber])).toEqual([['MARS', 'mars', 7], ['SIRIUS', 'sirius', 2]]);
  });
});
