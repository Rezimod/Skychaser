import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { accentFor, accentInkFor } from '@/components/skychaser/card/CardFront';
import { notFound } from 'next/navigation';
import AlmanacDate from '@/components/skychaser/AlmanacDate';
import CardPlate from '@/components/skychaser/CardPlate';
import SkychaserBuyCard from '@/components/skychaser/SkychaserBuyCard';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import DataRow, { type Datum } from '@/components/skychaser/ui/DataRow';
import ObservationStatusMark from '@/components/skychaser/ui/ObservationStatusMark';
import Chapter from '@/components/skychaser/ui/Chapter';
import { getDb } from '@/lib/db';
import { formatDec, formatRa } from '@/lib/observatory/telescope-targets';
import { rarityInfo, type Rarity } from '@/lib/rarity';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { cardStatus } from '@/lib/skychaser/almanac';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { perkFor } from '@/lib/skychaser/perks';
import type { ObservationStatus } from '@/lib/skychaser/observability';
import { cardAvailability } from '@/lib/skychaser/orders';
import { photoFor } from '@/lib/skychaser/photos';
import { posterFor } from '@/lib/skychaser/poster';
import CardBuyBar from '@/components/skychaser/CardBuyBar';
import ShareCard from '@/components/skychaser/ShareCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ designation: string }>;
}): Promise<Metadata> {
  const { designation } = await params;
  const card = SET_001_CARD_BY_DESIGNATION.get(designation.toUpperCase());
  if (!card) return { title: 'Card not found — Skychaser' };
  return { title: `${card.seed.name} — Genesis · Skychaser`, description: card.seed.blurb };
}

