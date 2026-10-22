import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orders } from '@/lib/schema';
import { assertOwnsWallet, verifyPrivy } from '@/lib/api-auth';
import { paused } from '@/lib/kill-switch';
import { skychaserOpenRateLimit } from '@/lib/rate-limit';
import { openCapsule, readCapsule, settleCapsulePayment } from '@/lib/skychaser/capsule';
import { findPayment, paymentLedger, paymentNetworkMisconfig, reportExtraTransfers, reportSharedTransfers, unpaidRehearsal } from '@/lib/skychaser/orders';
import { SoldOutError } from '@/lib/skychaser/randomness';
import { rewardReferrer } from '@/lib/skychaser/referral';
import { isUuid, limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * Opens a capsule: only its holder, and only once its order is paid. The
 * response reveals the secret committed to at listing, so the holder can
 * check the draws themselves. Opening twice returns the same cards.
 *
 * A capsule whose order is still pending is looked for on chain first, as the
 * confirm route would: a buyer who paid and closed the tab before it confirmed
 * opens it from the capsule's page without waiting for a sweep.
 */
export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { capsuleId?: unknown } | null;
  const capsuleId = body?.capsuleId;
  if (!isUuid(capsuleId)) {
    return NextResponse.json({ error: 'capsuleId required' }, { status: 400 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const c = await readCapsule(db, capsuleId);
  // Someone else's capsule and no capsule at all look the same from outside.
  if (!c || !c.buyer_wallet || !c.order_id) return NextResponse.json({ error: 'Capsule not found' }, { status: 404 });
  if (!(await assertOwnsWallet(privyId, c.buyer_wallet))) return NextResponse.json({ error: 'Capsule not found' }, { status: 404 });

  const l = await limited(skychaserOpenRateLimit, c.buyer_wallet);
  if (l) return l;

  const [found] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, c.order_id), eq(orders.privyId, privyId)))
    .limit(1);
  if (!found) return NextResponse.json({ error: 'Capsule not found' }, { status: 404 });
  let order = found;
  if (order.status === 'pending') {
    const guard = paymentNetworkMisconfig();
    if (guard) return guard;
    const payment = await findPayment(order, paymentLedger(db));
    if (payment.paid) {
      order = await settleCapsulePayment(db, order, payment);
      if (order.status === 'paid') {
        await reportExtraTransfers(order.id, payment.extra);
        await reportSharedTransfers(order.id, payment.shared);
      }
    }
  }
  if (order.status !== 'paid') return NextResponse.json({ error: 'The capsule’s payment is not confirmed yet' }, { status: 409 });
  if (unpaidRehearsal(order)) return NextResponse.json({ error: 'This capsule was bought in a rehearsal and was never paid' }, { status: 409 });

  try {
    const result = await openCapsule(db, c.id);
    if (!result.ok) return NextResponse.json({ error: 'This capsule cannot be opened' }, { status: 409 });
    // The first capsule an invited account opens earns its inviter a card; later ones, and a reopening, do not.
    if (!result.alreadyOpened) {
      const buyer = c.buyer_wallet;
      after(() => rewardReferrer(db, { inviteePrivyId: privyId, inviteeWallet: buyer, capsuleId: c.id }).catch((err) => console.error('[skychaser/capsules/open] referral', err)));
    }
    return NextResponse.json({
      capsuleId: c.id,
      sequence: Number(c.sequence),
      commitment: c.commitment,
      nonce: c.buyer_nonce,
      secret: result.secret,
      alreadyOpened: result.alreadyOpened,
      cards: result.pulls,
    });
  } catch (err) {
    if (err instanceof SoldOutError) {
      return NextResponse.json(
        { error: `${err.message} The capsule is withdrawn, as the public log records, and its payment will be refunded.`, refundDue: true },
        { status: 409 },
      );
    }
    console.error('[skychaser/capsules/open]', err);
    return NextResponse.json({ error: 'Could not open the capsule. Try again in a moment.' }, { status: 500 });
  }
}
