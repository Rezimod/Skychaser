/**
 * Reading the capsule log for what it should not contain.
 *
 * Pure: it takes the published rows and nothing else, so anyone holding a copy
 * of the log can run it. What it looks for is the evidence a selective abort
 * leaves behind. A capsule is listed, with a sequence number and a
 * commitment, before it can be sold; so a server that throws away an outcome
 * it does not like has these options, and each is visible here:
 *
 *   - erase the capsule from the log      → a gap in the listing sequence
 *   - sell it and never open it            → purchased, not opened
 *   - sell it and void it                  → voided after purchase
 *   - sell it and release it while paid    → released with an on-time payment
 *
 * None of these is proof of bad faith on its own — an unpaid order is voided
 * after purchase too — which is why a void or release reveals the secret and
 * a reason. What the log shows and is expected (a purchase released after its
 * payment window closed unpaid, a capsule withdrawn unsold) is reported as a
 * note, not a flag.
 *
 * Direct card sales are logged too ('card_sold'), so every edition a capsule's
 * logged supply says was gone can be matched against an entry that took it.
 */

import bs58 from 'bs58';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { SoldOutError, commitmentOf, planPulls, purchaseHash, verifyCapsule, type SupplyEntry } from './randomness';

export type CapsuleEvent = 'listed' | 'purchased' | 'opened' | 'voided' | 'released' | 'refund_due' | 'card_sold';

export type LogRow = {
  seq: number;
  /** Null only for 'card_sold', which belongs to no capsule. */
  capsuleId: string | null;
  capsuleSequence: number | null;
  event: CapsuleEvent;
  commitment: string | null;
  buyerWallet: string | null;
  buyerNonce: string | null;
  purchaseHash: string | null;
  outcome: unknown;
  at: string;
};

/**
 * What a 'listed' row's outcome carries: null, or the demo mark, and — for a
 * capsule listed as a tier — the tier and the odds it must open under.
 */
export type ListedOutcome = { demo?: boolean; tier?: string; oddsBps?: Record<Rarity, number> } | null;

/**
 * What a 'purchased' row's outcome carries: when the payment window closes,
 * and whether the sale was a rehearsal — bought on a deployment that takes no
 * payment. A rehearsal is a note, not a flag: it is in the log, and the log
 * explains it.
 */
export type PurchasedOutcome = { expiresAt?: string; simulated?: boolean } | null;

/** What an 'opened' row's outcome carries. */
export type OpenedOutcome = {
  secret: string;
  draws: number;
  oddsBps: Record<Rarity, number>;
  supply: SupplyEntry[];
  pulls: Array<{ drawIndex: number; designation: string; rarity: string; editionNumber: number }>;
};

/**
 * What a 'voided' row's outcome carries. The secret is null only for a
 * capsule withdrawn before anyone bought it whose sealed secret could not be
 * read. A capsule voided because the set ran out also logs the supply and the
 * draws, so anyone can see the draws could not be made.
 */
export type VoidedOutcome = {
  secret: string | null;
  reason: string;
  priorState: 'listed' | 'purchased';
  demo?: boolean;
  soldOut?: { draws: number; oddsBps: Record<Rarity, number>; supply: SupplyEntry[] };
};

/** What a 'released' row's outcome carries. */
export type ReleasedOutcome = { secret: string; reason: string; expiresAt: string };

/** What a 'refund_due' row's outcome carries: a payment the capsule could not take. */
export type RefundOutcome = { reason: string; paidAt: string | null; expiresAt: string | null };

/** What a 'card_sold' row's outcome carries. No wallet: the order's SHA-256 lets its buyer find it. */
export type CardSoldOutcome = { designation: string; editionNumber: number; editionSize: number; orderHash: string };

