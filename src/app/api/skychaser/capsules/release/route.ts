import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { paused } from '@/lib/kill-switch';
import { recheckClosedCapsuleOrders, releaseCapsule, releaseLapsed } from '@/lib/skychaser/capsule';
import { fulfilPaidCardOrders, grantPaidCredits, recheckClosedCardOrders, refundsOwed, settleCardOrders } from '@/lib/skychaser/orders';
import { sendTelegram } from '@/lib/telegram';
import { isSkychaserAdmin, isUuid } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';
// The daily sweep asks the chain about up to 150 orders; the most important steps run first.
export const maxDuration = 60;

/**
 * Releases capsules bought and left unpaid past their payment window. Cron
 * (GET, CRON_SECRET) sweeps every lapsed capsule; an admin can POST one
 * `capsuleId`. The cron also settles single-card orders left pending past
 * their window, gives paid card orders that hold no edition one, asks the chain again about orders closed in the last few
 * days (a payment found now is owed back), and says how many refunds are owed. Each release looks for the payment on chain first, and the
 * public log records it as 'released', with the nonce kept and the secret
 * revealed — never as a void.
 */
export async function GET(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  if (!(await isSkychaserAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  // Each step stands alone: one that fails is reported and the rest still run.
  const step = async <T,>(name: string, run: () => Promise<T>): Promise<T | { error: string }> => {
    try {
      return await run();
    } catch (err) {
      console.error('[skychaser/cron] sweep step failed:', name, err);
      return { error: name };
    }
  };
  const released = await step('release lapsed capsules', () => releaseLapsed(db));
  const cards = await step('settle card orders', () => settleCardOrders(db));
  const fulfilled = await step('fulfil paid card orders', () => fulfilPaidCardOrders(db));
  const credits = await step('grant paid credits', () => grantPaidCredits(db));
  const recheckedCapsules = await step('re-check closed capsule orders', () => recheckClosedCapsuleOrders(db));
  const recheckedCards = await step('re-check closed card orders', () => recheckClosedCardOrders(db));
  const owed = await step('count refunds owed', () => refundsOwed(db));
  if (typeof owed === 'number' && owed > 0) {
    await sendTelegram(`Skychaser: ${owed} order(s) are owed a refund. List them with scripts/skychaser-refunds.ts.`).catch((err) =>
      console.error('[skychaser/cron] refund summary not sent', err),
    );
  }
  return NextResponse.json({ released, cards, fulfilled, credits, recheckedCapsules, recheckedCards, refundsOwed: owed });
}

export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  if (!(await isSkychaserAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { capsuleId?: unknown } | null;
  const capsuleId = body?.capsuleId;
  if (!isUuid(capsuleId)) return NextResponse.json({ error: 'capsuleId required' }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const result = await releaseCapsule(db, capsuleId);
  if (!result.ok) {
    const status = result.reason === 'not_found' ? 404 : result.reason === 'payment_unknown' ? 503 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json({ released: capsuleId });
}
