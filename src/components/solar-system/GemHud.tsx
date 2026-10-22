'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Gem } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { GEM_INFO, type GemKind } from '@/lib/solar-system/gem-layout';
import { useGemSync } from '@/components/play/useGemSync';

/** What the glass reads from either surface's telemetry. */
export interface GemTelemetry {
  phase: string;
  gems: number;
  gemsTotal: number;
  gemPoints: number;
  gemLast: GemKind | '';
  gemPicks: number;
}

export interface GemHudHandle {
  /** Called from the surface's HUD loop: writes the DOM directly, no React render. */
  paint: (tel: GemTelemetry) => void;
}

const TOAST_MS = 2600;

/**
 * The gem tally in the surface's bottom-right tray (gems held here of the
 * world's total, and their points), and a line across the glass for each
 * pickup ("+50 · Diamond"). It also keeps the platform in step
 * (useGemSync) for as long as a surface is up.
 */
export const GemHud = forwardRef<GemHudHandle>(function GemHud(_props, ref) {
  const t = useTranslations('solarSystem.gems');
  const tRef = useRef(t);
  tRef.current = t;
  const boxRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const pointsRef = useRef<HTMLElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const seen = useRef(-1);
  const until = useRef(0);
  useGemSync();

  useImperativeHandle(ref, () => ({
    paint(tel) {
      const box = boxRef.current;
      const on = tel.phase === 'surface' && tel.gemsTotal > 0;
      if (box && box.hidden === on) box.hidden = !on;
      const count = `${tel.gems} / ${tel.gemsTotal}`;
      if (countRef.current && countRef.current.textContent !== count) countRef.current.textContent = count;
      const pts = tRef.current('points', { n: tel.gemPoints });
      if (pointsRef.current && pointsRef.current.textContent !== pts) pointsRef.current.textContent = pts;
      const toast = toastRef.current;
      if (!toast) return;
      // The first paint only learns the count: no toast for what was already held.
      if (seen.current < 0) seen.current = tel.gemPicks;
      if (tel.gemPicks !== seen.current) {
        seen.current = tel.gemPicks;
        if (tel.gemLast) {
          toast.textContent = tRef.current('picked', { points: GEM_INFO[tel.gemLast].points, kind: tRef.current(`kinds.${tel.gemLast}`) });
          toast.dataset.kind = tel.gemLast;
          // Restart the rise: off, a reflow, on.
          toast.hidden = true;
          void toast.offsetWidth;
          toast.hidden = false;
          until.current = performance.now() + TOAST_MS;
          if (box) { box.dataset.tick = box.dataset.tick === '1' ? '2' : '1'; }
        }
      } else if (!toast.hidden && performance.now() > until.current) {
        toast.hidden = true;
      }
    },
  }), []);

  return (
    <>
      <span ref={boxRef} className="moon-hud__carry moon-hud__crystals moon-hud__gems" role="status" aria-label={t('label')} hidden>
        <Gem size={14} aria-hidden /><i>{t('label')}</i><span ref={countRef} /><b ref={pointsRef} className="moon-hud__gems-points" />
      </span>
      <div ref={toastRef} className="moon-hud__gem-toast" role="status" aria-live="polite" hidden />
    </>
  );
});
