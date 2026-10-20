/**
 * Unit tests for Stage 5 frontend error state logic.
 * Tests pure functions extracted from the modified pages.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Proof page: isSafePhoto ─────────────────────────────────────────────────

const isSafePhoto = (url: string) =>
  url.startsWith('data:image/jpeg;base64,') ||
  url.startsWith('data:image/png;base64,') ||
  url.startsWith('data:image/webp;base64,') ||
  url.startsWith('blob:') ||
  url.startsWith('/images/') ||
  (url.startsWith('https://') && (
    url.includes('vercel.app') ||
    url.includes('supabase.co') ||
    url.includes('cloudinary.com') ||
    url.includes('s3.amazonaws.com')
  ));

describe('isSafePhoto', () => {
  it('accepts base64 jpeg', () => {
    expect(isSafePhoto('data:image/jpeg;base64,/9j/')).toBe(true);
  });

  it('accepts base64 png', () => {
    expect(isSafePhoto('data:image/png;base64,iVBOR')).toBe(true);
  });

  it('accepts base64 webp', () => {
    expect(isSafePhoto('data:image/webp;base64,UklGR')).toBe(true);
  });

  it('accepts blob URLs', () => {
    expect(isSafePhoto('blob:http://localhost/abc-123')).toBe(true);
  });

  it('accepts local image paths', () => {
    expect(isSafePhoto('/images/placeholder-nft.svg')).toBe(true);
  });

  it('accepts Vercel CDN URLs', () => {
    expect(isSafePhoto('https://stellar.vercel.app/obs/photo.jpg')).toBe(true);
  });

  it('accepts Supabase storage URLs', () => {
    expect(isSafePhoto('https://abc.supabase.co/storage/v1/object/photo.jpg')).toBe(true);
  });

  it('accepts Cloudinary URLs', () => {
    expect(isSafePhoto('https://res.cloudinary.com/stellar/image/upload/photo.jpg')).toBe(true);
  });

  it('accepts S3 URLs', () => {
    expect(isSafePhoto('https://bucket.s3.amazonaws.com/photo.jpg')).toBe(true);
  });

  it('rejects arbitrary https URLs', () => {
    expect(isSafePhoto('https://malicious.com/xss.jpg')).toBe(false);
  });

  it('rejects http URLs', () => {
    expect(isSafePhoto('http://example.com/photo.jpg')).toBe(false);
  });

  it('rejects javascript: URIs', () => {
    expect(isSafePhoto('javascript:alert(1)')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafePhoto('')).toBe(false);
  });
});

// ─── Leaderboard: walletColor ─────────────────────────────────────────────────

function walletColor(wallet: string): string {
  const hex = wallet.replace(/^0x/, '').slice(0, 6).padEnd(6, '0');
  return `hsl(${Math.round(parseInt(hex, 16) * 1.4) % 360}, 60%, 55%)`;
}

describe('walletColor', () => {
  it('returns a valid hsl string', () => {
    const color = walletColor('AbCdEfGhIj');
    expect(color).toMatch(/^hsl\(\d+, 60%, 55%\)$/);
  });

  it('produces consistent output for same input', () => {
    const c1 = walletColor('7xKFo9p2mR3nLQeD5vBy1');
    const c2 = walletColor('7xKFo9p2mR3nLQeD5vBy1');
    expect(c1).toBe(c2);
  });

  it('produces different colors for different wallets', () => {
    const c1 = walletColor('AAAAAAAAAA');
    const c2 = walletColor('BBBBBBBBBB');
    expect(c1).not.toBe(c2);
  });

  it('hue stays within 0–359', () => {
    const wallets = ['FFFFFF1234', '000000ABCD', 'abcdef9876', '111111xxxx'];
    for (const w of wallets) {
      const match = walletColor(w).match(/hsl\((\d+),/);
      const hue = parseInt(match![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('strips 0x prefix if present', () => {
    const withPrefix = walletColor('0xAbCdEf1234');
    const withoutPrefix = walletColor('AbCdEf1234');
    expect(withPrefix).toBe(withoutPrefix);
  });
});

// ─── Profile: activity feed sort ──────────────────────────────────────────────

interface ActivityItem {
  key: string;
  date: string | null | undefined;
}

function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((a, b) =>
    new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  );
}

describe('activity feed sort', () => {
  it('sorts by date descending', () => {
    const items: ActivityItem[] = [
      { key: 'old', date: '2026-01-01T00:00:00Z' },
      { key: 'new', date: '2026-04-15T10:00:00Z' },
      { key: 'mid', date: '2026-02-20T08:00:00Z' },
    ];
    const sorted = sortActivity(items);
    expect(sorted.map(i => i.key)).toEqual(['new', 'mid', 'old']);
  });

  it('handles null dates without throwing', () => {
    const items: ActivityItem[] = [
      { key: 'a', date: '2026-04-15T10:00:00Z' },
      { key: 'b', date: null },
      { key: 'c', date: undefined },
    ];
    expect(() => sortActivity(items)).not.toThrow();
    // items with valid date should appear before null/undefined
    const sorted = sortActivity(items);
    expect(sorted[0].key).toBe('a');
  });

  it('handles ISO timestamp and date-only strings', () => {
    const items: ActivityItem[] = [
      { key: 'ts', date: '2026-04-10T22:30:00.000Z' },
      { key: 'date', date: '2026-04-15' },
    ];
    const sorted = sortActivity(items);
    expect(sorted[0].key).toBe('date');
  });
});

// ─── Learn: events date UTC fix ───────────────────────────────────────────────

describe('events date comparison (UTC fix)', () => {
  it('T12:00:00Z gives consistent result across timezones', () => {
    const dateStr = '2026-06-15';
    const ts = new Date(dateStr + 'T12:00:00Z').getTime();
    // Should be a specific UTC noon, not ambiguous local time
    const utcHour = new Date(ts).getUTCHours();
    expect(utcHour).toBe(12);
  });

  it('correctly filters future events', () => {
    const now = new Date('2026-04-16T00:00:00Z').getTime();
    const events = [
      { date: '2026-04-10', name: 'past' },
      { date: '2026-04-20', name: 'future' },
    ];
    const upcoming = events.filter(e => new Date(e.date + 'T12:00:00Z').getTime() >= now);
    expect(upcoming.map(e => e.name)).toEqual(['future']);
  });
});

// ─── DarkSky: dynamic stats computation ───────────────────────────────────────

interface Location {
  name: string;
  region: string;
  bortle: number;
}

function computeDarkSkyStats(locations: Location[]) {
  return {
    totalSites: locations.length,
    darkSites: locations.filter(l => l.bortle <= 3).length,
    regions: new Set(locations.map(l => l.region)).size,
  };
}

describe('DarkSky dynamic stats', () => {
  const testLocations: Location[] = [
    { name: 'Kazbegi', region: 'Georgia', bortle: 2 },
    { name: 'Mestia', region: 'Georgia', bortle: 2 },
    { name: 'Tbilisi', region: 'Georgia', bortle: 8 },
    { name: 'Cherry Springs', region: 'USA', bortle: 2 },
    { name: 'Death Valley', region: 'USA', bortle: 1 },
    { name: 'Black Forest', region: 'Germany', bortle: 4 },
  ];

  it('counts total sites correctly', () => {
    expect(computeDarkSkyStats(testLocations).totalSites).toBe(6);
  });

  it('counts dark sites (bortle ≤3) correctly', () => {
    expect(computeDarkSkyStats(testLocations).darkSites).toBe(4); // Kazbegi, Mestia, Cherry Springs, Death Valley
  });

  it('counts unique regions correctly', () => {
    expect(computeDarkSkyStats(testLocations).regions).toBe(3); // Georgia, USA, Germany
  });

  it('handles empty array', () => {
    const stats = computeDarkSkyStats([]);
    expect(stats.totalSites).toBe(0);
    expect(stats.darkSites).toBe(0);
    expect(stats.regions).toBe(0);
  });

  it('bortle boundary: 3 is dark, 4 is not', () => {
    const locs: Location[] = [
      { name: 'A', region: 'X', bortle: 3 },
      { name: 'B', region: 'X', bortle: 4 },
    ];
    expect(computeDarkSkyStats(locs).darkSites).toBe(1);
  });
});

// ─── Profile: all-APIs-failed detection ───────────────────────────────────────

describe('Promise.allSettled all-failed detection', () => {
  it('detects all rejected', async () => {
    const results = await Promise.allSettled([
      Promise.reject(new Error('api 1 failed')),
      Promise.reject(new Error('api 2 failed')),
      Promise.reject(new Error('api 3 failed')),
    ]);
    expect(results.every(r => r.status === 'rejected')).toBe(true);
  });

  it('does not flag partial failures as all-failed', async () => {
    const results = await Promise.allSettled([
      Promise.resolve('ok'),
      Promise.reject(new Error('failed')),
      Promise.resolve('ok'),
    ]);
    expect(results.every(r => r.status === 'rejected')).toBe(false);
  });

  it('does not flag all-success as all-failed', async () => {
    const results = await Promise.allSettled([
      Promise.resolve(42),
      Promise.resolve(100),
      Promise.resolve(0),
    ]);
    expect(results.every(r => r.status === 'rejected')).toBe(false);
  });
});

// ─── Email validation (home page fix) ─────────────────────────────────────────

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

describe('email validation', () => {
  it('accepts standard email', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });

  it('accepts email with subdomain', () => {
    expect(isValidEmail('user@mail.example.co.uk')).toBe(true);
  });

  it('accepts email with plus sign', () => {
    expect(isValidEmail('user+tag@example.com')).toBe(true);
  });

  it('rejects missing @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('rejects single-char TLD', () => {
    expect(isValidEmail('user@example.c')).toBe(false);
  });

  it('rejects email with spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('is more strict than includes("@") check', () => {
    // old check would pass this
    expect(isValidEmail('@invalid')).toBe(false);
  });
});

// ─── NFTs: mission ID matching ─────────────────────────────────────────────────

interface MissionDef { id: string; name: string; }
interface NftAttr { trait_type: string; value: string | number; }

function getAttr(attrs: NftAttr[] | undefined, key: string): string {
  return String(attrs?.find(a => a.trait_type === key)?.value ?? '');
}

function resolveOwnedMissionId(attrs: NftAttr[] | undefined, missions: MissionDef[]): string | undefined {
  const missionId = getAttr(attrs, 'Mission-ID');
  if (missionId && missions.find(m => m.id === missionId)) return missionId;
  const target = getAttr(attrs, 'Target');
  return missions.find(m => m.name.toLowerCase() === target.toLowerCase())?.id;
}

describe('NFT mission ID matching', () => {
  const missions: MissionDef[] = [
    { id: 'moon', name: 'Moon' },
    { id: 'jupiter', name: 'Jupiter' },
    { id: 'saturn', name: 'Saturn' },
  ];

  it('matches by Mission-ID attribute first', () => {
    const attrs: NftAttr[] = [
      { trait_type: 'Mission-ID', value: 'moon' },
      { trait_type: 'Target', value: 'Different Name' },
    ];
    expect(resolveOwnedMissionId(attrs, missions)).toBe('moon');
  });

  it('falls back to name matching when Mission-ID absent', () => {
    const attrs: NftAttr[] = [
      { trait_type: 'Target', value: 'Jupiter' },
    ];
    expect(resolveOwnedMissionId(attrs, missions)).toBe('jupiter');
  });

  it('name matching is case-insensitive', () => {
    const attrs: NftAttr[] = [
      { trait_type: 'Target', value: 'SATURN' },
    ];
    expect(resolveOwnedMissionId(attrs, missions)).toBe('saturn');
  });

  it('returns undefined for unknown target', () => {
    const attrs: NftAttr[] = [
      { trait_type: 'Target', value: 'Pluto' },
    ];
    expect(resolveOwnedMissionId(attrs, missions)).toBeUndefined();
  });

  it('ignores Mission-ID if not in known missions list', () => {
    const attrs: NftAttr[] = [
      { trait_type: 'Mission-ID', value: 'unknown-mission-xyz' },
      { trait_type: 'Target', value: 'Moon' },
    ];
    // Should fall through to name match
    expect(resolveOwnedMissionId(attrs, missions)).toBe('moon');
  });

  it('handles undefined attrs gracefully', () => {
    expect(resolveOwnedMissionId(undefined, missions)).toBeUndefined();
  });
});
