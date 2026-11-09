'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import SkychaserAccountGate from '@/components/skychaser/SkychaserAccountGate';
import type { Rarity } from '@/lib/rarity';
import { WORDMARK_GLYPHS } from './wordmark';

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
};
export type GridCard = { designation: string; name: string; rarity: Rarity };
export type TierRow = { name: string; price: string; odds: { rarity: Rarity; label: string; pct: string; bps: number }[] };

type Props = {
  fontClass: string;
  setSize: number;
  editions: number;
  legendary: number;
  fromPrice: string;
  spotlight: { designation: string; name: string; no: number; rarity: string; perk: string; photo: string };
  feature: FeatureCard[];
  grid: GridCard[];
  tiers: TierRow[];
  scope: { site: string; optics: string; aperture: number; minutes: number; from: string; to: string };
};

const CONTACT = 'info@astroman.ge';
const RARITY: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const art = (designation: string, small = false) => `/cards/plate/${designation}/card${small ? '-sm' : ''}.webp?v=specimen9`;
const fmt = (n: number) => n.toLocaleString('en-US');

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

function Wordmark() {
  return <svg className="wm" viewBox="0 0 2648 400" aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORDMARK_GLYPHS }} />;
}

function Card({
  designation,
  alt,
  priority = false,
  small = false,
  first = false,
}: {
  designation: string;
  alt: string;
  priority?: boolean;
  small?: boolean;
  first?: boolean;
}) {
  return (
    <span className="card">
      <img
        src={art(designation, small)}
        alt={alt}
        width={small ? 400 : 520}
        height={small ? 559 : 727}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={first ? 'high' : undefined}
        decoding="async"
      />
      <i className="sheen" />
    </span>
  );
}

/**
 * The home page, five screens: the hero with its panels, the shelf, the
 * capsule, the telescope and the sign-off. Native scroll; sections rise in as
 * they arrive. Every number is passed in from the set, the capsule tiers and
 * the telescope's record.
 */
