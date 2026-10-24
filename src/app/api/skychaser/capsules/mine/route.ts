import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { skychaserOpenRateLimit } from '@/lib/rate-limit';
import { heldCapsules } from '@/lib/skychaser/capsule';
import { limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * The signed-in account's capsules bought and not yet opened, paid or still
 * inside their payment window, newest first. The Collection lists them, each
 * with the way to open it.
 */
export async function GET(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const l = await limited(skychaserOpenRateLimit, privyId);
  if (l) return l;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    return NextResponse.json({ capsules: await heldCapsules(db, privyId) });
  } catch (err) {
    console.error('[skychaser/capsules/mine]', err);
    return NextResponse.json({ error: 'Your capsules cannot be read at the moment.' }, { status: 500 });
  }
}
