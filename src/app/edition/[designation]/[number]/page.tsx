import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { accentFor, accentInkFor } from '@/components/skychaser/card/CardFront';
import CardPlate from '@/components/skychaser/CardPlate';
import ShareCard from '@/components/skychaser/ShareCard';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import DataRow, { type Datum } from '@/components/skychaser/ui/DataRow';
import { getDb } from '@/lib/db';
import { isRarity, rarityInfo } from '@/lib/rarity';
import { SHELF_BY_DESIGNATION } from '@/lib/sets/shelf';
import { parseEdition } from '@/lib/skychaser/edition-path';
import { perkFor } from '@/lib/skychaser/perks';
import { readEdition, type EditionView } from '@/lib/skychaser/repo';

export const dynamic = 'force-dynamic';

const pad = (n: number) => String(n).padStart(3, '0');
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

type Params = Promise<{ designation: string; number: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const parsed = parseEdition(await params);
  const card = parsed && SHELF_BY_DESIGNATION.get(parsed.designation);
  if (!parsed || !card) return { title: 'Edition not found — Skychaser' };
  const { seed, record } = card;
  return {
    title: `${seed.name} No. ${pad(parsed.number)} of ${seed.editionSize} — Skychaser`,
    description: `One numbered edition of ${seed.name}, held on Skychaser. ${record.line}`,
  };
}

function provenanceOf(view: EditionView): Datum['value'] {
  const p = view.provenance;
  if (p.kind === 'capsule')
    return (
      <Link href={`/capsule/${p.capsuleId}`} className="sd-link">
        {p.sequence === null ? 'A capsule' : `Capsule No. ${pad(p.sequence)}`}
      </Link>
    );
  if (p.kind === 'outright') return 'Bought outright';
  if (p.kind === 'welcome') return 'The first card, on sign-in';
  return 'Given';
}

/**
 * One holder's one card: the edition by its number, who holds it, when and
 * how it came to them, and whether the observatory has photographed the card
 * since. The page a reveal, a Collection and a welcome share.
 */
export default async function EditionPage({ params }: { params: Params }) {
  const parsed = parseEdition(await params);
  if (!parsed) notFound();
  const card = SHELF_BY_DESIGNATION.get(parsed.designation);
  if (!card) notFound();
  const { seed, record } = card;
  const rarity = isRarity(seed.rarity) ? seed.rarity : 'common';

  const db = getDb();
  let view: EditionView | null = null;
  let unreadable = !db;
  if (db) {
    try {
      view = await readEdition(db, parsed.designation, parsed.number);
    } catch (err) {
      console.error('[skychaser] cannot read edition', err);
      unreadable = true;
    }
  }
  if (!view && !unreadable) notFound();

  // The database is the record; the shelf stands in while it cannot be read.
  const number = `No. ${pad(parsed.number)} of ${view?.editionSize ?? seed.editionSize}`;
  const url = `https://skychaser.io/edition/${seed.designation}/${parsed.number}`;
  const perk = perkFor(seed.designation, rarity);

  return (
    <SkychaserShell title={`${seed.name} ${number}`}>
      <SkychaserView step="edition" />
      <section className="sd-container sd-top">
        <nav aria-label="Breadcrumb" className="sd-crumb sd-data">
          <Link href="/genesis">Genesis</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/card/${seed.designation}`}>{seed.designation}</Link>
          <span aria-hidden="true">/</span>
          <strong>{`No. ${pad(parsed.number)}`}</strong>
        </nav>
        <div className="sd-cardhero" data-rarity={rarity} style={{ '--accent': accentFor(seed.designation), '--accent-ink': accentInkFor(seed.designation) } as CSSProperties}>
          <figure className="sd-cardhero__plate sd-figure">
            <CardPlate size="lg" hero priority designation={seed.designation} edition={parsed.number} />
          </figure>

          <div>
            <p className="sd-eyebrow">{[seed.designation, rarityInfo(rarity).label, 'Edition'].join(' · ')}</p>
            <h2 className="sd-cardhero__title">{seed.name}</h2>
            <p className="sd-cardhero__line">{number}</p>
            {view ? (
              <DataRow
                layout="stacked"
                className="sd-facts"
                items={[
                  {
                    label: 'Holder',
                    value: (
                      <Link href={`/collection?wallet=${view.ownerWallet}`} className="sd-link" title={view.ownerWallet}>
                        {short(view.ownerWallet)}
                      </Link>
                    ),
                  },
                  { label: 'Acquired', value: day(view.acquiredAt) },
                  { label: 'From', value: provenanceOf(view) },
                  { label: 'Photographed', value: view.latest ? day(view.latest.capturedAt) : 'Not yet' },
                ]}
              />
            ) : (
              <p className="sd-note">The edition’s record cannot be read at the moment.</p>
            )}
            <div className="sd-perk" data-rarity={rarity}>
              <span className="sd-perk__tier">{rarityInfo(rarity).label}</span>
              <span className="sd-perk__short">
                {perk.short}
                {perk.soon && <em>Coming soon</em>}
              </span>
              <p className="sd-perk__line">{perk.line}</p>
            </div>
            <p className="sd-note">{record.line}</p>
            <div className="sd-cardhero__obs">
              <Link href="/genesis" className="sd-btn sd-btn--primary">
                Open a capsule
              </Link>
              <Link href={`/card/${seed.designation}`} className="sd-btn">
                The card
              </Link>
            </div>
            <div className="sd-cardhero__share">
              <ShareCard title={`${seed.name} ${number} — Skychaser`} text={`${seed.name}, ${number}, held on Skychaser.`} url={url} />
            </div>
          </div>
        </div>
      </section>
    </SkychaserShell>
  );
}