export default function EditorialHome({ fontClass, setSize, editions, legendary, fromPrice, spotlight, feature, grid, tiers, scope }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const fan = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  // Sections rise in once, as they reach the screen.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>('[data-rise]');
    if (!('IntersectionObserver' in window)) {
      items.forEach((i) => i.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -12% 0px' },
    );
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, []);

  // The hero cards lean toward the pointer (desktop, motion allowed).
  useEffect(() => {
    const el = fan.current;
    if (!el || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5;
        const y = e.clientY / window.innerHeight - 0.5;
        el.style.transform = `rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
    };
  }, []);

  // The shelf: the card nearest the middle is the one described.
  const [ci, setCi] = useState(0);
  const onShelf = useCallback(() => {
    const t = track.current;
    if (!t) return;
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
    setCi(best);
  }, []);
  const go = (i: number) => {
    const t = track.current;
    const el = t?.children[Math.max(0, Math.min(feature.length - 1, i))] as HTMLElement | undefined;
    if (!t || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    t.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - t.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
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
    target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setTimeout(() => target.querySelector('input')?.focus({ preventScroll: true }), 700);
  };

  const f = feature[ci];
  const starter = tiers[0];

  return (
    <div ref={root} className={`ed ${fontClass}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="nav">
        <Link className="brand" href="/" aria-label="Skychaser home">
          <img src="/brand/logo-mark.svg" alt="" width={22} height={22} />
          <Wordmark />
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
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="hero" aria-label="Skychaser">
          <img
            className="sky"
            src="/home/saturn-1280.webp"
            srcSet="/home/saturn-1280.webp 1280w, /home/saturn-2400.webp 2400w"
            sizes="100vw"
            alt="Saturn eclipsing the Sun, seen from behind by Cassini"
            fetchPriority="high"
            decoding="async"
          />
          <div className="veil" />

          <div className="stage">
            <div className="lead">
              <h1 className="xl">
                Collect
                <br />
                the <em>cosmos.</em>
              </h1>
              <p>
                {setSize} numbered cards of real objects in the night sky. Sealed in capsules, from {fromPrice}.
              </p>
              <div className="acts">
                <Btn href="/capsules" tone="w">
                  Open a capsule
                </Btn>
                <Btn href="/genesis" tone="o">
                  Browse the cards
                </Btn>
              </div>
            </div>

            <div className="fanwrap" aria-hidden="true">
              <div className="fan" ref={fan}>
                <span className="f f1">
                  <Card designation="SATURN" alt="" priority small />
                </span>
                <span className="f f3">
                  <Card designation="CANYON-DIABLO" alt="" priority small />
                </span>
                <span className="f f2">
                  <Card designation={spotlight.designation} alt="" priority first />
                </span>
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
            <Link className="panel glass p-cap" href="/capsules">
              <span className="ph">
                <span>Capsules</span>
                <span>{tiers.length} tiers</span>
              </span>
              <img className="capsule" src="/home/capsule-360.webp" alt="" width={360} height={373} loading="lazy" />
              <span className="pf">
                <b className="big">{fromPrice}</b>
                <span>One sealed card</span>
              </span>
              <i className="chip go">
                <Arrow />
              </i>
            </Link>

            <Link className="panel glass p-card" href={`/card/${spotlight.designation}`}>
              <img className="photo" src={spotlight.photo} alt="" width={640} height={640} loading="lazy" />
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
              <i className="chip go">
                <Arrow />
              </i>
            </Link>

            <Link className="panel glass p-odds" href="/capsules">
              <span className="ph">
                <span>Odds</span>
                <span>Published</span>
              </span>
              <span className="rows">
                {starter.odds.map((o) => (
                  <span key={o.rarity} className="row" data-rarity={o.rarity}>
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

            <Link className="panel glass p-scope" href="/node">
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
          {feature.map((c, i) => (
            <div key={c.designation} className={`glow${i === ci ? ' on' : ''}`} style={{ '--c': c.rgb.join(',') } as CSSProperties} />
          ))}
          <div className="ghost" aria-hidden="true">
            Genesis
          </div>
          <div className="shead" data-rise>
            <h2 className="xl2">
              Real objects.
              <br />
              <em>Numbered editions.</em>
            </h2>
            <Btn href="/genesis" tone="o">
              All {setSize} cards
            </Btn>
          </div>

          <div className="track" ref={track} onScroll={onShelf} tabIndex={0} aria-label="Featured cards, scroll sideways">
            {feature.map((c, i) => (
              <button
                key={c.designation}
                type="button"
                className={`slot${i === ci ? ' on' : ''}`}
                onClick={() => go(i)}
                aria-label={`${c.name}, No. ${c.no}, ${RARITY[c.rarity]}`}
              >
                <Card designation={c.designation} alt="" />
              </button>
            ))}
          </div>

          <div className="shelfbar">
            <button type="button" className="round glass" onClick={() => go(ci - 1)} disabled={ci === 0} aria-label="Previous card">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path d="M10 3 5 8l5 5" />
              </svg>
            </button>
            <Link className="info glass" href={`/card/${f.designation}`} aria-live="polite">
              <span className="k" data-rarity={f.rarity}>
                <i className="dot" />
                {RARITY[f.rarity]} · No. {f.no} of {setSize}
              </span>
              <b>{f.name}</b>
              <span className="note">{f.note}</span>
              <span className="meta">
                <span>{f.type}</span>
                <span>{f.perk}</span>
                <span>{f.editions} editions</span>
                <span className="price">{f.price}</span>
              </span>
            </Link>
            <button type="button" className="round glass" onClick={() => go(ci + 1)} disabled={ci === feature.length - 1} aria-label="Next card">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </button>
          </div>
        </section>

        {/* ── The capsule ─────────────────────────────────── */}
        <section className="cap" id="capsule" aria-label="Inside a capsule">
          <div className="lines" aria-hidden="true" />
          <div className="ctext" data-rise>
            <h2 className="xl2">
              Nine of {setSize}.
              <br />
              <em>One is yours.</em>
            </h2>
            <p>Every capsule holds one sealed card. The more it costs, the rarer the odds.</p>
          </div>

          {/* the reveal class goes on this wrapper, which React never re-renders the class of */}
          <div className="casewrap" data-rise>
            <div className={`case${lit ? ' hl' : ''}`} onMouseLeave={() => setHover(null)}>
              <div className="grid">
                {grid.map((g, i) => (
                  <span
                    key={g.designation}
                    className={`cell${hover === i ? ' on' : ''}`}
                    style={{ '--i': i } as CSSProperties}
                    onMouseEnter={() => setHover(i)}
                  >
                    <Card designation={g.designation} alt={`${g.name}, ${RARITY[g.rarity]}`} small />
                  </span>
                ))}
              </div>
              <div className="lid" aria-hidden="true">
                <img src="/brand/logo-mark.svg" alt="" width={44} height={44} />
                <span className="band">Sealed</span>
              </div>
            </div>
          </div>

          <div className="buy glass" data-rise>
            <div className="seg" role="group" aria-label="Capsule">
              {tiers.map((x, i) => (
                <button key={x.name} type="button" aria-pressed={i === tier} onClick={() => setTier(i)}>
                  {x.price}
                </button>
              ))}
            </div>
            <div className="price">
              <b>{t.price}</b>
              <span>{t.name} capsule</span>
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
        </section>

        {/* ── The telescope ───────────────────────────────── */}
        <section className="obs" id="observatory" aria-label="The telescope">
          <img
            className="bgi"
            src="/home/night-night-1280.webp"
            srcSet="/home/night-night-1280.webp 1280w, /home/night-night-2200.webp 2200w"
            sizes="100vw"
            alt="An observatory dome under the stars"
            loading="lazy"
            decoding="async"
          />
          <div className="veil" />
          <div className="lines" aria-hidden="true" />

          <div className="otext" data-rise>
            <span className="status glass">
              <i />
              First light · November
            </span>
            <h2 className="xl2">
              Then point it
              <br />
              <em>yourself.</em>
            </h2>
            <p>Epic cards include a {scope.minutes}-minute session on the telescope in Tbilisi.</p>
            <div className="acts">
              <Btn href="#signup" tone="w" onClick={toSignup}>
                Join the first-light list
              </Btn>
              <Btn href="/contact" tone="o">
                Own a telescope?
              </Btn>
            </div>
          </div>

          <div className="night glass" data-rise>
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
          </div>

          <ul className="specs" data-rise aria-label="The telescope">
            <li>
              <i />
              {scope.optics} · {scope.aperture} mm
            </li>
            <li>
              <i />
              {scope.site}
            </li>
          </ul>
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
          <div className="ftext" data-rise>
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
              Saturn: NASA/JPL-Caltech/SSI · Pillars of Creation: NASA, ESA, Hubble · Observatory: ESO/H.H. Heyer, CC BY 4.0, regraded for night
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
