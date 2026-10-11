import { NextRequest, NextResponse, after } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPrivy } from '@/lib/api-auth';
import { paused } from '@/lib/kill-switch';
import { skychaserBuyRateLimit } from '@/lib/rate-limit';
import { purchaseCapsule, readCapsule, releaseLapsed } from '@/lib/skychaser/capsule';
import { usdToSol, merchantWallet, newPaymentReference, paymentUrl, paymentNetworkMisconfig } from '@/lib/skychaser/orders';
import { isHex32, verifyPurchaseSignature } from '@/lib/skychaser/randomness';
import { isUuid, holderWallet, limited, NO_LINKED_WALLET, rehearsalOnLiveDatabase } from '@/lib/skychaser/route-guards';
import { SolPriceUnavailableError } from '@/lib/sol-price';

export const runtime = 'nodejs';

/** Unpaid capsules one account may hold at once. */
const MAX_UNPAID = 2;

/**
 * Buys one listed capsule.
 *
 * The buyer names the capsule and the commitment they saw published, and
 * supplies a 32-byte nonce, fresh from their own random source. The response
 * carries the exact purchase message and its hash — the buyer's receipt that
 * this nonce, and no other, was accepted for this capsule. A signature over
 * that message by the wallet is recorded when sent, and is refused if it does
 * not verify. The capsule is the buyer's, and its nonce fixed, from here; it
 * is opened once the order is paid. The quote stands for ORDER_WINDOW_MINUTES:
 * unpaid by then, the capsule is released. No quote is given without a live
 * SOL price.
 */
export async function POST(req: NextRequest) {
  const p = paused();
  if (p) return p;
  const n = paymentNetworkMisconfig();
  if (n) return n;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { walletAddress: named, capsuleId, commitment, nonce, signature } = body ?? {};
  if (!isUuid(capsuleId)) return NextResponse.json({ error: 'capsuleId required' }, { status: 400 });
  if (!isHex32(commitment)) return NextResponse.json({ error: 'commitment must be 64 lowercase hex characters' }, { status: 400 });
  if (!isHex32(nonce)) return NextResponse.json({ error: 'nonce must be 64 lowercase hex characters' }, { status: 400 });
  if (signature !== undefined && typeof signature !== 'string') return NextResponse.json({ error: 'signature must be base58' }, { status: 400 });

  // The wallet is the one Privy lists for this session; the page's choice is only a preference.
  const walletAddress = await holderWallet(privyId, named);
  if (!walletAddress) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });
  const l = await limited(skychaserBuyRateLimit, walletAddress);
  if (l) return l;

  const recipient = merchantWallet();
  if (!recipient) return NextResponse.json({ error: 'Merchant wallet not configured' }, { status: 503 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const r = await rehearsalOnLiveDatabase(db);
  if (r) return r;

  // Capsules left unpaid go back on the shelf as soon as their window closes,
  // not only at the nightly sweep. One account holds few unpaid at a time; purchaseCapsule enforces it.
  after(() => releaseLapsed(db, 10).catch((err) => console.error('[skychaser/capsules/buy] release sweep', err)));

  const listed = await readCapsule(db, capsuleId);
  if (!listed || listed.demo) return NextResponse.json({ error: 'Capsule not found' }, { status: 404 });
  if (listed.set_status !== 'released') return NextResponse.json({ error: 'This set is not on sale yet' }, { status: 409 });
  if (signature) {
    const terms = { capsuleId, sequence: Number(listed.sequence), commitment, wallet: walletAddress, nonce };
    if (!verifyPurchaseSignature(terms, signature)) {
      return NextResponse.json({ error: 'The signature does not match the purchase message' }, { status: 400 });
    }
  }

  let amountSol: number;
  try {
    amountSol = await usdToSol(Number(listed.price_usd));
  } catch (err) {
    if (!(err instanceof SolPriceUnavailableError)) console.error('[skychaser/capsules/buy] quote', err);
    return NextResponse.json({ error: 'No price can be quoted right now. Try again in a moment.' }, { status: 503 });
  }

  try {
    const reference = newPaymentReference();
    const result = await purchaseCapsule(db, {
      capsuleId,
      commitment,
      wallet: walletAddress,
      nonce,
      signature: signature ?? null,
      privyId,
      amountSol,
      paymentReference: reference,
      maxUnpaid: MAX_UNPAID,
    });
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'too_many_unpaid' ? 429 : 409;
      const error = {
        too_many_unpaid: 'Pay for the capsule you are holding, or let its quote lapse, before taking another.',
        not_found: 'Capsule not found',
        commitment_mismatch: 'That commitment is not this capsule’s',
        not_listed: 'This capsule is no longer on sale',
      }[result.reason];
      return NextResponse.json({ error }, { status });
    }
    return NextResponse.json({
      orderId: result.orderId,
      capsuleId,
      sequence: result.sequence,
      reference,
      url: paymentUrl({ recipient, amountSol, reference, label: `Capsule ${result.sequence}`, orderId: result.orderId }),
      amountSol,
      amountFiat: result.priceUsd,
      currency: 'USD',
      purchaseMessage: result.message,
      purchaseHash: result.purchaseHash,
      status: 'pending',
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    console.error('[skychaser/capsules/buy]', err);
    return NextResponse.json({ error: 'Could not reserve the capsule. Try again in a moment.' }, { status: 500 });
  }
}
