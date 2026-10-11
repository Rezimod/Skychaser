import type { Metadata } from 'next';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import DataRow from '@/components/skychaser/ui/DataRow';

export const metadata: Metadata = {
  title: 'Contact — Skychaser',
  description: 'How to reach the people behind Skychaser and the Live Telescope.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <SkychaserShell title="Contact">
      <article className="sd-container sd-top sd-legal">
        <p className="sd-lede">
          Skychaser is run by Astroman. Email is the fastest way to reach us; a reply can take a day or two. For a
          payment, include the transaction signature.
        </p>
        <DataRow
          layout="stacked"
          className="sd-legal__ledger"
          items={[
            { label: 'Email', value: <a href="mailto:info@astroman.ge">info@astroman.ge</a> },
            { label: 'Store', value: <a href="https://astroman.ge" target="_blank" rel="noopener noreferrer">astroman.ge</a> },
            { label: 'Live Telescope', value: 'Coming soon · first light in November' },
          ]}
        />
      </article>
    </SkychaserShell>
  );
}
