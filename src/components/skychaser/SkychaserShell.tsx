import type { ReactNode } from 'react';
import Link from 'next/link';
import Wordmark from './ui/Wordmark';
import SkychaserNavLinks from './SkychaserNavLinks';
import SkychaserTabBar from './SkychaserTabBar';
import SkychaserAccountGate from './SkychaserAccountGate';
import SkychaserAuth from './SkychaserAuth';
import SkychaserLiving, { LIVE_SCRIPT } from './SkychaserLiving';

const PARTNERS = [
  { src: '/brand-partners/astroman.png', alt: 'Astroman', width: 640, height: 169 },
  { src: '/brand-partners/bresser.svg', alt: 'Bresser', width: 290, height: 60 },
  { src: '/brand-partners/celestron.png', alt: 'Celestron', width: 500, height: 76 },
  { src: '/brand-partners/levenhuk.svg', alt: 'Levenhuk', width: 300, height: 60 },
];

const RECOGNITION = [
  {
    href: 'https://superteam.fun/earn/listing/tether-frontier-hackathon-track',
    logo: '/brand-partners/qvac.svg', logoAlt: 'QVAC by Tether', logoWidth: 218, logoHeight: 24,
    label: 'Tether Frontier', rank: '1st place',
    linkLabel: 'View Tether Frontier Hackathon track on Superteam Earn',
  },
  {
    href: 'https://superteam.fun/earn/grants/solana-foundation-georgia-grants',
    logo: '/brand-partners/superteam-mark.png', logoAlt: 'Superteam', logoWidth: 160, logoHeight: 48,
    label: 'Superteam', rank: 'Grant',
    linkLabel: 'View the Solana Foundation grant on Superteam Earn',
  },
];

const EXPLORE = [
  { href: '/node', label: 'Observatory' },
  { href: '/voyage', label: 'Voyage' },
];

const LEGAL = [
  { href: '/contact', label: 'Contact' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
];

/**
 * The frame every Skychaser page wraps itself in:
 *
 *   export default function Page() {
 *     return <SkychaserShell>…</SkychaserShell>;
 *   }
 *
 * It puts `.skychaser` on its root, which scopes the Skychaser tokens and fonts
 * (src/styles/skychaser-theme.css) and hides the legacy Skychaser nav, footer,
 * bottom tabs and starfield while the page is on screen. Legacy pages are
 * untouched. Content goes inside `.sd-container` for the 16px gutter and the
 * 1040px measure, unless a section is meant to run full-bleed. A page with no
 * visible heading passes `title`, read out as its h1. A page that draws its
 * own header and runs edge to edge, like the observatory console, passes `bare`.
 */
export default function SkychaserShell({
  children,
  title,
  bare = false,
}: {
  children: ReactNode;
  title?: string;
  bare?: boolean;
}) {
  if (bare)
    return (
      <SkychaserAuth>
        <div className="skychaser">
          <div className="sd-backdrop" aria-hidden="true" />
          {children}
        </div>
      </SkychaserAuth>
    );
  return (
    <SkychaserAuth>
      <div className="skychaser skychaser--framed">
        <script dangerouslySetInnerHTML={{ __html: LIVE_SCRIPT }} />
        <div className="sd-backdrop" aria-hidden="true" />
        <header className="sd-bar">
          <div className="sd-container sd-bar__inner">
            <div className="sd-bar__mark">
              <Wordmark href="/" />
            </div>
            <SkychaserNavLinks />
            <div className="sd-bar__account">
              <SkychaserAccountGate />
            </div>
          </div>
        </header>

        {title && <h1 className="sr-only">{title}</h1>}
        <div className="sd-page">{children}</div>

        <footer className="sd-foot">
          <div className="sd-container">
            <div className="sd-foot__top">
              <div className="sd-foot__brand">
                <Wordmark href="/" />
              </div>
              <div className="sd-foot__trust" aria-label="Partner brands and recognition" role="group">
                <ul className="sd-partners">
                  {PARTNERS.map((p) => (
                    <li key={p.alt}>
                      <img src={p.src} alt={p.alt} width={p.width} height={p.height} loading="lazy" />
                    </li>
                  ))}
                </ul>
                <ul className="sd-recog">
                  {RECOGNITION.map((r) => (
                    <li key={r.label}>
                      <a href={r.href} target="_blank" rel="noopener noreferrer" aria-label={r.linkLabel} className="sd-recog__item">
                        <img src={r.logo} alt={r.logoAlt} width={r.logoWidth} height={r.logoHeight} loading="lazy" />
                        <span className="sd-recog__cap">
                          {r.label} · <b>{r.rank}</b>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="sd-foot__base">
              <nav aria-label="Explore" className="sd-foot__legal">
                {EXPLORE.map((l) => (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ))}
              </nav>
              <nav aria-label="Footer" className="sd-foot__legal">
                {LEGAL.map((l) => (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ))}
              </nav>
              <span>© {new Date().getFullYear()} Skychaser</span>
            </div>
          </div>
        </footer>
        <SkychaserTabBar />
        <SkychaserLiving />
      </div>
    </SkychaserAuth>
  );
}
