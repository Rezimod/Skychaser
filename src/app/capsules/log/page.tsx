import type { Metadata } from 'next';
import Link from 'next/link';
import SkychaserShell from '@/components/skychaser/SkychaserShell';
import DataRow from '@/components/skychaser/ui/DataRow';
import Chapter from '@/components/skychaser/ui/Chapter';
import { getDb } from '@/lib/db';
import { auditLog, type AuditFlag, type LogRow } from '@/lib/skychaser/audit';
import { readFullLog } from '@/lib/skychaser/capsule';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Public log — Skychaser',
  description: 'Every capsule listed, bought, opened, released and withdrawn, in the order it happened.',
};

const EVENT: Record<LogRow['event'], string> = {
  listed: 'Listed',
  purchased: 'Bought',
  opened: 'Opened',
  voided: 'Withdrawn',
  released: 'Released',
  refund_due: 'Refund due',
  card_sold: 'Card sold',
};

/** Each flag the audit can raise, in words. */
const FLAG: Record<AuditFlag['kind'], string> = {
  sequence_gap: 'A capsule number is missing',
  duplicate_listing: 'A capsule number is listed twice',
  unlisted_event: 'An event for a capsule never listed',
  out_of_order: 'Events out of order',
  commitment_changed: 'Commitment changed after listing',
  odds_changed: 'Opened under other odds than listed',
  nonce_changed: 'Nonce changed after purchase',
  opened_without_purchase: 'Opened without a purchase',
  purchased_not_opened: 'Bought, not yet opened',
  voided_after_purchase: 'Withdrawn after purchase',
  released_early: 'Released before its window closed',
  released_while_paid: 'Released while paid for',
  edition_duplicate: 'One edition issued twice',
  verification_failed: 'Draw does not recompute',
  awaiting_payment: 'Awaiting payment',
  simulated_payment: 'Rehearsal sale',
  released_unpaid: 'Released unpaid',
  voided_sold_out: 'Withdrawn, set sold out',
  withdrawn_unsold: 'Withdrawn unsold',
  refund_due: 'Refund due',
  edition_check_skipped: 'Edition check skipped',
  editions_outside_log: 'Editions issued outside the log',
};

function detail(row: LogRow): string {
  const o = row.outcome as Record<string, unknown> | null;
  if (row.event === 'opened' && o && Array.isArray(o.pulls)) {
    return (o.pulls as Array<{ designation: string; editionNumber: number }>)
      .map((p) => `${p.designation} ${String(p.editionNumber).padStart(3, '0')}`)
      .join(', ');
  }
  if (row.event === 'card_sold' && o) return `${o.designation} ${String(o.editionNumber).padStart(3, '0')}`;
  if (o && typeof o.reason === 'string') return o.reason;
  if (row.event === 'listed' && row.commitment) return `${row.commitment.slice(0, 16)}…`;
  if (row.event === 'purchased' && row.buyerNonce) return `nonce ${row.buyerNonce.slice(0, 16)}…`;
  return '';
}

export default async function LogPage() {
  const db = getDb();
  let entries: LogRow[] | null = null;
  if (db) {
    try {
      entries = await readFullLog(db);
    } catch (err) {
      console.error('[skychaser] cannot read the log', err);
    }
  }
  const audit = entries ? auditLog(entries) : null;
  const newestFirst = entries ? [...entries].sort((a, b) => b.seq - a.seq) : [];

  return (
    <SkychaserShell title="Public log">
      <section className="sd-container sd-top">
        {audit && (
          <DataRow
            className="sd-strip"
            items={[
              { label: 'Listed', value: audit.listed },
              { label: 'Bought', value: audit.purchased },
              { label: 'Opened', value: audit.opened },
              { label: 'Recomputed', value: `${audit.verified} / ${audit.opened}` },
              { label: 'Flags', value: audit.flags.length },
            ]}
          />
        )}
        <p className="sd-strip-note">Append-only · every event numbered in order · a removed capsule would leave a gap</p>
        {audit && audit.flags.length > 0 && (
          <ul className="sd-flags">
            {audit.flags.map((f, i) => (
              <li key={i} data-serious={f.kind !== 'purchased_not_opened'}>
                {f.capsuleSequence !== undefined &&
                  (f.capsuleId ? (
                    <Link href={`/capsule/${f.capsuleId}`}>Capsule {f.capsuleSequence}</Link>
                  ) : (
                    <span>Capsule {f.capsuleSequence}</span>
                  ))}
                <span>{FLAG[f.kind]}</span>
                {f.kind !== 'purchased_not_opened' && <span className="sd-flags__detail">{f.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sd-container sd-chapter-block">
        <Chapter n="01" title="Entries" aside={entries ? `${entries.length} logged` : undefined} />

        {entries === null && <p className="sd-note">The log cannot be read at the moment.</p>}
        {entries?.length === 0 && <p className="sd-note">Nothing has been logged yet.</p>}
        {newestFirst.length > 0 && (
          <div className="sd-scroll">
            <table className="sd-log sd-log--mid">
              <thead>
                <tr>
                  <th scope="col">Seq</th>
                  <th scope="col">Capsule</th>
                  <th scope="col">Event</th>
                  <th scope="col">Detail</th>
                  <th scope="col">UTC</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((r) => (
                  <tr key={r.seq}>
                    <td>{r.seq}</td>
                    <td>
                      {r.capsuleId ? (
                        <Link href={`/capsule/${r.capsuleId}`} className="sd-link">
                          {r.capsuleSequence ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{EVENT[r.event]}</td>
                    <td>{detail(r)}</td>
                    <td>{r.at.replace('T', ' ').slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </SkychaserShell>
  );
}
