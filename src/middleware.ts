import { NextResponse, type NextRequest } from 'next/server';

// Stellar Explore's own deployment: the game, its install page and Stellar
// Academy, and nothing of the Stellar website. "/" is the install page; an
// `academy.` host opens on the Academy instead.

/** The install page (download / add to home screen / about the game). */
export const EXPLORE_SITE_PATH = '/explore';
/** The game itself. */
export const GAME_PATH = '/play';
/** Stellar Academy, the children's learning app. */
export const ACADEMY_PATH = '/academy';
/** Hosts whose front page is the Academy. Any `academy.` host also counts. */
export const ACADEMY_HOSTS: readonly string[] = ['academy.stellarr.club'];

/** Where the Stellar website lives, for links out of the game. */
export const MAIN_SITE_ORIGIN = 'https://stellarr.club';

/** The value the root layout reads: `1` the game, `site` the install page,
 *  `academy` the learning app. */
export const GAME_HEADER = 'x-stellar-game';

const hostName = (host: string) => host.split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');

/** Every host of this deployment is the game's own site. */
export function isExploreHost(host: string | null | undefined): boolean {
  return !!host;
}

export function isAcademyHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = hostName(host);
  return ACADEMY_HOSTS.includes(name) || name.startsWith('academy.');
}

function requestHost(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-host') ?? req.headers.get('host');
}

function ownDocument(req: NextRequest, kind: '1' | 'site' | 'academy', rewriteTo?: string) {
  const headers = new Headers(req.headers);
  headers.set(GAME_HEADER, kind);
  if (!rewriteTo) return NextResponse.next({ request: { headers } });
  const url = req.nextUrl.clone();
  url.pathname = rewriteTo;
  return NextResponse.rewrite(url, { request: { headers } });
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === GAME_PATH) return ownDocument(req, '1');
  if (pathname === ACADEMY_PATH) return ownDocument(req, 'academy');
  if (pathname === '/') {
    return isAcademyHost(requestHost(req)) ? ownDocument(req, 'academy', ACADEMY_PATH) : ownDocument(req, 'site', EXPLORE_SITE_PATH);
  }
  // The install page's own path still works (the service worker caches it there).
  if (pathname === EXPLORE_SITE_PATH) return ownDocument(req, 'site');
  // "Exit to Stellar" and old links onto the website's pages go to the website.
  if (pathname === '/solar-system') return NextResponse.redirect(new URL(`/solar-system${req.nextUrl.search}`, MAIN_SITE_ORIGIN));
  return NextResponse.next();
}

export const config = { matcher: ['/', '/play', '/explore', '/academy', '/solar-system'] };
