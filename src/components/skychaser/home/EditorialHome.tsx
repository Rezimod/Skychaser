'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import type { Rarity } from '@/lib/rarity';
import { WORDMARK_GLYPHS } from './wordmark';

export type FeatureCard = {
  designation: string;
  word: string;
  no: number;
  rarity: string;
  type: string;
  perk: string;
  price: string;
  note: string;
  rgb: [number, number, number];
};
export type GridCard = {
  designation: string;
  name: string;
  rarity: string;
  rarityKey: Rarity;
  no: number;
  line: string;
  perk: string;
};
export type NightStep = {
  at: number;
  title: string;
  text: string;
  designation: string;
  card: string;
  perk: string;
};
export type TierRow = {
  name: string;
  price: string;
  odds: Record<Rarity, string>;
};

type Props = {
  fontClass: string;
  setSize: number;
  fromPrice: string;
  feature: FeatureCard[];
  grid: GridCard[];
  night: NightStep[];
  nightFrom: number;
  nightTo: number;
  tiers: TierRow[];
  scope: { site: string; optics: string; minutes: number };
};

const CONTACT = 'info@astroman.ge';
const art = (designation: string, small = false) => `/cards/plate/${designation}/card${small ? '-sm' : ''}.webp?v=specimen9`;
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function Arrow({ w = 1.6 }: { w?: number }) {
  return (
    <svg className="ar" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={w} aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function Wordmark() {
  return <svg viewBox="0 0 2648 400" aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORDMARK_GLYPHS }} />;
}

/** One card face, floating, with the foil sheen passing over it. */
function Card({ designation, alt, delay = 0, eager = false }: { designation: string; alt: string; delay?: number; eager?: boolean }) {
  return (
    <div className="float" style={{ animationDelay: `${-delay * 1.3}s` }}>
      <div className="cardw">
        <img src={art(designation)} alt={alt} width={520} height={727} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        <i className="foil" style={{ animationDelay: `${-delay * 0.9}s` }} />
      </div>
    </div>
  );
}

/**
 * The home page as one scroll story: how light becomes a card (pinned), the
 * collection (pinned, sideways), one night at the telescope (pinned, a clock),
 * the capsule opening (pinned), the telescope, and the footer. GSAP
 * ScrollTrigger drives every scene; Lenis smooths the wheel and feeds it.
 * Reduced motion gets each scene at its last state.
 */
