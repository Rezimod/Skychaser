import type { ReactNode } from 'react';
import Link from 'next/link';
import Wordmark from './ui/Wordmark';
import SkychaserNavLinks from './SkychaserNavLinks';
import SkychaserTabBar from './SkychaserTabBar';
import SkychaserAccountGate from './SkychaserAccountGate';
import SkychaserAuth from './SkychaserAuth';
import SkychaserLiving from './SkychaserLiving';
import SkychaserHello from './SkychaserHello';

const PARTNERS = [
  { src: '/brand-partners/astroman.png', alt: 'Astroman', width: 640, height: 169 },
  { src: '/brand-partners/bresser.svg', alt: 'Bresser', width: 290, height: 60 },
  { src: '/brand-partners/celestron.png', alt: 'Celestron', width: 500, height: 76 },
  { src: '/brand-partners/levenhuk.svg', alt: 'Levenhuk', width: 300, height: 60 },
];

const EXPLORE = [
  { href: '/node', label: 'Observatory' },
  { href: '/vote', label: 'Vote' },
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
          <SkychaserHello />
        </div>
      </SkychaserAuth>
    );
  return (
    <SkychaserAuth>
      <div className="skychaser skychaser--framed">
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
        <SkychaserHello />

        <footer className="sd-foot">
          <div className="sd-container">
            <div className="sd-foot__top">
              <div className="sd-foot__brand">
                <Wordmark href="/" />
              </div>
              <div className="sd-foot__trust" aria-label="Partner brands" role="group">
                <ul className="sd-partners">
                  {PARTNERS.map((p) => (
                    <li key={p.alt}>
                      <img src={p.src} alt={p.alt} width={p.width} height={p.height} loading="lazy" />
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
              <a href="https://x.com/Skychaserio" target="_blank" rel="noopener noreferrer" className="sd-foot__x" aria-label="Skychaser on X">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                @Skychaserio
              </a>
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
