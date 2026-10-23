'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Phase = 'idle' | 'loading' | 'done';

/** A thin accent line along the top from the press of a link to the new page, so a tap never feels unanswered. */
export default function SkychaserNavProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a');
      if (!a || !a.href || a.hasAttribute('download') || (a.target && a.target !== '_self')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      clearTimeout(timer.current);
      setPhase('loading');
      timer.current = setTimeout(() => setPhase('idle'), 10000);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    setPhase((p) => {
      if (p !== 'loading') return p;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase('idle'), 450);
      return 'done';
    });
  }, [pathname]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return <div className="sd-navprog" data-phase={phase} aria-hidden="true" />;
}
