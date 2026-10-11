import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { skychaserLogRateLimit } from '@/lib/rate-limit';
import { readSetSupply } from '@/lib/skychaser/capsule';
import { clientIp, limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * Every card of a set with its edition size and how many editions exist now,
 * and the draws owed to capsules listed or bought and not yet opened. Edition
 * numbers are gapless from 1, so `allocated` is also the highest number. A
 * capsule's logged supply can be checked against this and the log's own
 * pulls and card sales. Counts only: no holder is named.
 */
export async function GET(req: NextRequest) {
  const l = await limited(skychaserLogRateLimit, clientIp(req));
  if (l) return l;
  const code = req.nextUrl.searchParams.get('set') ?? 'SET001';
  if (!/^[A-Z0-9]{1,16}$/.test(code)) return NextResponse.json({ error: 'set must be a set code' }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const supply = await readSetSupply(db, code);
  if (!supply) return NextResponse.json({ error: 'Unknown set' }, { status: 404 });
  return NextResponse.json(supply);
}
