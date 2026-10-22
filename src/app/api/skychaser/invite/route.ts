import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { skychaserInviteRateLimit } from '@/lib/rate-limit';
import { growthTablesMissing } from '@/lib/skychaser/contact';
import { inviteStats } from '@/lib/skychaser/referral';
import { holderWallet, limited, NO_LINKED_WALLET } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/** The signed-in holder's invitation: its code and link, who came by it and what it brought. Made on first request. */
export async function GET(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const l = await limited(skychaserInviteRateLimit, privyId);
  if (l) return l;
  const wallet = await holderWallet(privyId, req.nextUrl.searchParams.get('wallet') ?? undefined);
  if (!wallet) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    const stats = await inviteStats(db, { privyId, wallet });
    return NextResponse.json({ ...stats, url: `https://skychaser.io/invite/${stats.code}` });
  } catch (err) {
    if (growthTablesMissing(err)) return NextResponse.json({ error: 'Not open yet' }, { status: 503 });
    console.error('[skychaser/invite]', err);
    return NextResponse.json({ error: 'Could not read the invitation. Try again in a moment.' }, { status: 500 });
  }
}
