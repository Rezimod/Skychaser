'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Diamond, X } from 'lucide-react';
import { SHELF_BY_DESIGNATION } from '@/lib/sets/shelf';
import { cardStatus } from '@/lib/skychaser/almanac';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { perkFor } from '@/lib/skychaser/perks';
import { plateFor } from '@/lib/skychaser/plate';
import SkychaserCard from './card/SkychaserCard';
import { accentFor, accentInkFor, faceSources } from './card/CardFront';

/** The tapped card held up over the page. Loaded on first contact with a card, so the catalogue stays off every page's first load. */
export type Zoom = { designation: string; from: HTMLAnchorElement };

export const knows = (designation: string) => Boolean(SHELF_BY_DESIGNATION.get(designation) && plateFor(designation));

export /** Fetches and decodes a card's full face while it is pointed at, so opening it shows the picture at once. */
const warmed = new Set<string>();
export const warm = (designation: string) => {
  const plate = plateFor(designation);
  if (!plate || warmed.has(designation)) return;
  warmed.add(designation);
  for (const src of faceSources(plate)) {
    const img = new Image();
    img.src = src;
    img.decode().catch(() => {});
  }
};

export default function ZoomedCard({ zoom, onClosed }: { zoom: Zoom; onClosed: () => void }) {
  const [active, setActive] = useState(zoom.from);
  const designation = active.dataset.zoom!;
  const plate = plateFor(designation)!;
  const item = SHELF_BY_DESIGNATION.get(designation)!;
  const perk = perkFor(designation, plate.rarity);
  const price = active.dataset.zoomPrice ?? (cardStatus(item) === 'sealed' ? 'Sealed' : `$${cardPriceUsd(designation, plate.rarity)}`);
  const left = active.dataset.zoomLeft;
  const dialog = useRef<HTMLDivElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const [cards] = useState(() => {
    const shelf = zoom.from.closest('.sd-fl__grid, .sd-showcase2__cards, .sd-herofan__deck') ?? zoom.from.parentElement!;
    return [...shelf.querySelectorAll<HTMLAnchorElement>('a[data-zoom]')].filter((anchor) => !anchor.closest('[hidden]'));
  });
  const index = cards.indexOf(active);
  useEffect(() => {
    for (const near of [cards[index - 1], cards[index + 1]]) if (near) warm(near.dataset.zoom!);
  }, [cards, index]);
  const move = (direction: number) => {
    const next = cards[index + direction];
    if (next) setActive(next);
  };

  useLayoutEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    const overlay = dialog.current!.parentElement!;
    const siblings = [...overlay.parentElement!.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previous = siblings.map((element) => element.inert);
    closer.current?.focus({ preventScroll: true });
    // The card is painted first; shutting the page behind it restyles the whole page, so it waits a frame, under the veil.
    let shut = 0;
    const frame = requestAnimationFrame(() => {
      shut = window.setTimeout(() => {
        root.style.overflow = 'hidden';
        siblings.forEach((element) => { element.inert = true; });
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(shut);
      // Opening the page again restyles all of it too: the card goes first, the page opens a frame later.
      requestAnimationFrame(() => window.setTimeout(() => {
        root.style.overflow = overflow;
        siblings.forEach((element, siblingIndex) => { element.inert = previous[siblingIndex]; });
        zoom.from.focus({ preventScroll: true });
      }));
    };
  }, [zoom.from]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClosed(); return; }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const stops = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const href = `/card/${designation}`;
  return (
    <div className="sd-zoom" data-state="open" data-rarity={plate.rarity} style={{ '--accent': accentFor(designation), '--accent-ink': accentInkFor(designation) } as CSSProperties}>
      <div className="sd-zoom__veil" onClick={onClosed} aria-hidden="true" />
      <div ref={dialog} className="sd-zoom__panel" role="dialog" aria-modal="true" aria-labelledby="sd-zoom-name">
        <header className="sd-zoom__toolbar">
          <span className="sd-zoom__crumb">Genesis set <span>/</span> {plate.name}</span>
          <div className="sd-zoom__navigation">
            <button type="button" aria-label="Previous card" disabled={index <= 0} onClick={() => move(-1)}><ArrowLeft size={16} /></button>
            <span aria-live="polite">{index + 1} of {cards.length}</span>
            <button type="button" aria-label="Next card" disabled={index >= cards.length - 1} onClick={() => move(1)}><ArrowRight size={16} /></button>
            <button ref={closer} type="button" className="sd-zoom__dismiss" aria-label="Close" onClick={onClosed}><X size={17} /></button>
          </div>
        </header>
        <div key={designation} className="sd-zoom__card">
          <SkychaserCard designation={designation} hero priority />
        </div>
        <div key={`${designation}-info`} className="sd-zoom__info">
          <p className="sd-zoom__rarity">{plate.rname} · Genesis</p>
          <h2 className="sd-zoom__name" id="sd-zoom-name">{plate.name}</h2>
          <p className="sd-zoom__line">{plate.poster.headline}</p>
          <dl className="sd-zoom__facts">
            <div><dt>Edition size</dt><dd>{item.seed.editionSize}</dd></div>
            <div><dt>Left</dt><dd>{left ?? '—'}</dd></div>
            <div><dt>Set number</dt><dd>{plate.num} / {plate.total}</dd></div>
          </dl>
          <div className="sd-zoom__perk">
            <span className="sd-zoom__gem"><Diamond size={20} fill="currentColor" strokeWidth={1} /></span>
            <div><span className="sd-zoom__label">Unlocks{perk.soon ? ' · Coming soon' : ''}</span><strong>{perk.short}</strong><p>{perk.line}</p></div>
          </div>
          <div className="sd-zoom__pricing"><p className="sd-zoom__price">{price}</p>{left != null && <span><i />{left} of {item.seed.editionSize} left</span>}</div>
          <div className="sd-zoom__cta">
            {price !== 'Sealed' && <Link href={`${href}#buy`} className="sd-btn sd-btn--light" onClick={onClosed}>Buy — {price}</Link>}
            <Link href={href} className="sd-btn" onClick={onClosed}>Details</Link>
          </div>
          <div className="sd-zoom__trust"><span>Numbered editions</span><Link href="/capsules/log" onClick={onClosed}>Provably fair · verify ↗</Link></div>
        </div>
      </div>
    </div>
  );
}
