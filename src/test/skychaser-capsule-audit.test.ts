// @vitest-environment node
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RARITIES } from '@/lib/rarity';
import { auditLog, type LogRow, type OpenedOutcome } from '@/lib/skychaser/audit';
import { CARDS_PER_CAPSULE, RARITY_ODDS_BPS } from '@/lib/skychaser/economics';
import { commitmentOf, planPulls, purchaseHash, type SupplyEntry } from '@/lib/skychaser/randomness';

const hex = (label: string) => createHash('sha256').update(label).digest('hex');
const idOf = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
/** A holder with the shape of a Solana address. */
const walletOf = (i: number) => bs58.encode(createHash('sha256').update(`wallet-${i}`).digest());
const SIZE = 1000;
const T0 = Date.UTC(2026, 8, 20, 0, 0);
const NOW = new Date(Date.UTC(2026, 8, 21));
const minute = (m: number) => new Date(T0 + m * 60_000).toISOString();

/**
 * A log as an honest server writes it: `n` capsules listed in order, each
 * bought and opened, every draw taking the card's next edition number from
 * the supply logged with it. Nothing here is the server's code; it is what
 * the published log would contain.
 */
function honestLog(n: number, draws = CARDS_PER_CAPSULE): LogRow[] {
  const rows: LogRow[] = [];
  let seq = 0;
  const row = (r: Omit<LogRow, 'seq' | 'at'>, at?: string) => rows.push({ ...r, seq: ++seq, at: at ?? minute(seq) });
  const remaining = new Map(RARITIES.map((r) => [r.toUpperCase(), SIZE]));
  const capsules = Array.from({ length: n }, (_, i) => ({ id: idOf(i + 1), sequence: i + 1, secret: hex(`secret-${i}`) }));
  for (const c of capsules) {
    row({ capsuleId: c.id, capsuleSequence: c.sequence, event: 'listed', commitment: commitmentOf(c.secret), buyerWallet: null, buyerNonce: null, purchaseHash: null, outcome: null });
  }
  for (const c of capsules) {
    const commitment = commitmentOf(c.secret);
    const wallet = walletOf(c.sequence);
    const nonce = hex(`nonce-${c.sequence}`);
    const hash = purchaseHash({ capsuleId: c.id, sequence: c.sequence, commitment, wallet, nonce });
    const buyer = { buyerWallet: wallet, buyerNonce: nonce, purchaseHash: hash };
    row({ capsuleId: c.id, capsuleSequence: c.sequence, event: 'purchased', commitment, ...buyer, outcome: { expiresAt: minute(seq + 15) } });
    const supply: SupplyEntry[] = RARITIES.map((rarity) => ({
      designation: rarity.toUpperCase(), rarity, remaining: remaining.get(rarity.toUpperCase())!, editionSize: SIZE,
    }));
    const pulls = planPulls({ secret: c.secret, nonce, capsuleId: c.id, supply, draws }).map((p) => {
      const left = remaining.get(p.designation)!;
      remaining.set(p.designation, left - 1);
      return { ...p, editionNumber: SIZE - left + 1 };
    });
    row({
      capsuleId: c.id,
      capsuleSequence: c.sequence,
      event: 'opened',
      commitment,
      ...buyer,
      outcome: { secret: c.secret, draws, oddsBps: RARITY_ODDS_BPS, supply, pulls },
    });
  }
  return rows;
}

const kinds = (list: Array<{ kind: string }>) => list.map((f) => f.kind);

