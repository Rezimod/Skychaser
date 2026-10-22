import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { INVITE_COOKIE, INVITED_COOKIE, INVITE_MAX_AGE, inviteCodes, isHolderCode, signInvite } from '@/lib/invite';
import { recordEvent } from '@/lib/skychaser/events';
import { growthTablesMissing } from '@/lib/skychaser/contact';
import { inviteExists } from '@/lib/skychaser/referral';

export const runtime = 'nodejs';

const cookie = (secure: boolean) => ({ httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: INVITE_MAX_AGE });

/**
 * An invitation link. The owner's code is kept for a year; a holder's code is
 * kept with its signature, so the middleware can admit it without asking the
 * database; anything else goes to the closed door. Opening a holder's link is
 * counted, signed in or not: the funnel's first step for an invited visitor.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const secure = process.env.NODE_ENV === 'production';

  if (inviteCodes().includes(code)) {
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set(INVITE_COOKIE, code, cookie(secure));
    return res;
  }

  if (isHolderCode(code)) {
    const db = getDb();
    if (db) {
      try {
        if (await inviteExists(db, code)) {
          const res = NextResponse.redirect(new URL('/', req.url));
          res.cookies.set(INVITE_COOKIE, code, cookie(secure));
          const signature = await signInvite(code);
          if (signature) res.cookies.set(INVITED_COOKIE, signature, cookie(secure));
          await recordEvent(db, 'invite_opened', { path: `/invite/${code}`, props: { invite: code } });
          return res;
        }
      } catch (err) {
        if (!growthTablesMissing(err)) console.error('[skychaser/invite]', err);
      }
    }
  }

  return NextResponse.redirect(new URL('/invite', req.url));
}
