import { NextRequest, NextResponse } from 'next/server';
import { getSessionEmail, verifyPrivy } from '@/lib/api-auth';
import { getDb } from '@/lib/db';
import { INVITE_COOKIE } from '@/lib/invite';
import { paused } from '@/lib/kill-switch';
import { skychaserHelloIpRateLimit, skychaserHelloRateLimit } from '@/lib/rate-limit';
import { growthTablesMissing, resolveInvite, touchContact } from '@/lib/skychaser/contact';
import { recordEvent } from '@/lib/skychaser/events';
import { clientIp, holderWallet, limited, NO_LINKED_WALLET } from '@/lib/skychaser/route-guards';
import { grantWelcome, welcomeOn } from '@/lib/skychaser/welcome';

export const runtime = 'nodejs';

/**
 * A sign-in says hello: the account's row is made or brought up to date (the
 * wallet Privy lists, the email, the invitation it arrived with), and the
 * first card is given if it has not been. Safe to call again: a second hello
 * finds the card already given and returns it, not fresh.
 */
export async function POST(req: NextRequest) {
  const p = await paused();
  if (p) return p;
  const privyId = await verifyPrivy(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const l = await limited(skychaserHelloRateLimit, privyId);
  if (l) return l;
  const li = await limited(skychaserHelloIpRateLimit, clientIp(req));
  if (li) return li;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const wallet = await holderWallet(privyId, body?.walletAddress);
  if (!wallet) return NextResponse.json({ error: NO_LINKED_WALLET }, { status: 403 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 503 });

  try {
    const email = await getSessionEmail(privyId);
    const invitedBy = await resolveInvite(db, req.cookies.get(INVITE_COOKIE)?.value, privyId);
    const contact = await touchContact(db, { privyId, wallet, email, invitedBy });
    if (contact.invitedNow && contact.invitedBy) {
      await recordEvent(db, 'invite_landed', { wallet, path: '/api/skychaser/hello', props: { invite: contact.invitedBy } });
    }

    const welcome = welcomeOn() ? await grantWelcome(db, { privyId, wallet }) : { edition: null, fresh: false };
    if (welcome.fresh && welcome.edition) {
      await recordEvent(db, 'welcome_granted', {
        wallet,
        path: '/api/skychaser/hello',
        props: { designation: welcome.edition.designation, editionNumber: welcome.edition.editionNumber, invite: contact.invitedBy },
      });
    }
    return NextResponse.json({ wallet, notify: contact.notify, invitedBy: contact.invitedBy, welcome });
  } catch (err) {
    if (growthTablesMissing(err)) return NextResponse.json({ error: 'Not open yet' }, { status: 503 });
    console.error('[skychaser/hello]', err);
    return NextResponse.json({ error: 'Could not record the sign-in. Try again in a moment.' }, { status: 500 });
  }
}
