'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Shot from './Shot';
import { HERO_FIRST, type ShotName } from '../shots';

/** The descent, as the game flies it: one frame per phase, with the altitude
 *  the HUD showed when it was captured. It opens on the entry (the most
 *  light on screen) and loops back up through orbit. */
const REEL: ReadonlyArray<{ shot: ShotName; phase: 'orbit' | 'entry' | 'descent' | 'jetpack' | 'eva'; body: 'moon' | 'earth' | 'mars'; alt: number }> = [
  { shot: HERO_FIRST, phase: 'entry', body: 'mars', alt: 61_800 },
  { shot: 'mars-descent', phase: 'descent', body: 'mars', alt: 133 },
  { shot: 'moon-jetpack', phase: 'jetpack', body: 'moon', alt: 8.8 },
  { shot: 'mars-suit', phase: 'eva', body: 'mars', alt: 0 },
  { shot: 'mars-orbit', phase: 'orbit', body: 'mars', alt: 250_000 },
];
const HOLD_MS = 6000;

function formatAlt(m: number): string {
  if (m >= 1000) return `${Math.round(m / 1000).toLocaleString('en-US')} km`;
  if (m >= 100) return `${Math.round(m)} m`;
  return `${m.toFixed(1)} m`;
}

/** Counts the altimeter down (or up) on a log scale, as a falling ship reads it. */
function useAltimeter(target: number, still: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (still) { setShown(target); from.current = target; return; }
    const a = Math.log10(from.current + 1);
    const b = Math.log10(target + 1);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1400);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.pow(10, a + (b - a) * e) - 1;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, still]);
  return shown;
}

export default function HeroReel() {
  const t = useTranslations('exploreSite.hero');
  const [index, setIndex] = useState(0);
  // Only the first frame loads with the page; the rest follow once it has painted.
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [offscreen, setOffscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    const id = window.setTimeout(() => setLoaded(true), 900);
    const el = root.current;
    const io = el ? new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting), { threshold: 0.05 }) : null;
    if (el && io) io.observe(el);
    const onVis = () => setOffscreen(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      mq.removeEventListener('change', sync);
      window.clearTimeout(id);
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const running = loaded && !paused && !reduced && !offscreen;
  useEffect(() => {
    if (!running) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % REEL.length), HOLD_MS);
    return () => window.clearTimeout(id);
  }, [running, index]);

  const frame = REEL[index];
  const alt = useAltimeter(frame.alt, reduced || !loaded);

  return (
    <div ref={root} className={`xs-reel${running ? ' is-running' : ''}`} aria-roledescription="carousel" aria-label={t('reelLabel')}>
      <div className="xs-reel__frames">
        {REEL.map((f, i) => (loaded || i === 0) && (
          <div key={f.shot} className={`xs-reel__frame${i === index ? ' is-on' : ''}`} aria-hidden={i !== index}>
            <Shot name={f.shot} alt={i === index ? `${t(`phases.${f.phase}`)} — ${t(`bodies.${f.body}`)}` : ''} sizes="100vw" priority={i === 0} portrait />
          </div>
        ))}
      </div>
      <div className="xs-reel__shade" aria-hidden />

      <dl className="xs-telemetry" aria-live="polite">
        <div><dt>{t('body')}</dt><dd>{t(`bodies.${frame.body}`)}</dd></div>
        <div><dt>{t('phase')}</dt><dd>{t(`phases.${frame.phase}`)}</dd></div>
        <div className="xs-telemetry__alt"><dt>{t('altitude')}</dt><dd>{formatAlt(alt)}</dd></div>
      </dl>

      <div className="xs-reel__progress">
        <ol>
          {REEL.map((f, i) => (
            <li key={f.shot} className={i < index ? 'is-past' : i === index ? 'is-now' : ''}>
              <button type="button" onClick={() => setIndex(i)} aria-label={t(`phases.${f.phase}`)} aria-current={i === index}>
                <span className="xs-reel__bar"><span style={{ animationDuration: `${HOLD_MS}ms` }} /></span>
                <span className="xs-reel__tick">{String(i + 1).padStart(2, '0')}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="xs-reel__toggle" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? t('resume') : t('pause')}>
          {paused ? (
            <svg viewBox="0 0 16 16" aria-hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
