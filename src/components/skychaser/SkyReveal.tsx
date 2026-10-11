'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

type SkyObject = {
  id: string;
  name: string;
  des: string;
  x: number;
  y: number;
  s: number;
  feather: number;
};

/** The objects hidden in the home sky, placed round the words, each a card in the set. */
const OBJECTS: SkyObject[] = [
  { id: 'moon', name: 'The Moon', des: 'MOON', x: 0.5, y: 0.13, s: 0.13, feather: 0.72 },
  { id: 'm42', name: 'The Orion Nebula', des: 'M42', x: 0.14, y: 0.24, s: 0.19, feather: 0.4 },
  { id: 'm31', name: 'The Andromeda Galaxy', des: 'M31', x: 0.85, y: 0.2, s: 0.2, feather: 0.45 },
  { id: 'saturn', name: 'Saturn', des: 'SATURN', x: 0.11, y: 0.58, s: 0.12, feather: 0.6 },
  { id: 'jupiter', name: 'Jupiter', des: 'JUPITER', x: 0.88, y: 0.64, s: 0.078, feather: 0.8 },
  { id: 'm57', name: 'The Ring Nebula', des: 'M57', x: 0.24, y: 0.84, s: 0.066, feather: 0.55 },
  { id: 'mars', name: 'Mars', des: 'MARS', x: 0.76, y: 0.88, s: 0.048, feather: 0.8 },
  { id: 'venus', name: 'Venus', des: 'VENUS', x: 0.4, y: 0.92, s: 0.044, feather: 0.8 },
  { id: 'neptune', name: 'Neptune', des: 'NEPTUNE', x: 0.69, y: 0.07, s: 0.036, feather: 0.8 },
  { id: 'uranus', name: 'Uranus', des: 'URANUS', x: 0.04, y: 0.09, s: 0.036, feather: 0.8 },
  { id: 'sgra', name: 'Sagittarius A*', des: 'SGR-A', x: 0.58, y: 0.86, s: 0.09, feather: 0.55 },
  { id: 'mercury', name: 'Mercury', des: 'MERCURY', x: 0.965, y: 0.42, s: 0.032, feather: 0.8 },
];
const TOUR = ['moon', 'm42', 'sgra', 'saturn', 'm31', 'jupiter', 'm57', 'venus', 'mars', 'neptune', 'uranus', 'mercury'];
const CREAM = '244, 232, 204';

