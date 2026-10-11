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
          <p className="sd-lede">Nothing is catalogued at this address. The set, the capsules and tonight&rsquo;s card are below.</p>
          <div className="sd-links" style={{ justifyContent: 'center' }}>
            <Link href="/genesis" className="sd-chip">Genesis</Link>
            <Link href="/capsules" className="sd-chip">Capsules</Link>
            <Link href="/tonight" className="sd-chip">Tonight</Link>
          </div>
        </div>
      </section>
    </SkychaserShell>
  );
}
