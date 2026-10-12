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
  /** Hex on the collector's ramp — silver, sapphire, amethyst, gold — for the plate's edge, the chip and the drawn plate. */
  color: string;
  label: string;
  /** A single character, never an emoji. */
  glyph: string;
};

const RARITY_MAP: Record<Rarity, Omit<RarityInfo, 'rarity' | 'rank'>> = {
  common: { color: '#B9C2CD', label: 'Common', glyph: '◇' },
  rare: { color: '#4A9BFF', label: 'Rare', glyph: '◈' },
  epic: { color: '#B06BFF', label: 'Epic', glyph: '◆' },
  legendary: { color: '#D8B66F', label: 'Legendary', glyph: '✦' },
};

export function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}

export function rarityInfo(rarity: Rarity): RarityInfo {
  return { rarity, rank: RARITIES.indexOf(rarity), ...RARITY_MAP[rarity] };
}
