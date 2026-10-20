'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  DEFAULT_OBSERVER,
  GEO_FRESH,
  GEO_RELAXED,
  dispatchLocationUpdated,
  isLocationStale,
  locationBucket,
  movedSignificantly,
  parseStoredLocation,
  persistObserverLocation,
  readGpsPosition,
  reverseGeocode,
  type StoredObserverLocation,
} from '@/lib/observer-location'
import { track } from '@/lib/track'

export type Region = 'caucasus' | 'north_america' | 'europe' | 'asia' | 'south_america' | 'global'

export interface UserLocation {
  region: Region
  country: string
  city: string
  lat: number
  lon: number
  source: 'gps' | 'manual' | 'default'
  /** Epoch ms when this fix was written. */
  updatedAt?: number
  /** Horizontal accuracy from Geolocation API, metres. */
  accuracyM?: number
}

const COUNTRY_TO_REGION: Record<string, Region> = {
  GE: 'caucasus', AM: 'caucasus', AZ: 'caucasus', TR: 'caucasus',
  IL: 'caucasus', JO: 'caucasus', LB: 'caucasus', IQ: 'caucasus',
  US: 'north_america', CA: 'north_america', MX: 'north_america',
  BR: 'south_america', AR: 'south_america', CL: 'south_america',
  CO: 'south_america', PE: 'south_america', VE: 'south_america',
  DE: 'europe', AT: 'europe', CH: 'europe', FR: 'europe',
  IT: 'europe', NL: 'europe', BE: 'europe', PL: 'europe',
  ES: 'europe', PT: 'europe', SE: 'europe', NO: 'europe',
  DK: 'europe', FI: 'europe', CZ: 'europe', HU: 'europe',
  RO: 'europe', GR: 'europe', BG: 'europe', HR: 'europe',
  SK: 'europe', SI: 'europe', IE: 'europe', GB: 'europe',
  UK: 'europe', UA: 'europe', RS: 'europe', LT: 'europe',
  LV: 'europe', EE: 'europe',
  JP: 'asia', KR: 'asia', CN: 'asia', IN: 'asia',
  TH: 'asia', SG: 'asia', MY: 'asia', ID: 'asia',
  PH: 'asia', VN: 'asia', PK: 'asia', BD: 'asia',
  LK: 'asia', MM: 'asia', KZ: 'asia', UZ: 'asia',
  TW: 'asia', HK: 'asia', MN: 'asia',
  AU: 'global', NZ: 'global',
}

export function getRegionForCountry(countryCode: string): Region {
  return COUNTRY_TO_REGION[countryCode.toUpperCase()] ?? 'global'
}

export type GpsState = 'pending' | 'resolved' | 'denied' | 'unsupported' | 'failed'

interface LocationContextValue {
  location: UserLocation
  setLocation: (loc: UserLocation) => void
  /** True while an active geolocation read is in flight. */
  loading: boolean
  /** True after localStorage hydration — safe to read cached coords. */
  hydrated: boolean
  /**
   * True when sky/compass APIs may use `location` — manual picks are instant;
   * GPS paths wait for the session's first fresh fix attempt to finish.
   */
  locationReady: boolean
  gpsState: GpsState
  isFallback: boolean
  requestLocation: (opts?: { fresh?: boolean }) => void
  /**
   * Request a GPS fix once per session for a surface that genuinely needs the
   * observer's position (sky / missions / marketplace / observe). No-op if the
   * user already picked a city manually, or if we've already prompted this
   * session. Entry pages (home, etc.) never call this — the permission prompt
   * is deferred so first load stays barrier-free on iOS/Android.
   */
  ensureLocation: () => void
}

const LocationContext = createContext<LocationContextValue | null>(null)

