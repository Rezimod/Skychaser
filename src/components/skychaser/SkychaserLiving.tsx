'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { cardStatus } from '@/lib/skychaser/almanac';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { plateFor } from '@/lib/skychaser/plate';
import SkychaserCard from './card/SkychaserCard';
import { accentFor, accentInkFor, faceSources } from './card/CardFront';
import { ArrowLeft, ArrowRight, Diamond, X } from 'lucide-react';
import { perkFor } from '@/lib/skychaser/perks';
import { rarityInfo } from '@/lib/rarity';

type Zoom = { designation: string; price: string; from: HTMLAnchorElement };

const DEALT = ':is(.sd-fl__grid, .sd-showcase2__cards) > li';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fetches and decodes a card's full face while it is pointed at, so opening it shows the picture at once. */
const warmed = new Set<string>();
const warm = (designation: string) => {
  const plate = plateFor(designation);
  if (!plate || warmed.has(designation)) return;
  warmed.add(designation);
  for (const src of faceSources(plate)) {
    const img = new Image();
    img.src = src;
    img.decode().catch(() => {});
  }
};

/** Sets the class the deal waits on before the cards are painted, so they never flash in place first. */
export const LIVE_SCRIPT = `if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('sd-live')`;

/**
 * What moves on a Skychaser page without being a component of its own: cards
 * that lean toward the pointer (or the scroll, on a phone), cards dealt onto
 * the table as they come into view, the home fan opening as it leaves, and a
 * card lifted out of the shelf to hold when it is tapped. One listener each,
 * delegated from the document; the cards themselves stay plain links.
 */
