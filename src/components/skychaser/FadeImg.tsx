'use client';

import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

/** How far ahead of the viewport a lazy card starts loading. */
const AHEAD = '600px 0px';

/**
 * A card image that fades in once it has loaded, over whatever stands behind it.
 * A priority image loads at once with high priority and shows the moment it
 * arrives, without waiting for the page to hydrate; any other starts loading
 * when it comes within AHEAD of the viewport.
 */
export default function FadeImg({ priority = false, ...img }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) {
  const ref = useRef<HTMLImageElement>(null);
  const [on, setOn] = useState(false);
  const [near, setNear] = useState(priority);

  useEffect(() => {
    const el = ref.current;
    if (el?.complete && el.naturalWidth) setOn(true);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: AHEAD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  return (
    <img
      {...img}
      ref={ref}
      alt={img.alt ?? ''}
      loading={near ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      data-fade={priority ? undefined : ''}
      data-on={on ? '' : undefined}
      onLoad={() => setOn(true)}
    />
  );
}