export type AuditFlag = {
  kind:
    | 'sequence_gap'
    | 'duplicate_listing'
    | 'unlisted_event'
    | 'out_of_order'
    | 'commitment_changed'
    | 'odds_changed'
    | 'nonce_changed'
    | 'opened_without_purchase'
    | 'purchased_not_opened'
    | 'voided_after_purchase'
    | 'released_early'
    | 'released_while_paid'
    | 'edition_duplicate'
    | 'verification_failed'
    // Notes: in the log, explained by it.
    | 'awaiting_payment'
    | 'simulated_payment'
    | 'released_unpaid'
    | 'voided_sold_out'
    | 'withdrawn_unsold'
    | 'refund_due'
    | 'edition_check_skipped'
    | 'editions_outside_log';
  capsuleSequence?: number;
  capsuleId?: string;
  demo?: boolean;
  detail: string;
};

export type Audit = {
  listed: number;
  purchased: number;
  opened: number;
  voided: number;
  released: number;
  refundsDue: number;
  cardsSold: number;
  verified: number;
  /** Listing numbers of capsules marked demo at listing, or bought by a holder that is not a Solana address. */
  demoCapsules: number[];
  /** What should not be there. */
  flags: AuditFlag[];
  /** What is there and is explained by the log itself. */
  notes: AuditFlag[];
};

const ORDER: Record<Exclude<CapsuleEvent, 'card_sold'>, number> = {
  listed: 0, purchased: 1, opened: 2, voided: 2, released: 2, refund_due: 3,
};

/** Real purchases require a Solana address; the demo script's test holders are not one. */
function isSolanaAddress(wallet: string | null): boolean {
  if (!wallet) return false;
  try {
    return bs58.decode(wallet).length === 32;
  } catch {
    return false;
  }
}

function time(value: string | null | undefined): number {
  const t = value ? Date.parse(value) : NaN;
  return Number.isFinite(t) ? t : NaN;
}

