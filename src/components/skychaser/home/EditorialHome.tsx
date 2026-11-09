'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import type { Rarity } from '@/lib/rarity';
import { out3, pageTop, runScenes, seg, type Range, type Scene } from './scenes';

export type FeatureCard = {
  designation: string;
  name: string;
  no: number;
  rarity: Rarity;
  type: string;
  perk: string;
  editions: number;
  price: string;
  note: string;
  rgb: [number, number, number];
  face: ReactNode;
};
export type GridCard = { designation: string; name: string; rarity: Rarity; face: ReactNode };
export type TierRow = { name: string; price: string; odds: { rarity: Rarity; label: string; pct: string; bps: number }[] };

type Props = {
  setSize: number;
  editions: number;
  legendary: number;
  fromPrice: string;
  fan: { left: ReactNode; front: ReactNode; right: ReactNode };
  spotlight: { designation: string; name: string; no: number; rarity: string; perk: string; photo: string };
  feature: FeatureCard[];
  grid: GridCard[];
  tiers: TierRow[];
  scope: { site: string; optics: string; aperture: number; minutes: number; from: string; to: string };
};

const CONTACT = 'info@astroman.ge';
const RARITY: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const RARITY_COLOR: Record<Rarity, string> = {
  common: 'var(--sd-rarity-common)',
  rare: 'var(--sd-rarity-rare)',
  epic: 'var(--sd-rarity-epic)',
  legendary: 'var(--sd-rarity-legendary)',
};
const fmt = (n: number) => n.toLocaleString('en-US');

/** Pinned scenes need a wide window with room above and below the cards; elsewhere the page scrolls plainly. */
const PIN_QUERY = '(min-width: 1024px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)';
const MOTION_QUERY = '(prefers-reduced-motion: no-preference)';

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path d="M5 11 11 5M6 5h5v5" />
    </svg>
  );
}

function useMedia(query: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const set = () => setOn(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, [query]);
  return on;
}

/**
 * The home page, five screens: the hero, the shelf, the capsule, the telescope
 * and the sign-off, in the site's own black, cream and red.
 *
 * On a wide screen the shelf and the capsule hold still while they play: the
 * shelf runs sideways as you scroll, and the capsule's band and lid come off
 * to show the nine cards. The hero's sky and cards drift apart as it leaves.
 * Everything is scrubbed by native scroll through ./scenes; on a phone the
 * shelf is swiped and the capsule opens once as it arrives. With reduced
 * motion every scene is drawn at its end.
 */
