'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { rarityInfo } from '@/lib/rarity';
import { CARDS_PER_TIER, type Tier } from '@/lib/skychaser/tiers';
import SkychaserBuyCapsule from './SkychaserBuyCapsule';
import TierCapsule from './TierCapsule';
import OddsBar from './OddsBar';

type OnSale = { id: string; sequence: number; commitment: string; priceUsd: number; cardsPerCapsule: number };

/**
 * One tier, taken off the shelf: its odds in full, and the next capsule of it
 * on sale — read at the moment the sheet opens, so the commitment the buyer
 * sends is the one published now. Everything, the buy button included, sits
 * on one screen.
 */
export default function CapsuleTierSheet({ tier, onClose }: { tier: Tier; onClose: () => void }) {
  const [next, setNext] = useState<OnSale | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Lifted to the page's .skychaser root: opened from a sticky panel, the sheet
  // would otherwise stack inside it, under the card grid beside it.
  const [host] = useState(() => (typeof document === 'undefined' ? null : (document.querySelector<HTMLElement>('.skychaser') ?? document.body)));

  useEffect(() => {
    let live = true;
    fetch(`/api/skychaser/capsules?tier=${tier.key}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { capsules: OnSale[] }) => live && setNext(d.capsules[0] ?? null))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [tier.key]);

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // The reveal, and Privy's sign-in window, take Escape for themselves when they are up.
      if (e.key === 'Escape' && !document.querySelector('.sd-reveal--staged, #privy-dialog')) onClose();
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const sheet = (
    <div className="sd-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        className="sd-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${tier.name} capsule`}
        tabIndex={-1}
        style={{ '--tier': rarityInfo(tier.lit).color } as CSSProperties}
      >
        <button type="button" className="sd-sheet__close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="sd-sheet__art">
          <TierCapsule tier={tier} />
          <span className="sd-sheet__count">{CARDS_PER_TIER === 1 ? 'One card inside' : `${CARDS_PER_TIER} cards inside`}</span>
        </div>

        <div className="sd-sheet__body">
          <p className="sd-label">Capsule · Genesis</p>
          <div className="sd-sheet__head">
            <h2 className="sd-sheet__name">{tier.name}</h2>
            <span className="sd-sheet__price">${tier.priceUsd}</span>
          </div>
          <p className="sd-sheet__line">{tier.line}</p>

          <OddsBar oddsBps={tier.oddsBps} />

          <div className="sd-sheet__buy">
            {failed ? (
              <p className="sd-buyflow__error">The sale cannot be read at the moment.</p>
            ) : next === undefined ? (
              <div className="sd-sheet__wait" aria-label="Reading the sale">
                <span />
                <span />
              </div>
            ) : next === null ? (
              <p className="sd-buyflow__error">No {tier.name} capsule is on sale right now.</p>
            ) : (
              <>
                <p className="sd-sheet__lot">
                  <span>No. {String(next.sequence).padStart(3, '0')}</span>
                  <span title={next.commitment}>commitment {next.commitment.slice(0, 10)}…</span>
                </p>
                <SkychaserBuyCapsule
                  capsuleId={next.id}
                  sequence={next.sequence}
                  commitment={next.commitment}
                  priceUsd={next.priceUsd}
                  cardsPerCapsule={next.cardsPerCapsule}
                  onClose={onClose}
                />
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );

  return host ? createPortal(sheet, host) : sheet;
}
