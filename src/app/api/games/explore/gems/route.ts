import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivy } from '@/lib/api-auth';
import { checkRateLimit, exploreGemsRateLimit } from '@/lib/rate-limit';
import { gemStanding, gemsOf, storeGems } from '@/lib/games/explore-gems-store';
import { GEM_INFO, gemLayout, isGemWorld } from '@/lib/solar-system/gem-layout';

// Explore gems for the signed-in player. POST reports pickups on one world:
// every id must be in that world's fixed layout (gem-layout, the same module
// the game places them from), each (account, gem) is kept once, and the
// points are the server's own price for the kind, never the client's. GET
// returns what the account has stored, so a new device takes it back.
//
// Like the other games' scores the report is self-declared — nothing proves
// the gem was flown to — but each one counts once, the layout bounds the
// total, and the rate limit bounds how fast a script can try.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const unavailable = () => NextResponse.json({ error: 'Gem storage is unavailable' }, { status: 503 });

export async function GET(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [worlds, standing] = await Promise.all([gemsOf(privyId), gemStanding(privyId)]);
  if (!worlds || !standing) return unavailable();
  // Only ids still in the layout: a retired gem is not handed back.
  const clean: Record<string, string[]> = {};
  for (const [w, ids] of Object.entries(worlds)) {
    if (!isGemWorld(w)) continue;
    const known = new Set(gemLayout(w).map((g) => g.id));
    const list = ids.filter((id) => known.has(id));
    if (list.length) clean[w] = list;
  }
  return NextResponse.json({ worlds: clean, ...standing }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { success } = await checkRateLimit(exploreGemsRateLimit, `gems:${privyId}`);
    if (!success) return NextResponse.json({ error: 'Too many reports' }, { status: 429 });
  } catch (err) {
    // No limiter configured (local, preview): the unique key still keeps each gem once.
    console.error('[explore/gems] rate limit unavailable', err);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const { world, gemIds } = body;
  if (!isGemWorld(world)) return NextResponse.json({ error: 'Unknown world' }, { status: 400 });
  const layout = gemLayout(world);
  if (!Array.isArray(gemIds) || gemIds.length === 0 || gemIds.length > layout.length * 2 || !gemIds.every((id) => typeof id === 'string')) {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const byId = new Map(layout.map((g) => [g.id, g]));
  const unique = [...new Set(gemIds as string[])];
  const unknown = unique.filter((id) => !byId.has(id));
  if (unknown.length) return NextResponse.json({ error: 'Unknown gem', unknown: unknown.slice(0, 10) }, { status: 400 });

  const stored = await storeGems(privyId, world, unique.map((id) => ({ id, points: GEM_INFO[byId.get(id)!.kind].points })));
  if (stored === null) return unavailable();
  const standing = await gemStanding(privyId);
  if (!standing) return unavailable();
  return NextResponse.json({ world, accepted: unique, stored, ...standing });
}
