import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OBSERVER,
  LOCATION_STALE_MS,
  compassOffsetKey,
  distanceMeters,
  isLocationStale,
  locationBucket,
  movedSignificantly,
  parseStoredLocation,
} from '@/lib/observer-location';

describe('parseStoredLocation', () => {
  it('returns null for invalid JSON', () => {
    expect(parseStoredLocation('not-json')).toBeNull();
  });

  it('parses valid stored coords', () => {
    const raw = JSON.stringify({
      lat: 40.7,
      lon: -74.0,
      source: 'gps',
      city: 'NYC',
      region: 'north_america',
      country: 'US',
    });
    const loc = parseStoredLocation(raw);
    expect(loc?.lat).toBe(40.7);
    expect(loc?.lon).toBe(-74);
    expect(loc?.source).toBe('gps');
  });
});

describe('isLocationStale', () => {
  it('treats missing updatedAt as stale', () => {
    expect(isLocationStale({})).toBe(true);
  });

  it('is fresh within TTL', () => {
    const now = Date.now();
    expect(isLocationStale({ updatedAt: now - LOCATION_STALE_MS + 1000 }, now)).toBe(false);
  });

  it('is stale past TTL', () => {
    const now = Date.now();
    expect(isLocationStale({ updatedAt: now - LOCATION_STALE_MS - 1 }, now)).toBe(true);
  });
});

describe('locationBucket / compassOffsetKey', () => {
  it('buckets coords to ~1 km grid', () => {
    expect(locationBucket(41.7151, 44.8271)).toBe('4172_4483');
    expect(compassOffsetKey(41.7151, 44.8271)).toContain('4172_4483');
  });
});

describe('movedSignificantly', () => {
  it('detects moves over 400 m', () => {
    const a = DEFAULT_OBSERVER;
    const b = { lat: a.lat + 0.01, lon: a.lon };
    expect(movedSignificantly(a, b)).toBe(true);
  });

  it('ignores sub-100 m jitter', () => {
    const a = DEFAULT_OBSERVER;
    const b = { lat: a.lat + 0.0003, lon: a.lon + 0.0003 };
    expect(movedSignificantly(a, b)).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is zero for identical points', () => {
    expect(distanceMeters(41.7, 44.8, 41.7, 44.8)).toBe(0);
  });
});
