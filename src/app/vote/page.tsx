import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import DataRow from '@/components/skychaser/ui/DataRow';

export const metadata: Metadata = {
  title: 'Vote — the week’s observation',
  description: 'One object a week, chosen by the holders among what the Live Telescope can photograph. Voting opens with first light in November.',
};

/** The vote is not open yet. Only the cards are live; this page says so and offers nothing else. */
export default function VotePage() {
  return (
    <SkychaserShell title="Vote">
      <SkychaserView step="tonight" />
      <article className="sd-container sd-top sd-legal">
        <p className="sd-eyebrow">Coming soon</p>
        <p className="sd-lede">Holders choose what the telescope observes each week.</p>
        <p>
          Voting opens with first light in November, when there is a telescope to point. Every holder votes with the
          editions they hold; the week’s card is locked on Sunday at 13:00 UTC and photographed on the first clear night.
        </p>
        <DataRow
          layout="stacked"
          className="sd-legal__ledger"
          items={[
            { label: 'Vote', value: 'Opens with first light' },
            { label: 'Live Telescope', value: 'Coming soon · first light in November' },
            { label: 'Open now', value: <Link href="/genesis">The Founding set</Link> },
          ]}
        />
      </article>
    </SkychaserShell>
  );
}
