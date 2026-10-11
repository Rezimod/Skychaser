import Link from 'next/link';
import CardThumb from './CardThumb';
import type { Rarity } from '@/lib/rarity';
import { accentFor } from './card/CardFront';
import type { CSSProperties, ReactNode } from 'react';

export type ShopCardProps = {
  designation: string;
  name: string;
  rarity: Rarity;
  /** One line under the name: how many are left, or an Almanac card's date. */
  sub: ReactNode;
  /** '$8', or 'Sealed' once an Almanac card's event has ended. */
  price: string;
  /** A pill on the card: 'Tonight', an edition number. */
  tag?: string;
  /** Near the top of the shelf: loads at once. */
  eager?: boolean;
  remaining?: number;
};

/** A card on the shelf: the live face, its price and stock printed on it. */
export default function ShopCard({ designation, name, rarity, sub, price, tag, eager = false, remaining }: ShopCardProps) {
  return (
    <Link
      href={`/card/${designation}`}
      className="sd-tile"
      data-rarity={rarity}
      aria-label={`${name}, ${price}`}
      data-zoom={designation}
      data-zoom-price={price}
      data-zoom-left={remaining}
      style={{ '--tile-glow': accentFor(designation) } as CSSProperties}
    >
      <span className="sd-tile__stage">
        <CardThumb designation={designation} eager={eager} price={price} sub={sub} />
        {tag && <span className="sd-tile__tag">{tag}</span>}
      </span>
    </Link>
  );
}