export default function EditorialHome({ fontClass, setSize, fromPrice, feature, grid, night, nightFrom, nightTo, tiers, scope }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // S2: the card the corners describe, faded out and back in on change.
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

  // S3: the step of the night, and the clock written straight to the page.
  const nightMinutes = ((nightTo - nightFrom + 24) % 24 || 24) * 60;
  const [ns, setNs] = useState(0);
  const [nightOut, setNightOut] = useState(false);
  const nsRef = useRef(0);
  const nsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clockRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const clockText = useRef('');
  const setNight = useCallback(
    (min: number) => {
      const h = (nightFrom + Math.floor(min / 60)) % 24;
      const t = hhmm(h, Math.floor((min % 60) / 10) * 10);
      if (t !== clockText.current && clockRef.current) {
        clockText.current = t;
        clockRef.current.textContent = t;
      }
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${Math.min(1, min / nightMinutes)})`;
      let s = 0;
      night.forEach((n, i) => {
        if (min >= n.at - 5) s = i;
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

  // S4: the capsule chosen, and the card under the pointer or the focus.
  const [tier, setTier] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  // Footer: the email box.
  const [mailNote, setMailNote] = useState('');
  const onMail = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get('email');
    const body = `Please write to ${String(email ?? '')} when a new Skychaser series opens.`;
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent('New series — tell me')}&body=${encodeURIComponent(body)}`;
    setMailNote(`Your mail app opens with the note to ${CONTACT}. Send it, and you are on the list.`);
  };

  const toHash = (e: MouseEvent<HTMLAnchorElement>) => {
    const id = e.currentTarget.getAttribute('href') ?? '';
    const target = id.startsWith('#') ? root.current?.querySelector<HTMLElement>(id) : null;
    if (!target) return;
    e.preventDefault();
    if (lenisRef.current) lenisRef.current.scrollTo(target, { duration: 1.6 });
    else target.scrollIntoView();
    if (target instanceof HTMLElement && target.querySelector('input'))
      setTimeout(() => target.querySelector('input')?.focus({ preventScroll: true }), lenisRef.current ? 1700 : 0);
  };

  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);

    const fitWords = () => {
      for (const w of q('.coll .word') as HTMLElement[]) {
        w.style.fontSize = '100px';
        const width = w.getBoundingClientRect().width || 1;
        w.style.fontSize = `${Math.min((100 * window.innerWidth * 0.94) / width, window.innerHeight * 0.42)}px`;
      }
    };
    fitWords();
    window.addEventListener('resize', fitWords);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('rm');
      setNight(night[2]?.at ?? 0);
      // No ScrollTrigger here: the nav reads the paper section from the page itself.
      const nav = q('.nav')[0] as HTMLElement;
      const cap = q('.cap')[0] as HTMLElement;
      const ink = () => {
        const r = cap.getBoundingClientRect();
        nav.classList.toggle('dk', r.top <= 50 && r.bottom > 50);
      };
      ink();
      window.addEventListener('scroll', ink, { passive: true });
      return () => {
        window.removeEventListener('resize', fitWords);
        window.removeEventListener('scroll', ink);
      };
    }

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    const one = (s: string) => q(s)[0] as HTMLElement;
    const mm = gsap.matchMedia(el);

    const ctx = gsap.context(() => {
      // Arrival
      const bgs = q('.hero .bg') as HTMLElement[];
      const lns = q('.hero .ln') as HTMLElement[];
      const N = bgs.length;
      gsap.from(bgs[0], { scale: 1.12, duration: 2.4, ease: 'power2.out' });

      // S1 · how light becomes a card
      const step = one('.hero .meta .num');
      const bar = one('.hero .meta .bar i');
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: one('.hero'),
          start: 'top top',
          end: '+=420%',
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

      // S3 · one night, as a clock
      const clock = { m: 0 };
      setNight(0);
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: one('.night'),
            start: 'top top',
            end: '+=380%',
            pin: true,
            scrub: 0.8,
            refreshPriority: 2,
          },
        })
        .to(clock, { m: nightMinutes, duration: 11, onUpdate: () => setNight(clock.m) }, 0)
        .to(one('.night .ph .n'), { opacity: 1, duration: 2.4 }, 1.4)
        .fromTo(q('.night .ph img'), { scale: 1.08 }, { scale: 1, duration: 11 }, 0)
        .to(one('.night .head'), { opacity: 0, y: -20, duration: 1 }, 4);

      // The nav reads in ink over the paper section
      // (two starts rather than a start and an end: an end measured on the next
      // section does not count the scroll the capsule's pin adds)
      const nav = one('.nav');
      const ink = (on: boolean) => () => nav.classList.toggle('dk', on);
      ScrollTrigger.create({
        trigger: one('.cap'),
        start: 'top 50px',
        refreshPriority: -1,
        onEnter: ink(true),
        onLeaveBack: ink(false),
      });
      ScrollTrigger.create({
        trigger: one('.scope'),
        start: 'top 50px',
        refreshPriority: -1,
        onEnter: ink(false),
        onLeaveBack: ink(true),
      });

      // Telescope and footer
      gsap.from(q('.scope .g > *'), {
        y: 50,
        opacity: 0,
        stagger: 0.12,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: one('.scope'),
          start: 'top 75%',
          refreshPriority: -1,
        },
      });
      gsap.fromTo(
        one('.foot .bgi'),
        { yPercent: -6 },
        {
          yPercent: 6,
          ease: 'none',
          scrollTrigger: {
            trigger: one('.foot'),
            start: 'top bottom',
            end: 'bottom bottom',
            scrub: true,
            refreshPriority: -1,
          },
        },
      );
      gsap.from(q('.foot > .lbl, .foot > h2, .foot > .say, .foot > form'), {
        y: 40,
        opacity: 0,
        stagger: 0.1,
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: one('.foot'),
          start: 'top 60%',
          refreshPriority: -1,
        },
      });
    }, el);

    // S2 · the collection, sideways (desktop); S4 · the capsule, pinned (desktop)
    mm.add('(min-width: 821px)', () => {
      const track = one('.coll .track');
      const slides = q('.coll .slide') as HTMLElement[];
      const layers = q('.coll .bgc') as HTMLElement[];
      const n = slides.length;
      const dist = () => track.scrollWidth - window.innerWidth;
      const ht = gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: one('.coll'),
          start: 'top top',
          end: () => `+=${dist() * 1.15}`,
          pin: true,
          refreshPriority: 3,
          scrub: 0.9,
          invalidateOnRefresh: true,
          onUpdate: (s) => {
            const f = s.progress * (n - 1);
            const i = Math.min(n - 1, Math.floor(f));
            const t = f - i;
            layers.forEach((l, j) => {
              l.style.opacity = j === i ? '1' : j === i + 1 ? String(t) : '0';
            });
            showCard(Math.round(f));
          },
        },
      });
      for (const s of slides) {
        const word = s.querySelector('.word');
        gsap.set(word, { x: 0, y: 0, xPercent: -50, yPercent: -50 });
        gsap.fromTo(
          word,
          { xPercent: -26 },
          {
            xPercent: -74,
            ease: 'none',
            scrollTrigger: {
              trigger: s,
              containerAnimation: ht,
              start: 'left right',
              end: 'right left',
              scrub: true,
            },
          },
        );
        gsap.fromTo(
          s.querySelector('.tilt'),
          { rotate: 12, y: 30 },
          {
            rotate: -10,
            y: -20,
            ease: 'none',
            scrollTrigger: {
              trigger: s,
              containerAnimation: ht,
              start: 'left right',
              end: 'right left',
              scrub: true,
            },
          },
        );
      }

      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: one('.cap'),
            start: 'top top',
            end: '+=170%',
            pin: true,
            scrub: 0.8,
            refreshPriority: 1,
          },
        })
        .from(q('.cap .lft > div:first-child > *'), { y: 40, opacity: 0, stagger: 0.1, duration: 0.5 }, 0)
        .to(one('.case .band'), { yPercent: -104, duration: 0.6 }, 0.35)
        .to(one('.case .lid'), { opacity: 0, scale: 1.06, y: -24, duration: 0.8 }, 0.85)
        .fromTo(
          q('.case .cell img'),
          { opacity: 0, scale: 0.9, y: 14 },
          {
            opacity: 1,
            scale: 1,
            y: 0,
            stagger: { each: 0.06, from: 'center' },
            duration: 0.6,
          },
          0.95,
        )
        .from(q('.cap .list li'), { opacity: 0, x: 20, stagger: 0.05, duration: 0.4 }, 1.2)
        .from(one('.cap .buy'), { opacity: 0, y: 20, duration: 0.4 }, 1.4)
        .to({}, { duration: 0.8 });

      return () => layers.forEach((l) => l.style.removeProperty('opacity'));
    });
    mm.add('(max-width: 820px)', () => {
      gsap
        .timeline({
          scrollTrigger: {
            trigger: one('.case'),
            start: 'top 70%',
            once: true,
          },
        })
        .to(one('.case .band'), {
          yPercent: -104,
          duration: 0.6,
          ease: 'power2.in',
        })
        .to(one('.case .lid'), {
          opacity: 0,
          scale: 1.05,
          duration: 0.7,
          ease: 'power2.out',
        })
        .fromTo(
          q('.case .cell img'),
          { opacity: 0, scale: 0.9 },
          {
            opacity: 1,
            scale: 1,
            stagger: { each: 0.05, from: 'center' },
            duration: 0.5,
          },
          '-=0.4',
        );
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
  const nightEnd = hhmm(nightTo % 24, 0);

  return (
    <div ref={root} className={`ed ${fontClass}`}>
      <a className="skip" href="#main" onClick={toHash}>
        Skip to content
      </a>

      <header className="nav">
        <Link className="logo" href="/" aria-label="Skychaser home">
          <Wordmark />
        </Link>
        <nav aria-label="Skychaser">
          <ul>
            <li>
              <Link href="/genesis">Cards</Link>
            </li>
            <li>
              <Link href="/capsules">Capsules</Link>
            </li>
            <li>
              <Link href="/node">Observatory</Link>
            </li>
            <li>
              <Link className="pill" href="/capsules">
                Open a capsule
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      <main id="main">
        {/* S1 · how light becomes a card */}
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
                <div className="cardw kc">
                  <div className="tilt">
                    <Card designation="M42" alt={`Orion Nebula card, ${grid.find((g) => g.designation === 'M42')?.rarity ?? 'Rare'}`} eager />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="shade" />
          <div className="copy">
            <div className="lines">
              <div className="ln">
                <span className="lbl ey">Stellar · Genesis series</span>
                <h1 className="disp">Aimed at Orion.</h1>
                <p>One patch of sky, chosen by the people who hold its card.</p>
              </div>
              <div className="ln">
                <span className="lbl ey">02 · Capture</span>
                <h2 className="disp">Exposed 120 seconds.</h2>
                <p>Light that left the nebula 1,344 years ago lands on the sensor.</p>
              </div>
              <div className="ln">
                <span className="lbl ey">03 · Process</span>
                <h2 className="disp">Stacked, frame by frame.</h2>
                <p>Dozens of frames, aligned and cleaned until the colour comes through.</p>
              </div>
              <div className="ln">
                <span className="lbl ey">04 · Edition</span>
                <h2 className="disp">Sealed in a capsule.</h2>
                <p>One card, numbered and sealed. The odds are published before sale.</p>
              </div>
              <div className="ln last">
                <span className="lbl ey">05 · The universe, collected</span>
                <h2 className="disp">Yours to keep.</h2>
                <p>{setSize} cards in the Genesis series. Start with one.</p>
                <div className="cta">
                  <Link className="pill w" href="/capsules">
                    Open a capsule · from {fromPrice} <Arrow />
                  </Link>
                  <Link className="pill o" href="/genesis">
                    Browse the cards
                  </Link>
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

        {/* S2 · the collection */}
        <section className="coll" id="collection" aria-label="Featured cards" style={{ '--c0': feature[0].rgb.join(',') } as CSSProperties}>
          {feature.map((c) => (
            <div key={c.designation} className="bgc" style={{ background: `rgb(${c.rgb.join(',')})` }} />
          ))}
          <div className="mhead lbl">02 · The collection — swipe</div>
          <div className="track">
            {feature.map((c, i) => (
              <div key={c.designation} className="slide" style={{ '--bg': c.rgb.join(',') } as CSSProperties}>
                <div className="word" aria-hidden="true">
                  {c.word}
                </div>
                <div className="tilt">
                  <Card designation={c.designation} alt={`${c.word} card, No. ${c.no}, ${c.rarity}`} delay={i} eager />
                </div>
                <div className="mi">
                  <div className="row">
                    <div>
                      <span className="lbl">
                        {c.rarity} · No. {c.no} · {c.perk}
                      </span>
                      <b>{c.note}</b>
                    </div>
                    <div className="end">
                      <span className="price num">{c.price}</span>
                      <Link className="circ" href={`/card/${c.designation}`} aria-label={`See the ${c.word} card`}>
                        <Arrow w={1.8} />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="corner tl">
            <span className="lbl">02 · The collection</span>
            <p>Each card is one real object in the night sky, numbered, in an edition sized by its rarity.</p>
          </div>
          <div className={`corner tr sw${cardOut ? ' out' : ''}`}>
            <div className="big num">No. {f.no}</div>
            <span className="lbl">
              {f.rarity} · of {setSize}
            </span>
          </div>
          <div className={`corner bl sw${cardOut ? ' out' : ''}`}>
            <span className="lbl">
              {f.type} · {f.perk}
            </span>
            <b>{f.note}</b>
          </div>
          <div className="corner bc" aria-hidden="true">
            {feature.map((c, i) => (
              <i key={c.designation} className={i === ci ? 'on' : undefined} />
            ))}
          </div>
          <div className={`corner br sw${cardOut ? ' out' : ''}`}>
            <span className="price num">{f.price}</span>
            <Link className="circ" href={`/card/${f.designation}`} aria-label={`See the ${f.word} card`}>
              <Arrow w={1.8} />
            </Link>
          </div>
        </section>

        {/* S3 · one night at the telescope */}
        <section className="night" id="night" aria-label="One night at the observatory">
          <div className="ph">
            <img
              className="k"
              src="/home/night-dusk-1280.webp"
              srcSet="/home/night-dusk-1280.webp 1280w, /home/night-dusk-2200.webp 2200w"
              sizes="100vw"
              alt="An observatory dome at dusk, its slit open"
              loading="lazy"
              decoding="async"
            />
            <img
              className="n"
              src="/home/night-night-1280.webp"
              srcSet="/home/night-night-1280.webp 1280w, /home/night-night-2200.webp 2200w"
              sizes="100vw"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="shade" />
          <div className="head">
            <span className="lbl">03 · Live Telescope V1</span>
            <h2 className="disp">One night at the observatory.</h2>
            <p>From first light, holders vote on the target and the telescope works from dusk until two.</p>
          </div>
          <article className="ncard">
            <div className="top">
              <div>
                <div className="clock num" ref={clockRef}>
                  {hhmm(nightFrom, 0)}
                </div>
                <span className="lbl live">
                  <i />
                  From first light
                </span>
              </div>
              <span className="lbl">
                Tbilisi
                <br />
                GMT+4
              </span>
            </div>
            <div className={`swp${nightOut ? ' out' : ''}`}>
              <div className="ttl">{n.title}</div>
              <p className="txt">{n.text}</p>
              <div className="drop">
                <img src={art(n.designation, true)} alt="" width={46} height={64} loading="lazy" />
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
              <div className="ends">
                <span>{hhmm(nightFrom, 0)}</span>
                <span>{nightEnd}</span>
              </div>
            </div>
          </article>
        </section>

        {/* S4 · the capsule */}
        <section className="cap" id="capsule" aria-label="Inside a capsule">
          <div className="in">
            <div className="lft">
              <div>
                <span className="lbl">04 · The capsule</span>
                <h2 className="disp">Nine of {setSize}. One is yours.</h2>
                <p className="sub">Every capsule holds one sealed card. Pay more, and the odds lean further out.</p>
              </div>
              <div className="buy">
                <div className="seg" role="group" aria-label="Capsule">
                  {tiers.map((x, i) => (
                    <button key={x.name} type="button" aria-pressed={i === tier} onClick={() => setTier(i)}>
                      {x.price}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <div>
                    <span className="tprice num">{t.price}</span>
                    <span className="tname">{t.name} capsule · one sealed card</span>
                  </div>
                  <Link className="pill k" href="/capsules">
                    Open {t.name} <Arrow />
                  </Link>
                </div>
              </div>
            </div>
            <div className="mid">
              <div className={`case${active !== null ? ' hl' : ''}`} onMouseLeave={leave}>
                <div className="grid">
                  {grid.map((g, i) => (
                    <div key={g.designation} className={`cell${active === i ? ' on' : ''}`} onMouseEnter={() => setActive(i)}>
                      <img src={art(g.designation, true)} alt={`${g.name} card, ${g.rarity}`} width={400} height={559} loading="lazy" decoding="async" />
                    </div>
                  ))}
                </div>
                <div className="lid" aria-hidden="true">
                  <div className="emb">
                    <Wordmark />
                    <span className="lbl">Genesis · Series 01</span>
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
                {grid.map((g, i) => (
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
                      <span className="r">{g.rarity}</span>
                    </button>
                    <div className="acc" id={`acc-${g.designation}`}>
                      <div>
                        <p>
                          No. {g.no}. {g.line} {g.perk}
                          <b>
                            {g.rarity} odds in a {t.price} capsule: {t.odds[g.rarityKey]}
                          </b>
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* The telescope, after the cards */}
        <section className="scope" id="observatory" aria-label="The telescope">
          <div className="g">
            <div>
              <span className="lbl soon">
                <i />
                Live Telescope V1 · first light in November
              </span>
              <h2 className="disp">Then point it yourself.</h2>
              <p className="lead">Epic cards come with a {scope.minutes}-minute session on the telescope in Tbilisi, booked after first light.</p>
              <dl>
                <div>
                  <dt>Site</dt>
                  <dd>{scope.site}</dd>
                </div>
                <div>
                  <dt>Optics</dt>
                  <dd>{scope.optics}</dd>
                </div>
                <div>
                  <dt>Session</dt>
                  <dd>{scope.minutes} min</dd>
                </div>
              </dl>
              <div className="acts">
                <a className="pill w" href="#signup" onClick={toHash}>
                  Join the first-light list
                </a>
                <Link className="pill o" href="/contact">
                  Own a telescope? Earn from it
                </Link>
              </div>
            </div>
            <figure className="ph">
              <img src="/home/moon-1000.webp" alt="The Moon" width={1000} height={1250} loading="lazy" decoding="async" />
              <figcaption className="tag">
                <span className="lbl">The Moon</span>
                <span className="chip">{scope.minutes}-min session</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* S5 · footer */}
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
          <span className="lbl">Skychaser · Stellar</span>
          <h2 className="disp">The universe, collected.</h2>
          <p className="say">One email when a new series opens. Nothing else.</p>
          <form className="mail" onSubmit={onMail}>
            <label className="sr" htmlFor="ed-email">
              Email
            </label>
            <input id="ed-email" name="email" type="email" required placeholder="Your email" autoComplete="email" />
            <button type="submit" aria-label="Subscribe">
              <Arrow w={1.8} />
            </button>
          </form>
          <p className="note" role="status">
            {mailNote}
          </p>
          <div className="legal">
            <span>© 2026 Skychaser · Tbilisi</span>
            <span className="credits">
              Orion over a ruined castle: Carlos Zudaire/IAU OAE, CC BY 4.0 · La Silla Observatory: ESO/H.H. Heyer, CC BY 4.0, regraded for night · Orion
              Nebula, Pillars of Creation: NASA, ESA, Hubble · The Moon: NASA/GSFC/Arizona State University · The raw frame and the capsule scene are
              illustrations.
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
