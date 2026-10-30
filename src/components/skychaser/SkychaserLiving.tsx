'use client';

import { useEffect, useState } from 'react';

type Zoom = { designation: string; from: HTMLAnchorElement };
type ZoomModule = typeof import('./SkychaserZoom');

let zoomModule: Promise<ZoomModule> | null = null;
const loadZoom = () => (zoomModule ??= import('./SkychaserZoom'));

const DEALT = ':is(.sd-fl__grid, .sd-showcase2__cards) > li';

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * What moves on a Skychaser page without being a component of its own: cards
 * that lean toward the pointer (or the scroll, on a phone), cards dealt onto
 * the table as they come into view, the home fan opening as it leaves, and a
 * card lifted out of the shelf to hold when it is tapped. One listener each,
 * delegated from the document; the cards themselves stay plain links.
 */
export default function SkychaserLiving() {
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [Zoomed, setZoomed] = useState<ZoomModule['default'] | null>(null);

  // Touching a card fetches the viewer, so the tap that follows opens it at once.
  useEffect(() => {
    const early = (e: Event) => { if ((e.target as Element | null)?.closest?.('a[data-zoom]')) void loadZoom(); };
    document.addEventListener('pointerdown', early, { passive: true, capture: true });
    document.addEventListener('pointerover', early, { passive: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', early, true);
      document.removeEventListener('pointerover', early, true);
    };
  }, []);

  useEffect(() => {
    let passing: HTMLAnchorElement | null = null;
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('a') === passing) { passing = null; return; }
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-zoom]');
      if (!a || !a.querySelector('.sd-thumb')) return;
      const designation = a.dataset.zoom!;
      e.preventDefault();
      e.stopPropagation();
      void loadZoom().then((m) => {
        if (!m.knows(designation)) { passing = a; a.click(); return; }
        setZoomed(() => m.default);
        setZoom({ designation, from: a });
      });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  useEffect(() => {
    if (calm()) return;
    const root = document.documentElement;
    const offs: (() => void)[] = [];

    // The deal: whatever comes into view in one frame is dealt left to right, top to bottom. The cards
    // on the first screen are already showing, painted with the page; only those below it wait their turn.
    const deal = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((en) => en.isIntersecting);
        shown.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
        shown.forEach((en, i) => {
          const el = en.target as HTMLElement;
          el.style.setProperty('--d', `${Math.min(i, 9) * 45}ms`);
          el.classList.add('is-in');
          deal.unobserve(el);
        });
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    const below = [...document.querySelectorAll<HTMLElement>(DEALT)].filter((el) => el.getBoundingClientRect().top > innerHeight);
    for (const el of below) {
      el.dataset.deal = '';
      deal.observe(el);
    }
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
          if (held) { const d = held.closest<HTMLElement>('[data-zoom]')!.dataset.zoom!; void loadZoom().then((m) => m.warm(d)); }
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

  return zoom && Zoomed ? <Zoomed key={zoom.designation} zoom={zoom} onClosed={() => setZoom(null)} /> : null;
}

