'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SkychaserAccountGate from './SkychaserAccountGate';
import { WORDMARK_GLYPHS } from './home/wordmark';
import '@/styles/skychaser-sitenav.css';

const LINKS = [
  { href: '/genesis', label: 'Cards', match: ['/genesis', '/card'] },
  { href: '/capsules', label: 'Capsules', match: ['/capsule'] },
  { href: '/collection', label: 'Collection', match: ['/collection'] },
  { href: '/node', label: 'Observatory', match: ['/node'] },
];

/** The one top bar, the same on every page. On the home page it floats over the hero (`overlay`). */
export default function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const pathname = usePathname();
  return (
    <header className={`snav${overlay ? ' snav--over' : ''}`}>
      <Link className="snav__brand" href="/" aria-label="Skychaser home">
        <img src="/brand/logo-mark.svg" alt="" width={30} height={30} />
        <svg className="snav__wm" viewBox="0 0 2648 400" aria-hidden="true" dangerouslySetInnerHTML={{ __html: WORDMARK_GLYPHS }} />
      </Link>
      <nav className="snav__menu" aria-label="Skychaser">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={l.match.some((p) => pathname.startsWith(p)) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="snav__end">
        <SkychaserAccountGate />
        <Link className="snav__cta" href="/capsules">
          <span>Open a capsule</span>
          <i>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
              <path d="M5 11 11 5M6 5h5v5" />
            </svg>
          </i>
        </Link>
      </div>
    </header>
  );
}
