import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivy } from '@/lib/api-auth';
import { checkRateLimit, exploreGemsBoardRateLimit } from '@/lib/rate-limit';
import { gemLeaderboard, gemStanding, type GemLeaderboard } from '@/lib/games/explore-gems-store';

// The Explore gem leaderboard: the players with the highest gem score, and,
// when a Privy token comes with the request, where the caller stands. The
// store being down is an empty board (`available: false`), never an error:
// the panel then shows the player's own gems from the device.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const raw = Number(req.nextUrl.searchParams.get('limit') ?? 50);
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(100, Math.floor(raw))) : 50;
  const signed = req.headers.get('authorization')?.startsWith('Bearer ') ?? false;
  const headers = { 'Cache-Control': signed ? 'private, no-store' : 'public, s-maxage=30, stale-while-revalidate=120' };
  const empty: GemLeaderboard = { available: false, players: 0, entries: [], me: null };

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
    const { success } = await checkRateLimit(exploreGemsBoardRateLimit, `gems-board:${ip}`);
    if (!success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  } catch { /* no limiter configured: the board is a cheap read */ }

  try {
    const privyId = signed ? await verifyPrivy(req).catch(() => null) : null;
    const [board, me] = await Promise.all([gemLeaderboard(limit, privyId), privyId ? gemStanding(privyId) : Promise.resolve(null)]);
    if (!board) return NextResponse.json(empty, { headers });
    const body: GemLeaderboard = { available: true, players: board.players, entries: board.entries, me };
    return NextResponse.json(body, { headers });
  } catch (err) {
    console.error('[explore/gems/leaderboard]', err);
    return NextResponse.json(empty, { headers });
  }
}
