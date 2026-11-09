import type { CSSProperties, ReactNode } from 'react';
import { rarityInfo, type Rarity } from '@/lib/rarity';
import { accentFor } from './CardFront';

/**
 * The light the card page puts around its card, for a card of any size: a
 * glow in the art's own colour close to the frame, and a wider one in the
 * rarity's colour behind it. Scaled to the card's width, so a shelf tile is
 * lit like the card held up on its own page.
 */
export default function CardHalo({ designation, rarity, children, className = '' }: { designation: string; rarity: Rarity; children: ReactNode; className?: string }) {
  return (
    <span className={`sdc-halo ${className}`} style={{ '--card-accent': accentFor(designation), '--rarity': rarityInfo(rarity).color } as CSSProperties}>
      {children}
    </span>
  );
}
