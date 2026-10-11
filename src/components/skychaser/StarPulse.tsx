'use client';

import { useEffect, useRef } from 'react';
import type { SupernovaHandle } from './supernova/engine';

/**
 * The star before the reveal: the same star the supernova opens with, drawn by
 * the same engine, breathing on a slow heartbeat and waiting to be lit. Every
 * card is born inside it. It draws only while on screen; without WebGL, or
 * before the engine arrives, a still CSS star stands in.
 */
export default function StarPulse({ className = '', centre = 0.5, tone = '#f0c75e', label, breathe = false, clear = false }: { className?: string; centre?: number; tone?: string; label?: string; breathe?: boolean; clear?: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let live = true;
    let handle: SupernovaHandle | null = null;
    let seen = true;
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      handle?.setPaused(!seen);
    }, { rootMargin: '120px' });
    io.observe(el);
    import('./supernova/engine').then(({ startSupernova }) => {
      if (!live || !root.current) return;
      handle = startSupernova(root.current, {
        rarity: 'common',
        tone,
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        sound: false,
        onDone: () => undefined,
        waiting: true,
        breathe,
        clear,
        centre,
      });
      handle.setPaused(!seen);
    });
    return () => {
      live = false;
      io.disconnect();
      handle?.destroy();
    };
  }, [centre, tone, breathe, clear]);

  return (
    <div ref={root} className={`sd-starpulse ${breathe ? 'sd-starpulse--breathe ' : ''}${className}`.trim()} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <canvas className="sd-starpulse__sky" data-sn="sky" />
    </div>
  );
}
