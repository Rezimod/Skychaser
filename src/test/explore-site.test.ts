// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, EXPLORE_HOSTS, isExploreHost, middleware } from '@/middleware';
import { isGameScene } from '@/game/save';
import { PWA_MANIFEST, SPLASH_SCREENS, splashPath, pwaMetadata } from '@/app/explore/pwa-meta';
import { SHOTS, shotSrc, shotPortraitSrc } from '@/app/explore/shots';

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const publicFile = (url: string) => path.join(PUBLIC, decodeURIComponent(new URL(url, 'http://x').pathname));

function req(url: string, host = 'stellarr.club') {
  return new NextRequest(new URL(url, `https://${host}`), { headers: { host } });
}
/** What the middleware asked Next to do with a request. */
function outcome(res: Response) {
  return {
    status: res.status,
    rewrite: res.headers.get('x-middleware-rewrite'),
    location: res.headers.get('location'),
    gameHeader: res.headers.get('x-middleware-request-x-stellar-game'),
    next: res.headers.get('x-middleware-next'),
  };
}

describe('middleware: the game and its platform page are their own documents', () => {
  it('flags /play as the game, as before', () => {
    const o = outcome(middleware(req('/play')));
    expect(o.gameHeader).toBe('1');
    expect(o.rewrite).toBeNull();
  });

  it('flags /explore as the platform page on the main site', () => {
    const o = outcome(middleware(req('/explore')));
    expect(o.gameHeader).toBe('site');
    expect(o.rewrite).toBeNull();
  });

  it('leaves the main site home page alone', () => {
    const o = outcome(middleware(req('/')));
    expect(o.gameHeader).toBeNull();
    expect(o.rewrite).toBeNull();
    expect(o.next).toBe('1');
  });

  it('keeps redirecting old surface deep links to the game', () => {
    const moon = outcome(middleware(req('/solar-system?moon=1')));
    expect(moon.status).toBe(307);
    expect(new URL(moon.location!).pathname).toBe('/play');
    expect(new URL(moon.location!).search).toBe('?moon=1');
    const land = outcome(middleware(req('/solar-system?land=mars')));
    expect(new URL(land.location!).pathname).toBe('/play');
    // The plain page is the website's.
    expect(outcome(middleware(req('/solar-system'))).location).toBeNull();
  });

  for (const host of EXPLORE_HOSTS) {
    it(`serves the platform page at / on ${host}`, () => {
      const o = outcome(middleware(req('/', host)));
      expect(o.gameHeader).toBe('site');
      expect(new URL(o.rewrite!).pathname).toBe('/explore');
      expect(new URL(o.rewrite!).host).toBe(host);
    });

    it(`keeps /play the game on ${host}`, () => {
      const o = outcome(middleware(req('/play?land=earth', host)));
      expect(o.gameHeader).toBe('1');
      expect(o.rewrite).toBeNull();
    });

    it(`sends "Exit to Stellar" from ${host} to the main site`, () => {
      const o = outcome(middleware(req('/solar-system', host)));
      expect(o.location).toBe('https://stellarr.club/solar-system');
      // A surface deep link there is still the game, on the same host.
      const deep = outcome(middleware(req('/solar-system?moon=1', host)));
      expect(new URL(deep.location!).host).toBe(host);
      expect(new URL(deep.location!).pathname).toBe('/play');
    });
  }

  it('matches hosts with a port, in any case, and only the listed ones', () => {
    expect(isExploreHost('Explore.Stellarr.Club:443')).toBe(true);
    expect(isExploreHost('explore.stellarr.club, proxy.internal')).toBe(true);
    expect(isExploreHost('stellarr.club')).toBe(false);
    expect(isExploreHost('evil-explore.stellarr.club.example.com')).toBe(false);
    expect(isExploreHost(null)).toBe(false);
  });

  it('honours ?site=explore outside production, to try the subdomain on localhost', () => {
    const o = outcome(middleware(req('/?site=explore', 'localhost:3000')));
    expect(o.gameHeader).toBe('site');
    expect(new URL(o.rewrite!).pathname).toBe('/explore');
  });

  it('keeps its matcher to the four pages that need it (never _next, api or files)', () => {
    expect(config.matcher).toEqual(['/', '/play', '/explore', '/solar-system']);
    for (const m of config.matcher) {
      expect(m).not.toMatch(/_next|api|\.|\(|\*/);
    }
  });
});

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = fs.readFileSync(file);
  expect(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  expect(b.toString('ascii', 12, 16)).toBe('IHDR');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(file: string): [number, number] {
  const b = fs.readFileSync(file);
  expect(b[0]).toBe(0xff);
  expect(b[1]).toBe(0xd8);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  throw new Error(`no SOF in ${file}`);
}

const imageSize = (file: string) => (file.endsWith('.png') ? pngSize(file) : jpegSize(file));

interface ManifestImage { src: string; sizes: string; type: string; purpose?: string; form_factor?: string }
const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, PWA_MANIFEST), 'utf8')) as {
  id: string; name: string; short_name: string; start_url: string; scope: string; display: string;
  display_override: string[]; orientation: string; background_color: string; theme_color: string;
  categories: string[]; icons: ManifestImage[]; screenshots: ManifestImage[];
  shortcuts: { name: string; url: string; icons?: ManifestImage[] }[];
};

