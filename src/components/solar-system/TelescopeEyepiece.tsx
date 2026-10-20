'use client';

import { useEffect, useMemo, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BRIGHT_STARS } from '@/lib/sky/stars';
import { eyepieceView, FIELD_ARCSEC, MAGNIFICATION, type EyepieceView } from '@/lib/solar-system/world-earth-eyepiece';
import { tbilisiClock, type SkyTarget } from '@/lib/solar-system/world-earth-tonight';

interface TelescopeEyepieceProps {
  target: SkyTarget;
  date: Date;
  onClose: () => void;
}

const SIZE = 520;

/** Colours of the discs as a small refractor shows them. */
const DISC: Record<string, [string, string]> = {
  jupiter: ['#efe3cc', '#b99a74'],
  saturn: ['#eadcb6', '#b8a07a'],
  mars: ['#e8a476', '#b8653e'],
  venus: ['#fbf8ee', '#dcd6c4'],
  mercury: ['#d9d3c9', '#9c968d'],
};

function draw(ctx: CanvasRenderingContext2D, view: EyepieceView, moonImg: HTMLImageElement | null, jitter: number) {
  const px = SIZE / FIELD_ARCSEC;
  const c = SIZE / 2;
  ctx.save();
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = '#020306';
  ctx.fillRect(0, 0, SIZE, SIZE);
  // A little seeing: the whole image shivers by a fraction of an arcsecond.
  ctx.translate(Math.sin(jitter * 13.1) * 0.5, Math.cos(jitter * 11.7) * 0.5);
  const up = (a: number): [number, number] => [Math.sin(a), -Math.cos(a)];
  const t = view.target;
  for (const o of view.objects) {
    const x = c + o.x * px; const y = c - o.y * px;
    if (o === view.objects[0] && o.size > 0) continue;
    // A point source: the Airy disc and a faint first ring.
    const b = Math.max(0.25, Math.min(1, 1.1 - (o.mag + 1) * 0.12));
    const g = ctx.createRadialGradient(x, y, 0, x, y, 3.2);
    g.addColorStop(0, `rgba(255,255,255,${b})`);
    g.addColorStop(0.5, `rgba(235,240,255,${b * 0.45})`);
    g.addColorStop(1, 'rgba(235,240,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(220,228,255,${b * 0.12})`;
    ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
  }
  if (t.size > 0) {
    const r = (t.size / 2) * px;
    const [sx, sy] = up(view.sunAngle);
    if (t.id === 'moon' && moonImg) {
      // The real map on the disc, the terminator where the Sun puts it.
      ctx.save();
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(moonImg, moonImg.width * 0.25, 0, moonImg.width * 0.5, moonImg.height, c - r, c - r, r * 2, r * 2);
      ctx.restore();
      shade(ctx, c, c, r, sx, sy, view.phase, 0.94);
    } else if (t.id === 'saturn') {
      const [ax, ay] = up(view.axisAngle);
      const ring = (rr: number, width: number, colour: string, front: boolean) => {
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate(Math.atan2(ay, ax));
        ctx.strokeStyle = colour; ctx.lineWidth = width;
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, Math.max(0.6, rr * view.ringOpen), 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      };
      ring(r * 2.02, r * 0.36, 'rgba(214,196,160,0.9)', false);
      ring(r * 1.62, r * 0.4, 'rgba(236,222,190,0.95)', false);
      disc(ctx, c, c, r, DISC.saturn, view.axisAngle, true);
      ring(r * 2.02, r * 0.36, 'rgba(214,196,160,0.9)', true);
      ring(r * 1.62, r * 0.4, 'rgba(236,222,190,0.95)', true);
    } else {
      disc(ctx, c, c, r, DISC[t.id] ?? DISC.mercury, view.axisAngle, t.id === 'jupiter');
      if (t.id === 'venus' || t.id === 'mercury') shade(ctx, c, c, r, sx, sy, view.phase, 1);
    }
  } else {
    const g = ctx.createRadialGradient(c, c, 0, c, c, 5);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(240,244,255,0.7)'); g.addColorStop(1, 'rgba(240,244,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c, c, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(230,236,255,0.18)';
    ctx.beginPath(); ctx.arc(c, c, 8, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // The field stop, soft at the edge.
  const v = ctx.createRadialGradient(c, c, SIZE * 0.44, c, c, SIZE * 0.5);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, SIZE, SIZE);
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, [light, dark]: [string, string], axis: number, banded: boolean) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, light); g.addColorStop(0.8, light); g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  if (banded) {
    // Two dark equatorial belts either side of the equator, across the axis.
    ctx.translate(x, y);
    ctx.rotate(axis - Math.PI / 2);
    ctx.fillStyle = 'rgba(120,86,60,0.45)';
    for (const at of [-0.3, 0.22]) ctx.fillRect(-r, at * r, r * 2, r * 0.16);
  }
  ctx.restore();
}

/** Darken the unlit part of a disc: lit fraction `phase`, the Sun toward (sx, sy). */
function shade(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, sx: number, sy: number, phase: number, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.atan2(sy, sx));
  // In this frame the Sun is along +x. The terminator is an ellipse of half-width |1 − 2·phase|·r.
  const k = (1 - 2 * phase) * r;
  ctx.fillStyle = `rgba(2,3,6,${alpha})`;
  ctx.beginPath();
  ctx.arc(0, 0, r + 0.5, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.ellipse(0, 0, Math.abs(k), r + 0.5, 0, -Math.PI / 2, Math.PI / 2, k < 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function TelescopeEyepiece({ target, date, onClose }: TelescopeEyepieceProps) {
  const t = useTranslations('solarSystem.worlds.earth.eyepiece');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useMemo(() => eyepieceView(target, date), [target, date]);
  const starName = target.kind === 'star' ? (BRIGHT_STARS.find((s) => s.id === target.id)?.name ?? target.id) : '';

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let moonImg: HTMLImageElement | null = null;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 90) return;
      last = now;
      draw(ctx, view, moonImg, now / 1000);
    };
    if (target.id === 'moon') {
      const img = new Image();
      img.onload = () => { moonImg = img; };
      img.src = '/solar-system/planets/moon.jpg';
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, target.id]);

  const name = target.kind === 'star' ? t('targets.star', { name: starName }) : t(`targets.${target.id}`);
  return (
    <div className="earth-eyepiece" role="dialog" aria-label={t('title', { mag: MAGNIFICATION })}>
      <div className="earth-eyepiece__field">
        <canvas ref={canvasRef} width={SIZE} height={SIZE} className="earth-eyepiece__canvas" />
      </div>
      <div className="earth-eyepiece__card">
        <div className="earth-eyepiece__head">
          <span className="earth-eyepiece__name">{name}</span>
          <button type="button" className="earth-eyepiece__close" onClick={onClose} aria-label={t('close')}><X size={16} aria-hidden /></button>
        </div>
        <span className="earth-eyepiece__tag">{t('title', { mag: MAGNIFICATION })}</span>
        <dl className="earth-eyepiece__rows">
          <div><dt>{t('alt')}</dt><dd>{target.alt.toFixed(1)}°</dd></div>
          <div><dt>{t('az')}</dt><dd>{target.az.toFixed(1)}°</dd></div>
          <div><dt>{t('brightness')}</dt><dd>{target.mag.toFixed(1)}</dd></div>
          {target.size > 0 && <div><dt>{t('size')}</dt><dd>{target.size >= 120 ? `${(target.size / 60).toFixed(1)}′` : `${target.size.toFixed(1)}″`}</dd></div>}
          {target.kind !== 'star' && <div><dt>{t('phase')}</dt><dd>{Math.round(target.phase * 100)}%</dd></div>}
          <div><dt>{t('time')}</dt><dd>{tbilisiClock(date)}</dd></div>
        </dl>
        <p className="earth-eyepiece__note">{t('note')}</p>
      </div>
    </div>
  );
}
