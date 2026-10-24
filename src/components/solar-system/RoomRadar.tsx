'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { fmtRange, type RoomLink } from '@/lib/multiplayer/room-link';
import { ROOM_MAX } from '@/lib/multiplayer/useExploreRoom';

/** The flight scene's view is this old: the ship is not flying, nothing to
 *  show. Long enough for a slow device's frames to come round. */
const STALE_VIEW_MS = 2000;
const LIST_EVERY_MS = 500;
const LIST_MAX = 5;
/** How far in from the screen's edge an arrow sits, px. */
const INSET = 34;

interface Row { id: string; name: string; km: number; faded: boolean }

/** Over the flight: an arrow at the screen's edge toward each pilot off the
 *  screen, and the nearest few with their range. It reads what the flight
 *  scene last drew of the others (`link.view`), on its own clock, and moves
 *  the arrows itself: nothing here re-renders sixty times a second. */
export function RoomRadar({ link }: { link: RoomLink }) {
  const t = useTranslations('solarSystem.room');
  const arrowsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let raf = 0;
    let lastList = 0;
    let lastJson = '';
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const view = link.view;
      const live = link.code !== null && performance.now() - view.at < STALE_VIEW_MS;
      const pilots = live ? view.pilots : [];
      const w = window.innerWidth;
      const h = window.innerHeight;
      let used = 0;
      for (const p of pilots) {
        if (p.onScreen || p.alpha <= 0) continue;
        const el = arrowsRef.current[used++];
        if (!el) break;
        // The edge of a box inset from the screen's, in the pilot's direction.
        const hx = w / 2 - INSET;
        const hy = h / 2 - INSET;
        const m = Math.max(Math.abs(p.x), Math.abs(p.y), 1e-6);
        const x = w / 2 + (p.x / m) * hx;
        const y = h / 2 - (p.y / m) * hy;
        const angle = Math.atan2(-p.y * hy, p.x * hx);
        el.style.display = '';
        el.style.opacity = String(p.alpha);
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        const tip = el.firstElementChild as HTMLElement | null;
        if (tip) tip.style.transform = `rotate(${angle.toFixed(3)}rad)`;
        const label = el.lastElementChild as HTMLElement | null;
        const text = `${p.name || '…'} · ${fmtRange(p.km)}`;
        if (label && label.textContent !== text) label.textContent = text;
        // The label stays on the screen's side of its arrow.
        el.dataset.side = x > w * 0.66 ? 'left' : x < w * 0.33 ? 'right' : y < h / 2 ? 'below' : 'above';
      }
      for (let i = used; i < arrowsRef.current.length; i++) {
        const el = arrowsRef.current[i];
        if (el) el.style.display = 'none';
      }
      if (now - lastList < LIST_EVERY_MS) return;
      lastList = now;
      const next: Row[] | null = live
        ? pilots.slice(0, LIST_MAX).map((p) => ({ id: p.id, name: p.name || '…', km: Math.round(p.km), faded: p.alpha < 1 }))
        : null;
      const json = JSON.stringify(next);
      if (json !== lastJson) {
        lastJson = json;
        setRows(next);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [link]);

  return (
    <>
      <div className="room-radar" aria-hidden>
        {Array.from({ length: ROOM_MAX - 1 }, (_, i) => (
          <div key={i} className="room-radar__arrow" style={{ display: 'none' }} ref={(el) => { arrowsRef.current[i] = el; }}>
            <span className="room-radar__tip" />
            <span className="room-radar__name" />
          </div>
        ))}
      </div>
      {rows && (
        <section className="room-nearby" aria-label={t('nearby')}>
          <h3 className="room-nearby__title">{t('nearby')}</h3>
          {rows.length === 0 ? <p className="room-nearby__none">{t('nearbyNone')}</p> : (
            <ul className="room-nearby__list">
              {rows.map((r) => (
                <li key={r.id} className={r.faded ? 'room-nearby__row is-faded' : 'room-nearby__row'}>
                  <span className="room-nearby__name">{r.name}</span>
                  <span className="room-nearby__km">{fmtRange(r.km)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
