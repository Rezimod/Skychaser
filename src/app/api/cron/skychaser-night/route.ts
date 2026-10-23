import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { verifyCronSecret } from '@/lib/cron-auth';
import { getDb } from '@/lib/db';
import { getNode } from '@/lib/observatory/nodes';
import { card } from '@/lib/schema';
import { runNight, weekOf } from '@/lib/skychaser/night';
import { notifyPhotographed, notifyWeekChosen } from '@/lib/skychaser/notify';

export const runtime = 'nodejs';

type Db = NonNullable<ReturnType<typeof getDb>>;

async function cardRef(db: Db, id: string) {
  const [row] = await db.select({ id: card.id, designation: card.designation, name: card.name }).from(card).where(eq(card.id, id)).limit(1);
  return row ?? null;
}

/**
 * Closes last night and plans tonight for the week's card; on the first night
 * of a week it decides that card from the holders' votes. Runs at 13:00 UTC —
 * 17:00 in Tbilisi, before dusk in every season, so the night is known before it starts.
 * Then the holders hear: of a card chosen for the week (once a week), and of
 * last night's photograph. A notice that fails never fails the night.
 */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  const node = getNode('tbilisi-01');
  if (!node) return NextResponse.json({ error: 'tbilisi-01 is not in the node registry' }, { status: 500 });

  const { night, last, decided, fresh } = await runNight(db, node, new Date());

  const notices = { chosen: 0, photographed: 0 };
  try {
    if (decided && fresh) {
      const ref = await cardRef(db, decided.cardId);
      if (ref) notices.chosen = await notifyWeekChosen(db, { card: ref, week: weekOf(night), night });
    }
  } catch (err) {
    console.error('[skychaser-night] notice: week chosen', err instanceof Error ? err.message : err);
  }
  try {
    if (last?.captureId) {
      const ref = await cardRef(db, last.cardId);
      if (ref) notices.photographed = await notifyPhotographed(db, { card: ref, night: last.nightDate });
    }
  } catch (err) {
    console.error('[skychaser-night] notice: photographed', err instanceof Error ? err.message : err);
  }

  return NextResponse.json({
    ok: true,
    night,
    lastNightLost: Boolean(last?.lostAt),
    decided: decided ? { cardId: decided.cardId, basis: decided.decisionBasis } : null,
    fresh,
    notices,
  });
}
