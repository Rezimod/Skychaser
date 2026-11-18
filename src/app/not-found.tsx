import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserShell from '@/components/skychaser/SkychaserShell';

export const metadata: Metadata = { title: 'Not found — Skychaser', robots: { index: false } };

export default function NotFound() {
  return (
    <SkychaserShell title="Not found">
      <section className="sd-container sd-top">
        <div className="sd-gate">
          <p className="sd-label">Not found</p>
          <p className="sd-lede">Nothing is catalogued at this address. The cards and your collection are below.</p>
          <div className="sd-links" style={{ justifyContent: 'center' }}>
            <Link href="/genesis" className="sd-chip">Genesis</Link>
            <Link href="/collection" className="sd-chip">Collection</Link>
          </div>
        </div>
      </section>
    </SkychaserShell>
  );
}
