'use client';

/* eslint-disable @next/next/no-img-element -- frames are pre-encoded to AVIF/WebP */
import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Shot from './Shot';
import { shotSrc, type ShotName } from '../shots';

const ITEMS: ReadonlyArray<{ shot: ShotName; key: string; span?: 'wide' | 'tall' }> = [
  { shot: 'earth-entry', key: 'entry', span: 'wide' },
  { shot: 'mars-suit', key: 'marsSuit', span: 'tall' },
  { shot: 'moon-jetpack', key: 'jetpack' },
  { shot: 'tbilisi-descent', key: 'tbilisi' },
  { shot: 'mars-arch', key: 'marsArch', span: 'wide' },
  { shot: 'moon-flag', key: 'lander' },
  { shot: 'proxima-crystals', key: 'proximaCrystals', span: 'tall' },
  { shot: 'moon-braking', key: 'moonBraking' },
  { shot: 'proxima-giant', key: 'proximaGiant' },
  { shot: 'mars-domes', key: 'marsDomes', span: 'wide' },
];

export default function Gallery() {
  const t = useTranslations('exploreSite.gallery');
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(0);

  const show = useCallback((i: number) => {
    setOpen(i);
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  const step = (d: number) => setOpen((i) => (i + d + ITEMS.length) % ITEMS.length);
  const item = ITEMS[open];

  return (
    <>
      <ul className="xs-gallery">
        {ITEMS.map((it, i) => (
          <li key={it.shot} className={it.span ? `is-${it.span}` : undefined}>
            <button type="button" onClick={() => show(i)} aria-label={t('open', { label: t(`items.${it.key}`) })}>
              <Shot name={it.shot} alt="" sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" />
              <span className="xs-gallery__cap">{t(`items.${it.key}`)}</span>
            </button>
          </li>
        ))}
      </ul>
      <dialog
        ref={dialog}
        className="xs-lightbox"
        aria-label={t(`items.${item.key}`)}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') step(1);
          if (e.key === 'ArrowLeft') step(-1);
        }}
      >
        <figure>
          <picture>
            <source type="image/avif" srcSet={shotSrc(item.shot, 1280, 'avif')} />
            <img src={shotSrc(item.shot, 1280, 'webp')} alt={t(`items.${item.key}`)} width={1280} height={720} />
          </picture>
          <figcaption>
            <span className="xs-lightbox__n">{String(open + 1).padStart(2, '0')} / {String(ITEMS.length).padStart(2, '0')}</span>
            {t(`items.${item.key}`)}
          </figcaption>
        </figure>
        <button type="button" className="xs-lightbox__nav is-prev" onClick={() => step(-1)} aria-label={t('prev')}>
          <svg viewBox="0 0 16 16" aria-hidden><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
        <button type="button" className="xs-lightbox__nav is-next" onClick={() => step(1)} aria-label={t('next')}>
          <svg viewBox="0 0 16 16" aria-hidden><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
        </button>
        <form method="dialog">
          <button className="xs-lightbox__close" aria-label={t('close')}>
            <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </form>
      </dialog>
    </>
  );
}
