'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import SiteNav from '@/components/skychaser/SiteNav';
import type { Rarity } from '@/lib/rarity';
import type { NightSkyData } from '@/lib/skychaser/night-sky';
import { compass, createSky } from './night-sky-canvas';
import { WORDMARK_GLYPHS } from './wordmark';

export type FeatureCard = {
  designation: string;
  name: string;
  word: string;
  no: number;
  rarity: Rarity;
  type: string;
  perk: string;
  editions: number;
  price: string;
  note: string;
  rgb: [number, number, number];
};
export type NightStep = { at: number; aim: string; title: string; text: string; designation: string; card: string; perk: string };

type Props = {
  fontClass: string;
  setSize: number;
  fromPrice: string;
  feature: FeatureCard[];
  night: NightStep[];
  nightFrom: number;
  nightTo: number;
  sky: NightSkyData;
  scope: { site: string; optics: string; aperture: number; minutes: number };
};

const CONTACT = 'info@astroman.ge';
const RARITY: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const art = (designation: string, small = false) => `/cards/plate/${designation}/card${small ? '-sm' : ''}.webp?v=specimen10`;
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

/** A button with its arrow in a round chip, the house style for every action. */
function Btn({ href, tone, children, onClick }: { href: string; tone: 'w' | 'o'; children: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const inner = (
    <>
      <span>{children}</span>
      <i className="chip">
        <Arrow />
      </i>
    </>
  );
  return href.startsWith('#') ? (
    <a className={`btn ${tone}`} href={href} onClick={onClick}>
      {inner}
    </a>
  ) : (
    <Link className={`btn ${tone}`} href={href}>
      {inner}
    </Link>
  );
}

/** One headline line inside a mask, so it can slide in and out of view. */
const Mask = ({ children }: { children: ReactNode }) => (
  <span className="m">
    <span>{children}</span>
  </span>
);

function Wordmark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 2648 400" aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORDMARK_GLYPHS }} />;
}

/** One card face, floating, with the foil sheen passing over it. */
function Card({ designation, alt, delay = 0, eager = false }: { designation: string; alt: string; delay?: number; eager?: boolean }) {
  return (
    <span className="float" style={{ animationDelay: `${-delay * 1.3}s` }}>
      <span className="card">
        <img src={art(designation)} alt={alt} width={520} height={727} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        <i className="sheen" style={{ animationDelay: `${-delay * 0.9}s` }} />
      </span>
    </span>
  );
}

/**
 * The home page as one scroll story: how light becomes a card (pinned), the
 * collection (pinned, sideways), one night at the telescope (pinned, a clock),
 * then the telescope and the sign-off. GSAP
 * ScrollTrigger drives every scene; Lenis smooths the wheel and feeds it.
 * Reduced motion gets each scene at its last state. Every number is passed in
 * from the set and the telescope's record.
 */
