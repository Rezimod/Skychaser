import { NextResponse, type NextRequest } from 'next/server';

/** Hosts that are the game's own site: their front page is the platform
 *  page, not the Stellar home. Point one of them at this deployment in Vercel
 *  and it is a separate site with nothing else to change. */
export const EXPLORE_HOSTS: readonly string[] = ['explore.stellarr.club', 'play.stellarr.club'];

/** The platform page (download / install / about the game). */
export const EXPLORE_SITE_PATH = '/explore';
/** The game itself. */
export const GAME_PATH = '/play';
/** Stellar Academy, the children's learning app, and the hosts that are its
 *  own site (their front page is the Academy). */
export const ACADEMY_PATH = '/academy';
export const ACADEMY_HOSTS: readonly string[] = ['academy.stellarr.club'];

/** Where the rest of Stellar lives, for links out of the game's own host. */
export const MAIN_SITE_ORIGIN = 'https://stellarr.club';

/** The value the root layout reads: `1` the game, `site` the platform page,
 *  `academy` the learning app. Each is its own document, without the
 *  website's chrome. */
export const GAME_HEADER = 'x-stellar-game';

export function isExploreHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return EXPLORE_HOSTS.includes(name);
}

export function isAcademyHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  return ACADEMY_HOSTS.includes(name);
}

function requestHost(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host');
}

/** The game's own host — or, outside production, `?site=explore` to try it on localhost. */
function onExploreSite(req: NextRequest): boolean {
  if (isExploreHost(requestHost(req))) return true;
  return process.env.NODE_ENV !== 'production' && req.nextUrl.searchParams.get('site') === 'explore';
}

function ownDocument(req: NextRequest, kind: '1' | 'site' | 'academy', rewriteTo?: string) {
  const headers = new Headers(req.headers);
  headers.set(GAME_HEADER, kind);
  if (!rewriteTo) return NextResponse.next({ request: { headers } });
  const url = req.nextUrl.clone();
  url.pathname = rewriteTo;
  return NextResponse.rewrite(url, { request: { headers } });
}

/** The game has its own document: the root layout reads the header and
 *  renders the minimal shell instead of the site. Old deep links onto a
 *  surface (`?moon`, `?land=`) belong to the game now. */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === '/solar-system' && (searchParams.has('moon') || searchParams.has('land'))) {
    const url = req.nextUrl.clone();
    url.pathname = GAME_PATH;
    return NextResponse.redirect(url);
  }
  if (pathname === GAME_PATH) return ownDocument(req, '1');
  if (pathname === EXPLORE_SITE_PATH) return ownDocument(req, 'site');
  if (pathname === ACADEMY_PATH) return ownDocument(req, 'academy');
  if (pathname === '/' && isAcademyHost(requestHost(req))) return ownDocument(req, 'academy', ACADEMY_PATH);
  if (pathname === '/' && onExploreSite(req)) return ownDocument(req, 'site', EXPLORE_SITE_PATH);
  // Leaving the game on its own host ("Exit to Stellar") goes to the website proper.
  if (pathname === '/solar-system' && isExploreHost(requestHost(req))) {
    return NextResponse.redirect(new URL(`/solar-system${req.nextUrl.search}`, MAIN_SITE_ORIGIN));
  }
  return NextResponse.next();
}

// Only the pages that need a decision: never _next, the API or static files.
export const config = { matcher: ['/', '/play', '/explore', '/academy', '/solar-system'] };
