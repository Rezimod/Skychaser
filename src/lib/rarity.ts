/**
 * Card rarity.
 *
 * Stored on the card when a set is authored, never computed from anything a
 * holder does. How scarce a card is has nothing to do with whether Live Telescope V1 can
 * photograph it: Europa is common and cannot be resolved; Saturn is epic
 * and can.
 *
 * The tiers minted into old Skychaser observation metadata (`Skychaser`,
 * `Celestial`, `Astral`) are a different vocabulary and stay in nft-rarity.ts.
 */

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/** Scarcest last. */
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export type RarityInfo = {
  rarity: Rarity;
  /** 0 for common, rising with scarcity — for sorting a Collection. */
  rank: number;
  /** Hex on the stellar temperature ramp — the colour of a star from cool to hot: ember red, solar yellow, white-cyan, blue giant — for the plate's edge, the chip and the drawn plate. */
  color: string;
  label: string;
  /** A single character, never an emoji. */
  glyph: string;
};

const RARITY_MAP: Record<Rarity, Omit<RarityInfo, 'rarity' | 'rank'>> = {
  common: { color: '#FF6A4D', label: 'Common', glyph: '◇' },
  rare: { color: '#FFC94A', label: 'Rare', glyph: '◈' },
  epic: { color: '#8FE3FF', label: 'Epic', glyph: '◆' },
  legendary: { color: '#5B7CFF', label: 'Legendary', glyph: '✦' },
};

export function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

export function rarityInfo(rarity: Rarity): RarityInfo {
  return { rarity, rank: RARITIES.indexOf(rarity), ...RARITY_MAP[rarity] };
}
