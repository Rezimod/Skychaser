'use client';

import Link from 'next/link';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { RARITIES, rarityInfo, type Rarity } from '@/lib/rarity';
import { CARDS_PER_TIER, TIERS, formatOdds } from '@/lib/skychaser/tiers';
import { TIER_PERKS } from '@/lib/skychaser/perks';

type Supply = Record<Rarity, { cards: number; editions: number }>;
type Guarantee = { title: string; text: string; icon: ReactNode };

const pct = (bps: number) => (bps === 0 ? '0%' : formatOdds(bps));
/** Log scale, so a 0.1% legendary still reads as a mark next to an 86% common. */
const reach = (bps: number) => (bps <= 0 ? 0 : Math.max(6, 8 + (92 * Math.log10(bps)) / 4));

/** The odds of every capsule on the shelf, one tier at a time: the chance of a legendary first, then each rarity's share. */
export default function OddsBoard({ supply, guarantees }: { supply: Supply; guarantees: Guarantee[] }) {
  const [key, setKey] = useState(TIERS[0].key);
  const tier = TIERS.find((t) => t.key === key)!;
  const legendary = tier.oddsBps.legendary / 10_000;
  const oneIn = Math.round(1 / (1 - (1 - legendary) ** CARDS_PER_TIER));

  return (
    <div className="sd-odds">
      <div className="sd-odds__stage">
        <div className="sd-odds__medal" aria-live="polite">
          <span className="sd-odds__ring" aria-hidden="true" />
          <span className="sd-odds__kicker">Legendary in a {tier.name}</span>
          <strong className="sd-odds__big"><small>1 in</small>{oneIn.toLocaleString('en-GB')}</strong>
          <span className="sd-odds__sub">{CARDS_PER_TIER} card{CARDS_PER_TIER === 1 ? '' : 's'} per capsule · ${tier.priceUsd}</span>
        </div>
        <div className="sd-odds__tiers" role="tablist" aria-label="Capsule">
          {TIERS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={t.key === key} className="sd-odds__tier" onClick={() => setKey(t.key)}>
              <span>{t.name}</span>
              <b>${t.priceUsd}</b>
            </button>
          ))}
        </div>
      </div>

      <ol className="sd-odds__ladder" role="tabpanel" aria-label={`${tier.name} capsule odds, per card`}>
        {[...RARITIES].reverse().map((r) => {
          const info = rarityInfo(r);
          return (
            <li key={r} className="sd-odds__row" data-rarity={r} style={{ '--reach': `${reach(tier.oddsBps[r])}%` } as CSSProperties}>
              <span className="sd-odds__chip" aria-hidden="true"><i>{info.glyph}</i></span>
              <span className="sd-odds__name">
                <b>{info.label}</b>
                <span>{TIER_PERKS.find((p) => p.rarity === r)!.title} · {supply[r].cards} cards</span>
              </span>
              <span className="sd-odds__pct">{pct(tier.oddsBps[r])}</span>
              <span className="sd-odds__meter" aria-hidden="true"><span /></span>
            </li>
          );
        })}
      </ol>

      <ul className="sd-odds__seals">
        {guarantees.map((g) => (
          <li key={g.title}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{g.icon}</svg>
            <div><b>{g.title}</b><span>{g.text}</span></div>
          </li>
        ))}
        <li className="sd-odds__log"><Link href="/capsules/log" className="sd-link">Read the public log</Link></li>
      </ul>
    </div>
  );
}
