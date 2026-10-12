import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { paused } from '@/lib/kill-switch';
import { skychaserBookRateLimit } from '@/lib/rate-limit';
import { bookingTablesMissing, cancelBooking, CANCEL_HOURS } from '@/lib/skychaser/booking';
import { isUuid, limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/** Cancels one of the holder's sessions; its credits come back while it is still a day away. */
export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!isUuid(body?.id)) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const l = await limited(skychaserBookRateLimit, privyId);
  if (l) return l;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    const result = await cancelBooking(db, { privyId, id: body!.id as string });
    if (!result.ok) {
      return result.reason === 'late'
        ? NextResponse.json({ error: `A session can be cancelled up to ${CANCEL_HOURS} hours before it starts.` }, { status: 409 })
        : NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    return NextResponse.json({ cancelled: true, balance: result.balance });
  } catch (err) {
    if (bookingTablesMissing(err)) return NextResponse.json({ error: 'Booking opens soon' }, { status: 503 });
    console.error('[skychaser/booking] cancel', err);
    return NextResponse.json({ error: 'The session could not be cancelled. Try again in a moment.' }, { status: 500 });
  }
}
