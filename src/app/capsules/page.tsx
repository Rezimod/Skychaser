import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserBuyCapsule from '@/components/skychaser/SkychaserBuyCapsule';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import Chapter from '@/components/skychaser/ui/Chapter';
import DataRow from '@/components/skychaser/ui/DataRow';
import RarityMark from '@/components/skychaser/ui/RarityMark';
import { getDb } from '@/lib/db';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { CARDS_PER_CAPSULE, ORDER_WINDOW_MINUTES } from '@/lib/skychaser/economics';
import { TIERS, formatOdds, tierByKey } from '@/lib/skychaser/tiers';
import { capsulesOnSale, goneRarities, heldDraws, readSupply, type SupplyRow } from '@/lib/skychaser/capsule';
import { simulatedPayments } from '@/lib/skychaser/rehearsal';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Capsules — one card, sealed before the sale',
  description:
    'A capsule holds one card from Genesis. The outcome is sealed before it goes on sale and can be checked by anyone after it opens.',
};

export default async function CapsulesPage() {
  const db = getDb();
  let onSale: Awaited<ReturnType<typeof capsulesOnSale>> | null = null;
  let supply: SupplyRow[] | null = null;
  let held: Partial<Record<Rarity, number>> = {};
  if (db) {
    try {
      onSale = await capsulesOnSale(db, { limit: 1000 });
      if (onSale[0]) [supply, held] = await Promise.all([readSupply(db, onSale[0].setId), heldDraws(db, onSale[0].setId)]);
    } catch (err) {
      console.error('[skychaser] cannot read capsules on sale', err);
    }
  }

  const sealed = onSale?.[0];
  // The odds each capsule on the shelf was listed under — what it opens under — one row per distinct set.
  const oddsRows = new Map<string, { key: string; label: string; odds: Record<Rarity, number> }>();
  for (const c of onSale ?? []) {
    const tier = tierByKey(c.tier);
    const key = `${c.tier ?? 'standard'}:${RARITIES.map((r) => c.oddsBps[r]).join('/')}`;
    if (!oddsRows.has(key)) oddsRows.set(key, { key, label: tier ? `${tier.name} · $${c.priceUsd}` : `Capsule · $${c.priceUsd}`, odds: c.oddsBps });
  }
  const odds = oddsRows.size
    ? [...oddsRows.values()]
    : TIERS.map((t) => ({ key: t.key, label: `${t.name} · $${t.priceUsd}`, odds: t.oddsBps }));
  const left = supply
    ? RARITIES.map((r) => ({ r, n: supply!.filter((s) => s.rarity === r).reduce((n, s) => n + Math.max(0, s.remaining), 0) }))
    : null;

  return (
    <SkychaserShell title="Capsules">
      <SkychaserView step="capsules" />
      <section className="sd-container sd-top">
        <div className="sd-capsule-top">
          <div className="sd-sealed" aria-hidden="true">
            <span className="sd-sealed__card" />
            <span className="sd-sealed__card" />
            <span className="sd-sealed__card sd-sealed__card--front">
              <span className="sd-sealed__mark">Skychaser</span>
              <span className="sd-sealed__label">Sealed · {CARDS_PER_CAPSULE === 1 ? 'one card' : `${CARDS_PER_CAPSULE} cards`}</span>
              {sealed && <span className="sd-sealed__hash">{sealed.commitment.slice(0, 16)}…</span>}
            </span>
          </div>
          <div>
            <DataRow
              className="sd-strip"
              items={[
                { label: 'Price', value: `$${TIERS[0].priceUsd}–${TIERS[TIERS.length - 1].priceUsd}` },
                { label: 'Cards', value: CARDS_PER_CAPSULE },
                { label: 'On sale', value: onSale?.length ?? '—' },
                { label: 'Quote holds', value: `${ORDER_WINDOW_MINUTES} min` },
              ]}
            />
            <p className="sd-capsule-top__line">
              One card, committed by hash before the sale. Your nonce seals the draw; anyone can recompute it after
              the card is out.
            </p>
            {simulatedPayments() ? (
              <p className="sd-strip-note">Rehearsal · no payment is taken · every sale is marked in the log</p>
            ) : (
              process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' && <p className="sd-strip-note">Solana devnet · paid in test SOL</p>
            )}
          </div>
        </div>
      </section>

      <section className="sd-container sd-chapter-block">
        <Chapter n="01" title="Odds per card" />
        {odds.map((row) => (
          <div key={row.key} className="sd-section">
            <p className="sd-label">{row.label}</p>
            <ul className="sd-oddsboard">
              {RARITIES.map((r) => (
                <li key={r} data-rarity={r}>
                  <RarityMark rarity={r} />
                  <span className="sd-oddsboard__n">{formatOdds(row.odds[r])}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="sd-strip-note">Fixed when a capsule is listed, and logged with it</p>
        {left && (
          <p className="sd-strip-note">
            Editions left to draw: {left.map(({ r, n }) => `${r} ${n.toLocaleString('en-US')}`).join(' · ')}. A capsule goes
            off sale once a rarity its odds promise has none left.
          </p>
        )}
      </section>

      <section className="sd-container sd-chapter-block">
        <Chapter n="02" title="On sale" aside={onSale ? `${onSale.length} listed` : undefined} />
        {onSale === null && <p className="sd-note">The sale cannot be read at the moment.</p>}
        {onSale?.length === 0 && <p className="sd-note">Nothing is listed right now.</p>}
        <div className="sd-capsules">
          {onSale?.map((c) => {
            const gone = supply ? goneRarities(c.oddsBps, supply, held) : [];
            return (
            <article key={c.id} className="sd-capsule">
              <div className="sd-capsule__head">
                <span className="sd-capsule__n">
                  <span className="sd-label">{tierByKey(c.tier)?.name ?? 'Capsule'}</span> {String(c.sequence).padStart(3, '0')}
                </span>
                <span className="sd-capsule__price">${c.priceUsd}</span>
              </div>
              <DataRow
                layout="stacked"
                items={[
                  { label: 'Cards', value: c.cardsPerCapsule },
                  { label: 'Commitment', value: `${c.commitment.slice(0, 18)}…` },
                ]}
              />
              {gone.length ? (
                <p className="sd-note">Off sale: every {gone.join(' and ')} edition its odds promise has gone.</p>
              ) : (
                <SkychaserBuyCapsule
                  capsuleId={c.id}
                  sequence={c.sequence}
                  commitment={c.commitment}
                  priceUsd={c.priceUsd}
                  cardsPerCapsule={c.cardsPerCapsule}
                />
              )}
            </article>
            );
          })}
        </div>
      </section>

      <section className="sd-container">
        <div className="sd-links">
          <Link href="/capsules/log" className="sd-btn">
            Public log
          </Link>
          <Link href="/genesis" className="sd-btn">
            Every card you can pull
          </Link>
        </div>
      </section>
    </SkychaserShell>
  );
}
