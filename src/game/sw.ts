// One service worker for the whole site: push for the website, an offline
// cache for the game and its platform page (the installed app). The build id
// in the URL is what versions the cache.

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const SW_URL = `/sw.js?v=${BUILD}`;
/** "/" so one worker covers the game (/play), its platform page (/explore,
 *  or "/" on the game's own host) and the website's push notifications. */
export const SW_SCOPE = '/';
const CACHED = ['/_next/static/', '/explore/', '/solar-system/', '/brand/'];

/** Everything this page has already fetched that the worker would cache:
 *  on a first visit the worker was not in control while it loaded, so the
 *  page hands the list over and the game works offline from the next launch. */
function loadedAssets(): string[] {
  const origin = window.location.origin;
  return performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => u.startsWith(origin) && CACHED.some((p) => u.startsWith(origin + p)));
}

/** Tell the worker in control which build this page is: a worker from an
 *  older deploy then stops serving this page last deploy's assets, and
 *  fetches its replacement. */
function announceBuild() {
  try {
    navigator.serviceWorker.controller?.postMessage({ type: 'build', build: BUILD });
  } catch {
    // No worker in control yet: nothing stale to warn.
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    announceBuild();
    // updateViaCache 'none': the browser always asks the server for sw.js, so a deploy is seen at once.
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    // A worker that took over after this page loaded (first visit, or a new deploy) learns the build too.
    navigator.serviceWorker.addEventListener('controllerchange', announceBuild);
    const worker = reg.active;
    if (worker) {
      const send = () => worker.postMessage({ type: 'cache', urls: loadedAssets() });
      send();
      // The game chunk and its models arrive after this runs; send again once the page has settled.
      window.setTimeout(send, 8000);
    }
    return reg;
  } catch {
    return null;
  }
}
