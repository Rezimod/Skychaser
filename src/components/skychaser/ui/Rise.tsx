'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A section that arrives as it is scrolled to, once.
 *
 * The wrapper only takes the hiding class after the client has armed it, so a
 * reader whose JavaScript never runs sees the section rather than an empty
 * page. Under reduced motion it never arms at all.
 */
export default function Rise({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setArmed(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setSeen(true);
      },
      { threshold: 0.2 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${armed ? 'sd-rise' : ''} ${seen ? 'is-in' : ''}`.trim()}>
      {children}
    </div>
  );
}
