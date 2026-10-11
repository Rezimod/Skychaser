/* Stellar service worker: Web Push for the site, an offline cache for the game
 * and its platform page (the installed Stellar Explore app).
 * Registered as /sw.js?v=<build id> with scope "/"; the id names the cache, so a
 * new build installs a new worker and the old caches go on activate.
 *
 * Updates: every page that registers the worker (src/game/sw.ts) first tells
 * the worker in control which build it is. A page from a newer build than the
 * worker makes it stop answering the game's unversioned assets (/explore/,
 * /solar-system/, /brand/) from its old cache, so a new page never runs
 * against last deploy's models, until the new worker (which the page is
 * registering at that moment) takes over. Hashed /_next/static/ files are safe to serve from any version; the
 * previous build's cache is kept one deploy longer so a tab still running it
 * can load its remaining chunks. */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const PREFIX = 'stellar-play-';
const CACHE = `${PREFIX}${VERSION}`;
/* Which builds have caches, newest last: the current one and the one before stay. */
const META = 'stellar-meta';
const VERSIONS_KEY = '/__stellar/versions';

const GAME_PAGE = '/play';
const SITE_PAGE = '/explore';
/* Hosts where "/" is the platform page (keep in step with EXPLORE_HOSTS in src/middleware.ts). */
const EXPLORE_HOSTS = ['explore.stellarr.club', 'play.stellarr.club'];
const MANIFEST = '/play.webmanifest';
/* Fetched on install so the installed app opens offline with its icons. */
const PRECACHE = [
  MANIFEST,
  '/explore/site/icons/icon-192.png',
  '/explore/site/icons/icon-512.png',
  '/explore/site/icons/icon-maskable-512.png',
  '/explore/site/icons/apple-touch-icon-180.png',
];
/* Same-origin paths kept cache-first: the game's code and its assets. API
 * routes and everything else on the site go straight to the network. */
const CACHED_PREFIXES = ['/_next/static/', '/explore/', '/solar-system/', '/brand/'];
const HASHED_PREFIX = '/_next/static/';

/* The build each open page has reported (client id → build id). A page that
 * is not this worker's build gets its unversioned assets from the network. */
const pageBuilds = new Map();
const stale = (clientId) => {
  const build = clientId ? pageBuilds.get(clientId) : undefined;
  return build !== undefined && VERSION !== 'dev' && build !== VERSION;
};

const readVersions = () => caches.open(META)
  .then((c) => c.match(VERSIONS_KEY))
  .then((r) => (r ? r.json() : []))
  .catch(() => []);
const writeVersions = (list) => caches.open(META)
  .then((c) => c.put(VERSIONS_KEY, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } })));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all([
        cache.add(new Request(GAME_PAGE, { cache: 'reload' })).catch(() => undefined),
        cache.add(new Request(SITE_PAGE, { cache: 'reload' })).catch(() => undefined),
        ...PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => undefined)),
      ]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    readVersions()
      .then((list) => {
        const order = list.filter((v) => v !== VERSION).concat(VERSION);
        const keep = new Set(order.slice(-2).map((v) => PREFIX + v));
        return writeVersions(order.slice(-2)).then(() => caches.keys()).then((keys) => Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && !keep.has(k)).map((k) => caches.delete(k)),
        ));
      })
      .then(() => self.clients.claim()),
  );
});

/* A hashed file: this build's cache, then the one before (a tab still on it), then the network. */
const hashedFirst = (event) => caches.open(CACHE).then((cache) => cache.match(event.request, { ignoreSearch: true })
  .then((hit) => hit || caches.match(event.request, { ignoreSearch: true }))
  .then((hit) => hit || fetch(event.request).then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  })));

/* An unversioned asset (models, textures): cache-first for a page of this worker's build;
 * the network first for a page of another build (the cache only when offline).
 * Query strings are only the dev server's. */
const assetFirst = (event) => caches.open(CACHE).then((cache) => {
  const cached = () => cache.match(event.request, { ignoreSearch: true });
  if (stale(event.clientId)) return fetch(event.request).catch(() => cached().then((hit) => hit || Response.error()));
  return cached().then((hit) => hit || fetch(event.request).then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  }));
});

/* An app document: the network when it is there (and the copy is refreshed),
 * the last copy when it is not; the game page is the last resort for both. */
const documentNetworkFirst = (event, key) =>
  caches.open(CACHE).then((cache) => fetch(event.request).then((res) => {
    if (res.ok && res.type === 'basic' && !res.redirected) cache.put(key, res.clone());
    return res;
  }).catch(() => cache.match(key)
    .then((hit) => hit || caches.match(key))
    .then((hit) => hit || cache.match(GAME_PAGE))
    .then((hit) => hit || caches.match(GAME_PAGE))
    .then((hit) => hit || Response.error())));

/* Which cached document a navigation is: the game, the platform page, or neither. */
const documentKey = (url) => {
  if (url.pathname === GAME_PAGE) return GAME_PAGE;
  if (url.pathname === SITE_PAGE) return SITE_PAGE;
  if (url.pathname === '/' && (EXPLORE_HOSTS.includes(self.location.hostname) || url.searchParams.get('site') === 'explore')) return SITE_PAGE;
  return null;
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    const key = documentKey(url);
    if (key) event.respondWith(documentNetworkFirst(event, key));
    return;
  }
  if (url.pathname === MANIFEST) {
    // The manifest: fresh when online (installs pick up changes), cached when not.
    event.respondWith(caches.open(CACHE).then((cache) => fetch(req).then((res) => {
      if (res.ok) cache.put(MANIFEST, res.clone());
      return res;
    }).catch(() => cache.match(MANIFEST).then((hit) => hit || caches.match(MANIFEST)).then((hit) => hit || Response.error()))));
    return;
  }
  if (url.pathname.startsWith(HASHED_PREFIX)) {
    event.respondWith(hashedFirst(event));
    return;
  }
  if (CACHED_PREFIXES.some((p) => url.pathname.startsWith(p))) event.respondWith(assetFirst(event));
});

/* The page says which build it is, and what it loaded before the worker was in control. */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const clientId = event.source && event.source.id;
  if (data.type === 'build' && typeof data.build === 'string') {
    if (pageBuilds.size > 64) pageBuilds.clear(); // closed tabs never say goodbye
    if (clientId) pageBuilds.set(clientId, data.build);
    // A page from a newer deploy: fetch the new worker now rather than at the next check.
    if (stale(clientId)) event.waitUntil(self.registration.update().catch(() => undefined));
    return;
  }
  if (data.type !== 'cache' || !Array.isArray(data.urls) || stale(clientId)) return;
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(
    data.urls.map((url) => cache.match(url).then((hit) => hit || cache.add(url).catch(() => undefined))),
  )));
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data && event.data.text ? event.data.text() : '' };
  }
  const title = data.title || 'Stellar';
  const options = {
    body: data.body || '',
    icon: data.icon || '/apple-touch-icon.png',
    badge: '/icon.svg',
    tag: data.tag || 'stellar',
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
