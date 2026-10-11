import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { paused } from '@/lib/kill-switch';
import { releaseCapsule, releaseLapsed } from '@/lib/skychaser/capsule';
import { settleCardOrders } from '@/lib/skychaser/orders';
import { isSkychaserAdmin, isUuid } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * Releases capsules bought and left unpaid past their payment window. Cron
 * (GET, CRON_SECRET) sweeps every lapsed capsule; an admin can POST one
 * `capsuleId`. The cron also settles single-card orders left pending past
 * their window. Each release looks for the payment on chain first, and the
 * public log records it as 'released', with the nonce kept and the secret
 * revealed — never as a void.
 */
export async function GET(req: NextRequest) {
  const p = paused();
  if (p) return p;
  if (!(await isSkychaserAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  return NextResponse.json({ released: await releaseLapsed(db), cards: await settleCardOrders(db) });
}

export async function POST(req: NextRequest) {
  const p = paused();
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
