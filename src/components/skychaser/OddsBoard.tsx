'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RARITIES, rarityInfo } from '@/lib/rarity';
import { TIERS, formatOdds } from '@/lib/skychaser/tiers';

/** The odds as four stars, each brighter and rarer than the last, its chance beneath, per capsule. */
export default function OddsBoard() {
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
        {RARITIES.map((rarity) => (
          <li key={rarity} data-rarity={rarity}>
            <span className="sd-odds__star" aria-hidden="true" />
            <span className="sd-odds__name">{rarityInfo(rarity).label}</span>
            <span className="sd-odds__pct">{tier.oddsBps[rarity] === 0 ? '—' : formatOdds(tier.oddsBps[rarity])}</span>
          </li>
        ))}
      </ol>

      <Link href="/capsules/log" className="sd-odds__log">Read the public log</Link>
    </div>
  );
}
