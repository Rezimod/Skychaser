import type { AuthoredCard, Family } from './build';

/** First Light's families, in the set's order; the Almanac by date. */
export const SET_GROUPS: Array<{ key: Family; title: string; short: string }> = [
  { key: 'near', title: 'The Solar System', short: 'Solar System' },
  { key: 'stars', title: 'The Stars', short: 'Stars' },
  { key: 'deep', title: 'The Deep Sky', short: 'Deep Sky' },
  { key: 'galaxies', title: 'The Galaxies', short: 'Galaxies' },
  { key: 'extremes', title: 'The Extremes', short: 'Extremes' },
  { key: 'sights', title: 'Rare Sights', short: 'Rare Sights' },
  { key: 'almanac', title: 'Meteors & Moons', short: 'Meteors & Moons' },
  { key: 'instruments', title: 'The Telescopes', short: 'Telescopes' },
  { key: 'treasures', title: 'The Treasures', short: 'Treasures' },
];

export function groupCards(cards: AuthoredCard[], family: Family): AuthoredCard[] {
  const of = cards.filter((c) => c.record.family === family);
  if (family === 'almanac') of.sort((a, b) => a.record.eventStartUtc!.localeCompare(b.record.eventStartUtc!));
  return of;
}