describe('auditing the capsule log', () => {
  it('finds nothing in an honest log, and verifies every opened capsule and its edition numbers', () => {
    const audit = auditLog(honestLog(6), NOW);
    expect(audit.flags).toEqual([]);
    expect(audit.notes).toEqual([]);
    expect(audit).toMatchObject({ listed: 6, purchased: 6, opened: 6, voided: 0, released: 0, verified: 6, demoCapsules: [] });
  });

  it('shows a suppressed outcome erased from the log as a gap in the listing sequence', () => {
    // Two-card capsules, as listed before 2026-10-01: enough draws after it to show the hole.
    const rows = honestLog(6, 2).filter((r) => r.capsuleSequence !== 4);
    const audit = auditLog(rows, NOW);
    expect(audit.flags).toEqual([expect.objectContaining({ kind: 'sequence_gap', capsuleSequence: 4 })]);
    // Its editions went somewhere: the numbers it took are missing from the log.
    expect(kinds(audit.notes)).toContain('editions_outside_log');
  });

  it('flags one listing number used twice', () => {
    const rows = honestLog(3);
    const twin: LogRow = { ...rows[0], seq: 999, capsuleId: idOf(99), commitment: commitmentOf(hex('twin')) };
    expect(kinds(auditLog([...rows, twin], NOW).flags)).toContain('duplicate_listing');
  });

  it('shows an outcome withheld by never opening a sold capsule, once its window has closed', () => {
    const rows = honestLog(6).filter((r) => !(r.capsuleSequence === 3 && r.event === 'opened'));
    const audit = auditLog(rows, NOW);
    expect(audit.flags).toEqual([expect.objectContaining({ kind: 'purchased_not_opened', capsuleSequence: 3 })]);

    const early = auditLog(rows, new Date(T0 + 5 * 60_000));
    expect(early.flags).toEqual([]);
    expect(kinds(early.notes)).toContain('awaiting_payment');
  });

  it('notes a sale made on a deployment that takes no payment, without flagging it', () => {
    const rows = honestLog(2).map((r) =>
      r.capsuleSequence === 2 && r.event === 'purchased'
        ? { ...r, outcome: { ...(r.outcome as Record<string, unknown>), simulated: true } }
        : r,
    );
    const audit = auditLog(rows, NOW);
    expect(audit.flags).toEqual([]);
    expect(audit.notes).toEqual([expect.objectContaining({ kind: 'simulated_payment', capsuleSequence: 2 })]);
  });

  it('flags an opening with no purchase before it', () => {
    const rows = honestLog(3).filter((r) => !(r.capsuleSequence === 2 && r.event === 'purchased'));
    expect(kinds(auditLog(rows, NOW).flags)).toContain('opened_without_purchase');
  });

  it('shows an outcome withheld by voiding a sold capsule, and checks the secret it reveals', () => {
    const log = honestLog(6);
    const opened = log.find((r) => r.capsuleSequence === 5 && r.event === 'opened')!;
    const secret = (opened.outcome as { secret: string }).secret;
    const rows = log.map((r) =>
      r === opened ? { ...r, event: 'voided' as const, outcome: { secret, reason: 'unpaid', priorState: 'purchased' } } : r,
    );
    expect(auditLog(rows, NOW).flags).toEqual([
      expect.objectContaining({ kind: 'voided_after_purchase', capsuleSequence: 5, detail: expect.stringMatching(/unpaid/) }),
    ]);

    const lying = rows.map((r) => (r.capsuleSequence === 5 && r.event === 'voided' ? { ...r, outcome: { secret: hex('x'), reason: 'unpaid', priorState: 'purchased' } } : r));
    expect(kinds(auditLog(lying, NOW).flags)).toContain('verification_failed');
    const hidden = rows.map((r) => (r.capsuleSequence === 5 && r.event === 'voided' ? { ...r, outcome: { secret: null, reason: 'unpaid', priorState: 'purchased' } } : r));
    expect(kinds(auditLog(hidden, NOW).flags)).toContain('verification_failed');
  });

  it('accepts a void for a sold-out set only when the logged supply really cannot fill the draws', () => {
    const log = honestLog(2);
    const opened = log.find((r) => r.capsuleSequence === 2 && r.event === 'opened')!;
    const o = opened.outcome as OpenedOutcome;
    const voidWith = (supply: SupplyEntry[]) => log.map((r) => (r === opened
      ? { ...r, event: 'voided' as const, outcome: { secret: o.secret, reason: 'sold_out', priorState: 'purchased', soldOut: { draws: CARDS_PER_CAPSULE, oddsBps: RARITY_ODDS_BPS, supply } } }
      : r));

    const short = o.supply.map((s, i) => ({ ...s, remaining: i === 0 ? CARDS_PER_CAPSULE - 1 : 0 }));
    const real = auditLog(voidWith(short), NOW);
    expect(real.flags).toEqual([]);
    expect(kinds(real.notes)).toContain('voided_sold_out');

    expect(kinds(auditLog(voidWith(o.supply), NOW).flags)).toContain('voided_after_purchase');
  });

  it('notes a capsule withdrawn before anyone bought it, even without its secret', () => {
    const rows = honestLog(2).filter((r) => r.capsuleSequence !== 2 || r.event === 'listed');
    const listing = rows.find((r) => r.capsuleSequence === 2)!;
    const withdrawn: LogRow = { ...listing, seq: 999, event: 'voided', outcome: { secret: null, reason: 'seal key lost', priorState: 'listed', demo: true } };
    const audit = auditLog([...rows, withdrawn], NOW);
    expect(audit.flags).toEqual([]);
    expect(audit.notes).toEqual([expect.objectContaining({ kind: 'withdrawn_unsold', capsuleSequence: 2, demo: true })]);
    expect(audit.demoCapsules).toEqual([2]);
  });

  describe('a purchase released after its payment window', () => {
    function released(opts: { at: number; paidAt?: number }) {
      const log = honestLog(2);
      const opened = log.find((r) => r.capsuleSequence === 2 && r.event === 'opened')!;
      const purchased = log.find((r) => r.capsuleSequence === 2 && r.event === 'purchased')!;
      const expiresAt = (purchased.outcome as { expiresAt: string }).expiresAt;
      const secret = (opened.outcome as { secret: string }).secret;
      const rows = log.filter((r) => r !== opened);
      rows.push({ ...opened, event: 'released', at: new Date(Date.parse(expiresAt) + opts.at).toISOString(), outcome: { secret, reason: 'payment window closed unpaid', expiresAt } });
      if (opts.paidAt !== undefined) {
        rows.push({ ...opened, seq: opened.seq + 1, event: 'refund_due', outcome: { reason: 'paid', paidAt: new Date(Date.parse(expiresAt) + opts.paidAt).toISOString(), expiresAt } });
      }
      return rows;
    }

    it('is expected when nothing was paid in time', () => {
      const audit = auditLog(released({ at: 60_000 }), NOW);
      expect(audit.flags).toEqual([]);
      expect(kinds(audit.notes)).toEqual(['released_unpaid']);
    });

    it('is expected with a payment that landed after the window, which is owed back', () => {
      const audit = auditLog(released({ at: 60_000, paidAt: 120_000 }), NOW);
      expect(audit.flags).toEqual([]);
      expect(kinds(audit.notes).sort()).toEqual(['refund_due', 'released_unpaid']);
    });

    it('is flagged when released while paid inside the window', () => {
      expect(kinds(auditLog(released({ at: 60_000, paidAt: -60_000 }), NOW).flags)).toEqual(['released_while_paid']);
    });

    it('is flagged when released before the window closed', () => {
      expect(kinds(auditLog(released({ at: -60_000 }), NOW).flags)).toEqual(['released_early']);
    });
  });

  it('fails an opened capsule whose logged cards are not what its secret and nonce draw', () => {
    const rows = honestLog(3).map((r) => {
      if (r.capsuleSequence !== 2 || r.event !== 'opened') return r;
      const o = r.outcome as { pulls: Array<{ designation: string; rarity: string }> };
      const pulls = o.pulls.map((p, i) => (i === 0 ? { ...p, designation: 'LEGENDARY', rarity: p.rarity === 'legendary' ? 'common' : 'legendary' } : p));
      return { ...r, outcome: { ...o, pulls } };
    });
    expect(kinds(auditLog(rows, NOW).flags)).toContain('verification_failed');
  });

  it('fails a draw that did not take the edition number its logged supply implies', () => {
    const rows = honestLog(3).map((r) => {
      if (r.capsuleSequence !== 2 || r.event !== 'opened') return r;
      const o = r.outcome as OpenedOutcome;
      return { ...r, outcome: { ...o, pulls: o.pulls.map((p, i) => (i === 0 ? { ...p, editionNumber: p.editionNumber + 7 } : p)) } };
    });
    const audit = auditLog(rows, NOW);
    expect(audit.flags).toEqual([expect.objectContaining({ kind: 'verification_failed', capsuleSequence: 2, detail: expect.stringMatching(/should be edition/) })]);
  });

  it('matches direct card sales against the supply the next opening logged', () => {
    const log = honestLog(1);
    const opened = log.find((r) => r.event === 'opened')!;
    const o = opened.outcome as OpenedOutcome;
    const drawn = o.pulls[0].designation;
    const taken = Math.max(...o.pulls.filter((p) => p.designation === drawn).map((p) => p.editionNumber));
    const sale = (n: number, seq: number): LogRow => ({
      seq, capsuleId: null, capsuleSequence: null, event: 'card_sold', commitment: null, buyerWallet: null, buyerNonce: null, purchaseHash: null,
      outcome: { designation: drawn, editionNumber: n, editionSize: SIZE, orderHash: hex(`order-${n}`) }, at: minute(seq),
    });
    const audit = auditLog([...log, sale(taken + 1, 100)], NOW);
    expect(audit.flags).toEqual([]);
    expect(audit.notes).toEqual([]);
    expect(audit.cardsSold).toBe(1);

    // The same edition sold twice, or an edition sold without an entry, shows.
    expect(kinds(auditLog([...log, sale(taken, 100)], NOW).flags)).toContain('edition_duplicate');
    expect(kinds(auditLog([...log, sale(taken + 2, 100)], NOW).notes)).toContain('editions_outside_log');
  });

  it('labels capsules marked demo at listing, and holders that are not Solana addresses', () => {
    const rows = honestLog(3).map((r) => {
      if (r.capsuleSequence === 1 && r.event === 'listed') return { ...r, outcome: { demo: true } };
      return r;
    });
    expect(auditLog(rows, NOW).demoCapsules).toEqual([1]);
    const withoutHolderAddress = honestLog(2).filter((r) => r.capsuleSequence === 1 || r.event === 'listed');
    const c2 = honestLog(2).filter((r) => r.capsuleSequence === 2 && r.event !== 'listed').map((r) => {
      const wallet = 'stellar-test-holder-0002';
      const hash = purchaseHash({ capsuleId: r.capsuleId!, sequence: 2, commitment: r.commitment!, wallet, nonce: r.buyerNonce! });
      return { ...r, buyerWallet: wallet, purchaseHash: hash };
    });
    const audit = auditLog([...withoutHolderAddress, ...c2], NOW);
    expect(audit.demoCapsules).toEqual([2]);
    expect(audit.flags).toEqual([]);
  });

  it('catches a nonce changed between purchase and opening', () => {
    const rows = honestLog(2).map((r) => (r.capsuleSequence === 1 && r.event === 'opened' ? { ...r, buyerNonce: hex('swapped') } : r));
    expect(kinds(auditLog(rows, NOW).flags)).toContain('nonce_changed');
  });

  it('catches a nonce rewritten at purchase, against the purchase hash', () => {
    const rows = honestLog(2).map((r) => (r.capsuleSequence === 2 && r.event === 'purchased' ? { ...r, buyerNonce: hex('swapped') } : r));
    expect(kinds(auditLog(rows, NOW).flags)).toContain('verification_failed');
  });

  it('checks the opening against the commitment logged at listing, not the one it repeats', () => {
    const rows = honestLog(2).map((r) => (r.capsuleSequence === 1 && r.event !== 'listed' ? { ...r, commitment: hex('other') } : r));
    expect(kinds(auditLog(rows, NOW).flags)).toContain('commitment_changed');
  });

  it('flags a purchase logged before its listing', () => {
    const rows = honestLog(2);
    const listing = rows.findIndex((r) => r.capsuleSequence === 2 && r.event === 'listed');
    const purchase = rows.findIndex((r) => r.capsuleSequence === 2 && r.event === 'purchased');
    const swapped = rows.map((r, i) => (i === listing ? { ...r, seq: rows[purchase].seq } : i === purchase ? { ...r, seq: rows[listing].seq } : r));
    expect(kinds(auditLog(swapped, NOW).flags)).toContain('out_of_order');
  });
});

