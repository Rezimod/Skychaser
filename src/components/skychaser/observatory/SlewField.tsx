'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { SPIN_DOWN_S, SPIN_UP_S } from '@/lib/observatory/mount-drive';

/** A GoTo as the eyepiece sees it: when the axes run, and which way the field travels on screen. */
export type SlewPan = { startsAtMs: number; stopsAtMs: number; dx: number; dy: number };

/** Cruise speed of the field, in view widths per second: fast enough to read as a slew, slow enough to see the stars go by. */
const CRUISE_W_S = 1;
/** How long a star's trail is, as seconds of travel. */
const TRAIL_S = 0.03;
const FADE_MS = 450;
const STARS = (() => {
  let s = 0x5a7e;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  return Array.from({ length: 340 }, () => {
    const m = rnd() ** 2.6;
    const warm = rnd();
    return {
      x: rnd(),
      y: rnd(),
      r: 0.45 + m * 1.9,
      a: 0.28 + m * 0.72,
      c: warm < 0.12 ? '255, 214, 170' : warm < 0.24 ? '186, 210, 255' : '244, 244, 242',
    };
  });
})();

/** The axes' speed at s seconds into a slew of T seconds, 0-1: spin up, cruise, spin down. */
const speed = (s: number, T: number) => Math.max(0, Math.min(1, s / SPIN_UP_S, (T - s) / SPIN_DOWN_S));

/** Distance the field covers between a and b seconds, in cruise-seconds. */
function travel(a: number, b: number, T: number) {
  const step = 1 / 240;
  let d = 0;
  for (let t = a; t < b; t += step) d += speed(t + step / 2, T) * Math.min(step, b - t);
  return d;
}

/**
 * While the mount slews, the stars stream across the eyepiece against the
 * direction of travel, and the target arrives from ahead as the axes spin
 * down, stopping where the mount lands.
 */
export default function SlewField({ pan, artRef }: { pan: SlewPan; artRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const T = Math.max(0.01, (pan.stopsAtMs - pan.startsAtMs) / 1000);
    const len = Math.hypot(pan.dx, pan.dy);
    const ux = len > 0 ? pan.dx / len : 1;
    const uy = len > 0 ? pan.dy / len : 0;
    const total = travel(0, T, T);
    let handle = 0;

    const draw = () => {
      const now = Date.now();
      const s = Math.min(T, Math.max(0, (now - pan.startsAtMs) / 1000));
      const rect = canvas.getBoundingClientRect();
      const W = Math.max(1, Math.round(rect.width));
      const H = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cruise = CRUISE_W_S * W;
      const v = speed(s, T) * cruise;
      const done = travel(0, s, T) * cruise;
      const ahead = (total - travel(0, s, T)) * cruise;

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#020202';
      ctx.fillRect(0, 0, W, H);
      ctx.lineCap = 'round';
      const tile = Math.max(W, H) * 1.15;
      const tail = v * TRAIL_S;
      for (const st of STARS) {
        const x = ((((st.x * tile - ux * done) % tile) + tile) % tile) - (tile - W) / 2;
        const y = ((((st.y * tile - uy * done) % tile) + tile) % tile) - (tile - H) / 2;
        if (x < -tail - 4 || x > W + tail + 4 || y < -tail - 4 || y > H + tail + 4) continue;
        const stretch = Math.max(1, tail / (st.r * 2));
        ctx.globalAlpha = st.a / Math.sqrt(stretch);
        ctx.strokeStyle = `rgb(${st.c})`;
        ctx.lineWidth = st.r * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ux * tail + 0.01, y + uy * tail);
        ctx.stroke();
        if (st.r > 1.5 && tail < 6) {
          ctx.globalAlpha = st.a * 0.18;
          ctx.fillStyle = `rgb(${st.c})`;
          ctx.beginPath();
          ctx.arc(x, y, st.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const art = artRef.current;
      if (art) {
        art.style.translate = `${(ux * ahead).toFixed(1)}px ${(uy * ahead).toFixed(1)}px`;
        art.style.filter = v > 1 ? `blur(${Math.min(3, v / 900).toFixed(2)}px)` : '';
      }
      const fade = now <= pan.stopsAtMs ? 1 : Math.max(0, 1 - (now - pan.stopsAtMs) / FADE_MS);
      canvas.style.opacity = String(fade);
      if (fade > 0) handle = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(handle);
      const art = artRef.current;
      if (art) {
        art.style.translate = '';
        art.style.filter = '';
      }
    };
  }, [pan, artRef]);

  return <canvas ref={canvasRef} className="sdo-slewfield" aria-hidden="true" />;
}
