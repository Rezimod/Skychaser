import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import AlmanacDate from '@/components/skychaser/AlmanacDate';
import CapsuleCounter from '@/components/skychaser/CapsuleCounter';
import ShelfFilter from '@/components/skychaser/ShelfFilter';
import ShopCard from '@/components/skychaser/ShopCard';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { card } from '@/lib/schema';
import { SET_001, SET_001_CARDS } from '@/lib/sets/set-001';
import { cardStatus } from '@/lib/skychaser/almanac';
import { capsulesOnSale, readSetSupply } from '@/lib/skychaser/capsule';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { nightRow } from '@/lib/skychaser/night';
import { siteNightDate } from '@/lib/skychaser/target';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Genesis — capsules and cards',
  description:
    'Genesis: real objects of the cosmos, each held as a numbered edition. Opened from sealed capsules, from $5.',
};

export default async function FirstLightPage() {
  const node = getNode('tbilisi-01')!;
  const db = getDb();

  let remaining = new Map<string, number>();
  let status: string = SET_001.status;
  let tonight: string | null = null;
  let onSale: Record<string, number> | null = null;
  if (db) {
    try {
      const [supply, night, listed] = await Promise.all([
        readSetSupply(db, SET_001.code),
        nightRow(db, siteNightDate(node.timezone, new Date())),
        capsulesOnSale(db, { limit: 1000 }).catch((err) => {
          console.error('[skychaser] cannot read capsules on sale', err);
          return null;
        }),
      ]);
      if (supply) {
        status = supply.status;
        remaining = new Map(supply.cards.map((c) => [c.designation, c.remaining]));
      }
      if (listed) {
        onSale = {};
        for (const c of listed) if (c.tier) onSale[c.tier] = (onSale[c.tier] ?? 0) + 1;
      }
      if (night) {
        const [row] = await db.select({ designation: card.designation }).from(card).where(eq(card.id, night.cardId));
        tonight = row?.designation ?? null;
      }
    } catch (err) {
      console.error('[skychaser] cannot read the set', err);
    }
  }

  // Scarcest first, the way a shelf puts its best stock at eye level; the set's own order within a rarity.
  const now = new Date();
  const sorted = [...SET_001_CARDS].sort(
    (a, b) => RARITIES.indexOf(b.seed.rarity as Rarity) - RARITIES.indexOf(a.seed.rarity as Rarity),
  );

  return (
    <SkychaserShell>
      <SkychaserView step="set" />
      <div className="sd-fl">
        <CapsuleCounter onSale={onSale} />

        <section className="sd-fl__set" aria-labelledby="fl-title">
          <header className="sd-fl__head">
            <div>
              <h1 className="sd-fl__title" id="fl-title">
                In this set
              </h1>
              <p className="sd-fl__meta">
                {SET_001_CARDS.length} cards · rarest first
                {status !== 'released' && ' · Pre-release'}
              </p>
            </div>
            <ShelfFilter total={SET_001_CARDS.length} />
          </header>

          <ul className="sd-fl__grid">
            {sorted.map((c, i) => {
              const { seed, record } = c;
              const rarity = seed.rarity as Rarity;
              const sealed = cardStatus(c, now) === 'sealed';
              return (
                <li key={seed.designation} data-shelf-item data-section={record.family} data-rarity={rarity} data-name={`${seed.name} ${seed.designation}`.toLowerCase()}>
                  <ShopCard
                    designation={seed.designation}
                    name={seed.name}
                    rarity={rarity}
                    remaining={remaining.get(seed.designation) ?? seed.editionSize}
                    sub={
                      record.section === 'almanac' ? (
                        <AlmanacDate startUtc={record.eventStartUtc!} endUtc={record.eventEndUtc!} countdown short />
                      ) : (
                        `${remaining.get(seed.designation) ?? seed.editionSize} of ${seed.editionSize} left`
                      )
                    }
                    price={sealed ? 'Sealed' : `$${cardPriceUsd(seed.designation, rarity)}`}
                    tag={seed.designation === tonight ? 'Tonight' : undefined}
                    eager={i < 8}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </SkychaserShell>
  );
}
