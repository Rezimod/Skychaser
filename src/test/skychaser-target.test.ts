import { afterEach, describe, expect, it } from 'vitest';
import { getTonightDarkWindow } from '@/lib/dark-window';
import { NODES } from '@/lib/observatory/nodes';
import { siteDateStamp, siteLocalHours } from '@/lib/observatory/site-time';
import { pickTonightsTarget, siteDarkWindow, siteNightDate } from '@/lib/skychaser/target';
import { TYCHO } from '@/lib/skychaser/tycho';

const node = NODES[0];
const NIGHT = '2026-09-20';

const RUNTIME_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = RUNTIME_TZ;
});

describe('the night at Tbilisi', () => {
  it('is the same night whatever zone the server runs in', () => {
    const windows = ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo'].map((tz) => {
      process.env.TZ = tz;
      return siteDarkWindow(node, NIGHT);
    });

    for (const w of windows) {
      expect(w.duskStart?.toISOString()).toBe(windows[0].duskStart?.toISOString());
      expect(w.dawnEnd?.toISOString()).toBe(windows[0].dawnEnd?.toISOString());
    }
    const { duskStart, dawnEnd } = windows[0];
    // Dusk on the evening of the 20th and dawn on the morning of the 21st, on
    // Tbilisi's clock: around 20:00 and 05:45.
    expect(siteDateStamp(node.timezone, duskStart!)).toBe('2026-09-20');
    expect(siteDateStamp(node.timezone, dawnEnd!)).toBe('2026-09-21');
    expect(siteLocalHours(node.timezone, duskStart!)).toBeGreaterThan(19.5);
    expect(siteLocalHours(node.timezone, duskStart!)).toBeLessThan(20.5);
  });

  it('is tonight, not last night, at 15:00 in Tbilisi on a UTC server', () => {
    process.env.TZ = 'UTC';
    // 11:00 UTC is 15:00 in Tbilisi. The runtime's clock says morning and
    // hands back the night that already ended; the site's clock does not.
    const at = new Date('2026-09-20T11:00:00Z');
    const runtime = getTonightDarkWindow(node.lat, node.lon, at);
    const site = getTonightDarkWindow(node.lat, node.lon, at, node.timezone);

    expect(siteDateStamp(node.timezone, runtime.duskStart!)).toBe('2026-09-19');
    expect(siteDateStamp(node.timezone, site.duskStart!)).toBe('2026-09-20');
  });

  it('files the small hours under the evening they belong to', () => {
    expect(siteNightDate(node.timezone, new Date('2026-09-20T16:30:00Z'))).toBe('2026-09-20');
    // 01:30 on the 21st in Tbilisi.
    expect(siteNightDate(node.timezone, new Date('2026-09-20T21:30:00Z'))).toBe('2026-09-20');
  });
});

describe('the night west of Greenwich', () => {
  // Midday UTC is five in the morning in Los Angeles; the night of the 20th
  // must still start on the evening of the 20th there, not the 19th.
  const west = { ...node, lat: 34.05, lon: -118.24, timezone: 'America/Los_Angeles' };

  it('is the evening of the date asked for, whatever zone the server runs in', () => {
    for (const tz of ['UTC', 'Asia/Tbilisi', 'Pacific/Honolulu']) {
      process.env.TZ = tz;
      const { duskStart, dawnEnd } = siteDarkWindow(west, NIGHT);
      expect(siteDateStamp(west.timezone, duskStart!), tz).toBe('2026-09-20');
      expect(siteDateStamp(west.timezone, dawnEnd!), tz).toBe('2026-09-21');
      expect(siteLocalHours(west.timezone, duskStart!)).toBeGreaterThan(19);
      expect(siteLocalHours(west.timezone, duskStart!)).toBeLessThan(21);
    }
  });
});

describe('choosing tonight’s card', () => {
  const cards = [
    TYCHO,
    { designation: 'RING', targetId: 'm57', observationStatus: 'dedicated' },
    // M31 stands higher than anything else that night, and must still lose.
    { designation: 'ANDROMEDA', targetId: 'm31', observationStatus: 'not_available' },
    // Eligible on paper, but Live Telescope V1 carries no such target.
    { designation: 'EUROPA', targetId: 'europa', observationStatus: 'eligible' },
  ];

  it('takes the eligible card that stands highest inside the safety envelope', () => {
    const pick = pickTonightsTarget(cards, node, NIGHT);

    expect(pick?.card.designation).toBe('RING');
    expect(pick!.altitudeDeg).toBeGreaterThan(80);
    expect(pick!.altitudeDeg).toBeLessThanOrEqual(85);
    expect(siteDateStamp(node.timezone, pick!.at)).toBe(NIGHT);
    expect(pick!.decisionBasis).toMatch(/^RING: Ring Nebula reaches 80\.\d° at \d\d:\d\d local time/);
    expect(pick!.decisionBasis).toContain('among 2 observable cards');
  });

  it('works the Moon only while it is above the envelope and inside the operator’s hours', () => {
    const pick = pickTonightsTarget([TYCHO], node, NIGHT)!;
    expect(pick.altitudeDeg).toBeGreaterThanOrEqual(20);
    const local = siteLocalHours(node.timezone, pick.at);
    expect(local >= 20 || local < 2).toBe(true);
  });

  it('answers null when nothing on the list can be observed', () => {
    expect(pickTonightsTarget(cards.slice(2), node, NIGHT)).toBeNull();
    // A waxing crescent that sets in twilight on the 19th.
    expect(pickTonightsTarget([TYCHO], node, '2026-09-19')).toBeNull();
  });
});
