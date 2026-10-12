import type { ReactNode } from 'react';
import { plateFor } from '@/lib/skychaser/plate';
import CardFront from './card/CardFront';
import FadeImg from './FadeImg';

type Props = {
  designation: string;
  eager?: boolean;
  /** Given a price, the face is drawn live, with today's price and stock; otherwise the baked face loads. */
  price?: string;
  sub?: ReactNode;
};

export default function CardThumb({ designation, eager = false, price, sub }: Props) {
  const plate = plateFor(designation);
  if (!plate) return <span className="sd-thumb sd-thumb--blank" aria-hidden="true">{designation}</span>;
  return (
    <div className="sd-thumb" role="img" aria-label={`${plate.name}, ${plate.rname}, Genesis ${plate.num} of ${plate.total}`}>
      {price ? <CardFront plate={plate} priority={eager} price={price} sub={sub} u="" /> : <FadeImg src={`${plate.art}/card.webp?v=specimen6`} width={520} height={726} priority={eager} />}
    </div>
  );
}