describe('the web app manifest', () => {
  it('has what Chrome, Edge and Safari need to install it', () => {
    expect(manifest.id).toBe('/play'); // unchanged: installs made before keep their identity
    expect(manifest.name).toBe('Stellar Explore');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.start_url).toBe('/play');
    expect(manifest.display).toBe('fullscreen');
    expect(manifest.display_override).toEqual(['fullscreen', 'standalone']);
    expect(manifest.orientation).toBe('any');
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.categories).toEqual(['games', 'education']);
  });

  it('is scoped over both the game and its platform page', () => {
    const inScope = (p: string) => new URL(p, 'https://x').pathname.startsWith(manifest.scope);
    expect(inScope(manifest.start_url)).toBe(true);
    expect(inScope('/explore')).toBe(true);
    expect(inScope('/')).toBe(true); // the platform page on the game's own host
    expect(inScope(manifest.id)).toBe(true);
  });

  it('declares PNG icons at 192 and 512, and a maskable 512, that exist at those sizes', () => {
    const pick = (size: string, purpose: string) => manifest.icons.find((i) => i.sizes === size && (i.purpose ?? 'any').split(' ').includes(purpose));
    expect(pick('192x192', 'any')).toBeTruthy();
    expect(pick('512x512', 'any')).toBeTruthy();
    expect(pick('512x512', 'maskable')).toBeTruthy();
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const file = publicFile(icon.src);
      expect(fs.existsSync(file), icon.src).toBe(true);
      const [w, h] = pngSize(file);
      expect(`${w}x${h}`).toBe(icon.sizes);
    }
  });

  it('has real screenshots, wide and narrow, at their declared sizes', () => {
    const forms = new Set(manifest.screenshots.map((s) => s.form_factor));
    expect(forms).toEqual(new Set(['wide', 'narrow']));
    for (const s of manifest.screenshots) {
      const file = publicFile(s.src);
      expect(fs.existsSync(file), s.src).toBe(true);
      const [w, h] = imageSize(file);
      expect(`${w}x${h}`).toBe(s.sizes);
      // Chrome's rules: 320–3840 px, and no side more than 2.3 times the other.
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(320);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3);
      if (s.form_factor === 'wide') expect(w).toBeGreaterThan(h);
      else expect(h).toBeGreaterThan(w);
    }
  });

  it('has shortcuts that land on real routes the game understands', () => {
    const urls = manifest.shortcuts.map((s) => s.url);
    expect(urls).toEqual(['/play', '/play?moon=1', '/play?land=mars', '/play?land=earth']);
    for (const s of manifest.shortcuts) {
      const u = new URL(s.url, 'https://x');
      expect(fs.existsSync(path.join(ROOT, 'src/app', u.pathname, 'page.tsx')), u.pathname).toBe(true);
      const land = u.searchParams.get('land');
      if (land) expect(isGameScene(land), land).toBe(true);
      for (const icon of s.icons ?? []) {
        const [w, h] = pngSize(publicFile(icon.src));
        expect(`${w}x${h}`).toBe(icon.sizes);
      }
    }
  });
});

