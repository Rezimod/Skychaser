import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { unsubscribeTokenValid } from '@/lib/skychaser/notify';

export const runtime = 'nodejs';

const page = (line: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Skychaser</title></head>` +
  `<body style="margin:0;background:#0b0c0e;color:#ece7da;font-family:Geist,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px">` +
  `<main style="max-width:480px;text-align:center"><p style="font-size:18px;line-height:1.6;margin:0 0 20px">${line}</p><a href="/" style="color:#ece7da">Skychaser</a></main></body></html>`;

/** The way out of email about one's cards: the link at the foot of every notice, signed for the account it was sent to. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const token = req.nextUrl.searchParams.get('t');
  if (!id || id.length > 128 || !unsubscribeTokenValid(id, token)) {
    return new NextResponse(page('This link is not one we sent, or it has changed on the way.'), { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const db = getDb();
  if (!db) return new NextResponse(page('The request cannot be kept at the moment. Try the link again later.'), { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  try {
    await db.execute(sql`UPDATE holder_contact SET notify = false WHERE privy_id = ${id}`);
  } catch (err) {
    console.error('[skychaser/notify/unsubscribe]', err);
    return new NextResponse(page('The request cannot be kept at the moment. Try the link again later.'), { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  return new NextResponse(page('No more email about your cards. Your Collection is where it was.'), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
