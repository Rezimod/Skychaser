import { rarityInfo, type Rarity } from '@/lib/rarity';

/** A card's rarity as a chip: the word in its rarity's colour. */
export default function RarityMark({ rarity, className = '' }: { rarity: Rarity; className?: string }) {
  return (
    <span className={`sd-rarity sd-rarity--${rarity} ${className}`.trim()}>
      <span className="sr-only">Rarity: </span>
      <span>{rarityInfo(rarity).label}</span>
    </span>
  );
}
