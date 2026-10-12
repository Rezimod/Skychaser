'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { rarityInfo } from '@/lib/rarity';
import { CARDS_PER_TIER, TIERS, tierByKey, type Tier } from '@/lib/skychaser/tiers';
import StarPulse from './StarPulse';
import OddsBar from './OddsBar';
import { TIER_PERKS } from '@/lib/skychaser/perks';

// The sheet carries the wallet and payment code; it is fetched on first
// intent (a pointer over the button, a touch) rather than with the page.
const loadSheet = () => import('./CapsuleTierSheet');
const CapsuleTierSheet = dynamic(loadSheet, { ssr: false });

/**
 * The counter beside the set: the four capsules, cheapest first, one of them
 * on the counter with its price, its odds and how many are on sale. Buying
 * opens the sheet with the next capsule of that tier.
 */
export default function CapsuleCounter({ onSale }: { onSale: Record<string, number> | null }) {
  const [tier, setTier] = useState<Tier>(TIERS[0]);
  const [sheet, setSheetState] = useState(false);

  // The open sheet lives in the address (#iron): a reload, or a link sent on,
  // lands on the same capsule.
  const setSheet = useCallback((t: Tier | null) => {
    if (t) setTier(t);
    setSheetState(t !== null);
    history.replaceState(history.state, '', t ? `#${t.key}` : location.pathname + location.search);
  }, []);
  const closeSheet = useCallback(() => setSheet(null), [setSheet]);
  useEffect(() => {
    const t = tierByKey(location.hash.slice(1));
    if (t) {
      setTier(t);
      setSheetState(true);
    }
  }, []);

  const stock = onSale ? (onSale[tier.key] ?? 0) : null;

  return (
    <aside className="sd-counter" id="capsules" aria-label="Capsules" style={{ '--tier': rarityInfo(tier.lit).color } as CSSProperties}>
      <div className="sd-counter__tabs" role="group" aria-label="Choose a capsule">
        {TIERS.map((t) => (
          <button
            key={t.key}
            type="button"
            className="sd-counter__tab"
            aria-pressed={t.key === tier.key}
            style={{ '--tier': rarityInfo(t.lit).color } as CSSProperties}
            onClick={() => setTier(t)}
          >
            <span className="sd-counter__tabname">{t.name}</span>
            <span className="sd-counter__tabprice">${t.priceUsd}</span>
          </button>
        ))}
      </div>

      <div className="sd-counter__stage">
        <StarPulse className="sd-counter__star" centre={0.4} breathe />
        <div className="sd-counter__over">
          <div>
            <span className="sd-counter__label">Ready to detonate</span>
            <h2 className="sd-counter__name">
              {tier.name}
              <span className="sr-only"> capsule</span>
            </h2>
          </div>
          <div className="sd-counter__price">
            <strong>${tier.priceUsd}</strong>
            <span>{CARDS_PER_TIER === 1 ? 'One card' : `${CARDS_PER_TIER} cards`}</span>
          </div>
        </div>
      </div>

      <p className="sd-counter__line">{tier.line}</p>

      <div className="sd-counter__buy">
        <button
          type="button"
          className="sd-btn sd-btn--light sd-btn--block"
          disabled={stock === 0}
          onPointerEnter={loadSheet}
          onTouchStart={loadSheet}
          onFocus={loadSheet}
          onClick={() => setSheet(tier)}
        >
          {stock === 0 ? 'None on sale' : `Buy & detonate — $${tier.priceUsd}`}
        </button>
      </div>

      <OddsBar oddsBps={tier.oddsBps} />

      <details className="sd-gives-drop">
        <summary className="sd-counter__h">
          What each rarity gives
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </summary>
        <ul className="sd-gives">
        {TIER_PERKS.map((t) => (
          <li key={t.rarity} data-rarity={t.rarity}>
            <span className="sd-gives__tier">{rarityInfo(t.rarity).label}</span>
            <span className="sd-gives__what">
              {t.title}
              {t.soon && <em>Coming soon</em>}
            </span>
            <span className="sd-gives__line">{t.line}</span>
          </li>
        ))}
        </ul>
      </details>

      <div className="sd-counter__foot">
        <span>{stock === null ? 'Sale not read' : `${stock} ${tier.name} on sale`}</span>
        <Link href="/capsules/log" className="sd-counter__fair">
          Checkable by anyone
        </Link>
      </div>

      {sheet && (
        <CapsuleTierSheet tier={tier} onClose={closeSheet} />
      )}
    </aside>
  );
}
