import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import DataRow from '@/components/skychaser/ui/DataRow';
import { getNode } from '@/lib/observatory/nodes';

export const metadata: Metadata = {
  title: 'Observatory · Skychaser',
  description: 'Live Telescope V1, the telescope in Tbilisi, is being commissioned. First light in November.',
};

/** The observatory is not open yet. Only the cards are live; this page says so and offers nothing else. */
export default function ObservatoryPage() {
  const node = getNode('tbilisi-01')!;
  return (
    <SkychaserShell title="Observatory">
      <article className="sd-container sd-top sd-legal">
        <p className="sd-eyebrow">Coming soon</p>
        <p className="sd-lede">Live Telescope V1 is being commissioned. First light is in November.</p>
        <p>
          From then, every clear night the telescope photographs one object the holders choose, every holder of that card
          receives the image, and half-hours on the telescope can be booked. Until then nothing is photographed and nothing
          is booked.
        </p>
        <DataRow
          layout="stacked"
          className="sd-legal__ledger"
          items={[
            { label: 'Live Telescope', value: 'Coming soon · first light in November' },
            { label: 'Site', value: node.site },
            { label: 'Sessions', value: 'Open with first light' },
            { label: 'Open now', value: <Link href="/genesis">The Founding set</Link> },
          ]}
        />
      </article>
    </SkychaserShell>
  );
}
