/**
 * The four capsules on the shelf, cheapest first. Each is named for something
 * brighter in the sky than the last, and the odds climb with the price. The
 * keys keep the meteorite classes they were first listed under.
 *
 * PROVISIONAL (Gate 2). A capsule is listed as one tier and keeps its odds
 * from then on (capsule.odds_bps, and its 'listed' log entry), so changing a
 * row here changes only capsules listed after. Odds are parts per ten
 * thousand and each row sums to exactly 10,000.
 *
 * Checked against First Light's supply (12,600 / 3,400 / 480 / 40 editions)
 * at a shelf of 40 / 25 / 10 / 5: the 40 legendaries last about 1,700
 * capsules, the epics about 3,000. That was at two cards a capsule; at one,
 * each lasts about twice as many capsules.
 */

import type { Rarity } from '@/lib/rarity';

export type Tier = {
  key: 'chondrite' | 'iron' | 'pallasite' | 'lunar';
  name: string;
  priceUsd: number;
  /** One line, under the name. */
  line: string;
  /** The rarity whose colour the capsule is lit in. */
  lit: Rarity;
  oddsBps: Record<Rarity, number>;
};

export const TIERS: readonly Tier[] = [
  {
    key: 'chondrite',
    name: 'Starter',
    priceUsd: 5,
    line: 'Where every collection begins',
    lit: 'common',
    oddsBps: { common: 8600, rare: 1250, epic: 140, legendary: 10 },
  },
  {
    key: 'iron',
    name: 'Explorer',
    priceUsd: 20,
    line: 'Further out, better odds',
    lit: 'rare',
    oddsBps: { common: 6000, rare: 3200, epic: 700, legendary: 100 },
  },
  {
    key: 'pallasite',
    name: 'Voyager',
    priceUsd: 50,
    line: 'Deep space, rarer finds',
    lit: 'epic',
    oddsBps: { common: 2500, rare: 5200, epic: 2000, legendary: 300 },
  },
  {
    key: 'lunar',
    name: 'Legend',
    priceUsd: 100,
    line: 'The best odds a star can give',
    lit: 'legendary',
    oddsBps: { common: 0, rare: 5300, epic: 4000, legendary: 700 },
  },
];

/** One card to a capsule (2026-10-01): it is flown home alone. Was two. */
export const CARDS_PER_TIER = 1;

export function tierByKey(key: unknown): Tier | undefined {
  return TIERS.find((t) => t.key === key);
}

/** A rarity drawn at a tier's odds, from a number in [0, 1). */
export function rarityAt(tier: Tier, u: number): Rarity {
  let at = u * 10_000;
  for (const r of ['legendary', 'epic', 'rare', 'common'] as const) {
    at -= tier.oddsBps[r];
    if (at < 0) return r;
  }
  return 'common';
}

/** Odds in basis points as a percentage, never rounded: 12.5%, 1.4%, 7%. */
export function formatOdds(bps: number): string {
  const p = bps / 100;
  return `${Number.isInteger(p) ? p : Number.isInteger(p * 10) ? p.toFixed(1) : p.toFixed(2)}%`;
}
