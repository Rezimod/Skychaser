import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPrivy } from '@/lib/api-auth';
import { paused } from '@/lib/kill-switch';
import { skychaserBuyIpRateLimit, skychaserBuyRateLimit } from '@/lib/rate-limit';
import { bookingReady, packByKey } from '@/lib/skychaser/booking';
import { createCreditsOrder, usdToSol, merchantWallet, newPaymentReference, paymentUrl, paymentNetworkMisconfig } from '@/lib/skychaser/orders';
import { clientIp, holderWallet, limited, NO_LINKED_WALLET, rehearsalOnLiveDatabase } from '@/lib/skychaser/route-guards';
import { SolPriceUnavailableError } from '@/lib/sol-price';

export const runtime = 'nodejs';

/**
 * Opens an order for a pack of telescope credits, on the same rail as a card:
 * a quote in SOL at the live rate that stands for the order window. The credits
 * are added when /api/skychaser/orders/confirm sees the transfer.
 */
export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  const n = paymentNetworkMisconfig();
  if (n) return n;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const pack = packByKey(body?.pack);
  if (!pack) return NextResponse.json({ error: 'Unknown pack' }, { status: 400 });
  const walletAddress = await holderWallet(privyId, body?.walletAddress);
  if (!walletAddress) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });
  const l = (await limited(skychaserBuyRateLimit, walletAddress)) ?? (await limited(skychaserBuyIpRateLimit, clientIp(req)));
  if (l) return l;

  const recipient = merchantWallet();
  if (!recipient) return NextResponse.json({ error: 'Merchant wallet not configured' }, { status: 503 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const r = await rehearsalOnLiveDatabase(db);
  if (r) return r;
  if (!(await bookingReady(db))) return NextResponse.json({ error: 'Booking opens soon' }, { status: 503 });

  let amountSol: number;
  try {
    amountSol = await usdToSol(pack.usd);
  } catch (err) {
    if (!(err instanceof SolPriceUnavailableError)) console.error('[skychaser/credits/buy] quote', err);
    return NextResponse.json({ error: 'No price can be quoted right now. Try again in a moment.' }, { status: 503 });
  }
  try {
    const reference = newPaymentReference();
    const order = await createCreditsOrder(db, { privyId, wallet: walletAddress, pack: pack.key, credits: pack.credits, priceUsd: pack.usd, amountSol, reference });
    return NextResponse.json({
      orderId: order.id,
      reference,
      url: paymentUrl({ recipient, amountSol, reference, label: `${pack.credits} credits`, orderId: order.id }),
      amountSol,
      amountFiat: pack.usd,
      currency: 'USD',
      status: 'pending',
      expiresAt: order.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('[skychaser/credits/buy]', err);
    return NextResponse.json({ error: 'Could not place the order. Try again in a moment.' }, { status: 500 });
  }
}
