'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import SkychaserAccountGate from '@/components/skychaser/SkychaserAccountGate';
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
export type GridCard = { designation: string; name: string; rarity: Rarity; no: number; line: string; perk: string };
export type NightStep = { at: number; aim: string; title: string; text: string; designation: string; card: string; perk: string };
export type TierRow = { name: string; price: string; odds: { rarity: Rarity; label: string; pct: string; bps: number }[] };

type Props = {
  fontClass: string;
  setSize: number;
  fromPrice: string;
  feature: FeatureCard[];
  grid: GridCard[];
  night: NightStep[];
  nightFrom: number;
  nightTo: number;
  sky: NightSkyData;
  tiers: TierRow[];
  scope: { site: string; optics: string; aperture: number; minutes: number };
};

const CONTACT = 'info@astroman.ge';
const RARITY: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const art = (designation: string, small = false) => `/cards/plate/${designation}/card${small ? '-sm' : ''}.webp?v=specimen9`;
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
 * the capsule opening (pinned), then the telescope and the sign-off. GSAP
 * ScrollTrigger drives every scene; Lenis smooths the wheel and feeds it.
 * Reduced motion gets each scene at its last state. Every number is passed in
 * from the set, the capsule tiers and the telescope's record.
 */
export default function EditorialHome({ fontClass, setSize, fromPrice, feature, grid, night, nightFrom, nightTo, sky, tiers, scope }: Props) {
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

  // The capsule: the tier chosen, and the card under the pointer or the focus.
  const [tier, setTier] = useState(0);
  const [active, setActive] = useState<number | null>(null);

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
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const mm = gsap.matchMedia(el);

    const ctx = gsap.context(() => {
      // The hero: how light becomes a card, five photographs on one scrub
      const bgs = q('.hero .bg') as HTMLElement[];
      const lns = q('.hero .ln') as HTMLElement[];
      const N = bgs.length;
      gsap.from(bgs[0], { scale: 1.1, duration: 2.4, ease: 'power2.out' });
      const step = one('.hero .meta .num');
      const bar = one('.hero .meta .bar i');
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: one('.hero'),
          start: 'top top',
          end: '+=300%',
          pin: true,
          refreshPriority: 4,
          scrub: 0.8,
          anticipatePin: 1,
          onUpdate: (s) => {
            const i = Math.min(N - 1, Math.max(0, Math.round(s.progress * tl.duration() - 0.2)));
            step.textContent = `${String(i + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
            bar.style.transform = `scaleX(${0.2 + 0.8 * s.progress})`;
          },
        },
      });
      bgs.forEach((b, i) => tl.fromTo(b.querySelector('.kb'), { scale: 1.14 }, { scale: 1, duration: i === N - 1 ? 1 : 2 }, Math.max(0, i - 1)));
      for (let i = 1; i < N; i++) {
        tl.to(bgs[i], { opacity: 1, duration: 0.55 }, i - 0.55)
          .to(lns[i - 1], { opacity: 0, y: -28, duration: 0.35 }, i - 0.55)
          .fromTo(lns[i], { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.45 }, i - 0.3);
      }
      tl.fromTo(one('.seal .slot'), { yPercent: -64 }, { yPercent: 0, duration: 0.9 }, 2.55)
        .fromTo(one('.seal .band'), { yPercent: -112, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.45 }, 3.15)
        .fromTo(one('.keep .kc'), { yPercent: 18, rotate: 11, scale: 0.86 }, { yPercent: 0, rotate: 0, scale: 1, duration: 0.8 }, N - 1.5)
        .fromTo(one('.hero .cta'), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.35 }, N - 0.6)
        .to({}, { duration: 0.4 });

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

    // The collection sideways and the capsule pinned (desktop)
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

      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: one('.cap'), start: 'top top', end: '+=130%', pin: true, scrub: 0.8, refreshPriority: 1 },
        })
        .from(q('.cap .ctext > *'), { y: 40, opacity: 0, stagger: 0.1, duration: 0.5 }, 0)
        .to(one('.case .band'), { yPercent: -104, duration: 0.6 }, 0.35)
        .to(one('.case .lid'), { opacity: 0, scale: 1.06, y: -24, duration: 0.8 }, 0.85)
        .fromTo(q('.case .cell img'), { opacity: 0, scale: 0.9, y: 14 }, { opacity: 1, scale: 1, y: 0, stagger: { each: 0.06, from: 'center' }, duration: 0.6 }, 0.95)
        .from(q('.cap .list li'), { opacity: 0, x: 20, stagger: 0.05, duration: 0.4 }, 1.2)
        .from(one('.cap .buy'), { opacity: 0, y: 20, duration: 0.4 }, 1.4)
        .to({}, { duration: 0.8 });

      return () => layers.forEach((l) => l.style.removeProperty('opacity'));
    });
    mm.add('(max-width: 820px)', () => {
      gsap
        .timeline({ scrollTrigger: { trigger: one('.case'), start: 'top 70%', once: true } })
        .to(one('.case .band'), { yPercent: -104, duration: 0.6, ease: 'power2.in' })
        .to(one('.case .lid'), { opacity: 0, scale: 1.05, duration: 0.7, ease: 'power2.out' })
        .fromTo(q('.case .cell img'), { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, stagger: { each: 0.05, from: 'center' }, duration: 0.5 }, '-=0.4');
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
    };
  }, []);

  const f = feature[ci];
  const n = night[ns];
  const t = tiers[tier];
  const leave = () => setActive(null);
  const lit = active === null ? null : grid[active].rarity;

  return (
    <div ref={root} className={`ed ${fontClass}`}>
      <a className="skip" href="#main" onClick={toHash}>
        Skip to content
      </a>

      <header className="nav">
        <Link className="brand" href="/" aria-label="Skychaser home">
          <img src="/brand/logo-mark.svg" alt="" width={22} height={22} />
          <Wordmark className="wm" />
        </Link>
        <nav className="menu glass" aria-label="Skychaser">
          <Link href="/genesis">Cards</Link>
          <Link href="/capsules">Capsules</Link>
          <Link href="/collection">Collection</Link>
          <Link href="/node">Observatory</Link>
        </nav>
        <div className="end">
          <SkychaserAccountGate />
          <Link className="btn w sm" href="/capsules">
            <span>Open a capsule</span>
            <i className="chip">
              <Arrow />
            </i>
          </Link>
        </div>
      </header>

      <main id="main">
        {/* ── How light becomes a card ─────────────────────── */}
        <section className="hero" aria-label="How light becomes a card">
          <div className="bgs">
            <div className="bg">
              <img
                className="kb"
                src="/home/orion-1280.webp"
                srcSet="/home/orion-1280.webp 1280w, /home/orion-2200.webp 2200w"
                sizes="100vw"
                alt="Orion rising over a ruined castle at night"
                fetchPriority="high"
                decoding="async"
              />
            </div>
            <div className="bg raw">
              <img
                className="kb"
                src="/home/m42-raw-1280.webp"
                srcSet="/home/m42-raw-1280.webp 1280w, /home/m42-raw-1800.webp 1800w"
                sizes="100vw"
                alt="A raw, grainy black-and-white frame of the Orion Nebula"
                decoding="async"
              />
              <i className="grain" />
            </div>
            <div className="bg">
              <img
                className="kb"
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
                  <div className="band">
                    <span>Sealed · Genesis</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg keep">
              <img className="blur kb" src="/home/m42-blur-800.webp" alt="" decoding="async" />
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
                  Aimed at
                  <br />
                  <em>Orion.</em>
                </h1>
                <p>One patch of sky, chosen by the people who hold its card.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  Exposed
                  <br />
                  <em>120 seconds.</em>
                </h2>
                <p>Light that left the nebula 1,344 years ago lands on the sensor.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  Stacked
                  <br />
                  <em>by hand.</em>
                </h2>
                <p>Dozens of frames, aligned and cleaned until the colour comes through.</p>
              </div>
              <div className="ln">
                <h2 className="xl">
                  Sealed in
                  <br />
                  <em>a capsule.</em>
                </h2>
                <p>One card, numbered and sealed. The odds are published before sale.</p>
              </div>
              <div className="ln last">
                <h2 className="xl">
                  Yours
                  <br />
                  <em>to keep.</em>
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
            <div className="meta" aria-hidden="true">
              <span className="num">01 / 05</span>
              <div className="bar">
                <i />
              </div>
              <span className="lbl">Scroll</span>
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
        <section className="night" id="night" aria-label="One night at the observatory">
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

        {/* ── The capsule ─────────────────────────────────── */}
        <section className="cap" id="capsule" aria-label="Inside a capsule">
          <div className="lines" aria-hidden="true" />
          <div className="in">
            <div className="lft">
              <div className="ctext">
                <h2 className="xl2">
                  Nine of {setSize}.
                  <br />
                  <em>One is yours.</em>
                </h2>
                <p>Every capsule holds one sealed card. The more it costs, the rarer the odds.</p>
              </div>
              <div className="buy glass">
                <div className="seg" role="group" aria-label="Capsule">
                  {tiers.map((x, i) => (
                    <button key={x.name} type="button" aria-pressed={i === tier} onClick={() => setTier(i)}>
                      {x.price}
                    </button>
                  ))}
                </div>
                <div className="price">
                  <b>{t.price}</b>
                  <span>{t.name} capsule · one sealed card</span>
                </div>
                <ul className="odds">
                  {t.odds.map((o) => (
                    <li key={o.rarity} data-rarity={o.rarity} className={lit && lit !== o.rarity ? 'dim' : undefined}>
                      <span className="nm">
                        <i className="dot" />
                        {o.label}
                      </span>
                      <span className="bar">
                        <i style={{ transform: `scaleX(${o.bps / 10000})` }} />
                      </span>
                      <b>{o.pct}</b>
                    </li>
                  ))}
                </ul>
                <Btn href="/capsules" tone="w">
                  Open {t.name}
                </Btn>
              </div>
            </div>
            <div className="mid">
              <div className={`case${active !== null ? ' hl' : ''}`} onMouseLeave={leave}>
                <div className="grid">
                  {grid.map((g, i) => (
                    <div key={g.designation} className={`cell${active === i ? ' on' : ''}`} onMouseEnter={() => setActive(i)}>
                      <img src={art(g.designation, true)} alt={`${g.name} card, ${RARITY[g.rarity]}`} width={400} height={559} loading="lazy" decoding="async" />
                    </div>
                  ))}
                </div>
                <div className="lid" aria-hidden="true">
                  <div className="emb">
                    <Wordmark />
                    <span>Genesis · Series 01</span>
                  </div>
                  <div className="band">
                    <span>Sealed · {t.name}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="rgt">
              <ul
                className="list"
                onMouseLeave={leave}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leave();
                }}
              >
                {grid.map((g, i) => {
                  const odds = t.odds.find((o) => o.rarity === g.rarity);
                  return (
                    <li key={g.designation} className={active === i ? 'on' : undefined} onMouseEnter={() => setActive(i)}>
                      <button
                        type="button"
                        aria-expanded={active === i}
                        aria-controls={`acc-${g.designation}`}
                        onFocus={() => setActive(i)}
                        onClick={() => setActive(i)}
                      >
                        <i className="b" />
                        {g.name}
                        <span className="r" data-rarity={g.rarity}>
                          {RARITY[g.rarity]}
                        </span>
                      </button>
                      <div className="acc" id={`acc-${g.designation}`}>
                        <div>
                          <p>
                            No. {g.no}. {g.line} {g.perk}
                            <b>
                              {RARITY[g.rarity]} odds in a {t.price} capsule: {odds?.pct}
                            </b>
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
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
              Orion over a ruined castle: Carlos Zudaire/IAU OAE, CC BY 4.0 · Night sky: Hipparcos stars and IAU figures via d3-celestial (BSD), positions by astronomy-engine · Orion Nebula,
              Pillars of Creation: NASA, ESA, Hubble · The Moon: NASA/GSFC/Arizona State University · The raw frame and the capsule scene are illustrations.
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
