import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { runNight } from '@/lib/skychaser/night';

export const runtime = 'nodejs';

/**
 * Closes last night and decides tonight's card. Runs at 13:00 UTC — 17:00 in
 * Tbilisi, before dusk in every season, so the night is known before it starts.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const node = getNode('tbilisi-01');
  if (!node) return NextResponse.json({ error: 'tbilisi-01 is not in the node registry' }, { status: 500 });

  const { night, last, decided, fresh } = await runNight(db, node, new Date());
  return NextResponse.json({
    ok: true,
    night,
    lastNightLost: Boolean(last?.lostAt),
    decided: decided ? { cardId: decided.cardId, basis: decided.decisionBasis } : null,
    fresh,
  });
}