export function auditLog(rows: LogRow[], now: Date = new Date()): Audit {
  const flags: AuditFlag[] = [];
  const notes: AuditFlag[] = [];
  const sorted = [...rows].sort((a, b) => a.seq - b.seq);
  const byCapsule = new Map<string, LogRow[]>();
  for (const r of sorted) {
    if (r.event === 'card_sold' || !r.capsuleId) continue;
    const list = byCapsule.get(r.capsuleId) ?? [];
    list.push(r);
    byCapsule.set(r.capsuleId, list);
  }

  // Every listing number from 1 to the highest must be present, once. A
  // capsule that vanished from the log leaves its number behind.
  const listings = new Map<number, string[]>();
  for (const r of sorted) {
    if (r.event !== 'listed' || r.capsuleSequence === null || !r.capsuleId) continue;
    listings.set(r.capsuleSequence, [...(listings.get(r.capsuleSequence) ?? []), r.capsuleId]);
  }
  const highest = Math.max(0, ...sorted.map((r) => r.capsuleSequence ?? 0));
  for (let n = 1; n <= highest; n++) {
    const ids = listings.get(n);
    if (!ids) flags.push({ kind: 'sequence_gap', capsuleSequence: n, detail: `no 'listed' entry for capsule ${n}` });
    else if (ids.length > 1) flags.push({ kind: 'duplicate_listing', capsuleSequence: n, detail: `capsule number ${n} is listed ${ids.length} times: ${ids.join(', ')}` });
  }

  // Every edition the log hands out, by card: capsule pulls and direct sales.
  const editions = new Map<string, Array<{ n: number; by: string }>>();
  const took = (designation: string, n: number, by: string) =>
    editions.set(designation, [...(editions.get(designation) ?? []), { n, by }]);
  const sizes = new Map<string, number>();

  let verified = 0;
  const demoCapsules: number[] = [];
  const counts = { listed: 0, purchased: 0, opened: 0, voided: 0, released: 0, refundsDue: 0, cardsSold: 0 };

  for (const r of sorted) {
    if (r.event !== 'card_sold') continue;
    counts.cardsSold++;
    const s = r.outcome as CardSoldOutcome | null;
    if (!s) continue;
    took(s.designation, s.editionNumber, `sale ${s.orderHash.slice(0, 12)}`);
    sizes.set(s.designation, s.editionSize);
  }

  for (const [capsuleId, events] of byCapsule) {
    const at = (e: CapsuleEvent) => events.find((x) => x.event === e);
    const listed = at('listed');
    const purchased = at('purchased');
    const opened = at('opened');
    const voided = at('voided');
    const released = at('released');
    const refund = at('refund_due');
    const capsuleSequence = events[0].capsuleSequence ?? undefined;
    const voidedOutcome = voided?.outcome as VoidedOutcome | null | undefined;
    const demo = Boolean(
      (listed?.outcome as ListedOutcome)?.demo ||
      voidedOutcome?.demo ||
      (purchased && !isSolanaAddress(purchased.buyerWallet)),
    );
    if (demo && capsuleSequence !== undefined) demoCapsules.push(capsuleSequence);
    const mark = (list: AuditFlag[]) => (kind: AuditFlag['kind'], detail: string) =>
      list.push({ kind, capsuleId, capsuleSequence, ...(demo ? { demo } : {}), detail });
    const flag = mark(flags);
    const note = mark(notes);

    counts.listed += listed ? 1 : 0;
    counts.purchased += purchased ? 1 : 0;
    counts.opened += opened ? 1 : 0;
    counts.voided += voided ? 1 : 0;
    counts.released += released ? 1 : 0;
    counts.refundsDue += refund ? 1 : 0;

    if (!listed) flag('unlisted_event', `'${events[0].event}' with no 'listed' entry before it`);
    for (let i = 1; i < events.length; i++) {
      const a = events[i - 1].event as keyof typeof ORDER;
      const b = events[i].event as keyof typeof ORDER;
      if (ORDER[b] <= ORDER[a]) flag('out_of_order', `'${b}' after '${a}'`);
    }
    const committed = listed?.commitment ?? events[0].commitment;
    if (events.some((e) => e.commitment !== committed)) {
      flag('commitment_changed', 'the commitment differs from the one logged at listing');
    }
    // The purchase hash binds the nonce to this capsule, its commitment and
    // its holder; recomputing it from the logged fields must give the logged hash.
    if (purchased && purchased.purchaseHash !== purchaseHash({
      capsuleId,
      sequence: purchased.capsuleSequence ?? 0,
      commitment: committed ?? '',
      wallet: purchased.buyerWallet ?? '',
      nonce: purchased.buyerNonce ?? '',
    })) {
      flag('verification_failed', 'the purchase hash does not match the logged capsule, holder and nonce');
    }
    for (const later of [opened, voided, released]) {
      if (purchased && later && later.buyerNonce !== purchased.buyerNonce) {
        flag('nonce_changed', `the nonce at '${later.event}' is not the nonce recorded at purchase`);
      }
    }
    const revealed = (secret: string | null | undefined) => Boolean(secret) && commitmentOf(secret as string) === committed;

    const expiresAt = time((purchased?.outcome as PurchasedOutcome)?.expiresAt);
    if ((purchased?.outcome as PurchasedOutcome)?.simulated) {
      note('simulated_payment', `bought on a deployment that takes no payment: nothing was paid for this capsule`);
    }
    if (purchased && !opened && !voided && !released) {
      if (expiresAt >= now.getTime()) note('awaiting_payment', `purchased at ${purchased.at}; its payment window closes ${new Date(expiresAt).toISOString()}`);
      else flag('purchased_not_opened', `purchased at ${purchased.at}, not opened`);
    }
    if (opened && !purchased) flag('opened_without_purchase', `'opened' with no 'purchased' entry`);

    if (voided) {
      const v = voidedOutcome;
      if (v?.secret == null && !purchased) {
        note('withdrawn_unsold', `withdrawn before any purchase, secret not revealed: ${v?.reason ?? 'no reason given'}`);
      } else if (!revealed(v?.secret)) {
        flag('verification_failed', 'the secret revealed at void does not match the commitment');
      } else if (purchased) {
        // A capsule the set could not fill: the logged supply must really be
        // too short for its draws, from its own secret and nonce.
        let soldOut = false;
        if (v?.soldOut) {
          try {
            planPulls({ secret: v.secret as string, nonce: purchased.buyerNonce ?? '', capsuleId, ...v.soldOut });
          } catch (err) {
            soldOut = err instanceof SoldOutError;
          }
        }
        if (soldOut) note('voided_sold_out', 'voided after purchase: its draws could not be made from the logged supply; the payment is owed back');
        else flag('voided_after_purchase', `voided after purchase: ${v?.reason ?? 'no reason given'}`);
      }
    }

    if (released) {
      const r = released.outcome as ReleasedOutcome | null;
      const paidAt = time((refund?.outcome as RefundOutcome | null)?.paidAt);
      if (!purchased) flag('unlisted_event', `'released' with no 'purchased' entry`);
      else if (!revealed(r?.secret)) flag('verification_failed', 'the secret revealed at release does not match the commitment');
      else if (!(time(released.at) > expiresAt)) flag('released_early', `released at ${released.at}, before its payment window closed`);
      else if (paidAt <= expiresAt) flag('released_while_paid', `released although paid at ${new Date(paidAt).toISOString()}, inside its window`);
      else note('released_unpaid', `released at ${released.at}: its payment window closed ${new Date(expiresAt).toISOString()} unpaid`);
    }
    if (refund) {
      const o = refund.outcome as RefundOutcome | null;
      note('refund_due', `a payment is owed back: ${o?.reason ?? 'no reason given'}${o?.paidAt ? ` (paid ${o.paidAt})` : ''}`);
    }

    if (opened) {
      const o = opened.outcome as OpenedOutcome | null;
      const result = o
        ? verifyCapsule({
            commitment: committed ?? '',
            secret: o.secret,
            nonce: purchased?.buyerNonce ?? opened.buyerNonce ?? '',
            capsuleId,
            pulls: o.pulls ?? [],
            supply: o.supply ?? [],
            draws: o.draws,
            oddsBps: o.oddsBps,
          })
        : { ok: false, problems: ['no outcome recorded'] };
      if (result.ok) verified++;
      else flag('verification_failed', result.problems.join('; '));
      const promised = (listed?.outcome as ListedOutcome)?.oddsBps;
      if (promised && o && JSON.stringify(RARITIES.map((r) => promised[r])) !== JSON.stringify(RARITIES.map((r) => o.oddsBps?.[r]))) {
        flag('odds_changed', 'opened under odds other than those logged when it was listed');
      }
      if (o?.supply?.some((s) => s.editionSize === undefined)) {
        note('edition_check_skipped', 'logged before supply carried edition sizes: edition numbers not checked against it');
      }
      for (const s of o?.supply ?? []) if (s.editionSize !== undefined) sizes.set(s.designation, s.editionSize);
      for (const p of o?.pulls ?? []) took(p.designation, p.editionNumber, `capsule ${capsuleSequence}`);
    }
  }

  // No edition is handed out twice. Numbers below a card's highest logged one
  // that no entry took were allocated outside the log.
  for (const [designation, taken] of editions) {
    const seen = new Map<number, string>();
    for (const t of taken) {
      const first = seen.get(t.n);
      if (first) flags.push({ kind: 'edition_duplicate', detail: `${designation} #${t.n} is taken by both ${first} and ${t.by}` });
      else seen.set(t.n, t.by);
    }
    const top = Math.max(...seen.keys());
    const missing = Array.from({ length: top }, (_, i) => i + 1).filter((n) => !seen.has(n));
    if (missing.length) {
      notes.push({ kind: 'editions_outside_log', detail: `${designation}: edition${missing.length > 1 ? 's' : ''} ${missing.join(', ')} of ${sizes.get(designation) ?? '?'} allocated without a log entry` });
    }
  }

  return { ...counts, verified, demoCapsules: demoCapsules.sort((a, b) => a - b), flags, notes };
}
