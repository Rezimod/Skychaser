import { NextRequest, NextResponse } from 'next/server';
import { getSessionWalletAddresses, verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { paused } from '@/lib/kill-switch';
import { getNode } from '@/lib/observatory/nodes';
import { skychaserBookRateLimit } from '@/lib/rate-limit';
import { book, bookingBoard, bookingTablesMissing, isBookingTarget, SESSION_MINUTES_CHOICES, type SessionMinutes } from '@/lib/skychaser/booking';
import { holderWallet, isUuid, limited, NO_LINKED_WALLET } from '@/lib/skychaser/route-guards';
import { sendTelegram } from '@/lib/telegram';
import { isValidPublicKey } from '@/lib/validate';

export const runtime = 'nodejs';

/** The booking board: every night ahead, its half-hours, which are taken. Public, like the page. */
export async function GET() {
  const node = getNode('tbilisi-01')!;
  try {
    const board = await bookingBoard(getDb(), node);
    return NextResponse.json(board, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[skychaser/booking] board', err);
    return NextResponse.json({ error: 'The board cannot be read right now' }, { status: 503 });
  }
}

const REASONS = {
  off_grid: 'That half-hour is not on the board.',
  too_soon: 'A session must be booked at least two hours ahead.',
  taken: 'That half-hour has just been taken.',
  short: 'Not enough credits.',
  edition: 'That card’s session is not yours to use, or is already booked.',
} as const;

/** Books a session for the signed-in holder, paid in credits or with an Epic card's session. */
export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const { walletAddress: named, startsAt, minutes, targetId, editionId } = body ?? {};
  const at = typeof startsAt === 'string' ? new Date(startsAt) : null;
  if (!at || Number.isNaN(at.getTime())) return NextResponse.json({ error: 'startsAt required' }, { status: 400 });
  if (!SESSION_MINUTES_CHOICES.includes(minutes as SessionMinutes)) return NextResponse.json({ error: 'minutes must be 30 or 60' }, { status: 400 });
  if (targetId != null && !isBookingTarget(targetId)) return NextResponse.json({ error: 'Unknown target' }, { status: 400 });
  if (editionId != null && !isUuid(editionId)) return NextResponse.json({ error: 'editionId must be a UUID' }, { status: 400 });

  const wallet = await holderWallet(privyId, named);
  if (!wallet) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });
  const l = await limited(skychaserBookRateLimit, privyId);
  if (l) return l;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const node = getNode('tbilisi-01')!;
  try {
    const wallets = (await getSessionWalletAddresses(privyId)).filter((a) => isValidPublicKey(a));
    const result = await book(db, {
      privyId,
      wallet,
      wallets,
      node,
      startsAt: at,
      minutes: minutes as SessionMinutes,
      targetId: (targetId as string | undefined) ?? null,
      editionId: (editionId as string | undefined) ?? null,
    });
    if (!result.ok) {
      const status = result.reason === 'taken' ? 409 : result.reason === 'short' ? 402 : 400;
      return NextResponse.json({ error: REASONS[result.reason], reason: result.reason }, { status });
    }
    sendTelegram(`Skychaser booking\n${at.toISOString()} · ${minutes} min · ${targetId ?? 'operator’s pick'}\n${result.credits} credits${editionId ? ' + an Epic session' : ''}\nwallet ${wallet}`).catch(() => {});
    return NextResponse.json({ id: result.id, credits: result.credits, balance: result.balance });
  } catch (err) {
    if (bookingTablesMissing(err)) return NextResponse.json({ error: 'Booking opens soon' }, { status: 503 });
    console.error('[skychaser/booking] book', err);
    return NextResponse.json({ error: 'The session could not be booked. Try again in a moment.' }, { status: 500 });
  }
}
