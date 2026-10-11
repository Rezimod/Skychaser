import type { CSSProperties } from 'react';
import { rarityInfo, type Rarity } from '@/lib/rarity';

/** The rarity as a badge pinned on the card's corner: on the card, not drawn into its face. */
export default function RarityBadge({ rarity }: { rarity: Rarity }) {
  const info = rarityInfo(rarity);
  return (
    <span className="sd-badge" data-rarity={rarity} style={{ '--rarity': info.color } as CSSProperties} aria-hidden="true">
      {info.label}
      <b className="sd-badge__glint" />
    </span>
  );
}
