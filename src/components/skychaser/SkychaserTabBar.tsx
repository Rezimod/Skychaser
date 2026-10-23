'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Layers, Wallet } from 'lucide-react';

/** Two destinations only (owner, 2026-10-23): the shelf and the Collection. The observatory and the vote stay in the footer. */
const TABS = [
  { href: '/genesis', label: 'Genesis', icon: Layers, match: ['/genesis', '/card', '/capsule', '/edition'] },
  { href: '/collection', label: 'Collection', icon: Wallet, match: ['/collection'] },
];

/** A phone's way round Skychaser: the destinations along the bottom, under the thumb. */
export default function SkychaserTabBar() {
  const pathname = usePathname();
  // The pressed tab lights at once, before its page arrives.
  const [pressed, setPressed] = useState<string | null>(null);
  useEffect(() => setPressed(null), [pathname]);
  return (
    <nav aria-label="Skychaser sections" className="sd-tabs">
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const current = pressed ? pressed === href : match.some((p) => pathname.startsWith(p));
        return (
          <Link key={href} href={href} className="sd-tab" aria-current={current ? 'page' : undefined} onClick={() => setPressed(href)}>
            <Icon aria-hidden="true" size={20} strokeWidth={current ? 2.2 : 1.8} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
