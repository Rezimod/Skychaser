/**
 * The telescopes the live console lists.
 *
 * One is the network's real node and the only one that connects; the rest
 * are stations still to come, listed as coming soon. Every station is a full
 * ObservatoryNode, so the safety envelope, the optics and the sky model all
 * run on it unchanged — the only thing simulated is the photons.
 */

import { getSunAltitude } from '@/lib/dark-window';
import { LIMITS } from './safety';
import { NODES } from './nodes';
import type { Instrument, ObservatoryNode } from './types';

export type Station = ObservatoryNode & {
  /** Metres above sea level, for the location readout. */
  elevationM: number;
  simulated: boolean;
  /** Not open yet: listed, never connectable. */
  soon?: boolean;
  /** Replaces "Coming soon" when the opening is known. */
  soonNote?: string;
};

/** Minutes of telescope time a connection buys in the console. */
export const SESSION_MINUTES = 120;

const NEXSTAR_8SE: Instrument = {
  optics: 'Celestron NexStar 8SE',
  apertureMm: 203,
  focalLengthMm: 2032,
  mount: 'Single-fork altazimuth, GoTo',
  camera: 'ZWO ASI585MC',
  sensorWidthMm: 11.18,
  sensorHeightMm: 6.32,
  pixelSizeUm: 2.9,
  suitedTo: ['Moon', 'Planets', 'BrightDeepSky'],
};

const EVOLUTION_925: Instrument = {
  optics: 'Celestron Evolution 9.25',
  apertureMm: 235,
  focalLengthMm: 2350,
  mount: 'Single-fork altazimuth, GoTo',
  camera: 'ZWO ASI585MC',
  sensorWidthMm: 11.18,
  sensorHeightMm: 6.32,
  pixelSizeUm: 2.9,
  suitedTo: ['Moon', 'Planets', 'BrightDeepSky'],
};

const simulated = (
  s: Omit<Station, 'tier' | 'status' | 'priceGel' | 'sessionMinutes' | 'simulated'>,
): Station => ({
  ...s,
  tier: 'first_party',
  status: 'commissioning',
  priceGel: 0,
  sessionMinutes: SESSION_MINUTES,
  simulated: true,
  soon: true,
});

export const STATIONS: Station[] = [
  { ...NODES[0], sessionMinutes: SESSION_MINUTES, elevationM: 450, simulated: true },
  simulated({
    id: 'abastumani-sim',
    name: 'Abastumani Ridge',
    site: 'Abastumani, Georgia',
    countryCode: 'GE',
    lat: 41.754,
    lon: 42.82,
    timezone: 'Asia/Tbilisi',
    bortle: 3,
    elevationM: 1650,
    instrument: NEXSTAR_8SE,
  }),
  simulated({
    id: 'atacama-sim',
    name: 'Atacama Station',
    site: 'San Pedro de Atacama, Chile',
    countryCode: 'CL',
    lat: -22.95,
    lon: -68.18,
    timezone: 'America/Santiago',
    bortle: 1,
    elevationM: 2400,
    instrument: EVOLUTION_925,
  }),
  simulated({
    id: 'maunaloa-sim',
    name: 'Mauna Loa Station',
    site: 'Hawaiʻi, United States',
    countryCode: 'US',
    lat: 19.536,
    lon: -155.576,
    timezone: 'Pacific/Honolulu',
    bortle: 2,
    elevationM: 3400,
    instrument: NEXSTAR_8SE,
  }),
  simulated({
    id: 'sidingspring-sim',
    name: 'Siding Spring Station',
    site: 'Coonabarabran, Australia',
    countryCode: 'AU',
    lat: -31.273,
    lon: 149.062,
    timezone: 'Australia/Sydney',
    bortle: 2,
    elevationM: 1165,
    instrument: NEXSTAR_8SE,
  }),
];

export const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export type SkyState = 'night' | 'twilight' | 'day';

/** Whether the station's sky is dark enough to work under, right now. */
export function skyStateAt(station: Station, date: Date): SkyState {
  const sun = getSunAltitude(station.lat, station.lon, date);
  if (sun <= LIMITS.sunAltitudeCeilingDeg) return 'night';
  if (sun <= 0) return 'twilight';
  return 'day';
}
