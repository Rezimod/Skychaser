import Link from 'next/link';
import type { CSSProperties } from 'react';
import { rarityInfo, type Rarity } from '@/lib/rarity';
import { formatOdds } from '@/lib/skychaser/tiers';

const ORDER: Rarity[] = ['legendary', 'epic', 'rare', 'common'];

/** A capsule's odds per card as one bar, scarcest first, each rarity in its own colour, and the figures under it. */
export default function OddsBar({ oddsBps }: { oddsBps: Record<Rarity, number> }) {
  const shown = ORDER.filter((r) => oddsBps[r] > 0);
  return (
    <div className="sd-oddsbar">
      <div className="sd-oddsbar__head">
        <span className="sd-oddsbar__h">Odds per card</span>
        <Link href="/capsules/log" className="sd-oddsbar__fair">Provably fair — verify ↗</Link>
      </div>
      <div className="sd-oddsbar__bar" role="img" aria-label={shown.map((r) => `${rarityInfo(r).label} ${formatOdds(oddsBps[r])}`).join(', ')}>
        {shown.map((r) => (
          <i key={r} style={{ flexGrow: oddsBps[r], '--r': rarityInfo(r).color } as CSSProperties} />
        ))}
      </div>
      <ul className="sd-oddsbar__legend">
        {shown.map((r) => (
          <li key={r} style={{ '--r': rarityInfo(r).color } as CSSProperties}>
            <i aria-hidden="true" />
            {rarityInfo(r).label}
            <b>{formatOdds(oddsBps[r])}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
