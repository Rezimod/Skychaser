import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { capsule, orders } from '@/lib/schema';
import { verifyPrivy } from '@/lib/api-auth';
import { paused } from '@/lib/kill-switch';
import { skychaserConfirmRateLimit } from '@/lib/rate-limit';
import { settleCapsulePayment } from '@/lib/skychaser/capsule';
import {
  CAPSULE_PRODUCT_ID,
  CARD_PRODUCT_PREFIX,
  findPayment,
  fulfilCardOrder,
  markPaid,
  markRefundDue,
  reportExtraTransfers,
  reportSharedTransfers,
  paymentLedger,
  unpaidRehearsal,
  type OrderRow,
  paymentNetworkMisconfig,
} from '@/lib/skychaser/orders';
import { isUuid, limited, rehearsalOnLiveDatabase } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * Confirms a Skychaser order's Solana Pay transfer. A paid capsule is then ready
 * to open; a paid card is allocated its edition here. Safe to call again.
 *
 * A transfer is never dropped: one that landed after the order's window
 * closed, or for an order already cancelled (its capsule voided or released
 * while the payment was on its way), is recorded as refund_due — and, for a
 * capsule, logged publicly against it.
 */
export async function POST(req: NextRequest) {
  const p = paused();
  if (p) return p;
  const n = paymentNetworkMisconfig();
  if (n) return n;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ confirmed: false, error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { orderId?: unknown } | null;
  const orderId = body?.orderId;
  if (!isUuid(orderId)) return NextResponse.json({ confirmed: false, error: 'orderId required' }, { status: 400 });
  const l = await limited(skychaserConfirmRateLimit, privyId);
  if (l) return l;

  const db = getDb();
  if (!db) return NextResponse.json({ confirmed: false, error: 'Database not configured' }, { status: 503 });
  const r = await rehearsalOnLiveDatabase(db);
  if (r) return r;

  const [found] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.privyId, privyId))).limit(1);
  const isSkychaser = found && (found.productId === CAPSULE_PRODUCT_ID || found.productId.startsWith(CARD_PRODUCT_PREFIX));
  if (!found || !isSkychaser) return NextResponse.json({ confirmed: false, error: 'Order not found' }, { status: 404 });

  let order: OrderRow = found;
  if (order.status === 'pending' || order.status === 'cancelled') {
    const payment = await findPayment(order, paymentLedger(db));
    if (!payment.paid) {
      if (order.status === 'cancelled' && !payment.error) {
        return NextResponse.json({ confirmed: false, status: order.status, error: 'This order is closed' }, { status: 409 });
      }
      return NextResponse.json({ confirmed: false, ...(payment.error ? { error: payment.error } : {}) }, { status: payment.status ?? 200 });
    }
    if (order.productId === CAPSULE_PRODUCT_ID) {
      order = await settleCapsulePayment(db, order, payment);
    } else if (payment.late || order.status === 'cancelled') {
      order = await markRefundDue(db, order.id, payment.signature, payment.paidAt, payment.late ? 'paid after its payment window closed' : 'paid after the order was closed');
    } else {
      order = await markPaid(db, order.id, payment.signature, payment.paidAt);
    }
    if (found.status === 'pending' && order.status === 'paid') {
      await reportExtraTransfers(order.id, payment.extra);
      await reportSharedTransfers(order.id, payment.shared);
    }
  }
  if (order.status === 'refund_due') {
    return NextResponse.json(
      { confirmed: false, status: order.status, signature: order.signature, error: 'The payment arrived after this order closed. It will be refunded.' },
      { status: 409 },
    );
  }
  if (order.status !== 'paid') {
    return NextResponse.json({ confirmed: false, status: order.status, error: 'This order is closed' }, { status: 409 });
  }
  if (unpaidRehearsal(order)) {
    return NextResponse.json({ confirmed: false, status: order.status, error: 'This order was a rehearsal and was never paid' }, { status: 409 });
  }

  if (order.productId === CAPSULE_PRODUCT_ID) {
    const [c] = await db.select({ id: capsule.id }).from(capsule).where(eq(capsule.orderId, order.id)).limit(1);
    return NextResponse.json({ confirmed: true, signature: order.signature, capsuleId: c?.id ?? null });
  }

  const fulfilled = await fulfilCardOrder(db, order);
  if (!fulfilled.ok) {
    const error = fulfilled.reason === 'sold_out'
      ? 'No edition of this card could be spared by the time the payment arrived. The order will be refunded.'
      : 'Card not found';
    return NextResponse.json({ confirmed: true, signature: order.signature, error }, { status: 409 });
  }
  return NextResponse.json({ confirmed: true, signature: order.signature, edition: fulfilled });
}
