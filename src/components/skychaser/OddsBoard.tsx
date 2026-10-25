'use client';

import { useState } from 'react';
import { RARITIES, rarityInfo, type Rarity } from '@/lib/rarity';
import { CARDS_PER_TIER, TIERS, formatOdds } from '@/lib/skychaser/tiers';
import { TIER_PERKS } from '@/lib/skychaser/perks';

type Supply = Record<Rarity, { cards: number; editions: number }>;

const pct = (bps: number) => (bps === 0 ? '0%' : formatOdds(bps));

/** The odds of every capsule on the shelf, one tier at a time, with what each rarity holds in the set. */
export default function OddsBoard({ supply }: { supply: Supply }) {
  const [key, setKey] = useState(TIERS[0].key);
  const tier = TIERS.find((t) => t.key === key)!;
  const legendary = tier.oddsBps.legendary / 10_000;
  const atLeastOne = 1 - (1 - legendary) ** CARDS_PER_TIER;

  return (
    <div className="sd-pub__panel sd-pub__board">
      <div className="sd-pub__head">
        <h3 className="sd-pub__h">Published odds</h3>
        <span className="sd-pub__per">Per card</span>
      </div>

      <div className="sd-pub__tabs" role="tablist" aria-label="Capsule">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={t.key === key}
            className="sd-pub__tab"
            onClick={() => setKey(t.key)}
          >
            <span>{t.name}</span>
            <span className="sd-pub__price">${t.priceUsd}</span>
          </button>
        ))}
      </div>

      <div className="sd-pub__bar" aria-hidden="true">
        {RARITIES.map((r) => (
          <span key={r} className={`sd-pub__seg sd-pub--${r}`} style={{ flexGrow: tier.oddsBps[r] }} />
        ))}
      </div>

      <div role="tabpanel" aria-label={`${tier.name} capsule odds`}>
      <ul className="sd-pub__tiles">
        {[...RARITIES].reverse().map((r) => (
          <li key={r} className={`sd-pub__tile sd-pub--${r}${tier.oddsBps[r] === 0 ? ' is-none' : ''}`}>
            <span className="sd-pub__mark" />
            <span className="sd-pub__pct">{pct(tier.oddsBps[r])}</span>
            <span className="sd-pub__rarity">{rarityInfo(r).label}</span>
            <span className="sd-pub__supply">
              {TIER_PERKS.find((p) => p.rarity === r)!.title}
            </span>
          </li>
        ))}
      </ul>
      </div>

      <div className="sd-pub__foot">
        <span>
          A legendary in {/^[AEIOU]/.test(tier.name) ? 'an' : 'a'} {tier.name} capsule
        </span>
        <strong>1 in {Math.round(1 / atLeastOne).toLocaleString('en-GB')}</strong>
      </div>
    </div>
  );
}