describe('iOS home screen', () => {
  it('has a 180px apple-touch-icon and the Apple meta tags', () => {
    const apple = pwaMetadata.icons as { apple: { url: string; sizes: string }[] };
    const [w, h] = pngSize(publicFile(apple.apple[0].url));
    expect([w, h]).toEqual([180, 180]);
    expect(pwaMetadata.other).toMatchObject({ 'apple-mobile-web-app-capable': 'yes' });
    expect(pwaMetadata.appleWebApp).toMatchObject({ capable: true, statusBarStyle: 'black-translucent' });
  });

  it('has a launch screen for each listed iPhone, upright and sideways, at the exact pixel size', () => {
    const startup = (pwaMetadata.appleWebApp as { startupImage: { url: string; media: string }[] }).startupImage;
    expect(startup).toHaveLength(SPLASH_SCREENS.length * 2);
    for (const s of SPLASH_SCREENS) {
      expect(s.w).toBe(s.cssW * s.dpr);
      expect(s.h).toBe(s.cssH * s.dpr);
      expect(jpegSize(publicFile(splashPath(s.w, s.h)))).toEqual([s.w, s.h]);
      expect(jpegSize(publicFile(splashPath(s.h, s.w)))).toEqual([s.h, s.w]);
    }
    for (const img of startup) {
      expect(img.media).toMatch(/^\(device-width: \d+px\) and \(device-height: \d+px\) and \(-webkit-device-pixel-ratio: [23]\) and \(orientation: (portrait|landscape)\)$/);
    }
  });
});

describe('platform page assets', () => {
  it('has every captured frame in AVIF and WebP at both widths', () => {
    for (const name of Object.keys(SHOTS) as (keyof typeof SHOTS)[]) {
      for (const w of [640, 1280] as const) {
        for (const ext of ['avif', 'webp'] as const) {
          expect(fs.existsSync(publicFile(shotSrc(name, w, ext))), `${name}-${w}.${ext}`).toBe(true);
        }
      }
    }
    for (const name of ['mars-entry', 'earth-entry', 'mars-descent', 'moon-jetpack', 'mars-suit', 'mars-orbit'] as const) {
      expect(fs.existsSync(publicFile(shotPortraitSrc(name, 'avif')))).toBe(true);
      expect(fs.existsSync(publicFile(shotPortraitSrc(name, 'webp')))).toBe(true);
    }
  });

  it('has a 1200×630 Open Graph image', () => {
    expect(jpegSize(path.join(PUBLIC, 'explore/site/og.jpg'))).toEqual([1200, 630]);
  });
});

describe('service worker', () => {
  const sw = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

  it('knows the same game hosts as the middleware', () => {
    const list = /const EXPLORE_HOSTS = \[([^\]]*)\]/.exec(sw)?.[1] ?? '';
    expect(list.match(/'[^']+'/g)?.map((s) => s.slice(1, -1))).toEqual([...EXPLORE_HOSTS]);
  });

  it('precaches files that exist', () => {
    const list = /const PRECACHE = \[([\s\S]*?)\];/.exec(sw)?.[1] ?? '';
    const urls = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(list).toMatch(/\bMANIFEST\b/);
    expect(sw).toContain(`const MANIFEST = '${PWA_MANIFEST}';`);
    urls.push(PWA_MANIFEST);
    for (const u of urls) expect(fs.existsSync(publicFile(u)), u).toBe(true);
  });

  it('still handles push notifications for the website', () => {
    expect(sw).toMatch(/addEventListener\('push'/);
    expect(sw).toMatch(/addEventListener\('notificationclick'/);
  });
});
