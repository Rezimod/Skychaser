'use client';

import { useEffect, useState } from 'react';

export type LoaderVariant = 'orrery' | 'descent' | 'ascent' | 'hyperspace' | 'entry' | 'insertion';
/** The world in the middle of the screen, photographed where there is a photograph. */
export type LoaderBody = 'earth' | 'moon' | 'mars' | 'proximaB' | 'mercury' | 'venus' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

interface CosmicLoaderProps {
  label: string;
  detail?: string;
  className?: string;
  /** What turns in the middle: a world with its moon, a world's limb with
   *  a lander going down or up, the star streaks of a ship under way, the
   *  entry — the world growing in the windscreen through a sheet of plasma —
   *  or orbit insertion: the world turning below, a ship settling onto a low
   *  orbit round it. The entry itself is flown in the surface scene now, so
   *  insertion is calm: no plasma. */
  variant?: LoaderVariant;
  /** Which world; each variant has its own default. */
  body?: LoaderBody;
  /** Lines to hand the reader while they wait; one at a time, in order. */
  tips?: string[];
  /** 0..1 when the caller knows how far along it is; otherwise the bar sweeps. */
  progress?: number;
}

/** Deterministic pseudo-random stars, so the server and the client draw the same sky. */
function starShadows(count: number, seed: number): string {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.round(rnd() * 100);
    const y = Math.round(rnd() * 100);
    const a = (0.25 + rnd() * 0.65).toFixed(2);
    out.push(`${x}vw ${y}vh 0 0 rgba(236, 240, 255, ${a})`);
  }
  return out.join(',');
}
const NEAR = starShadows(90, 7);
const FAR = starShadows(160, 131);
const STREAKS = Array.from({ length: 24 }, (_, i) => i);
/** The plasma of the entry: fewer, and they come from the world ahead. */
const PLASMA = Array.from({ length: 18 }, (_, i) => i);
/** How long each tip stays up. */
const TIP_MS = 3800;
const MAPS: Record<LoaderBody, string> = {
  earth: '/solar-system/planets/earth-1k.jpg',
  moon: '/solar-system/planets/moon-512.jpg',
  mars: '/solar-system/planets/mars-1k.jpg',
  // No photograph of Proxima b exists; the Earth's, turned to its colours.
  proximaB: '/solar-system/planets/earth-1k.jpg',
  mercury: '/solar-system/planets/mercury.jpg',
  venus: '/solar-system/planets/venus.jpg',
  jupiter: '/solar-system/planets/jupiter.jpg',
  saturn: '/solar-system/planets/saturn.jpg',
  uranus: '/solar-system/planets/uranus.jpg',
  neptune: '/solar-system/planets/neptune.jpg',
};

/** A photographed world: its map scrolls behind a round window, lit from
 *  the upper left, with the night side and the air drawn over it. */
function Globe({ body, className }: { body: LoaderBody; className: string }) {
  return (
    <span className={`cosmic-globe ${className}`} data-body={body} aria-hidden>
      <span className="cosmic-globe__map" style={{ backgroundImage: `url(${MAPS[body]})` }} />
      <span className="cosmic-globe__shade" />
    </span>
  );
}

/** The loader's sky; the game's menus stand in front of the same one. */
export function CosmicSky() {
  return (
    <span className="cosmic-loader__sky" aria-hidden>
      <span className="cosmic-loader__nebula"><i /><i /></span>
      <span className="cosmic-loader__stars" style={{ boxShadow: FAR }} />
      <span className="cosmic-loader__stars cosmic-loader__stars--near" style={{ boxShadow: NEAR }} />
    </span>
  );
}

/** A world with the Moon going round it, far side and all. */
export function CosmicSystem({ body = 'earth', className }: { body?: LoaderBody; className?: string }) {
  return (
    <div className={className ? `cosmic-loader__system ${className}` : 'cosmic-loader__system'} aria-hidden>
      <Globe body={body} className="cosmic-loader__world" />
      <span className="cosmic-loader__orbit">
        <span className="cosmic-loader__carrier"><Globe body="moon" className="cosmic-loader__satellite" /></span>
      </span>
    </div>
  );
}

/** The wait before a 3D scene. Everything that moves here moves by transform
 *  or opacity alone, so it keeps moving on the compositor while the main
 *  thread is busy building the scene behind it. */
export function CosmicLoader({ label, detail, className, variant = 'orrery', body, tips, progress }: CosmicLoaderProps) {
  const [tip, setTip] = useState(0);
  const count = tips?.length ?? 0;
  useEffect(() => {
    if (count < 2) return;
    const id = window.setInterval(() => setTip((i) => (i + 1) % count), TIP_MS);
    return () => window.clearInterval(id);
  }, [count]);
  const world = body ?? (variant === 'orrery' ? 'earth' : 'moon');
  const known = progress !== undefined;
  return (
    <div className={className ? `cosmic-loader ${className}` : 'cosmic-loader'} data-variant={variant} role="status" aria-live="polite">
      <CosmicSky />
      <div className="cosmic-loader__stage" aria-hidden>
        {variant === 'orrery' && <CosmicSystem body={world} />}
        {(variant === 'descent' || variant === 'ascent') && (
          <div className="cosmic-loader__approach">
            <Globe body={world} className="cosmic-loader__limb" />
            <span className="cosmic-loader__craft">
              <svg viewBox="0 0 40 44" className="cosmic-loader__lander">
                <path d="M13 4h14l5 10v9H8v-9z" fill="#d7d2c8" />
                <path d="M8 14h24v4H8z" fill="#9a958c" />
                <rect x="16" y="7" width="8" height="5" rx="1" fill="#1c2233" />
                <path d="M12 23l-6 13M28 23l6 13M4 36h6M30 36h6M17 23h6l-1 5h-4z" stroke="#b9b4aa" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              </svg>
              <i className="cosmic-loader__flame" />
            </span>
            <span className="cosmic-loader__dust" />
          </div>
        )}
        {variant === 'hyperspace' && (
          <div className="cosmic-loader__streaks">
            {STREAKS.map((i) => <span key={i} style={{ '--i': i } as React.CSSProperties} />)}
            <b />
          </div>
        )}
        {variant === 'insertion' && (
          <div className="cosmic-loader__insertion" data-body={world}>
            <Globe body={world} className="cosmic-loader__below" />
            <span className="cosmic-loader__track"><i className="cosmic-loader__ship" /></span>
          </div>
        )}
        {variant === 'entry' && (
          <div className="cosmic-loader__entry" data-body={world}>
            <Globe body={world} className="cosmic-loader__planet" />
            <span className="cosmic-loader__plasma">
              {PLASMA.map((i) => <i key={i} style={{ '--i': i } as React.CSSProperties} />)}
            </span>
            <span className="cosmic-loader__shock" />
            <span className="cosmic-loader__heat" />
          </div>
        )}
      </div>
      <div className="cosmic-loader__copy">
        <p className="cosmic-loader__label">{label}</p>
        {detail && <p className="cosmic-loader__detail">{detail}{known && <b className="cosmic-loader__pct">{Math.round(Math.min(1, Math.max(0, progress)) * 100)}%</b>}</p>}
        <span className="cosmic-loader__bar" data-determinate={known ? '' : undefined} aria-hidden>
          <i style={known ? { transform: `scaleX(${Math.min(1, Math.max(0.02, progress))})` } : undefined} />
        </span>
        {count > 0 && tips && <p key={tip} className="cosmic-loader__tip">{tips[tip]}</p>}
      </div>
    </div>
  );
}
