'use client';

import Link from 'next/link';
import { useRef, type CSSProperties, type PointerEvent } from 'react';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { glowFor } from '@/lib/skychaser/plate';
import CardThumb from './CardThumb';

/**
 * The poster beside the headline: a cream-framed print of the black sky, five
 * cards flying along a striped trail from the bottom right up to the lead card
 * at the top left, a moon behind them. Each card has a seat on the print (x, y
 * in percent), a lean and a size. The first three also carry `side`; the rest
 * stay hidden on a phone. Any card can be pulled off the trail and moved.
 */
const FLIGHT = [
  { designation: 'HALLEY', x: 30, y: 30, rot: -24, s: 1, side: 0 },
  { designation: 'SATURN', x: 50, y: 48, rot: -14, s: 0.84, side: -1 },
  { designation: 'M1', x: 66, y: 64, rot: -4, s: 0.7, side: 1 },
  { designation: 'JUPITER', x: 78, y: 78, rot: 6, s: 0.56 },
  { designation: 'M31', x: 88, y: 90, rot: 14, s: 0.44 },
];

const DRAG_START = 5;

export default function HomeFan() {
  const top = useRef(20);

  function onPointerDown(e: PointerEvent<HTMLAnchorElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX, startY = e.clientY;
    const baseX = parseFloat(el.style.getPropertyValue('--dx-px')) || 0;
    const baseY = parseFloat(el.style.getPropertyValue('--dy-px')) || 0;
    let moved = false;
    el.style.zIndex = String(++top.current);

    const onMove = (ev: globalThis.PointerEvent) => {
      const mx = ev.clientX - startX, my = ev.clientY - startY;
      if (!moved && Math.hypot(mx, my) < DRAG_START) return;
      if (!moved) { moved = true; el.dataset.drag = 'on'; }
      el.style.setProperty('--dx-px', `${baseX + mx}px`);
      el.style.setProperty('--dy-px', `${baseY + my}px`);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      delete el.dataset.drag;
      if (moved) {
        const swallow = (ce: Event) => { ce.preventDefault(); ce.stopPropagation(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return (
    <div className="sd-herofan" aria-label="Cards from Genesis">
      <div className="sd-herofan__print">
        <span className="sd-herofan__moon" aria-hidden="true" />
        <span className="sd-herofan__moon sd-herofan__moon--far" aria-hidden="true" />
        <span className="sd-herofan__trail" aria-hidden="true" />
        <div className="sd-herofan__deck">
          {FLIGHT.map((f, i) => {
            const c = SET_001_CARD_BY_DESIGNATION.get(f.designation);
            if (!c) return null;
            return (
              <Link
                key={f.designation}
                href={`/card/${f.designation}`}
                className="sd-herofan__card"
                aria-label={c.seed.name}
                data-zoom={f.designation}
                data-phone={f.side === undefined ? 'hide' : undefined}
                draggable={false}
                onPointerDown={onPointerDown}
                onDragStart={(e) => e.preventDefault()}
                style={
                  {
                    '--x': f.x, '--y': f.y, '--rot': `${f.rot}deg`, '--s': f.s, '--i': i,
                    '--side': f.side ?? 0, '--off': Math.abs(f.side ?? 0),
                    '--tile-glow': glowFor(f.designation),
                  } as CSSProperties
                }
              >
                <CardThumb designation={f.designation} eager />
              </Link>
            );
          })}
        </div>
      </div>
      <span className="sd-herofan__caption" aria-hidden="true">Genesis</span>
    </div>
  );
}
