/**
 * What holding a card gives, by its rarity. One rule per tier:
 *
 * - Legendary: the meteorites and the moon rock. The card carries the piece of
 *   it that it shows.
 * - Epic: the planets. Each edition is a 30-minute session on Live Telescope V1.
 * - Rare: everything else Live Telescope V1 will point at: the objects it can
 *   photograph and the dated night-sky events. Each edition is an entry in the
 *   draw for a visitor's seat at a live session.
 * - Common: the rest. Each edition votes on the night's target, and the cards
 *   that were the set's headliners vote harder.
 *
 * Every edition votes; the tiers above common vote with a fixed weight.
 * PROVISIONAL (Gate 4): sessions and visitor seats open with the telescope,
 * which is commissioning.
 */

import type { Rarity } from '@/lib/rarity';

/** How long one Epic session lasts. */
export const SESSION_MINUTES = 30;

/** Commons that vote three times: the set's former headliners. */
const VOTE_3 = new Set(['APOLLO-11', 'AURORA', 'CARTWHEEL', 'CMB', 'EARTHRISE', 'ETA-CARINAE', 'FIRST-LIGHT', 'GREAT-ECLIPSE', 'HALLEY', 'HUBBLE-DEEP-FIELD', 'M1', 'M87', 'MILKY-WAY', 'PLUTO', 'TON-618', 'TOTAL-ECLIPSE', 'VENUS-TRANSIT']);

/** Commons that vote twice. */
const VOTE_2 = new Set(['ALPHA-CEN', 'ANTARES', 'BLOOD-MOON', 'CARINA', 'CEN-A', 'CHICXULUB', 'ENCELADUS', 'HALE-BOPP', 'HELIX', 'HORSEHEAD', 'IO', 'JWST', 'LEONIDS', 'M104', 'M31', 'M51', 'OMEGA-CEN', 'OUMUAMUA', 'RING-OF-FIRE', 'SL9', 'SN-1987A', 'SUN', 'TARANTULA', 'TRAPPIST-1']);

/** What one edition adds to its holder's vote for the night's target. */
export function votePower(designation: string, rarity: Rarity): number {
  if (rarity === 'common') return VOTE_3.has(designation) ? 3 : VOTE_2.has(designation) ? 2 : 1;
  return rarity === 'rare' ? 4 : 5;
}

export type Perk = {
  /** A few words, for a list or the card page: "30-min session". */
  short: string;
  /** Fewer still, for a shelf tile: "Session". */
  tile: string;
  /** The reason band on the card's face, role then gift: "Pilot · 30-min session". */
  reason: string;
  /** What it is, in one sentence. */
  line: string;
  /** Not open yet: the telescope perks wait for Live Telescope V1, which is commissioning. */
  soon: boolean;
};

export function perkFor(designation: string, rarity: Rarity): Perk {
  switch (rarity) {
    case 'legendary':
      return { short: 'Real specimen', tile: 'Real specimen', reason: 'Redeem · Real specimen', line: 'Carries a real piece of the meteorite it shows, sent to its holder.', soon: false };
    case 'epic':
      return { short: `${SESSION_MINUTES}-min session`, tile: 'Session', reason: `Pilot · ${SESSION_MINUTES}-min session`, line: `Each edition is a ${SESSION_MINUTES}-minute session on the Live Telescope.`, soon: true };
    case 'rare':
      return { short: 'Visitor seat', tile: 'Visitor seat', reason: 'Visitor · Live seat', line: 'Each edition enters the draw for a visitor’s seat at a live session.', soon: true };
    default: {
      const v = votePower(designation, rarity);
      return { short: `Vote ×${v}`, tile: `Vote ×${v}`, reason: `Vote ×${v} · Tonight’s target`, line: `Each edition adds ${v} to its holder’s vote on the night’s target.`, soon: false };
    }
  }
}

/**
 * What a card unlocks, in one line: under the card after the reveal, and on the
 * Genesis tier tiles. The telescope perks always wait for first light.
 */
export function perkLine(rarity: Rarity, name = 'the stone it shows'): string {
  switch (rarity) {
    case 'legendary':
      return `A real piece of ${name}. Redeemable — we’ll be in touch.`;
    case 'epic':
      return `A ${SESSION_MINUTES}-minute session at the telescope — yours to book after first light.`;
    case 'rare':
      return 'You’re in the draw for a seat at a live session — after first light.';
    default:
      return 'Your vote on the night — counts ×1 to ×3.';
  }
}

/** What each tier gives, for the guide under the odds, from common up to legendary. */
export const TIER_PERKS: { rarity: Rarity; title: string; line: string; soon: boolean }[] = [
  { rarity: 'common', title: 'Nightly vote', line: perkLine('common'), soon: false },
  { rarity: 'rare', title: 'Visitor seat', line: perkLine('rare'), soon: true },
  { rarity: 'epic', title: `${SESSION_MINUTES}-min session`, line: perkLine('epic'), soon: true },
  { rarity: 'legendary', title: 'Real meteorite', line: perkLine('legendary'), soon: false },
];
