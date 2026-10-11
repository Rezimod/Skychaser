'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layers, Moon, Telescope, Wallet } from 'lucide-react';

const TABS = [
  { href: '/genesis', label: 'Genesis', icon: Layers, match: ['/genesis', '/card', '/capsule'] },
  { href: '/tonight', label: 'Tonight', icon: Moon, match: ['/tonight'] },
  { href: '/node', label: 'Observatory', icon: Telescope, match: ['/node'] },
  { href: '/collection', label: 'Collection', icon: Wallet, match: ['/collection'] },
];

/** A phone's way round Skychaser: the destinations along the bottom, under the thumb. */
export default function SkychaserTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Skychaser sections" className="sd-tabs">
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const current = match.some((p) => pathname.startsWith(p));
        return (
          <Link key={href} href={href} className="sd-tab" aria-current={current ? 'page' : undefined}>
            <Icon aria-hidden="true" size={22} strokeWidth={current ? 2.2 : 1.7} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
