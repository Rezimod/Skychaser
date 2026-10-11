import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

/**
 * Emergency pause for every value-moving route: buying, confirming, opening,
 * voiding, releasing, listing, voting.
 *
 * Two switches. `app_flag` 'paused' in the database takes effect on the next
 * request, with no redeploy — `scripts/skychaser-pause.ts on|off`. STELLAR_PAUSED=1
 * in the Vercel environment does too, but only once a new deployment carries
 * it (redeploy). A database that cannot be read, or has no app_flag table,
 * does not pause anything by itself: the route then fails on its own reads.
 *
 * Call as the first line of a handler: `const p = await paused(); if (p) return p;`
 */
export async function paused(): Promise<NextResponse | null> {
  if (process.env.STELLAR_PAUSED === '1' || (await pausedInDatabase())) {
    return NextResponse.json({ error: 'Service temporarily paused' }, { status: 503 });
  }
  return null;
}

async function pausedInDatabase(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const { rows } = (await db.execute(sql`SELECT value FROM app_flag WHERE name = 'paused'`)) as { rows: Array<{ value: string }> };
    return rows[0]?.value === '1';
  } catch (err) {
    const { code, cause } = err as { code?: string; cause?: { code?: string } };
    if ((code ?? cause?.code) !== '42P01') console.error('[kill-switch] cannot read the pause flag', err instanceof Error ? err.message : err);
    return false;
  }
}
