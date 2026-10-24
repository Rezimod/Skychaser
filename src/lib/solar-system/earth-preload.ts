// Tbilisi's data, fetched and prepared while the ship is still on its way
// in. The approach takes long enough for the download and the city's sliced
// preparation to finish, so by the time the ship dives into the air the
// surface only has to make its meshes. The surface takes the result (or the
// promise still in flight) when it mounts; a ship that pulls away lets it go.

import { loadTbilisi, type EarthData } from '@/lib/solar-system/world-earth-data';
import { prepareEarthCity } from '@/lib/solar-system/world-earth';

interface Pending { promise: Promise<EarthData>; abort: AbortController; lite: boolean }

let pending: Pending | null = null;

/** Start (or keep) fetching and preparing Earth for this quality. */
export function preloadEarth(lite: boolean): Promise<EarthData> {
  if (pending && pending.lite === lite) return pending.promise;
  cancelEarthPreload();
  const abort = new AbortController();
  const promise = loadTbilisi(abort.signal)
    .then((data) => prepareEarthCity(data, { lite, signal: abort.signal }).then((prepared) => ({ ...data, prepared })));
  const mine: Pending = { promise, abort, lite };
  // A failure is the surface's to report when it asks; a later ask starts over.
  promise.catch(() => { if (pending === mine) pending = null; });
  pending = mine;
  return promise;
}

/** The surface takes the preload over (it now owns the abort), or null if none is running for this quality. */
export function takeEarthPreload(lite: boolean): { promise: Promise<EarthData>; abort: AbortController } | null {
  if (!pending || pending.lite !== lite) return null;
  const taken = pending;
  pending = null;
  return { promise: taken.promise, abort: taken.abort };
}

/** The ship has pulled away: stop and let the data go. */
export function cancelEarthPreload() {
  if (!pending) return;
  pending.abort.abort();
  pending = null;
}

export function earthPreloading(): boolean {
  return pending !== null;
}
