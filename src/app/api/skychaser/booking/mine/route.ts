import { NextRequest, NextResponse } from 'next/server';
import { getSessionWalletAddresses, verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { creditBalance, holderBookings, redeemableEditions } from '@/lib/skychaser/booking';
import { isValidPublicKey } from '@/lib/validate';

export const runtime = 'nodejs';

/** The signed-in holder's credits, sessions to come, and the Epic cards whose session is still unused. */
export async function GET(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  try {
    const wallets = (await getSessionWalletAddresses(privyId)).filter((a) => isValidPublicKey(a));
    const [balance, bookings, editions] = await Promise.all([creditBalance(db, privyId), holderBookings(db, privyId), redeemableEditions(db, wallets)]);
    return NextResponse.json({ balance, bookings, editions });
  } catch (err) {
    console.error('[skychaser/booking] mine', err);
    return NextResponse.json({ error: 'Your sessions cannot be read right now' }, { status: 503 });
  }
}