function toStored(loc: UserLocation, accuracyM?: number): StoredObserverLocation {
  return {
    ...loc,
    updatedAt: Date.now(),
    accuracyM,
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocationState] = useState<UserLocation>(DEFAULT_OBSERVER)
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [locationReady, setLocationReady] = useState(false)
  const [gpsState, setGpsState] = useState<GpsState>('pending')
  const gpsInFlightRef = useRef(false)
  const autoPromptedRef = useRef(false)
  const lastTrackedBucketRef = useRef<string | null>(null)

  const commitLocation = useCallback((loc: StoredObserverLocation) => {
    persistObserverLocation(loc)
    setLocationState(loc)
    dispatchLocationUpdated(loc)
    // Analytics: a real (non-default) location was set. De-noised by ~1km
    // bucket so tab-focus GPS re-syncs at the same spot don't spam the funnel.
    if (loc.source !== 'default') {
      const bucket = locationBucket(loc.lat, loc.lon)
      if (bucket !== lastTrackedBucketRef.current) {
        lastTrackedBucketRef.current = bucket
        track('location_set', { source: loc.source, city: loc.city, country: loc.country })
      }
    }
  }, [])

  const applyGpsFix = useCallback(
    async (pos: GeolocationPosition) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords
      const { countryCode, city } = await reverseGeocode(lat, lon)
      const loc: StoredObserverLocation = toStored(
        {
          region: getRegionForCountry(countryCode),
          country: countryCode,
          city,
          lat,
          lon,
          source: 'gps',
        },
        Number.isFinite(accuracy) ? accuracy : undefined,
      )
      commitLocation(loc)
      setGpsState('resolved')
    },
    [commitLocation],
  )

  const requestLocation = useCallback((opts?: { fresh?: boolean }) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsState('unsupported')
      setLocationReady(true)
      return
    }
    if (gpsInFlightRef.current) return
    gpsInFlightRef.current = true
    setLoading(true)

    const options = opts?.fresh ? GEO_FRESH : GEO_RELAXED
    readGpsPosition(options)
      .then((pos) => applyGpsFix(pos))
      .catch((err: GeolocationPositionError | Error) => {
        const code = 'code' in err ? err.code : -1
        if (code === 1) setGpsState('denied')
        else setGpsState('failed')
      })
      .finally(() => {
        gpsInFlightRef.current = false
        setLoading(false)
        setLocationReady(true)
      })
  }, [applyGpsFix])

  // Session bootstrap: hydrate cached coords only. We never prompt for GPS on
  // entry — the browser permission request is deferred to ensureLocation(),
  // which the sky / missions / marketplace / observe surfaces call when they
  // actually need the observer's position. This keeps first load barrier-free
  // on iOS/Android. With a stored fix we render those coords; without one we
  // render the Tbilisi default. Either way locationReady flips true so data
  // that gates on it (sky forecast, etc.) loads immediately with a fallback.
  useEffect(() => {
    const stored = parseStoredLocation(
      typeof window !== 'undefined' ? localStorage.getItem('stellar_location') : null,
    )
    if (stored) {
      setLocationState(stored)
      setGpsState('resolved')
    }
    setHydrated(true)
    setLocationReady(true)
  }, [])

  // Re-sync observer position when the user returns to the tab — but only for
  // an already-granted GPS fix (re-reading needs no new prompt). Default and
  // manual locations are left untouched so returning to a tab never triggers a
  // permission request the user didn't ask for.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (location.source !== 'gps') return
      requestLocation({ fresh: true })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [location.source, requestLocation])

  const setLocation = useCallback(
    (loc: UserLocation) => {
      const stored = toStored({ ...loc, source: loc.source === 'default' ? 'manual' : loc.source })
      // An explicit pick should never be overwritten by a deferred auto-prompt.
      autoPromptedRef.current = true
      commitLocation(stored)
      setGpsState('resolved')
      setLocationReady(true)
    },
    [commitLocation],
  )

  const ensureLocation = useCallback(() => {
    if (!hydrated || autoPromptedRef.current) return
    autoPromptedRef.current = true
    // Respect an explicit manual city pick; otherwise request a fresh fix.
    if (location.source === 'manual') return
    requestLocation({ fresh: true })
  }, [hydrated, location.source, requestLocation])

  const isFallback =
    locationReady &&
    location.source !== 'manual' &&
    (gpsState === 'denied' ||
      gpsState === 'unsupported' ||
      (gpsState === 'failed' && location.source === 'default'))

  const value = useMemo(
    () => ({
      location,
      setLocation,
      loading,
      hydrated,
      locationReady,
      gpsState,
      isFallback,
      requestLocation,
      ensureLocation,
    }),
    [location, setLocation, loading, hydrated, locationReady, gpsState, isFallback, requestLocation, ensureLocation],
  )

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext)
  if (!ctx) throw new Error('useLocation must be used inside LocationProvider')
  return ctx
}

/** @internal — tests only */
export function __locationMovedSignificantly(a: UserLocation, b: UserLocation): boolean {
  return movedSignificantly(a, b)
}

/** @internal — tests only */
export function __locationIsStale(loc: UserLocation): boolean {
  return isLocationStale(loc)
}
