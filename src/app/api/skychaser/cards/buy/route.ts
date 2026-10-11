import { NextRequest, NextResponse, after } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPrivy } from '@/lib/api-auth';
import { paused } from '@/lib/kill-switch';
import { skychaserBuyIpRateLimit, skychaserBuyRateLimit } from '@/lib/rate-limit';
import { isRarity } from '@/lib/rarity';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { cardAvailability, createCardOrder, settleCardOrders, usdToSol, merchantWallet, newPaymentReference, paymentUrl, paymentNetworkMisconfig } from '@/lib/skychaser/orders';
import { clientIp, holderWallet, limited, NO_LINKED_WALLET, rehearsalOnLiveDatabase } from '@/lib/skychaser/route-guards';
import { SolPriceUnavailableError } from '@/lib/sol-price';

export const runtime = 'nodejs';

/**
 * Buys one card outright — the second way in, besides a capsule. The edition
 * number is allocated when the payment is confirmed, not now, so an unpaid
 * order never holds a number and the numbers stay gapless. A draft set sells
 * nothing, on its own or by capsule. Editions owed to capsules already listed
 * or bought are not for sale on their own. The quote
 * stands for ORDER_WINDOW_MINUTES, and none is given without a live SOL price.
 */
export async function POST(req: NextRequest) {
  const p = paused();
  if (p) return p;
  const n = paymentNetworkMisconfig();
  if (n) return n;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { walletAddress?: unknown; designation?: unknown } | null;
  const named = body?.walletAddress;
  const designation = body?.designation;
  if (typeof designation !== 'string' || !/^[A-Z0-9-]{1,40}$/.test(designation)) {
    return NextResponse.json({ error: 'designation required' }, { status: 400 });
  }
  // The wallet is the one Privy lists for this session; the page's choice is only a preference.
  const walletAddress = await holderWallet(privyId, named);
  if (!walletAddress) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });
  const l = (await limited(skychaserBuyRateLimit, walletAddress)) ?? (await limited(skychaserBuyIpRateLimit, clientIp(req)));
  if (l) return l;

  const recipient = merchantWallet();
  if (!recipient) return NextResponse.json({ error: 'Merchant wallet not configured' }, { status: 503 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const r = await rehearsalOnLiveDatabase(db);
  if (r) return r;

  // Orders left pending past their window are settled from the chain now, not only at the nightly sweep.
  after(() => settleCardOrders(db, 10).catch((err) => console.error('[skychaser/cards/buy] settle sweep', err)));
  const c = await cardAvailability(db, designation);
  if (!c || !isRarity(c.rarity)) return NextResponse.json({ error: 'Card not found' }, { status: 404 });
  if (!c.released) return NextResponse.json({ error: 'This set is not on sale yet' }, { status: 409 });
  if (!c.available) return NextResponse.json({ error: 'No edition of this card is available on its own' }, { status: 409 });

  const priceUsd = cardPriceUsd(designation, c.rarity);
  let amountSol: number;
  try {
    amountSol = await usdToSol(priceUsd);
  } catch (err) {
    if (!(err instanceof SolPriceUnavailableError)) console.error('[skychaser/cards/buy] quote', err);
    return NextResponse.json({ error: 'No price can be quoted right now. Try again in a moment.' }, { status: 503 });
  }

  try {
    const reference = newPaymentReference();
    const order = await createCardOrder(db, { privyId, wallet: walletAddress, designation, name: c.name, priceUsd, amountSol, reference });
    return NextResponse.json({
      orderId: order.id,
      designation,
      reference,
      url: paymentUrl({ recipient, amountSol, reference, label: c.name, orderId: order.id }),
      amountSol,
      amountFiat: priceUsd,
      currency: 'USD',
      status: 'pending',
      expiresAt: order.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error('[skychaser/cards/buy]', err);
    return NextResponse.json({ error: 'Could not place the order. Try again in a moment.' }, { status: 500 });
  }
}