type Live = SkyObject & {
  bmp?: HTMLCanvasElement;
  ar: number;
  cx: number;
  cy: number;
  r: number;
  h: number;
  found: boolean;
  lit: boolean;
  litAt: number;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The black sky behind the home words. Twelve real objects sit in it unseen;
 * the pointer reveals the one beneath it, which ignites, settles into its true
 * colours and is named. One canvas, redrawn only while something still moves.
 * On a tablet, with no pointer, the sky tours its objects on its own. A phone
 * has no sky at all: the hero is just the words and the button.
 */
export default function SkyReveal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<HTMLCanvasElement>(null);
  const foundRef = useRef<HTMLElement>(null);
  const verbRef = useRef<HTMLSpanElement>(null);
  const router = useRouter();

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const starsCanvas = starsRef.current;
    const foundEl = foundRef.current;
    const hero = root?.parentElement;
    if (!root || !canvas || !starsCanvas || !foundEl || !hero || matchMedia('(max-width: 559px)').matches) return;
    const ctx = canvas.getContext('2d', { desynchronized: true });
    if (!ctx) return;

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hoverless = matchMedia('(hover: none)').matches;
    const objects: Live[] = OBJECTS.map((o) => ({ ...o, ar: 1, cx: 0, cy: 0, r: 0, h: 0, found: false, lit: false, litAt: 0 }));

    let W = 1, H = 1, dpr = 1, R = 120;
    let labelFont = '300 24px sans-serif';
    // The live layer only clears what it drew last frame.
    let dirty: number[] = [];
    let wasDirty: number[] = [];
    const mark = (x: number, y: number, w: number, h: number) => { dirty.push(x, y, w, h); };
    const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    let gain = 0, gainTgt = 0;
    let found = 0;
    let raf = 0, last = 0, activeUntil = 0, visible = true, dead = false;
    let touring = false, tourIdx = 0, tourTimer = 0;
    let rectCache: DOMRect | null = null;
    let target = '';
    let swallowClick = false;

    // Each photo feathered into the black once, kept as a bitmap.
    for (const o of objects) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        if (dead) return;
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d');
        if (!g) return;
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.save();
        g.translate(c.width / 2, c.height / 2);
        g.scale(c.width / 2, c.height / 2);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(o.feather, 'rgba(0,0,0,1)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(-1, -1, 2, 2);
        g.restore();
        o.bmp = c; o.ar = c.width / c.height;
        wake();
      };
      img.src = `/sky/reveal/${o.id}.webp`;
    }

    function buildStars() {
      starsCanvas!.width = W * dpr; starsCanvas!.height = H * dpr;
      const g = starsCanvas!.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const n = Math.round((W * H) / 2100);
      for (let i = 0; i < n; i++) {
        const x = rnd() * W, y = rnd() * H, m = rnd();
        const r = m > 0.97 ? 1.6 : m > 0.8 ? 1 : 0.6;
        const a = m > 0.97 ? 0.95 : 0.25 + rnd() * 0.5;
        g.fillStyle = rnd() < 0.22 ? `rgba(255,224,180,${a})` : `rgba(230,236,255,${a})`;
        g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
        if (m > 0.985) {
          g.strokeStyle = `rgba(255,248,230,${a * 0.5})`; g.lineWidth = 0.6;
          g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.moveTo(x, y - 6); g.lineTo(x, y + 6); g.stroke();
        }
      }
    }

    function layout() {
      const rect = root!.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width)); H = Math.max(1, Math.round(rect.height));
      // Never more than ~3.2 megapixels per layer, whatever the screen.
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (W * H)));
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      wasDirty = [0, 0, W, H];
      labelFont = `300 24px ${getComputedStyle(root!).getPropertyValue('--sd-spaced').trim() || 'sans-serif'}`;
      // The reach of the light: wide enough that pointing near an object shows most of it.
      R = Math.max(170, Math.min(300, W * 0.17));
      const base = Math.min(W, H * 1.6);
      for (const o of objects) { o.cx = o.x * W; o.cy = o.y * H; o.r = (o.s * base) / 2; }
      buildStars();
      wake();
    }

    function wake() {
      if (!raf && visible && !dead) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    function frame(now: number) {
      raf = 0;
      const dt = Math.min(now - last, 48); last = now;
      const k = reduced ? 1 : 1 - Math.exp(-dt / 45);
      cur.x += (tgt.x - cur.x) * k; cur.y += (tgt.y - cur.y) * k;
      gain += (gainTgt - gain) * (reduced ? 1 : 1 - Math.exp(-dt / 90));
      draw(now);
      const moving = Math.abs(tgt.x - cur.x) + Math.abs(tgt.y - cur.y) > 0.25 || Math.abs(gainTgt - gain) > 0.004 || now < activeUntil;
      if (moving) raf = requestAnimationFrame(frame);
    }

    function draw(now: number) {
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < wasDirty.length; i += 4) c.clearRect(wasDirty[i] - 2, wasDirty[i + 1] - 2, wasDirty[i + 2] + 4, wasDirty[i + 3] + 4);
      dirty = [];

      if (gain > 0.01) {
        const lg = c.createRadialGradient(cur.x, cur.y, 0, cur.x, cur.y, R * 1.4);
        lg.addColorStop(0, `rgba(${CREAM},${0.07 * gain})`); lg.addColorStop(0.5, `rgba(${CREAM},${0.02 * gain})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = lg; c.fillRect(cur.x - R * 1.4, cur.y - R * 1.4, R * 2.8, R * 2.8);
        mark(cur.x - R * 1.4, cur.y - R * 1.4, R * 2.8, R * 2.8);
      }

      let nearest: Live | null = null, nearestA = 0;
      for (const o of objects) {
        if (!o.bmp) continue;
        const d = Math.hypot(cur.x - o.cx, cur.y - o.cy);
        const inner = o.r * 0.9 + 24;
        let a = d <= inner ? 1 : 1 - (d - inner) / R;
        a = a <= 0 ? 0 : Math.pow(smooth(Math.min(1, a)), 0.7) * gain;
        if (a > 0.9 && !o.found) { o.found = true; found++; foundEl!.textContent = String(found); }
        if (a > 0.3 && !o.lit) { o.lit = true; o.litAt = now; activeUntil = Math.max(activeUntil, now + 1000); }
        if (a < 0.08) o.lit = false;
        const alpha = Math.max(o.found ? 0.035 : 0, a);
        if (alpha < 0.004) continue;
        const t = o.lit ? Math.min(1, (now - o.litAt) / 900) : 1;
        const pop = 1 - Math.pow(1 - t, 3);
        const sc = (0.84 + 0.16 * pop) * (0.96 + 0.04 * a);
        const w = (o.ar >= 1 ? o.r * 2 : o.r * 2 * o.ar) * sc, h = (o.ar >= 1 ? (o.r * 2) / o.ar : o.r * 2) * sc;
        c.globalAlpha = alpha;
        c.drawImage(o.bmp, o.cx - w / 2, o.cy - h / 2, w, h);
        mark(o.cx - w / 2, o.cy - h / 2, w, h);
        if (o.lit && t < 1) {
          // Ignition: a bloom of light and a moment of overexposure that settles.
          const br = o.r * (0.9 + t * 1.1);
          const fg = c.createRadialGradient(o.cx, o.cy, 0, o.cx, o.cy, br);
          fg.addColorStop(0, `rgba(255,240,214,${(1 - t) * 0.38 * a})`);
          fg.addColorStop(0.4, `rgba(255,214,160,${(1 - t) * 0.12 * a})`);
          fg.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = fg; c.fillRect(o.cx - br, o.cy - br, br * 2, br * 2);
          mark(o.cx - br, o.cy - br, br * 2, br * 2);
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = (1 - t) * 0.7 * a;
          c.drawImage(o.bmp, o.cx - w / 2, o.cy - h / 2, w, h);
          c.globalCompositeOperation = 'source-over';
        }
        c.globalAlpha = 1;
        o.h = h;
        if (a > nearestA) { nearestA = a; nearest = o; }
      }

      const next = nearest && nearestA > 0.85 ? (nearest as Live).des : '';
      if (next !== target) { target = next; root!.style.cursor = target ? 'pointer' : ''; }
      if (nearest && nearestA > 0.35) {
        const o = nearest as Live;
        const la = (nearestA - 0.35) / 0.65;
        const below = o.cy + o.h / 2 + 30 < H - 12;
        const ty = below ? o.cy + o.h / 2 + 26 : o.cy - o.h / 2 - 22;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.letterSpacing = '0.04em';
        c.font = labelFont;
        c.fillStyle = `rgba(${CREAM},${0.96 * la})`;
        const lx = Math.min(W - 80, Math.max(80, o.cx));
        c.fillText(o.name, lx, ty);
        const tw = c.measureText(o.name).width;
        mark(lx - tw / 2 - 8, ty - 18, tw + 16, 36);
        c.letterSpacing = '0px';
      }
      wasDirty = dirty;
    }

    function point(e: PointerEvent) {
      const r = rectCache || (rectCache = root!.getBoundingClientRect());
      tgt.x = e.clientX - r.left; tgt.y = Math.min(H, Math.max(0, e.clientY - r.top));
    }
    function startTour(delay: number) {
      stopTour();
      touring = true;
      const step = () => {
        const o = objects.find((x) => x.id === TOUR[tourIdx % TOUR.length])!; tourIdx++;
        tgt.x = o.cx; tgt.y = o.cy; gainTgt = 1; wake();
        tourTimer = window.setTimeout(step, 2600);
      };
      tourTimer = window.setTimeout(step, delay);
    }
    function stopTour() { if (touring) { touring = false; clearTimeout(tourTimer); } }

    // A mouse explores by moving; a finger taps. A tap sends the light to the nearest object;
    // a second tap on the lit one opens its card. Swipes still scroll the page.
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'touch') return; stopTour(); point(e); gainTgt = 1; wake(); };
    const onEnter = (e: PointerEvent) => { if (e.pointerType === 'touch') return; rectCache = null; point(e); gainTgt = 1; wake(); };
    const onLeave = (e: PointerEvent) => { if (e.pointerType === 'touch') return; gainTgt = 0; wake(); if (hoverless) startTour(2200); };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      rectCache = null;
      const r = root!.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let near: Live | null = null, best = Infinity;
      for (const o of objects) { const d = Math.hypot(x - o.cx, y - o.cy) - o.r; if (d < best) { best = d; near = o; } }
      if (!near) return;
      if (target === near.des && Math.hypot(cur.x - near.cx, cur.y - near.cy) < near.r) { swallowClick = false; return; }
      swallowClick = true;
      stopTour();
      tgt.x = near.cx; tgt.y = near.cy; gainTgt = 1; wake();
      startTour(6000);
    };
    const onClick = () => {
      if (swallowClick) { swallowClick = false; return; }
      if (target) router.push(`/card/${target}`);
    };
    const onScroll = () => { rectCache = null; };
    hero.addEventListener('pointermove', onMove, { passive: true });
    hero.addEventListener('pointerenter', onEnter);
    hero.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('click', onClick);
    addEventListener('scroll', onScroll, { passive: true });

    const ro = new ResizeObserver(() => { rectCache = null; layout(); });
    ro.observe(root);
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting && !document.hidden;
      if (visible) wake(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }, { threshold: 0.05 });
    io.observe(hero);
    const onVis = () => { visible = !document.hidden; if (visible) wake(); };
    document.addEventListener('visibilitychange', onVis);

    layout();
    // First light: drift up to the Moon, then wait for the pointer.
    const moon = objects[0];
    cur.x = W * 0.5; cur.y = H * 0.55; tgt.x = moon.cx; tgt.y = moon.cy;
    if (reduced) { cur.x = tgt.x; cur.y = tgt.y; }
    gainTgt = 1;
    document.fonts.ready.then(wake);
    if (hoverless) verbRef.current!.textContent = 'Tap the sky';
    if (hoverless && !reduced) startTour(2400);
    wake();

    return () => {
      dead = true;
      stopTour();
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerenter', onEnter);
      hero.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('click', onClick);
      removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [router]);

  return (
    <div className="sd-sky" ref={rootRef}>
      <canvas ref={starsRef} aria-hidden="true" />
      <canvas ref={canvasRef} role="img" aria-label="A night sky. Move the pointer, or tap, to reveal the Moon, planets, nebulae, galaxies and a black hole hidden in it." />
      <div className="sd-sky__vignette" aria-hidden="true" />
      <div className="sd-sky__grain" aria-hidden="true" />
      <p className="sd-sky__hint" aria-live="polite">
        <span ref={verbRef}>Explore the sky</span><span>·</span><b ref={foundRef}>0</b><span>/</span><b>{OBJECTS.length}</b> found
      </p>
    </div>
  );
}
