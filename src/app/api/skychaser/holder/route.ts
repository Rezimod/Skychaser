import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { skychaserLogRateLimit } from '@/lib/rate-limit';
import { clientIp, limited } from '@/lib/skychaser/route-guards';
import { isValidPublicKey } from '@/lib/validate';

export const runtime = 'nodejs';

/** How many editions a wallet holds. Public, like the Collection page it summarises. */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet') ?? '';
  if (!isValidPublicKey(wallet)) return NextResponse.json({ error: 'Valid wallet required' }, { status: 400 });
  const l = await limited(skychaserLogRateLimit, clientIp(req));
  if (l) return l;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const { rows } = (await db.execute(sql`SELECT count(*)::int AS n FROM edition WHERE owner_wallet = ${wallet}`)) as unknown as {
    rows: Array<{ n: number }>;
  };
  return NextResponse.json({ cards: Number(rows[0]?.n ?? 0) });
}
