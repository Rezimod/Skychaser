'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { rarityInfo, type Rarity } from '@/lib/rarity';
import { TIERS, formatOdds } from '@/lib/skychaser/tiers';

/** The odds told with the cards themselves: one of each rarity, its chance beneath, per capsule. */
export default function OddsBoard({ cards }: { cards: { rarity: Rarity; face: ReactNode }[] }) {
  const [key, setKey] = useState(TIERS[0].key);
  const tier = TIERS.find((t) => t.key === key)!;

  return (
    <div className="sd-odds">
      <p className="sd-odds__lede">Sealed before sale. Opened in public.</p>

      <div className="sd-odds__tiers" role="tablist" aria-label="Capsule">
        {TIERS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === key} className="sd-odds__tier" onClick={() => setKey(t.key)}>
            {t.name}
          </button>
        ))}
      </div>

      <ol className="sd-odds__deck" role="tabpanel" aria-label={`${tier.name} capsule odds, per card`}>
        {cards.map(({ rarity, face }) => (
          <li key={rarity} data-rarity={rarity}>
            <div className="sd-odds__card" aria-hidden="true">{face}</div>
            <span className="sd-odds__name">{rarityInfo(rarity).label}</span>
            <span className="sd-odds__pct">{tier.oddsBps[rarity] === 0 ? '—' : formatOdds(tier.oddsBps[rarity])}</span>
          </li>
        ))}
      </ol>

      <Link href="/capsules/log" className="sd-odds__log">Read the public log</Link>
    </div>
  );
}
