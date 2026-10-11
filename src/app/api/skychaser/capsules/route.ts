import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { cardSet } from '@/lib/schema';
import { paused } from '@/lib/kill-switch';
import { skychaserLogRateLimit } from '@/lib/rate-limit';
import { capsulesOnSale, listCapsules } from '@/lib/skychaser/capsule';
import { clientIp, isSkychaserAdmin, limited } from '@/lib/skychaser/route-guards';
import { tierByKey } from '@/lib/skychaser/tiers';

export const runtime = 'nodejs';

const MAX_PER_LISTING = 100;

/** Capsules on sale, each with the commitment published when it was listed; `?tier=` for one tier's. */
export async function GET(req: NextRequest) {
  const l = await limited(skychaserLogRateLimit, clientIp(req));
  if (l) return l;
  const key = req.nextUrl.searchParams.get('tier');
  const tier = key === null ? undefined : tierByKey(key);
  if (key !== null && !tier) return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  return NextResponse.json({ capsules: await capsulesOnSale(db, { tier: tier?.key }) });
}

/**
 * Lists new capsules. Admin or cron only. Each capsule's secret is drawn and
 * its commitment logged here, before any purchase of it can exist.
 */
export async function POST(req: NextRequest) {
  const p = paused();
  if (p) return p;
  if (!(await isSkychaserAdmin(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { count?: unknown; setCode?: unknown; tier?: unknown } | null;
  const count = body?.count;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_PER_LISTING) {
    return NextResponse.json({ error: `count must be an integer from 1 to ${MAX_PER_LISTING}` }, { status: 400 });
  }
  const setCode = typeof body?.setCode === 'string' ? body.setCode : 'SET001';
  const tier = body?.tier === undefined ? undefined : tierByKey(body.tier);
  if (body?.tier !== undefined && !tier) return NextResponse.json({ error: 'Unknown tier' }, { status: 400 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const [set] = await db.select({ id: cardSet.id }).from(cardSet).where(eq(cardSet.code, setCode)).limit(1);
  if (!set) return NextResponse.json({ error: 'Unknown set' }, { status: 404 });

  try {
    const listed = await listCapsules(db, { setId: set.id, count, tier });
    return NextResponse.json({ listed }, { status: 201 });
  } catch (err) {
    console.error('[skychaser/capsules/list]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not list capsules' }, { status: 409 });
  }
}
