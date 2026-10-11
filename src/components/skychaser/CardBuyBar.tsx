'use client';

import { useEffect, useState } from 'react';

/**
 * On a phone the card fills the screen and the way to buy it sits below.
 * This bar keeps the price in reach, and steps aside once the buy panel
 * itself is on screen. Pressing it brings that panel up.
 */
export default function CardBuyBar({ name, priceUsd, left, target }: { name: string; priceUsd: number; left: string; target: string }) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHidden(e.isIntersecting), { rootMargin: '0px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);

  const go = () => {
    const el = document.getElementById(target);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('button, a')?.focus({ preventScroll: true });
  };

  return (
    <div className="sd-buybar" data-hidden={hidden} aria-hidden={hidden}>
      <div className="sd-buybar__what">
        <span className="sd-buybar__name">{name}</span>
        <span className="sd-buybar__meta">{left}</span>
      </div>
      <button type="button" className="sd-btn sd-btn--primary" onClick={go} tabIndex={hidden ? -1 : 0}>
        Buy · ${priceUsd}
      </button>
    </div>
  );
}