describe('capsule_log is append-only', () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sources(full);
      return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
    });
  }

  it('is never updated, deleted or truncated anywhere in src', () => {
    const offenders = sources(path.resolve(__dirname, '..')).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return (
        /\bUPDATE\s+capsule_log\b/i.test(text) ||
        /\bDELETE\s+FROM\s+capsule_log\b/i.test(text) ||
        /\bTRUNCATE\b[^;]*\bcapsule_log\b/i.test(text) ||
        /\.(update|delete)\(\s*capsuleLog\b/.test(text)
      );
    });
    // The schema's own comment block creates the trigger that refuses them.
    expect(offenders.map((f) => path.relative(process.cwd(), f)).filter((f) => f !== 'src/lib/schema.ts')).toEqual([]);
    expect(readFileSync(path.resolve(__dirname, '../lib/schema.ts'), 'utf8')).toMatch(
      /BEFORE UPDATE OR DELETE ON capsule_log[\s\S]*BEFORE TRUNCATE ON capsule_log/,
    );
  });
});

describe('the paying block in the log', () => {
  it('flags a capsule paid on chain that was opened without it, but not a rehearsal or an older capsule', () => {
    const rows = honestLog(3);
    const purchase = (i: number) => rows.filter((r) => r.event === 'purchased')[i];
    // Capsule 1 logged its payment reference (paid on chain) and opened without a beacon.
    purchase(0).outcome = { ...(purchase(0).outcome as object), reference: 'ref-1' };
    // Capsule 2 was a rehearsal: it logged a reference too, but nothing was paid.
    purchase(1).outcome = { ...(purchase(1).outcome as object), reference: 'ref-2', simulated: true };
    // Capsule 3 predates references in the log.
    const a = auditLog(rows, NOW);
    expect(a.flags.filter((f) => f.kind === 'beacon_missing').map((f) => f.capsuleSequence)).toEqual([1]);
  });

  it('treats a purchase logged as on chain the way it treated a logged reference', () => {
    const rows = honestLog(2);
    const purchase = (i: number) => rows.filter((r) => r.event === 'purchased')[i];
    purchase(1).outcome = { ...(purchase(1).outcome as object), onChain: true };
    const a = auditLog(rows, NOW);
    expect(a.flags.filter((f) => f.kind === 'beacon_missing').map((f) => f.capsuleSequence)).toEqual([2]);
  });
});
