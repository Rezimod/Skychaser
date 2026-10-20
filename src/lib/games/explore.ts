// Stellar Explore — what a finished mission on the Moon is worth, server-safe.
//
// The game keeps its own records on the device (achievements.ts). This is
// the other half: which of those records the platform pays Stars for, and
// how many. Pure constants, no React, no fetch: the award route, the game
// shell and the /missions card all read the same table.

export const EXPLORE_GAME_ID = 'explore';

/** Stars per achievement id, once per wallet, ever. Ordered as the crew
 *  meets them: the first walk, the base jobs, then the crater. */
export const EXPLORE_ACHIEVEMENT_STARS: Readonly<Record<string, number>> = Object.freeze({
  'explore.first_steps': 10,
  'explore.earthrise_photo': 10,
  'explore.power_restored': 15,
  'explore.telescope_calibrated': 20,
  'explore.comms_restored': 15,
  'explore.lunar_geology': 25,
});

/** Every rewardable id, in the order above. */
export const EXPLORE_ACHIEVEMENT_IDS: readonly string[] = Object.freeze(Object.keys(EXPLORE_ACHIEVEMENT_STARS));

/** The most a wallet can earn from Explore, all records in. */
export const EXPLORE_MAX_STARS: number = Object.values(EXPLORE_ACHIEVEMENT_STARS).reduce((a, b) => a + b, 0);

export function isExploreAchievement(id: unknown): id is string {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(EXPLORE_ACHIEVEMENT_STARS, id);
}

/** Stars for an id, or 0 for one the platform does not pay for. */
export function exploreStarsFor(id: string): number {
  return isExploreAchievement(id) ? EXPLORE_ACHIEVEMENT_STARS[id] : 0;
}

/** The ledger row name for one achievement: `game:explore:explore.first_steps`. */
export function exploreLedgerTarget(id: string): string {
  return `game:${EXPLORE_GAME_ID}:${id}`;
}

/** The `game` column in game_daily_plays: one row per achievement, not per day. */
export function exploreLedgerGame(id: string): string {
  return `${EXPLORE_GAME_ID}:${id}`;
}

/** What the server reports back for one wallet. */
export interface ExploreCredit {
  id: string;
  stars: number;
  /** ISO time the award was recorded. */
  at: string;
}

export interface ExploreProgress {
  credited: ExploreCredit[];
  totalStars: number;
  maxStars: number;
}
