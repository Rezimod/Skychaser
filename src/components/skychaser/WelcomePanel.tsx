'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import CardPlate from './CardPlate';
import ShareCard from './ShareCard';
import { isRarity, rarityInfo } from '@/lib/rarity';
import type { WelcomeEdition } from '@/lib/skychaser/welcome';

const pad = (n: number) => String(n).padStart(3, '0');

/**
 * The first card, shown once: the account signed in and found an edition
 * already in its Collection. Escape or the close mark puts it away; the
 * card itself stays where it is.
 */
export default function WelcomePanel({ edition, wallet, onClose }: { edition: WelcomeEdition; wallet: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const rarity = isRarity(edition.rarity) ? rarityInfo(edition.rarity) : null;

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const number = `No. ${pad(edition.editionNumber)} of ${edition.editionSize}`;
  const url = `https://skychaser.io/card/${edition.designation}`;

  return (
    <div className="sd-sheet" role="dialog" aria-modal="true" aria-labelledby="sd-welcome-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className="sd-sheet__panel sd-welcome" data-rarity={edition.rarity} style={{ '--tier': rarity?.color ?? 'var(--sd-rarity-common)' } as CSSProperties}>
        <button type="button" className="sd-sheet__close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        <div className="sd-sheet__art">
          <CardPlate designation={edition.designation} edition={edition.editionNumber} size="sm" priority />
        </div>
        <div className="sd-sheet__body">
          <p className="sd-eyebrow">Your collection begins</p>
          <h2 id="sd-welcome-title" className="sd-sheet__name">{edition.name}</h2>
          <p className="sd-sheet__line">
            {number}
            {rarity && <> · {rarity.label}</>}
          </p>
          <p className="sd-note">
            One edition of {edition.name}, numbered and yours. Every clear night the observatory photographs one card, and the holders decide which: this card votes.
          </p>
          <div className="sd-pay__actions">
            <a className="sd-btn sd-btn--primary" href={`/collection?wallet=${wallet}`}>
              See it in your Collection
            </a>
            <a className="sd-btn" href="/genesis">
              Open a capsule
            </a>
          </div>
          <ShareCard title={`${edition.name} — Skychaser`} text={`My collection begins with ${edition.name}, ${number}, on Skychaser.`} url={url} />
        </div>
      </div>
    </div>
  );
}
