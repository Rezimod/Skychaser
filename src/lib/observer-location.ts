import type { UserLocation } from '@/lib/location';

export const STELLAR_LOCATION_KEY = 'stellar_location';
export const LOCATION_UPDATED_EVENT = 'stellar:location-updated';

/** Unified default observer — Astroman store, Tbilisi. */
export const DEFAULT_OBSERVER: UserLocation = {
  region: 'caucasus',
  country: 'GE',
  city: 'Tbilisi',
  lat: 41.7151,
  lon: 44.8271,
  source: 'default',
};

/**
 * Single source of truth for last-resort coordinates. Every client and server
 * fallback derives from `DEFAULT_OBSERVER` — do not introduce ad-hoc literals
 * (the app once carried three divergent "Tbilisi" pairs that disagreed by ~3 km).
 */
export const DEFAULT_LAT = DEFAULT_OBSERVER.lat;
export const DEFAULT_LON = DEFAULT_OBSERVER.lon;

/** Cached GPS/manual coords older than this are refreshed on app open. */
export const LOCATION_STALE_MS = 15 * 60 * 1000;

/** Fresh fix on session start / tab focus — no stale browser cache. */
export const GEO_FRESH: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15_000,
};

/** Background refresh while the app stays open. */
export const GEO_RELAXED: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 60_000,
  timeout: 10_000,
};

export type StoredObserverLocation = UserLocation & {
  updatedAt?: number;
  accuracyM?: number;
};

export function parseStoredLocation(raw: string | null): StoredObserverLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredObserverLocation;
    if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lon)) return null;
    return {
      ...DEFAULT_OBSERVER,
      ...parsed,
      lat: parsed.lat,
      lon: parsed.lon,
    };
  } catch {
    return null;
  }
}

export function persistObserverLocation(loc: StoredObserverLocation): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STELLAR_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    /* private mode */
  }
}

export function isLocationStale(loc: { updatedAt?: number }, now = Date.now()): boolean {
  if (loc.updatedAt == null || !Number.isFinite(loc.updatedAt)) return true;
  return now - loc.updatedAt > LOCATION_STALE_MS;
}

/** ~1 km grid — compass calibration is valid per observing site, not globally. */
export function locationBucket(lat: number, lon: number): string {
  return `${Math.round(lat * 100)}_${Math.round(lon * 100)}`;
}

export function compassOffsetKey(lat: number, lon: number): string {
  return `stellar.sky.compass.offset.${locationBucket(lat, lon)}`;
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True when the observer moved enough that sky geometry meaningfully changes. */
export function movedSignificantly(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  thresholdM = 400,
): boolean {
  return distanceMeters(a.lat, a.lon, b.lat, b.lon) > thresholdM;
}

export function dispatchLocationUpdated(loc: UserLocation): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<StoredObserverLocation>(LOCATION_UPDATED_EVENT, { detail: loc }),
  );
}

export async function reverseGeocode(lat: number, lon: number): Promise<{
  countryCode: string;
  city: string;
}> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`,
  );
  const data = (await res.json()) as {
    address?: { country_code?: string; city?: string; town?: string; state?: string };
  };
  const countryCode = (data.address?.country_code ?? '').toUpperCase();
  const city =
    data.address?.city ||
    data.address?.town ||
    data.address?.state ||
    '';
  return { countryCode, city };
}

export function readGpsPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
