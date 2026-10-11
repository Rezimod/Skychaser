import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { skychaserLogRateLimit } from '@/lib/rate-limit';
import type { ListedOutcome, OpenedOutcome } from '@/lib/skychaser/audit';
import { RARITIES } from '@/lib/rarity';
import { readFullLog } from '@/lib/skychaser/capsule';
import { verifyCapsule } from '@/lib/skychaser/randomness';
import { clientIp, isUuid, limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * Re-runs the check on one opened capsule from its public log entries, and
 * returns every input so the same check can be run anywhere else. The secret
 * is checked against the commitment published at listing — not the one the
 * 'opened' entry repeats — and the nonce against the one logged at purchase.
 */
export async function GET(req: NextRequest) {
  const l = await limited(skychaserLogRateLimit, clientIp(req));
  if (l) return l;
  const capsuleId = req.nextUrl.searchParams.get('capsuleId') ?? '';
  if (!isUuid(capsuleId)) return NextResponse.json({ error: 'capsuleId required' }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const entries = await readFullLog(db, { capsuleId });
  const listed = entries.find((e) => e.event === 'listed');
  const purchased = entries.find((e) => e.event === 'purchased');
  const opened = entries.find((e) => e.event === 'opened');
  if (!opened) return NextResponse.json({ capsuleId, entries, verification: null, note: 'Not opened yet' });
  if (!listed || !purchased) {
    return NextResponse.json({
      capsuleId,
      entries,
      verification: { ok: false, problems: [`the log has no '${listed ? 'purchased' : 'listed'}' entry for this capsule`] },
    });
  }

  const o = opened.outcome as OpenedOutcome;
  const inputs = {
    commitment: listed.commitment ?? '',
    secret: o.secret,
    nonce: purchased.buyerNonce ?? '',
    capsuleId,
    pulls: o.pulls,
    supply: o.supply,
    draws: o.draws,
    oddsBps: o.oddsBps,
  };
  const verification = verifyCapsule(inputs);
  // The odds that count are the ones published when the capsule was listed, not the ones the opening repeats.
  const promised = (listed.outcome as ListedOutcome | null)?.oddsBps;
  if (promised && RARITIES.some((r) => promised[r] !== o.oddsBps?.[r])) {
    verification.ok = false;
    verification.problems.push('opened under odds other than those logged when it was listed');
  }
  return NextResponse.json({ capsuleId, entries, inputs, verification });
}
