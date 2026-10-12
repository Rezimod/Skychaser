import { NextResponse, type NextRequest } from 'next/server';
import { INVITE_COOKIE, inviteCodes } from '@/lib/invite';
import { LEGACY_HOST } from '@/lib/skychaser/legacy';

/** Cards of the first Set 001, replaced by First Light before anything sold. Names First Light reuses are live again. */
const RETIRED_CARD = /^\/card\/(TRANQUILITY-BASE|TWIN-SUN|TIDE-WORLD|RING-HABITAT|UNIT-7|SENTINEL|BLACK-SLAB)\/?$/i;

/** The pages the card product serves. */
const CARD_PAGES = /^\/($|(genesis|set|card|collection|capsules?|tonight|vote|node|book|voyage|invite|terms|privacy|contact)(\/|$))/;

/** The legacy app's pages, which now live on its own domain. Anything else is the card product's 404. */
const LEGACY_PAGES = /^\/(en|ka|accessibility|admin|chat|club|cookie-policy|darksky|earn|faq|feed|field|first-light|games|hub|leaderboard|learn|marketplace|missions|moon|network|nfts|observations|observatory|observe|play|profile|proof|returns|security-policy|settings|shop|sky|solar-system|star|u)(\/|$)/;

/**
 * The closed beta. While STELLAR_INVITE_CODES names any code, a page opens only
 * to a visitor carrying one of them, set by /invite/<code>. Unset, the gate is
 * not there at all. APIs, assets and the on-chain metadata routes are never
 * behind it: minted cards and the reveal still have to reach them.
 */

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (RETIRED_CARD.test(pathname)) return NextResponse.redirect(new URL('/genesis', req.url), 307);
  if (LEGACY_PAGES.test(pathname)) return NextResponse.redirect(`${LEGACY_HOST}${pathname}${search}`, 307);
  if (!CARD_PAGES.test(pathname)) return NextResponse.next();

  const codes = inviteCodes();
  if (codes.length === 0) return NextResponse.next();
  const held = req.cookies.get(INVITE_COOKIE)?.value;
  if (held && codes.includes(held)) return NextResponse.next();
  return NextResponse.rewrite(new URL('/invite', req.url));
}

export const config = {
  matcher: [
    '/((?!api/|_next/|m/|invite|\\.well-known/|cards/|_og|opengraph-image|icon|apple-icon|robots\\.txt|sitemap\\.xml|.*\\.[^/]+$).*)',
  ],
};
