'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/genesis', label: 'Genesis', match: ['/genesis', '/card', '/capsule'] },
  { href: '/vote', label: 'Vote', match: ['/vote'] },
  { href: '/node', label: 'Observatory', match: ['/node'] },
  { href: '/book', label: 'Book', match: ['/book'] },
];

/** The Skychaser destinations. Client-side only to mark the current page. */
export default function SkychaserNavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Skychaser" className="sd-bar__links">
      {LINKS.map((l) => {
        const current = l.match.some((p) => pathname.startsWith(p));
        return (
          <Link key={l.href} href={l.href} className="sd-navlink" aria-current={current ? 'page' : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
