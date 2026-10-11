import Link from 'next/link';
import type { CSSProperties } from 'react';
import SkychaserCard from './card/SkychaserCard';
import { glowFor } from '@/lib/skychaser/plate';

export type CardPlateProps = {
  designation: string;
  /** The holder's edition number, stamped in the cartouche. */
  edition?: number | null;
  /** A real capture from Live Telescope V1; the drawn plate stands in until one exists. */
  capture?: string | null;
  commitment?: string | null;
  /** The card page. Without it the card is not a link. */
  href?: string;
  /** Width cap. The grid still decides the width below it. */
  size?: 'sm' | 'md' | 'lg';
  /** Floats, and turns over to show its back. */
  hero?: boolean;
  /** Drawn on first paint: its pictures load at once, with high priority. */
  priority?: boolean;
};

/** One First Light card, as it is printed: art window, metal frame, name, figures and edition. */
export default function CardPlate({ designation, edition, capture, commitment, href, size = 'md', hero = false, priority = false }: CardPlateProps) {
  const card = <SkychaserCard designation={designation} edition={edition} capture={capture} commitment={commitment} hero={hero} lite={!hero} priority={priority} />;
  return (
    <div className="sd-cardplate" data-size={size} style={{ '--tile-glow': glowFor(designation) } as CSSProperties}>
      {href ? (
        <Link href={href} className="sd-cardplate__link">
          {card}
        </Link>
      ) : (
        card
      )}
    </div>
  );
}
