'use client';

import { memo, useEffect, useId, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { editionLabel, plateFor } from '@/lib/skychaser/plate';
import CardBack from './CardBack';
import CardFront from './CardFront';
import './skychaser-card.css';

type Props = {
  designation: string;
  edition?: number | null;
  capture?: string | null;
  commitment?: string | null;
  /** The hero card: it floats when left alone and can be turned over. */
  hero?: boolean;
  /** A small card: its drawing loads as pre-rendered WebP. */
  lite?: boolean;
  /** Drawn on first paint: its pictures load at once, with high priority. */
  priority?: boolean;
};

/**
 * A Skychaser card you can hold. Move across it and it leans toward you; the sky
 * sinks behind the object, the labels float above it, the foil follows the light.
 */
function SkychaserCard({ designation, edition, capture, commitment, hero = false, lite = false, priority = false }: Props) {
  const plate = plateFor(designation);
  const u = `sd${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const stage = useRef<HTMLDivElement>(null);
  const box = useRef<DOMRect | null>(null);
  const frame = useRef(0);
  const [over, setOver] = useState(false);
  const ed = editionLabel(edition);
  useEffect(() => {
    if (!hero) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key.toLowerCase() !== 'f' || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setOver((value) => !value);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hero]);
  // An edition of a card no longer in the set: its number, on a blank card.
  if (!plate)
    return (
      <div className="sdc">
        <div className="sdc-card sdc-card--blank">
          <span>{designation}</span>
          {edition != null && <span>No. {ed}</span>}
        </div>
      </div>
    );

  // One write per frame, against a box measured once per visit, so the lean never waits on layout.
  const set = (px: number, py: number, live: boolean) => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const el = stage.current;
      if (!el) return;
      el.style.setProperty('--px', px.toFixed(3));
      el.style.setProperty('--py', py.toFixed(3));
      el.classList.toggle('is-live', live);
    });
  };

  return (
    <div className={`sdc${hero ? ' sdc--hero' : ''}`}>
      <div
        ref={stage}
        className="sdc-stage"
        onPointerEnter={(e) => {
          box.current = e.currentTarget.getBoundingClientRect();
        }}
        onPointerMove={(e) => {
          const r = (box.current ??= e.currentTarget.getBoundingClientRect());
          const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
          const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
          set(over ? 1 - px : px, py, true);
        }}
        onPointerLeave={() => {
          box.current = null;
          set(0.5, 0.5, false);
        }}
        onClick={hero ? () => setOver((v) => !v) : undefined}
        style={hero ? { cursor: 'pointer' } : undefined}
      >
        <div className="sdc-tilt">
          <div className={`sdc-flip${over ? ' is-over' : ''}`}>
            <div className="sdc-face" aria-hidden={over} role="img" aria-label={`${plate.name}, ${plate.rname}, Genesis number ${plate.num}${edition != null ? `, edition ${ed} of ${plate.of}` : ''}`}>
              <CardFront plate={plate} capture={capture} lite={lite} priority={priority} u={u} />
            </div>
            {hero && (
              <div className="sdc-face sdc-face--back" aria-hidden={!over}>
                <CardBack plate={plate} edition={edition} commitment={commitment} priority={priority} u={u} />
              </div>
            )}
          </div>
        </div>
      </div>
      {hero && <span className="sdc-shadow" aria-hidden="true" />}
      {hero && (
        <button type="button" className="sd-btn sdc-turn" aria-pressed={over} aria-keyshortcuts="F" onClick={() => setOver((v) => !v)}>
          <RotateCcw size={13} aria-hidden="true" />
          {over ? 'Turn back' : 'Turn it over'} <kbd aria-hidden="true">F</kbd>
          <span className="sdc-sides" aria-hidden="true"><i data-active={!over} /><i data-active={over} /></span>
        </button>
      )}
    </div>
  );
}

export default memo(SkychaserCard);
