import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import CardPlate from '@/components/skychaser/CardPlate';
import SkychaserOpen from '@/components/skychaser/SkychaserOpen';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import SkychaserView from '@/components/skychaser/SkychaserView';
import SkychaserVerify from '@/components/skychaser/SkychaserVerify';
import DataRow from '@/components/skychaser/ui/DataRow';
import Chapter from '@/components/skychaser/ui/Chapter';
import { getDb } from '@/lib/db';
import type { OpenedOutcome } from '@/lib/skychaser/audit';
import { readFullLog } from '@/lib/skychaser/capsule';
import { verifyCapsule } from '@/lib/skychaser/randomness';
import { isUuid } from '@/lib/skychaser/route-guards';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Capsule',
  description: 'One capsule’s public record: what was committed to, what was drawn, and whether it checks out.',
};


export default async function CapsuleRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const db = getDb();
  if (!db) {
    return (
      <SkychaserShell title="Capsule">
        <section className="sd-container sd-top">
          <p className="sd-note">The record cannot be read at the moment.</p>
        </section>
      </SkychaserShell>
    );
  }

  const entries = await readFullLog(db, { capsuleId: id });
  if (entries.length === 0) notFound();

  const listed = entries.find((e) => e.event === 'listed');
  const purchased = entries.find((e) => e.event === 'purchased');
  const opened = entries.find((e) => e.event === 'opened');
  const closed = entries.find((e) => e.event === 'voided' || e.event === 'released');
  const sequence = entries.find((e) => e.capsuleSequence !== null)?.capsuleSequence ?? null;

  const outcome = opened ? (opened.outcome as OpenedOutcome) : null;
  const closedOutcome = closed ? (closed.outcome as { secret: string | null; reason: string }) : null;
  const verification =
    outcome && listed && purchased
      ? verifyCapsule({
          commitment: listed.commitment ?? '',
          secret: outcome.secret,
          nonce: purchased.buyerNonce ?? '',
          capsuleId: id,
          pulls: outcome.pulls,
          supply: outcome.supply,
          draws: outcome.draws,
          oddsBps: outcome.oddsBps,
        })
      : null;

  return (
    <SkychaserShell title={sequence !== null ? `Capsule ${String(sequence).padStart(3, '0')}` : 'Capsule'}>
      <SkychaserView step="capsule" />
      <section className="sd-container sd-top">
        <nav aria-label="Breadcrumb" className="sd-crumb sd-data">
          <Link href="/capsules/log">Log</Link>
          <span aria-hidden="true">/</span>
          <strong>Capsule {sequence ?? ''}</strong>
        </nav>
        <DataRow
          className="sd-strip"
          items={[
            { label: 'Capsule', value: sequence === null ? '—' : String(sequence).padStart(3, '0') },
            { label: 'Cards', value: outcome ? outcome.pulls.length : 'Sealed' },
            { label: 'Listed', value: listed ? `${listed.at.slice(0, 10)}` : '—' },
          ]}
        />
        <p className="sd-verdict" style={{ marginTop: 20 }}>
          {verification ? (verification.ok ? 'Draw recomputes' : 'Draw does not recompute') : closed ? (closed.event === 'voided' ? 'Withdrawn' : 'Released') : opened ? 'Opened' : purchased ? 'Bought, not opened' : 'On sale'}
        </p>
      </section>
      <section className="sd-container sd-chapter-block">
        <Chapter n="01" title="Commitment" />
        <DataRow
          layout="stacked"
          className="sd-ledger--hash"
          items={[
            { label: 'Commitment', value: listed?.commitment ?? '—' },
            { label: 'Listed', value: listed ? listed.at.replace('T', ' ').slice(0, 19) : '—' },
            { label: 'Buyer nonce', value: purchased?.buyerNonce ?? 'Not bought yet' },
            { label: 'Purchase hash', value: purchased?.purchaseHash ?? '—' },
            {
              label: 'Secret',
              value: outcome?.secret ?? closedOutcome?.secret ?? 'Sealed until it is opened',
            },
            { label: 'Draws', value: outcome ? outcome.draws : '—' },
          ]}
        />

        {closed && (
          <p className="sd-note">
            {closed.event === 'voided' ? 'Withdrawn' : 'Released back to the sale'} on{' '}
            {closed.at.replace('T', ' ').slice(0, 19)} — {closedOutcome?.reason ?? 'no reason logged'}. It can no longer
            be bought or opened.
          </p>
        )}

        {purchased && !opened && !closed && <SkychaserOpen capsuleId={id} />}

        {outcome && (
          <div className="sd-chapter-block">
            <Chapter n="02" title="Drawn" />
            <ul className="sd-grid">
              {outcome.pulls.map((p) => (
                <li key={p.drawIndex}>
                  <CardPlate designation={p.designation} edition={p.editionNumber} href={`/card/${p.designation}`} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {verification && !verification.ok && (
          <p className="sd-note">{verification.problems.join('; ')}</p>
        )}

        {outcome && (
          <>
            <div className="sd-chapter-block">
              <Chapter n="03" title="Recompute it" />
            </div>
            <p className="sd-note">Secret committed before the sale, nonce set by the buyer after. Together they reproduce every draw.</p>
            <SkychaserVerify capsuleId={id} />
          </>
        )}
      </section>
    </SkychaserShell>
  );
}