export default function EditorialHome({ fontClass, setSize, fromPrice, feature, night, nightFrom, nightTo, sky, scope }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // The collection: the card the corners describe, faded out and back in on change.
  const [ci, setCi] = useState(0);
  const [cardOut, setCardOut] = useState(false);
  const ciRef = useRef(0);
  const ciTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showCard = useCallback((i: number) => {
    if (i === ciRef.current) return;
    ciRef.current = i;
    setCardOut(true);
    clearTimeout(ciTimer.current);
    ciTimer.current = setTimeout(() => {
      setCi(i);
      setCardOut(false);
    }, 220);
  }, []);

  // The night: the step, and the clock written straight to the page.
  const nightMinutes = ((nightTo - nightFrom + 24) % 24 || 24) * 60;
  const [ns, setNs] = useState(0);
  const [nightOut, setNightOut] = useState(false);
  const nsRef = useRef(0);
  const nsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clockRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const clockText = useRef('');
  const skyCanvas = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<ReturnType<typeof createSky> | null>(null);
  const aimRef = useRef<HTMLSpanElement>(null);
  const aimText = useRef('');
  const nightMin = useRef(0);
  const setNight = useCallback(
    (min: number) => {
      nightMin.current = min;
      const p = skyRef.current?.draw(min);
      if (p && aimRef.current) {
        const a = p.slewing ? `Slewing to ${p.name}…` : `${p.name} · ${Math.round(p.alt)}° up, ${compass(p.az)}`;
        if (a !== aimText.current) {
          aimText.current = a;
          aimRef.current.textContent = a;
        }
      }
      const h = (nightFrom + Math.floor(min / 60)) % 24;
      const t = hhmm(h, Math.floor((min % 60) / 10) * 10);
      if (t !== clockText.current && clockRef.current) {
        clockText.current = t;
        clockRef.current.textContent = t;
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, min / nightMinutes)})`;
      let s = 0;
      night.forEach((n, i) => {
        if (min >= n.at) s = i;
      });
      if (s === nsRef.current) return;
      nsRef.current = s;
      setNightOut(true);
      clearTimeout(nsTimer.current);
      nsTimer.current = setTimeout(() => {
        setNs(s);
        setNightOut(false);
      }, 200);
    },
    [night, nightFrom, nightMinutes],
  );

  // The sign-off: one email when a series opens. There is no list yet, so the note goes by email.
  const [mailNote, setMailNote] = useState('');
  const onMail = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    const body = `Please write to ${email} when a new Skychaser series opens.`;
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent('New series — tell me')}&body=${encodeURIComponent(body)}`;
    setMailNote(`Your mail app opens with a note to ${CONTACT}. Send it and you are on the list.`);
  };

  const toHash = (e: MouseEvent<HTMLAnchorElement>) => {
    const id = e.currentTarget.getAttribute('href') ?? '';
    const target = id.startsWith('#') ? root.current?.querySelector<HTMLElement>(id) : null;
    if (!target) return;
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView();
    const input = target.querySelector('input');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), lenisRef.current ? 1700 : 0);
  };

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const one = (s: string) => q(s)[0] as HTMLElement;

    // The giant name behind each card fills 94% of the width, up to 42% of the height.
    const fitWords = () => {
      for (const w of q('.coll .word') as HTMLElement[]) {
        w.style.fontSize = '100px';
        const width = w.getBoundingClientRect().width || 1;
        w.style.fontSize = `${Math.min((100 * window.innerWidth * 0.94) / width, window.innerHeight * 0.42)}px`;
      }
    };
    fitWords();
    window.addEventListener('resize', fitWords);
    if (skyCanvas.current) skyRef.current = createSky(skyCanvas.current, sky, night);
    const redrawSky = () => {
      skyRef.current?.resize();
      setNight(nightMin.current);
    };
    window.addEventListener('resize', redrawSky);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('rm');
      setNight((night[1]?.at ?? 0) + 20);
      return () => {
        window.removeEventListener('resize', fitWords);
        window.removeEventListener('resize', redrawSky);
      };
    }

    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    // Snapping: a short scroll inside a stepped scene finishes the move to the next step.
    const snaps = new Set<{ st: ScrollTrigger; points: number[] }>();
    let idle: ReturnType<typeof setTimeout> | undefined;
    let dir = 1;
    let inside: ScrollTrigger | null = null;
    const settle = () => {
      for (const { st, points } of snaps) {
        if (!st.isActive) continue;
        // arriving from another scene, settle on the nearest step rather than skip the first
        const arriving = inside !== st && st.start > 0;
        inside = st;
        const p = st.progress;
        if (points.some((x) => Math.abs(x - p) < 0.003)) return;
        const nearest = points.reduce((a, x) => (Math.abs(x - p) < Math.abs(a - p) ? x : a));
        const next = arriving ? nearest : dir > 0 ? points.find((x) => x > p) : [...points].reverse().find((x) => x < p);
        if (next !== undefined) lenis.scrollTo(st.start + next * (st.end - st.start), { duration: 0.75, easing: (t) => 1 - Math.pow(1 - t, 4) });
        return;
      }
      inside = null;
    };
    lenis.on('scroll', (l: Lenis) => {
      if (l.direction) dir = l.direction;
      clearTimeout(idle);
      idle = setTimeout(settle, 120);
    });
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const mm = gsap.matchMedia(el);

    const ctx = gsap.context(() => {
      // The hero: four quick transitions, the scroll snapping from one step to the next.
      // 1→2 the telescope dives into the nebula, 2→3 the colour develops from the middle,
      // 3→4 the picture shrinks into the card and the card into its case, 4→5 the case opens.
      const hero = one('.hero');
      const bgs = q('.hero .bg') as HTMLElement[];
      const lns = q('.hero .ln') as HTMLElement[];
      const N = bgs.length;
      const [orion, raw, colour, seal, keep] = bgs;
      const pic = orion.querySelector('picture') as HTMLElement;
      const slot = one('.seal .slot');
      const words = (i: number) => lns[i].querySelectorAll('.m > span');
      const para = (i: number) => lns[i].querySelectorAll(':scope > p');
      const cardClip = () => {
        let x = 0;
        let y = 0;
        for (let e: HTMLElement | null = slot; e && e !== hero; e = e.offsetParent as HTMLElement | null) {
          x += e.offsetLeft;
          y += e.offsetTop;
        }
        const w = slot.offsetWidth;
        const h = slot.offsetHeight;
        return `inset(${y}px ${hero.clientWidth - x - w}px ${hero.clientHeight - y - h}px ${x}px round ${Math.round(w * 0.05)}px)`;
      };
      gsap.from(pic.querySelector('img'), { scale: 1.1, duration: 2.4, ease: 'power2.out' });
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: '+=200%',
          pin: true,
          refreshPriority: 4,
          scrub: 0.35,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });
      for (let i = 0; i < N - 1; i++) {
        // explicit starts: the first step's are mid-way through its CSS rise when this runs
        const first = i === 0;
        tl.fromTo(words(i), { y: 0, yPercent: 0 }, { yPercent: -112, duration: 0.3, stagger: 0.05, ease: 'power3.in', immediateRender: first }, i + 0.06)
          .fromTo(para(i), { opacity: 1, y: 0 }, { opacity: 0, y: -10, duration: 0.24, ease: 'power2.in', immediateRender: first }, i + 0.06)
          .fromTo(words(i + 1), { y: 0, yPercent: 112 }, { yPercent: 0, duration: 0.42, stagger: 0.07, ease: 'power3.out' }, i + 0.42)
          .fromTo(para(i + 1), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.36, ease: 'power2.out' }, i + 0.56);
      }
      tl.fromTo(pic, { scale: 1 }, { scale: 3, duration: 0.8, ease: 'power3.in' }, 0.04)
        .to(orion, { opacity: 0, duration: 0.24 }, 0.6)
        .fromTo(raw, { opacity: 0, scale: 1.6 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }, 0.56)
        .set(colour, { opacity: 1 }, 1.04)
        .fromTo(colour, { '--r': '0vmax' }, { '--r': '84vmax', duration: 0.78, ease: 'power2.inOut' }, 1.04)
        .to(raw, { scale: 1.08, duration: 0.78, ease: 'power1.in' }, 1.04)
        .set(raw, { opacity: 0 }, 2.04)
        .fromTo(colour, { clipPath: 'inset(0px 0px 0px 0px round 0px)' }, { clipPath: cardClip, duration: 0.5, ease: 'power3.inOut' }, 2.04)
        .fromTo(seal, { opacity: 0 }, { opacity: 1, duration: 0.24 }, 2.4)
        .to(colour, { opacity: 0, duration: 0.16 }, 2.58)
        .fromTo(slot, { yPercent: -5 }, { yPercent: 0, duration: 0.3, ease: 'power2.out' }, 2.5)
        .to(one('.sealcase'), { scale: 0.9, opacity: 0, duration: 0.36, ease: 'power2.in' }, 3.06)
        .fromTo(keep, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 3.2)
        .fromTo(one('.keep .blur'), { scale: 1.25 }, { scale: 1, duration: 0.7, ease: 'power2.out' }, 3.2)
        .fromTo(one('.keep .kc'), { yPercent: 26, rotate: 14, scale: 0.78 }, { yPercent: 0, rotate: 0, scale: 1, duration: 0.62, ease: 'power3.out' }, 3.26)
        .fromTo(one('.hero .cta'), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 3.66)
        .to({}, { duration: 0.3 }, 4);
      snaps.add({ st: tl.scrollTrigger!, points: bgs.map((_, i) => i / tl.duration()) });

      // The night, as a clock
      const clock = { m: 0 };
      setNight(0);
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: one('.night'), start: 'top top', end: '+=240%', pin: true, scrub: 0.8, refreshPriority: 2 },
        })
        .to(clock, { m: nightMinutes, duration: 11, onUpdate: () => setNight(clock.m) }, 0)
        .to(one('.night .head'), { opacity: 0, y: -20, duration: 1 }, 3.4);

      // The telescope and the sign-off rise in
      gsap.from(q('.scope .rise'), {
        y: 50,
        opacity: 0,
        stagger: 0.12,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: one('.scope'), start: 'top 75%', refreshPriority: -1 },
      });
      gsap.fromTo(
        one('.foot .bgi'),
        { yPercent: -6 },
        { yPercent: 6, ease: 'none', scrollTrigger: { trigger: one('.foot'), start: 'top bottom', end: 'bottom bottom', scrub: true, refreshPriority: -1 } },
      );
      gsap.from(q('.foot .ftext > *'), {
        y: 40,
        opacity: 0,
        stagger: 0.1,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: one('.foot'), start: 'top 60%', refreshPriority: -1 },
      });
    }, el);

    // The collection sideways (desktop)
    mm.add('(min-width: 821px)', () => {
      const track = one('.coll .track');
      const slides = q('.coll .slide') as HTMLElement[];
      const layers = q('.coll .glow') as HTMLElement[];
      const n = slides.length;
      const dist = () => track.scrollWidth - window.innerWidth;
      const ht = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: one('.coll'),
          start: 'top top',
          end: () => `+=${dist() * 0.6}`,
          pin: true,
          refreshPriority: 3,
          scrub: 0.9,
          invalidateOnRefresh: true,
          onUpdate: (s) => {
            const f = s.progress * (n - 1);
            const i = Math.min(n - 1, Math.floor(f));
            const t = f - i;
            layers.forEach((l, j) => {
              l.style.opacity = j === i ? String(1 - t) : j === i + 1 ? String(t) : '0';
            });
            showCard(Math.round(f));
          },
        },
      });
      for (const s of slides) {
        const word = s.querySelector('.word');
        gsap.set(word, { x: 0, y: 0, xPercent: -50, yPercent: -50 });
        const along = { trigger: s, containerAnimation: ht, start: 'left right', end: 'right left', scrub: true };
        gsap.fromTo(word, { xPercent: -26 }, { xPercent: -74, ease: 'none', scrollTrigger: along });
        gsap.fromTo(s.querySelector('.tilt'), { rotate: 12, y: 30 }, { rotate: -10, y: -20, ease: 'none', scrollTrigger: { ...along } });
      }

      const sideways = { st: ht.scrollTrigger!, points: slides.map((_, i) => i / (n - 1)) };
      snaps.add(sideways);

      return () => {
        snaps.delete(sideways);
        layers.forEach((l) => l.style.removeProperty('opacity'));
      };
    });
    // Pinned scenes are created out of page order (the desktop ones last), and
    // each one's start depends on the pins above it: refresh them top to bottom
    // (refreshPriority), then the plain triggers below them.
    const refresh = () => {
      fitWords();
      ScrollTrigger.sort();
      ScrollTrigger.refresh();
    };
    refresh();
    ScrollTrigger.addEventListener('refreshInit', fitWords);
    if (document.readyState !== 'complete') window.addEventListener('load', refresh, { once: true });
    document.fonts?.ready.then(refresh);

    return () => {
      window.removeEventListener('resize', fitWords);
      window.removeEventListener('resize', redrawSky);
      window.removeEventListener('load', refresh);
      ScrollTrigger.removeEventListener('refreshInit', fitWords);
      mm.revert();
      ctx.revert();
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      lenisRef.current = null;
      clearTimeout(ciTimer.current);
      clearTimeout(nsTimer.current);
      clearTimeout(idle);
    };
  }, []);

  const f = feature[ci];
  const n = night[ns];

  return (
    <div ref={root} className={`ed ${fontClass}`}>
      <a className="skip" href="#main" onClick={toHash}>
        Skip to content
      </a>

      <SiteNav overlay />

      <main id="main">
        {/* ── How light becomes a card ─────────────────────── */}
        <section className="hero" aria-label="How light becomes a card">
          <div className="bgs">
            <div className="bg">
              {/* Wide screens: turned a quarter, north to the left, the way Orion rises in the east. */}
              <picture>
                <source media="(max-width: 820px)" srcSet="/home/orion-tall-900.webp 900w, /home/orion-tall-1400.webp 1400w" sizes="100vw" />
                <img
                  src="/home/orion-1280.webp"
                  srcSet="/home/orion-1280.webp 1280w, /home/orion-2200.webp 2200w"
                  sizes="100vw"
                  alt="Orion in a deep exposure: Barnard's Loop, the Orion Nebula, the Horsehead, red Betelgeuse"
                  fetchPriority="high"
                  decoding="async"
                />
              </picture>
            </div>
            <div className="bg raw">
              <img
                src="/home/m42-raw-1280.webp"
                srcSet="/home/m42-raw-1280.webp 1280w, /home/m42-raw-1800.webp 1800w"
                sizes="100vw"
                alt="A raw, grainy black-and-white frame of the Orion Nebula"
                decoding="async"
              />
              <i className="grain" />
            </div>
            <div className="bg dev">
              <img
                src="/home/m42-1280.webp"
                srcSet="/home/m42-1280.webp 1280w, /home/m42-2200.webp 2200w"
                sizes="100vw"
                alt="The Orion Nebula in full colour"
                decoding="async"
              />
            </div>
            <div className="bg seal">
              <div className="kb">
                <div className="sealcase">
                  <div className="well">
                    <div className="slot">
                      <img src={art('M42')} alt="The Orion Nebula card going into its black capsule case" width={520} height={727} decoding="async" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg keep">
              <img className="blur" src="/home/m42-blur-800.webp" alt="" decoding="async" />
              <div className="pos">
                <div className="kc">
                  <div className="tilt">
                    <Card designation="M42" alt="The Orion Nebula card" eager />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="shade" />
          <div className="copy">
            <div className="steps">
              <div className="ln">
                <h1 className="xl">
                  <Mask>Aimed at</Mask>
                  <Mask>
                    <em>Orion.</em>
                  </Mask>
                </h1>
                <p>One patch of sky, chosen by the people who hold its card.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  <Mask>Exposed</Mask>
                  <Mask>
                    <em>120 seconds.</em>
                  </Mask>
                </h2>
                <p>Light that left the nebula 1,344 years ago lands on the sensor.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  <Mask>Stacked</Mask>
                  <Mask>
                    <em>by hand.</em>
                  </Mask>
                </h2>
                <p>Dozens of frames, aligned and cleaned until the colour comes through.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  <Mask>Sealed in</Mask>
                  <Mask>
                    <em>a capsule.</em>
                  </Mask>
                </h2>
                <p>One card, numbered and sealed. The odds are published before sale.</p>
              </div>
              <div className="ln last">
                <h2 className="xl">
                  <Mask>Yours</Mask>
                  <Mask>
                    <em>to keep.</em>
                  </Mask>
                </h2>
                <p>{setSize} cards in the Genesis series. Start with one.</p>
                <div className="cta acts">
                  <Btn href="/capsules" tone="w">
                    Open a capsule · from {fromPrice}
                  </Btn>
                  <Btn href="/genesis" tone="o">
                    Browse the cards
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── The collection ──────────────────────────────── */}
        <section className="coll" id="cards" aria-label="Featured cards">
          {feature.map((c) => (
            <div key={c.designation} className="glow" style={{ '--c': c.rgb.join(',') } as CSSProperties} />
          ))}
          <div className="mhead">
            <h2 className="xl2">
              Real objects.
              <br />
              <em>Numbered editions.</em>
            </h2>
          </div>
          <div className="track">
            {feature.map((c, i) => (
              <div key={c.designation} className="slide" style={{ '--c': c.rgb.join(',') } as CSSProperties}>
                <div className="word" aria-hidden="true">
                  {c.word}
                </div>
                <div className="tilt">
                  <Card designation={c.designation} alt={`${c.name} card, No. ${c.no}, ${RARITY[c.rarity]}`} delay={i} eager={i < 2} />
                </div>
                <div className="mi">
                  <span className="k" data-rarity={c.rarity}>
                    <i className="dot" />
                    {RARITY[c.rarity]} · No. {c.no} · {c.perk}
                  </span>
                  <div className="row">
                    <b>{c.note}</b>
                    <span className="end">
                      <span className="price">{c.price}</span>
                      <Link className="circ" href={`/card/${c.designation}`} aria-label={`See the ${c.name} card`}>
                        <Arrow />
                      </Link>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="corner tl">
            <h2 className="xl2">
              Real objects.
              <br />
              <em>Numbered editions.</em>
            </h2>
            <Link className="all" href="/genesis">
              All {setSize} cards <Arrow />
            </Link>
          </div>
          <div className={`corner tr sw${cardOut ? ' out' : ''}`}>
            <div className="big">
              No. {f.no}
              <small>/{setSize}</small>
            </div>
            <span className="k" data-rarity={f.rarity}>
              <i className="dot" />
              {RARITY[f.rarity]} · {f.editions} editions
            </span>
          </div>
          <div className={`corner bl sw${cardOut ? ' out' : ''}`}>
            <span className="k">{f.type}</span>
            <b>{f.note}</b>
          </div>
          <div className="corner bc" aria-hidden="true">
            {feature.map((c, i) => (
              <i key={c.designation} className={i === ci ? 'on' : undefined} />
            ))}
          </div>
          <div className={`corner br sw${cardOut ? ' out' : ''}`}>
            <span className="price">{f.price}</span>
            <Link className="circ" href={`/card/${f.designation}`} aria-label={`See the ${f.name} card`}>
              <Arrow />
            </Link>
          </div>
        </section>

        {/* ── One night at the telescope ──────────────────── */}
        <section className="night" id="night" aria-label="One night on the roof">
          <canvas ref={skyCanvas} className="sky" role="img" aria-label="The sky over Tbilisi on the night of 14 November, hour by hour, with the telescope's target marked" />
          <div className="shade" />
          <div className="head">
            <span className="status glass">
              <i />
              First light · November
            </span>
            <h2 className="xl2">
              One night
              <br />
              <em>on the roof.</em>
            </h2>
            <p>
              Holders vote on the target, and a {scope.aperture} mm telescope on a {scope.site.split(',')[0]} roof works from {hhmm(nightFrom, 0)} until {hhmm(nightTo % 24, 0)}. This is
              the real sky of 14 November.
            </p>
          </div>
          <article className="ncard glass">
            <div className="top">
              <div className="clock" ref={clockRef}>
                {hhmm(nightFrom, 0)}
              </div>
              <span className="lbl">
                Tbilisi
                <br />
                GMT+4
              </span>
            </div>
            <div className="aim">
              <span className="lbl">Telescope on</span>
              <span ref={aimRef} />
            </div>
            <div className={`swp${nightOut ? ' out' : ''}`}>
              <div className="ttl">{n.title}</div>
              <p className="txt">{n.text}</p>
              <div className="drop">
                <img src={art(n.designation, true)} alt="" width={56} height={78} loading="lazy" />
                <div>
                  <span className="lbl">Drops into</span>
                  <b>{n.card}</b>
                  <span className="p">{n.perk}</span>
                </div>
              </div>
            </div>
            <div className="tline" aria-hidden="true">
              <div className="rail" />
              <div className="fill" ref={fillRef} />
              {night.map((x, i) => (
                <i key={i} style={{ left: `${(x.at / nightMinutes) * 100}%` }} />
              ))}
              <div className="ends">
                <span>{hhmm(nightFrom, 0)}</span>
                <span>{hhmm(nightTo % 24, 0)}</span>
              </div>
            </div>
          </article>
        </section>

        {/* ── The telescope, after the cards ──────────────── */}
        <section className="scope" id="observatory" aria-label="The telescope">
          <div className="lines" aria-hidden="true" />
          <div className="g">
            <div>
              <span className="status glass rise">
                <i />
                First light · November
              </span>
              <h2 className="xl2 rise">
                Then point it
                <br />
                <em>yourself.</em>
              </h2>
              <p className="lead rise">Epic cards include a {scope.minutes}-minute session on the telescope in Tbilisi, booked after first light.</p>
              <dl className="rise">
                <div>
                  <dt>Site</dt>
                  <dd>{scope.site.split(',')[0]}</dd>
                </div>
                <div>
                  <dt>Optics</dt>
                  <dd>
                    {scope.optics} · {scope.aperture} mm
                  </dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{scope.minutes} min</dd>
                </div>
              </dl>
              <div className="acts rise">
                <Btn href="#signup" tone="w" onClick={toHash}>
                  Join the first-light list
                </Btn>
                <Btn href="/contact" tone="o">
                  Own a telescope? Earn from it
                </Btn>
              </div>
            </div>
            <figure className="moon rise">
              <img src="/home/moon-1000.webp" alt="The Moon" width={1000} height={1250} loading="lazy" decoding="async" />
              <figcaption className="tag">
                <span>The Moon</span>
                <span className="pill glass">{scope.minutes}-min session</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── Sign-off ────────────────────────────────────── */}
        <footer className="foot" id="signup">
          <img
            className="bgi"
            src="/home/pillars-1280.webp"
            srcSet="/home/pillars-1280.webp 1280w, /home/pillars-2000.webp 2000w"
            sizes="100vw"
            alt=""
            loading="lazy"
            decoding="async"
          />
          <div className="veil" />
          <div className="ftext">
            <h2 className="xl2">
              The universe,
              <br />
              <em>collected.</em>
            </h2>
            <p>One email when a new series opens. Nothing else.</p>
            <form className="mail glass" onSubmit={onMail}>
              <label className="sr" htmlFor="ed-email">
                Email
              </label>
              <input id="ed-email" name="email" type="email" required placeholder="Your email" autoComplete="email" />
              <button type="submit" aria-label="Subscribe">
                <Arrow />
              </button>
            </form>
            <p className="note" role="status">
              {mailNote}
            </p>
          </div>
          <div className="legal">
            <span>© 2026 Skychaser · Tbilisi</span>
            <span className="credits">
              Orion, head to toe: Rogelio Bernal Andreo, CC BY-SA 3.0, turned and darkened · Night sky: Hipparcos stars and IAU figures via d3-celestial (BSD), positions by astronomy-engine · Orion Nebula,
              Pillars of Creation: NASA, ESA, Hubble · The Moon: NASA/GSFC/Arizona State University · The raw frame is an illustration.
            </span>
            <nav aria-label="Legal">
              <Link href="/contact">Contact</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}
