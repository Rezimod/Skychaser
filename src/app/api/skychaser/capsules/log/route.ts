import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { skychaserLogRateLimit } from '@/lib/rate-limit';
import { auditLog } from '@/lib/skychaser/audit';
import { LOG_PAGE_MAX, readFullLog, readLog } from '@/lib/skychaser/capsule';
import { clientIp, limited } from '@/lib/skychaser/route-guards';

export const runtime = 'nodejs';

/**
 * The public capsule log, oldest first, a page at a time: `after` is the last
 * `seq` already read, `limit` at most LOG_PAGE_MAX, and `next` is the cursor
 * for the following page (null at the end). With `audit=1`, the audit of the
 * whole log — read page by page — comes with it: listing gaps, capsules
 * purchased and never opened, voided or released against the rules, and any
 * opened capsule whose draws or edition numbers do not verify.
 */
export async function GET(req: NextRequest) {
  const l = await limited(skychaserLogRateLimit, clientIp(req));
  if (l) return l;
  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  const params = req.nextUrl.searchParams;
  const after = Number(params.get('after') ?? 0);
  const asked = Number(params.get('limit') ?? LOG_PAGE_MAX);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(1, Math.floor(asked)), LOG_PAGE_MAX) : LOG_PAGE_MAX;
  const entries = await readLog(db, { afterSeq: Number.isFinite(after) ? after : 0, limit });
  return NextResponse.json({
    entries,
    next: entries.length === limit ? entries[entries.length - 1].seq : null,
    ...(params.get('audit') === '1' ? { audit: auditLog(await readFullLog(db)) } : {}),
  });
}