export default function SkychaserLiving() {
  const [zoom, setZoom] = useState<Zoom | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-zoom]');
      if (!a || !a.querySelector('.sd-thumb')) return;
      const designation = a.dataset.zoom!;
      const seed = SET_001_CARD_BY_DESIGNATION.get(designation);
      const plate = plateFor(designation);
      if (!seed || !plate) return;
      e.preventDefault();
      e.stopPropagation();
      const price = a.dataset.zoomPrice ?? (cardStatus(seed) === 'sealed' ? 'Sealed' : `$${cardPriceUsd(plate.designation, plate.rarity)}`);
      setZoom({ designation, price, from: a });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (calm()) return;
    const root = document.documentElement;
    root.classList.add('sd-live');
    const offs: (() => void)[] = [];

    // The deal: whatever comes into view in one frame is dealt left to right, top to bottom.
    const deal = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((en) => en.isIntersecting).map((en) => en.target as HTMLElement);
        shown.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
        shown.forEach((el, i) => {
          el.style.setProperty('--d', `${Math.min(i, 9) * 45}ms`);
          el.classList.add('is-in');
          deal.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    document.querySelectorAll(DEALT).forEach((el) => deal.observe(el));
    offs.push(() => deal.disconnect());

    // In view: only these cards carry anything that runs (the lean, a pass of foil).
    const view = new IntersectionObserver((entries) => entries.forEach((en) => en.target.classList.toggle('is-view', en.isIntersecting)), { rootMargin: '10% 0px' });
    document.querySelectorAll(`${DEALT}, .sd-herofan__card`).forEach((el) => view.observe(el));
    offs.push(() => view.disconnect());

    // Browsers without scroll-driven animation: sections rise on arrival, the fan opens from script.
    if (!CSS.supports('animation-timeline: view()')) {
      root.classList.add('sd-io');
      const rise = new IntersectionObserver(
        (entries) => {
          for (const en of entries) {
            if (!en.isIntersecting) continue;
            en.target.classList.add('is-in');
            rise.unobserve(en.target);
          }
        },
        { rootMargin: '0px 0px -10% 0px' },
      );
      document.querySelectorAll('.sd-home-sec > :not(.sd-showcase2__cards, .sd-orbit__stage), .sd-fl__head').forEach((el) => rise.observe(el));
      offs.push(() => rise.disconnect());

      const deck = document.querySelector<HTMLElement>('.sd-herofan__deck');
      if (deck) {
        let raf = 0;
        const spread = () => {
          raf = 0;
          const r = deck.getBoundingClientRect();
          const p = Math.min(1, Math.max(0, (innerHeight / 2 - (r.top + r.height / 2)) / (innerHeight / 2 + r.height / 2)));
          deck.style.setProperty('--sd-spread', p.toFixed(3));
        };
        const onScroll = () => {
          if (!raf) raf = requestAnimationFrame(spread);
        };
        addEventListener('scroll', onScroll, { passive: true });
        spread();
        offs.push(() => removeEventListener('scroll', onScroll));
      }
    }

    // The lean. A mouse tilts the card under it; on a phone every card in view leans with its place on the screen.
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let held: HTMLElement | null = null;
      let raf = 0;
      let at = { x: 0, y: 0 };
      const letGo = () => {
        held?.classList.remove('is-tilt');
        held?.style.removeProperty('--tx');
        held?.style.removeProperty('--ty');
        held = null;
      };
      const lean = () => {
        raf = 0;
        if (!held) return;
        const r = held.getBoundingClientRect();
        held.style.setProperty('--tx', ((at.x - r.left) / r.width - 0.5).toFixed(3));
        held.style.setProperty('--ty', ((at.y - r.top) / r.height - 0.5).toFixed(3));
      };
      const onMove = (e: PointerEvent) => {
        const thumb = (e.target as Element | null)?.closest('[data-zoom]')?.querySelector<HTMLElement>('.sd-thumb') ?? null;
        if (thumb !== held) {
          letGo();
          held = thumb;
          held?.classList.add('is-tilt');
          if (held) warm(held.closest<HTMLElement>('[data-zoom]')!.dataset.zoom!);
        }
        at = { x: e.clientX, y: e.clientY };
        if (held && !raf) raf = requestAnimationFrame(lean);
      };
      document.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', letGo);
      offs.push(() => {
        document.removeEventListener('pointermove', onMove);
        document.documentElement.removeEventListener('pointerleave', letGo);
        cancelAnimationFrame(raf);
      });
    } else {
      const seen = new Set<HTMLElement>();
      let raf = 0;
      const lean = () => {
        raf = 0;
        for (const t of seen) {
          const r = t.getBoundingClientRect();
          const y = Math.min(0.5, Math.max(-0.5, ((r.top + r.height / 2) / innerHeight - 0.5) * 0.8));
          t.style.setProperty('--ty', y.toFixed(3));
        }
      };
      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(lean);
      };
      const watch = new IntersectionObserver((entries) => {
        for (const en of entries) {
          const t = en.target as HTMLElement;
          if (en.isIntersecting) seen.add(t);
          else seen.delete(t);
        }
        onScroll();
      });
      document.querySelectorAll<HTMLElement>('[data-zoom] .sd-thumb').forEach((t) => {
        t.classList.add('is-scroll');
        watch.observe(t);
      });
      addEventListener('scroll', onScroll, { passive: true });
      offs.push(() => {
        watch.disconnect();
        removeEventListener('scroll', onScroll);
        cancelAnimationFrame(raf);
      });
    }

    return () => offs.forEach((off) => off());
  }, []);

  return zoom ? <ZoomedCard key={zoom.designation} zoom={zoom} onClosed={() => setZoom(null)} /> : null;
}

function ZoomedCard({ zoom, onClosed }: { zoom: Zoom; onClosed: () => void }) {
  const [active, setActive] = useState(zoom.from);
  const designation = active.dataset.zoom!;
  const plate = plateFor(designation)!;
  const item = SET_001_CARD_BY_DESIGNATION.get(designation)!;
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
    root.style.overflow = 'hidden';
    const overlay = dialog.current!.parentElement!;
    const siblings = [...overlay.parentElement!.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
    const previous = siblings.map((element) => element.inert);
    siblings.forEach((element) => { element.inert = true; });
    closer.current?.focus({ preventScroll: true });
    return () => {
      root.style.overflow = overflow;
      siblings.forEach((element, siblingIndex) => { element.inert = previous[siblingIndex]; });
      zoom.from.focus({ preventScroll: true });
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