export default function EditorialHome({ setSize, editions, legendary, fromPrice, fan, spotlight, feature, grid, tiers, scope }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const shelfRange = useRef<Range | null>(null);
  const pin = useMedia(PIN_QUERY);
  const motion = useMedia(MOTION_QUERY);

  // The shelf: the card nearest the middle is the one described.
  const [ci, setCi] = useState(0);
  const ciRef = useRef(0);
  const pick = useCallback((i: number) => {
    if (i === ciRef.current) return;
    ciRef.current = i;
    setCi(i);
  }, []);

  // ── Scroll scenes ────────────────────────────────────────────
  useEffect(() => {
    const el = root.current;
    if (!el || !motion) return;
    const one = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
    const all = <T extends HTMLElement = HTMLElement>(s: string) => Array.from(el.querySelectorAll<T>(s));
    const touched = new Set<HTMLElement>();
    const put = (node: HTMLElement, transform: string, opacity?: number) => {
      touched.add(node);
      node.style.transform = transform;
      if (opacity !== undefined) node.style.opacity = opacity < 0.001 ? '0' : opacity > 0.999 ? '1' : opacity.toFixed(3);
    };

    const scenes: Scene[] = [];

    // The hero: the sky sinks and grows, the copy lifts away, the fan opens and rises.
    const hero = one('.hero');
    const sky = one('.hero .sky');
    const lead = one('.hero .lead');
    const fanWrap = one('.hero .fanwrap');
    const fanEl = fanRef.current!;
    let heroH = 1;
    scenes.push({
      measure: (y) => {
        const top = pageTop(hero, y);
        heroH = hero.offsetHeight;
        return { start: top, end: top + heroH };
      },
      draw: (p) => {
        put(sky, `translate3d(0, ${(p * heroH * 0.22).toFixed(1)}px, 0) scale(${(1 + p * 0.08).toFixed(4)})`);
        put(lead, `translate3d(0, ${(-p * 90).toFixed(1)}px, 0)`, 1 - seg(p, 0.1, 0.6));
        put(fanWrap, `translate3d(0, ${(-p * 140).toFixed(1)}px, 0)`, 1 - seg(p, 0.45, 0.9));
        touched.add(fanEl);
        fanEl.style.setProperty('--s', p.toFixed(3));
      },
    });

    // The shelf, sideways (wide screens).
    const shelf = one('.shelf');
    const slots = all('.shelf .slot');
    const glows = all('.shelf .glow');
    const ghost = one('.shelf .ghost');
    const n = slots.length;
    let centers: number[] = [];
    let spacing = 1;
    let travel = 0;
    if (pin) {
      const pinbox = one('.shelf .pinbox');
      const trackEl = track.current!;
      scenes.push({
        measure: (y, vh) => {
          centers = slots.map((s) => s.offsetLeft + s.offsetWidth / 2);
          spacing = n > 1 ? (centers[n - 1] - centers[0]) / (n - 1) : 1;
          travel = centers[n - 1] - centers[0];
          const height = Math.round(pinbox.offsetHeight + travel * 1.25 + vh * 0.15);
          if (Math.abs(shelf.offsetHeight - height) > 1) shelf.style.height = `${height}px`;
          touched.add(shelf);
          // The box sticks when the section's top reaches the bar, and lets go when its foot does.
          const stick = parseFloat(getComputedStyle(pinbox).top) || 0;
          const top = pageTop(shelf, y) - stick;
          const range = { start: top + vh * 0.08, end: top + height - pinbox.offsetHeight - vh * 0.07 };
          shelfRange.current = range;
          return range;
        },
        draw: (p) => {
          const x = p * travel;
          put(trackEl, `translate3d(${(-x).toFixed(1)}px, 0, 0)`);
          slots.forEach((s, i) => {
            const d = (centers[i] - centers[0] - x) / spacing;
            const a = Math.min(1, Math.abs(d));
            put(s, `translate3d(0, ${(a * 34).toFixed(1)}px, 0) rotate(${(Math.max(-1, Math.min(1, d)) * 7).toFixed(2)}deg) scale(${(1 - a * 0.16).toFixed(4)})`, 1 - a * 0.5);
          });
          const f = p * (n - 1);
          const i = Math.min(n - 1, Math.floor(f));
          const t = f - i;
          glows.forEach((g, j) => {
            touched.add(g);
            g.style.opacity = j === i ? '1' : j === i + 1 ? t.toFixed(3) : '0';
          });
          put(ghost, `translate3d(${(-p * 28).toFixed(2)}%, 0, 0)`);
          pick(Math.round(f));
        },
      });
    }

    // The capsule: the band slides off, the lid lifts, the cards come up from the middle out.
    const capS = one('.cap');
    const ctext = one('.cap .ctext');
    const band = one('.cap .band');
    const lid = one('.cap .lid');
    const cells = all('.cap .cell');
    const buy = one('.cap .buy');
    const order = cells.map((_, i) => {
      const r = Math.floor(i / 3) - 1;
      const c = (i % 3) - 1;
      return Math.abs(r) + Math.abs(c);
    });
    if (pin) {
      const pinbox = one('.cap .pinbox');
      scenes.push({
        measure: (y, vh) => {
          const height = Math.round(pinbox.offsetHeight + vh * 1.3);
          if (Math.abs(capS.offsetHeight - height) > 1) capS.style.height = `${height}px`;
          touched.add(capS);
          const stick = parseFloat(getComputedStyle(pinbox).top) || 0;
          const top = pageTop(capS, y) - stick;
          return { start: top - vh * 0.35, end: top + height - pinbox.offsetHeight - vh * 0.1 };
        },
        draw: (p) => {
          const a = out3(seg(p, 0.0, 0.26));
          put(ctext, `translate3d(0, ${((1 - a) * 40).toFixed(1)}px, 0)`, a);
          const b = seg(p, 0.3, 0.44);
          put(band, `translate3d(0, ${(-b * 104).toFixed(2)}%, 0)`);
          const l = out3(seg(p, 0.42, 0.6));
          put(lid, `translate3d(0, ${(-l * 26).toFixed(1)}px, 0) scale(${(1 + l * 0.06).toFixed(4)})`, 1 - l);
          cells.forEach((c, i) => {
            const k = out3(seg(p, 0.5 + order[i] * 0.06, 0.66 + order[i] * 0.06));
            put(c, `translate3d(0, ${((1 - k) * 16).toFixed(1)}px, 0) scale(${(0.9 + k * 0.1).toFixed(4)})`, k);
          });
          const u = out3(seg(p, 0.6, 0.82));
          put(buy, `translate3d(${((1 - u) * 36).toFixed(1)}px, 0, 0)`, u);
        },
      });
    }

    // The telescope and the sign-off: their photographs drift against the page.
    for (const sel of ['.obs', '.signoff']) {
      const sec = one(sel);
      const img = one(`${sel} .bgi`);
      scenes.push({
        smooth: false,
        measure: (y, vh) => {
          const top = pageTop(sec, y);
          return { start: top - vh, end: top + sec.offsetHeight };
        },
        draw: (p) => put(img, `translate3d(0, ${((p - 0.5) * 12).toFixed(2)}%, 0) scale(1.14)`),
      });
    }

    const stop = runScenes(scenes, el);
    return () => {
      stop();
      shelfRange.current = null;
      touched.forEach((node) => {
        node.style.removeProperty('transform');
        node.style.removeProperty('opacity');
        node.style.removeProperty('height');
        node.style.removeProperty('--s');
      });
    };
  }, [pin, motion, pick]);

  // Sections rise in once as they arrive, and the capsule opens once on a phone.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-rise]');
    const cap = el.querySelector<HTMLElement>('.cap')!;
    if (!motion || !('IntersectionObserver' in window)) {
      items.forEach((i) => i.classList.add('in'));
      cap.classList.add('open');
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add(e.target === cap ? 'open' : 'in');
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -18% 0px' },
    );
    items.forEach((i) => io.observe(i));
    if (!pin) io.observe(cap);
    return () => io.disconnect();
  }, [motion, pin]);

  // The hero cards lean toward the pointer (a mouse, motion allowed).
  useEffect(() => {
    const el = fanRef.current;
    if (!el || !motion || !window.matchMedia('(hover: hover)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      el.style.removeProperty('transform');
    };
  }, [motion]);

  // The shelf on a phone: swiped, and the card nearest the middle is described.
  const onShelf = useCallback(() => {
    const t = track.current;
    if (!t || pin) return;
    const mid = t.scrollLeft + t.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    Array.from(t.children).forEach((c, i) => {
      const el = c as HTMLElement;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    pick(best);
  }, [pin, pick]);
  const go = (i: number) => {
    const k = Math.max(0, Math.min(feature.length - 1, i));
    const smooth = motion ? 'smooth' : 'auto';
    const range = shelfRange.current;
    if (pin && range) {
      window.scrollTo({ top: range.start + (k / Math.max(1, feature.length - 1)) * (range.end - range.start) + 1, behavior: smooth });
      return;
    }
    const t = track.current;
    const el = t?.children[k] as HTMLElement | undefined;
    if (!t || !el) return;
    t.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - t.clientWidth / 2, behavior: smooth });
  };

  // The capsule: the tier chosen, and the card under the pointer.
  const [tier, setTier] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const t = tiers[tier];
  const lit = hover === null ? null : grid[hover].rarity;

  // The sign-off: one email when a series opens. There is no list yet, so the note goes by email.
  const [mailNote, setMailNote] = useState('');
  const onMail = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email') ?? '');
    const body = `Please write to ${email} when a new Skychaser series opens.`;
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent('New series — tell me')}&body=${encodeURIComponent(body)}`;
    setMailNote(`Your mail app opens with a note to ${CONTACT}. Send it and you are on the list.`);
  };
  const toSignup = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = root.current?.querySelector<HTMLElement>('#signup');
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: motion ? 'smooth' : 'auto' });
    setTimeout(() => target.querySelector('input')?.focus({ preventScroll: true }), motion ? 900 : 0);
  };

  const f = feature[ci];
  const starter = tiers[0];

  return (
    <div ref={root} className={`ed${pin ? ' pin' : ''}`}>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero" aria-label="Skychaser">
        <div className="sky">
          <img
            src="/home/saturn-1280.webp"
            srcSet="/home/saturn-1280.webp 1280w, /home/saturn-2400.webp 2400w"
            sizes="100vw"
            alt="Saturn eclipsing the Sun, seen from behind by Cassini"
            fetchPriority="high"
            decoding="async"
          />
        </div>
        <div className="veil" />

        <div className="stage">
          <div className="lead">
            <p className="ey">Genesis · Series 01</p>
            <h1>
              Collect
              <br />
              <em>the cosmos.</em>
            </h1>
            <p className="sub">
              {setSize} numbered cards of real objects in the night sky. Sealed in capsules, from {fromPrice}.
            </p>
            <div className="acts">
              <Link className="sd-btn sd-btn--primary" href="/capsules">
                Open a capsule
              </Link>
              <Link className="sd-btn" href="/genesis">
                Browse the cards
              </Link>
            </div>
          </div>

          <div className="fanwrap" aria-hidden="true">
            <div className="fanlift">
              <div className="fan" ref={fanRef}>
                <span className="f f1">
                  <span className="cardbox">{fan.left}</span>
                </span>
                <span className="f f3">
                  <span className="cardbox">{fan.right}</span>
                </span>
                <span className="f f2">
                  <span className="cardbox halo">{fan.front}</span>
                </span>
              </div>
            </div>
          </div>

          <dl className="rail">
            <div>
              <dt>Cards</dt>
              <dd>{setSize}</dd>
            </div>
            <div>
              <dt>Editions</dt>
              <dd>{fmt(editions)}</dd>
            </div>
            <div>
              <dt>Legendary</dt>
              <dd>{legendary}</dd>
            </div>
          </dl>
        </div>

        <div className="bento">
          <Link className="panel p-cap" href="/capsules">
            <span className="ph">
              <span>Capsules</span>
              <span>{tiers.length} tiers</span>
            </span>
            <img className="capsule" src="/home/capsule-360.webp" alt="" width={360} height={373} loading="lazy" decoding="async" />
            <span className="pf">
              <b className="big">{fromPrice}</b>
              <span>One sealed card</span>
            </span>
            <i className="go">
              <Arrow />
            </i>
          </Link>

          <Link className="panel p-card" href={`/card/${spotlight.designation}`}>
            <img className="photo" src={spotlight.photo} alt="" width={640} height={640} loading="lazy" decoding="async" />
            <span className="ph">
              <span>On the shelf</span>
              <span>No. {spotlight.no}</span>
            </span>
            <span className="pf">
              <b>{spotlight.name}</b>
              <span>
                {spotlight.rarity} · {spotlight.perk}
              </span>
            </span>
            <i className="go">
              <Arrow />
            </i>
          </Link>

          <Link className="panel p-odds" href="/capsules">
            <span className="ph">
              <span>Odds</span>
              <span>Published</span>
            </span>
            <span className="rows">
              {starter.odds.map((o) => (
                <span key={o.rarity} className="row" style={{ '--rarity': RARITY_COLOR[o.rarity] } as CSSProperties}>
                  <i className="dot" />
                  {o.label}
                  <b>{o.pct}</b>
                </span>
              ))}
            </span>
            <span className="pf">
              <span>
                {starter.name} capsule · {starter.price}
              </span>
            </span>
          </Link>

          <Link className="panel p-scope" href="/node">
            <span className="ph">
              <span>Live telescope</span>
              <span className="soon">November</span>
            </span>
            <svg className="radar" viewBox="0 0 120 120" aria-hidden="true">
              <circle cx="60" cy="60" r="56" />
              <circle cx="60" cy="60" r="38" />
              <circle cx="60" cy="60" r="20" />
              <path d="M60 4v112M4 60h112" />
              <circle className="s" cx="78" cy="34" r="2.4" />
              <circle className="s" cx="36" cy="72" r="1.8" />
              <circle className="s" cx="88" cy="80" r="1.6" />
              <circle className="s on" cx="52" cy="44" r="3" />
            </svg>
            <span className="pf">
              <b>First light</b>
              <span>
                {scope.site.split(',')[0]} · {scope.optics}
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* ── The shelf ───────────────────────────────────── */}
      <section className="shelf" id="cards" aria-label="The cards">
        <div className="pinbox">
          {feature.map((c, i) => (
            <div key={c.designation} className={`glow${i === ci ? ' on' : ''}`} style={{ '--c': c.rgb.join(',') } as CSSProperties} />
          ))}
          <div className="ghost" aria-hidden="true">
            Genesis
          </div>
          <div className="shead" data-rise>
            <div>
              <p className="ey">The Genesis set</p>
              <h2>
                Real objects.
                <br />
                <em>Numbered editions.</em>
              </h2>
            </div>
            <Link className="sd-btn" href="/genesis">
              All {setSize} cards
            </Link>
          </div>

          <div className="track" ref={track} onScroll={onShelf} tabIndex={pin ? -1 : 0} aria-label="Featured cards">
            {feature.map((c, i) => (
              <button
                key={c.designation}
                type="button"
                className={`slot${i === ci ? ' on' : ''}`}
                onClick={() => go(i)}
                aria-label={`${c.name}, No. ${c.no}, ${RARITY[c.rarity]}`}
                aria-current={i === ci ? 'true' : undefined}
              >
                <span className="cardbox">{c.face}</span>
              </button>
            ))}
          </div>

          <div className="shelfbar">
            <button type="button" className="round" onClick={() => go(ci - 1)} disabled={ci === 0} aria-label="Previous card">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
            <Link className="info" href={`/card/${f.designation}`} aria-live="polite" style={{ '--rarity': RARITY_COLOR[f.rarity] } as CSSProperties}>
              <span className="k">
                <i className="dot" />
                {RARITY[f.rarity]} · No. {f.no} of {setSize}
              </span>
              <span className="row">
                <b>{f.name}</b>
                <span className="price">{f.price}</span>
              </span>
              <span className="note">{f.note}</span>
              <span className="meta">
                <span>{f.type}</span>
                <span>{f.perk}</span>
                <span>{f.editions} editions</span>
              </span>
            </Link>
            <button type="button" className="round" onClick={() => go(ci + 1)} disabled={ci === feature.length - 1} aria-label="Next card">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ── The capsule ─────────────────────────────────── */}
      <section className="cap" id="capsule" aria-label="Inside a capsule">
        <div className="pinbox">
          <div className="lines" aria-hidden="true" />
          <div className="cin">
            <div className="ctext">
              <p className="ey">The capsule</p>
              <h2>
                Nine of {setSize}.
                <br />
                <em>One is yours.</em>
              </h2>
              <p className="sub">Every capsule holds one sealed card. The more it costs, the rarer the odds.</p>
            </div>

            <div className={`case${lit ? ' hl' : ''}`} onMouseLeave={() => setHover(null)}>
              <div className="grid">
                {grid.map((g, i) => (
                  <span
                    key={g.designation}
                    className={`cell${hover === i ? ' on' : ''}`}
                    style={{ '--d': `${[2, 1, 2, 1, 0, 1, 2, 1, 2][i] * 70}ms` } as CSSProperties}
                    onMouseEnter={() => setHover(i)}
                    role="img"
                    aria-label={`${g.name}, ${RARITY[g.rarity]}`}
                  >
                    <span className="cardbox">{g.face}</span>
                  </span>
                ))}
              </div>
              <div className="lid" aria-hidden="true">
                <img src="/brand/logo-mark.svg" alt="" width={44} height={44} />
                <span className="emb">Genesis · Series 01</span>
              </div>
              <span className="band" aria-hidden="true">
                <span>Sealed · {t.name}</span>
              </span>
            </div>

            <div className="buy">
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
                  <li key={o.rarity} className={lit && lit !== o.rarity ? 'dim' : undefined} style={{ '--rarity': RARITY_COLOR[o.rarity] } as CSSProperties}>
                    <span className="nm">
                      <i className="dot" />
                      {o.label}
                    </span>
                    <span className="bar">
                      <i style={{ transform: `scaleX(${Math.max(0.006, o.bps / 10000)})` }} />
                    </span>
                    <b>{o.pct}</b>
                  </li>
                ))}
              </ul>
              <Link className="sd-btn sd-btn--primary" href="/capsules">
                Open {t.name} · {t.price}
              </Link>
              <Link className="fair" href="/capsules/log">
                Provably fair · verify ↗
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── The telescope ───────────────────────────────── */}
      <section className="obs" id="observatory" aria-label="The telescope">
        <div className="bgwrap" aria-hidden="true">
          <img
            className="bgi"
            src="/home/night-night-1280.webp"
            srcSet="/home/night-night-1280.webp 1280w, /home/night-night-2200.webp 2200w"
            sizes="100vw"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="veil" />

        <div className="ogrid">
          <div className="otext" data-rise>
            <p className="ey live">
              <i />
              Live telescope · first light in November
            </p>
            <h2>
              Then point it
              <br />
              <em>yourself.</em>
            </h2>
            <p className="sub">Epic cards include a {scope.minutes}-minute session on the telescope in Tbilisi.</p>
            <div className="acts">
              <a className="sd-btn sd-btn--primary" href="#signup" onClick={toSignup}>
                Join the first-light list
              </a>
              <Link className="sd-btn" href="/contact">
                Own a telescope?
              </Link>
            </div>
          </div>

          <div className="night" data-rise>
            <span className="ph">
              <span>One night</span>
              <span>
                {scope.from} – {scope.to}
              </span>
            </span>
            <ol>
              <li>
                <time>{scope.from}</time>
                <span>On the target holders chose</span>
              </li>
              <li>
                <time>20:30</time>
                <span>Epic sessions begin</span>
              </li>
              <li>
                <time>22:00</time>
                <span>Visitor seats drawn from Rare</span>
              </li>
              <li>
                <time>{scope.to}</time>
                <span>Every holder of the card gets the image</span>
              </li>
            </ol>
            <dl className="specs">
              <div>
                <dt>Optics</dt>
                <dd>
                  {scope.optics} · {scope.aperture} mm
                </dd>
              </div>
              <div>
                <dt>Site</dt>
                <dd>{scope.site}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ── Sign-off ────────────────────────────────────── */}
      <section className="signoff" id="signup" aria-label="New series">
        <div className="bgwrap" aria-hidden="true">
          <img
            className="bgi"
            src="/home/pillars-1280.webp"
            srcSet="/home/pillars-1280.webp 1280w, /home/pillars-2000.webp 2000w"
            sizes="100vw"
            alt=""
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="veil" />
        <div className="ftext" data-rise>
          <p className="ey">Series 02</p>
          <h2>
            The universe,
            <br />
            <em>collected.</em>
          </h2>
          <p className="sub">One email when a new series opens. Nothing else.</p>
          <form className="mail" onSubmit={onMail}>
            <label className="sr" htmlFor="ed-email">
              Email
            </label>
            <input id="ed-email" name="email" type="email" required placeholder="Your email" autoComplete="email" />
            <button type="submit" className="sd-btn sd-btn--primary">
              Notify me
            </button>
          </form>
          <p className="note" role="status">
            {mailNote}
          </p>
        </div>
        <p className="credits">
          Saturn: NASA/JPL-Caltech/SSI · Pillars of Creation: NASA, ESA, Hubble · Observatory: ESO/H.H. Heyer, CC BY 4.0, regraded for night
        </p>
      </section>
    </div>
  );
}