/** A selenographic degree, with a real minus sign rather than a hyphen. */
const degrees = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}°`;

export default async function CardPage({ params }: { params: Promise<{ designation: string }> }) {
  const { designation } = await params;
  const card = SET_001_CARD_BY_DESIGNATION.get(designation.toUpperCase());
  if (!card) notFound();

  const { seed, record } = card;
  const rarity = seed.rarity as Rarity;
  const priceUsd = cardPriceUsd(seed.designation, rarity);
  const perk = perkFor(seed.designation, rarity);
  const almanac = record.section === 'almanac';
  const sealed = cardStatus(card) === 'sealed';
  const pair = record.pairsWith ? SET_001_CARD_BY_DESIGNATION.get(record.pairsWith) : null;
  const poster = posterFor(seed.designation, seed.name, record.line);
  const photo = photoFor(seed.designation);

  const db = getDb();
  let allocated: number | null = null;
  let available = false;
  let released = false;
  if (db) {
    try {
      const a = await cardAvailability(db, seed.designation);
      if (a) {
        allocated = a.allocated;
        available = a.available;
        released = a.released;
      }
    } catch (err) {
      console.error('[skychaser] cannot read card availability', err);
    }
  }

  const position: Datum[] = almanac
    ? []
    : seed.raHours !== null && seed.raHours !== undefined && seed.decDeg !== null && seed.decDeg !== undefined
      ? [
          { label: 'RA', value: formatRa(seed.raHours) },
          { label: 'Dec', value: formatDec(seed.decDeg) },
        ]
      : seed.surfaceLat !== null && seed.surfaceLat !== undefined && seed.surfaceLon !== null && seed.surfaceLon !== undefined
        ? [
            { label: 'Lat', value: degrees(seed.surfaceLat) },
            { label: 'Lon', value: degrees(seed.surfaceLon) },
          ]
        : seed.targetId === 'kept'
          ? [{ label: 'Position', value: 'Held, not observed' }]
          : [{ label: 'Position', value: 'Moves — computed for the night' }];

  return (
    <SkychaserShell title={seed.name}>
      <SkychaserView step="card" />
      <section className="sd-container sd-top">
        <nav aria-label="Breadcrumb" className="sd-crumb sd-data">
          <Link href="/genesis">Genesis</Link>
          <span aria-hidden="true">/</span>
          <strong>{seed.designation}</strong>
        </nav>
        <div className="sd-cardhero" data-rarity={rarity} style={{ '--accent': accentFor(seed.designation), '--accent-ink': accentInkFor(seed.designation) } as CSSProperties}>
          <figure className="sd-cardhero__plate sd-figure">
            <CardPlate size="lg" hero priority designation={seed.designation} />
          </figure>

          <div>
            <p className="sd-eyebrow">
              {[seed.designation, ...seed.objectType.split(' · ').filter((t) => t.toUpperCase() !== seed.designation), rarityInfo(rarity).label].join(' · ')}
            </p>
            <h2 className="sd-cardhero__title">{seed.name}</h2>
            {/* The card beside it carries the epithet, quote and headline; the page adds what the card does not say. */}
            <p className="sd-cardhero__line">{record.line}</p>
            <div className="sd-perk" data-rarity={rarity}>
              <span className="sd-perk__tier">{rarityInfo(rarity).label}</span>
              <span className="sd-perk__short">
                {perk.short}
                {perk.soon && <em>Coming soon</em>}
              </span>
              <p className="sd-perk__line">{perk.line}</p>
            </div>
            <DataRow
              className="sd-facts"
              items={[
                ...(almanac ? [{ label: 'Date', value: <AlmanacDate startUtc={record.eventStartUtc!} endUtc={record.eventEndUtc!} countdown /> }] : []),
                sealed
                  ? { label: 'Supply', value: 'Sealed' }
                  : { label: 'Supply', value: `${seed.editionSize - (allocated ?? 0)} of ${seed.editionSize} left` },
                { label: 'Price', value: sealed ? 'Sealed' : `$${priceUsd}` },
              ]}
            />
            {sealed ? (
              <p className="sd-note">Sealed. The event has passed; the editions that were held are the editions there are.</p>
            ) : (
              <div className="sd-buy" id="buy">
                <SkychaserBuyCard
                  designation={seed.designation}
                  name={seed.name}
                  rarity={rarity}
                  priceUsd={priceUsd}
                  available={available}
                  released={released}
                />
              </div>
            )}
            {almanac && !sealed && <p className="sd-note">If clouds cover the night, there is no capture; the card still seals when the event ends.</p>}
            {record.physical && <p className="sd-note">How to receive the specimen will be published before the first one ships.</p>}
            {pair && (
              <div className="sd-cardhero__pair">
                <span className="sd-label">Pairs with</span>
                <CardPlate size="sm" designation={pair.seed.designation} href={`/card/${pair.seed.designation}`} />
                <span className="sd-data">{pair.seed.name}</span>
              </div>
            )}
            <div className="sd-cardhero__obs">
              <ObservationStatusMark status={seed.observationStatus as ObservationStatus} />
              <span className="sd-data">{card.observability.reason}</span>
              <Link href="/vote" className="sd-link sd-data">
                See this week’s vote
              </Link>
            </div>
            <div className="sd-cardhero__share">
              <ShareCard title={`${seed.name} — Skychaser`} text={`${seed.name} — a Genesis card on Skychaser. ${record.line}`} url={`https://skychaser.io/card/${seed.designation}`} />
            </div>
          </div>
        </div>
      </section>

      {photo && (
        <section className="sd-container sd-chapter-block">
          <Chapter n="01" title="The real thing" aside={photo.kind === 'impression' ? 'Artist’s impression' : 'Photograph'} />
          <figure className="sd-realphoto">
            <img src={photo.file} alt={photo.kind === 'impression' ? `An artist’s impression of ${seed.name}` : `${seed.name}, photographed by ${photo.source}`} loading="lazy" decoding="async" />
            <figcaption className="sd-caption">
              {photo.credit} · <a href={photo.url} target="_blank" rel="noopener noreferrer" className="sd-link">{photo.license}</a>
            </figcaption>
          </figure>
        </section>
      )}

      <section className="sd-container sd-chapter-block">
        <Chapter n={photo ? '02' : '01'} title="Record" aside={seed.catalogRef} />
        <DataRow
          layout="stacked"
          items={[
            { label: 'Object', value: seed.objectType },
            { label: 'Rarity', value: rarityInfo(rarity).label },
            ...position,
            ...record.stats.map(([label, value]) => ({ label, value })),
            { label: 'Editions issued', value: allocated === null ? `0 / ${seed.editionSize}` : `${allocated} / ${seed.editionSize}` },
            { label: 'Direct price', value: sealed ? 'Sealed' : `$${priceUsd}` },
          ]}
        />
      </section>
      {!sealed && available && (
        <CardBuyBar name={seed.name} priceUsd={priceUsd} left={`${seed.editionSize - (allocated ?? 0)} of ${seed.editionSize} left`} target="buy" />
      )}
    </SkychaserShell>
  );
}
