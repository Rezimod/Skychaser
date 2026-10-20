/**
 * The numbers that decide what a card is worth to hold.
 *
 * One file on purpose: edition sizes, price and odds move together and are
 * argued about together. Rarer means fewer.
 *
 * PROVISIONAL. Everything below EDITION_SIZE is a placeholder until Gate 2
 * (docs/skychaser/gate-2-economics.md) is decided on real cost numbers. Change
 * them here and nowhere else. A capsule's log entry records the odds and draw
 * count it was opened under, so changing them later does not break the
 * verification of capsules already opened.
 */

import { RARITIES, type Rarity } from '@/lib/rarity';

/** How many numbered editions of one card exist, by rarity. */
export const EDITION_SIZE: Record<Rarity, number> = {
  common: 300,
  rare: 100,
  epic: 30,
  legendary: 5,
};

/** PROVISIONAL (Gate 2). Cards drawn when one capsule is opened. One since 2026-10-01; was two. */
export const CARDS_PER_CAPSULE = 1;

/**
 * PROVISIONAL (Gate 2). Chance of each rarity on a single draw, in parts per
 * ten thousand. Integers so the draw is exact arithmetic that any verifier,
 * in any language, reproduces bit for bit. Set to Genesis's supply mix:
 * 21,600 common / 1,800 rare / 270 epic / 35 legendary editions since Phobos
 * joined as the ninth epic (2026-10-20; was 240 epic and 9123/760/101/16),
 * nudged by a part in ten thousand so the fractions sum to exactly one in
 * floating point.
 */
export const RARITY_ODDS_BPS: Record<Rarity, number> = {
  common: 9112,
  rare: 759,
  epic: 113,
  legendary: 16,
};

/** The same odds as fractions of one. They sum to exactly 1. */
export const RARITY_ODDS: Record<Rarity, number> = {
  common: RARITY_ODDS_BPS.common / 10_000,
  rare: RARITY_ODDS_BPS.rare / 10_000,
  epic: RARITY_ODDS_BPS.epic / 10_000,
  legendary: RARITY_ODDS_BPS.legendary / 10_000,
};

/**
 * How long a Skychaser order's quote stands. A payment whose block time is later
 * than this is not accepted as payment: it is recorded as a refund due. A
 * capsule bought and left unpaid this long is released.
 */
export const ORDER_WINDOW_MINUTES = 15;

/** PROVISIONAL (Gate 2). What one capsule costs, in US dollars. Paid in SOL at the live rate. */
export const CAPSULE_PRICE_USD = 15;

/** PROVISIONAL (Gate 2). What one card costs bought on its own, in US dollars. */
export const DIRECT_CARD_PRICE_USD: Record<Rarity, number> = {
  common: 3,
  rare: 8,
  epic: 22,
  legendary: 95,
};

/**
 * Cards that carry a real meteorite cost what that piece sells for. Each is
 * the retail price of a dealer listing for a comparable specimen (October
 * 2026), at the weight printed on the card.
 */
export const SPECIMEN_PRICE_USD: Record<string, number> = {
  IMILAC: 125, // 4.6 g pallasite (FossilEra, 4.55 g)
  'LUNAR-FRAGMENT': 575, // 8.5 g lunar slice (FossilEra, Oued el Hamim 001, 8.47 g)
  'CANYON-DIABLO': 57, // 81 g individual (Meteorite Market, CD80-6, 80.6 g)
  GIBEON: 42, // 7.7 g piece (FossilEra, 7.69 g)
  'CAMPO-DEL-CIELO': 43, // 15 g specimen with certificate
  MUONIONALUSTA: 129, // 46 g etched slice (Galactic Stone)
  ALLENDE: 85, // 1.5 g crusted fragment (1.48 g listing)
};

/** PROVISIONAL. Limited cards are priced on their own, not by their rarity. */
export const LIMITED_PRICE_USD: Record<string, number> = {
  ROADSTER: 55,
};

/** What one card costs bought on its own: its specimen's price, a limited card's own price, or its rarity's. */
export function cardPriceUsd(designation: string, rarity: Rarity): number {
  return SPECIMEN_PRICE_USD[designation] ?? LIMITED_PRICE_USD[designation] ?? DIRECT_CARD_PRICE_USD[rarity];
}

/** The cost base Gate 2 needs, per capsule sold, in US dollars. Unknowns are zero until supplied. */
export type CapsuleCosts = {
  /** Payment processing, as a fraction of the price (0.029 for 2.9%). */
  paymentFeeRate: number;
  /** Fixed per-payment fee. */
  paymentFeeFixedUsd: number;
  /** Producing one card's contents (a printed card, if physical; 0 if digital only). */
  contentsCostPerCardUsd: number;
  fulfilmentUsd: number;
  packagingUsd: number;
  /** Expected refunds and returns, as a fraction of the price. */
  returnsRate: number;
  supportUsd: number;
  /** Live Telescope V1's running cost, spread over the capsules sold in the same period. */
  telescopeOperatingUsd: number;
};

export const UNKNOWN_COSTS: CapsuleCosts = {
  paymentFeeRate: 0,
  paymentFeeFixedUsd: 0,
  contentsCostPerCardUsd: 0,
  fulfilmentUsd: 0,
  packagingUsd: 0,
  returnsRate: 0,
  supportUsd: 0,
  telescopeOperatingUsd: 0,
};

/**
 * Gate 2's arithmetic. Contents value is what the capsule's cards would cost
 * bought one at a time; contribution margin is what one capsule leaves after
 * the costs that scale with it.
 */
export function capsuleEconomics(costs: CapsuleCosts, price = CAPSULE_PRICE_USD) {
  const valuePerDraw = RARITIES.reduce((sum, r) => sum + RARITY_ODDS[r] * DIRECT_CARD_PRICE_USD[r], 0);
  const expectedContentsValueUsd = CARDS_PER_CAPSULE * valuePerDraw;
  const variableCostUsd =
    price * (costs.paymentFeeRate + costs.returnsRate) +
    costs.paymentFeeFixedUsd +
    CARDS_PER_CAPSULE * costs.contentsCostPerCardUsd +
    costs.fulfilmentUsd +
    costs.packagingUsd +
    costs.supportUsd +
    costs.telescopeOperatingUsd;
  const contributionMarginUsd = price - variableCostUsd;
  return {
    priceUsd: price,
    expectedContentsValueUsd,
    /** Contents value over price: above 1, a capsule is cheaper than its cards bought one by one. */
    contentsValueRatio: expectedContentsValueUsd / price,
    variableCostUsd,
    contributionMarginUsd,
    contributionMarginRate: contributionMarginUsd / price,
  };
}

