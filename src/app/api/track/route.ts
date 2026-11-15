import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyticsEvent } from '@/lib/schema';
import { trackRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { isValidPublicKey } from '@/lib/validate';
import { INVITE_COOKIE } from '@/lib/invite';

export const runtime = 'nodejs';

// Client-emittable events. Anything else is rejected at the boundary so the
// table stays a clean, queryable funnel. Server-only events (signup,
// observation_minted, reward_redeemed) are inserted directly from their route
// handlers via src/lib/track-server.ts and are intentionally absent here — a
// client must not be able to forge them.
const ALLOWED = new Set([
  'open',
  'location_set',
  'find_aimed',
  'stars_earned',
  'stars_spent',
  'mission_complete',
  'session_open',
  'observation_started',
  'quiz_completed',
  'marketplace_view',
  'product_view',
  'stellar_view',
]);

const PROPS_MAX_BYTES = 4096;

export async function POST(req: NextRequest) {
  let body: { event?: string; wallet?: string; anonId?: string; path?: string; props?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const event = typeof body.event === 'string' ? body.event : '';
  if (!ALLOWED.has(event)) {
    // Unknown event — accept-and-drop so a misbehaving client never sees errors,
    // but nothing is written.
    return new NextResponse(null, { status: 204 });
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  // Analytics is best-effort: with no Redis configured (local dev) or Redis down, proceed unthrottled.
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { success } = await checkRateLimit(trackRateLimit, ip);
      if (!success) return new NextResponse(null, { status: 204 });
    } catch {}
  }

  const db = getDb();
  if (!db) return new NextResponse(null, { status: 204 });

  let props: unknown = body.props ?? null;
  if (props != null && JSON.stringify(props).length > PROPS_MAX_BYTES) props = null;
  // The beta's invite code rides on its httpOnly cookie, which the client
  // cannot read; the server attaches it so the funnel splits by invitation.
  const invite = req.cookies.get(INVITE_COOKIE)?.value;
  if (event === 'stellar_view' && invite) {
    props = { ...(props && typeof props === 'object' ? props : {}), invite: invite.slice(0, 64) };
  }

  try {
    await db.insert(analyticsEvent).values({
      event,
      // This endpoint is intentionally unauthenticated (pre-auth analytics via
      // sendBeacon, which can't carry a token). Only accept a syntactically
      // valid pubkey so the funnel can't be polluted with arbitrary junk.
      wallet: typeof body.wallet === 'string' && isValidPublicKey(body.wallet) ? body.wallet : null,
      anonId: typeof body.anonId === 'string' ? body.anonId.slice(0, 64) : null,
      path: typeof body.path === 'string' ? body.path.slice(0, 256) : null,
      props: props as Record<string, unknown> | null,
    });
  } catch {
    // Never surface analytics failures to the client.
  }

  return new NextResponse(null, { status: 204 });
}
