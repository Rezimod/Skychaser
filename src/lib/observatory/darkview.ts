/**
 * Skychaser's client for a Darkview observatory.
 *
 * Darkview is a separate, grant-funded project with its own repository and an
 * audited statement that it shares no code with Skychaser — see
 * docs/observatory-network.md §4.1. Nothing here is copied from it. This file
 * speaks its published contract (`contracts/openapi.yaml`, operation
 * `getObservatoryStatus`) the way any third-party client would, and the shape
 * below is only the subset Skychaser reads.
 *
 * The single most important thing in this file is that Darkview has two modes.
 * Its contract says, in as many words, that SIMULATED is the default always and
 * that REAL is reachable only through an explicit attended operator action. So
 * being connected to a Darkview observatory does not make a frame evidence —
 * being connected to one that is in REAL mode, right now, does. Everything else
 * resolves to 'simulated', including every failure.
 */

import { getSunAltitude, getTonightDarkWindow } from '@/lib/dark-window';
import {
  CLOUD_LIMIT,
  SUN_LIMIT_DEG,
  currentCloudCover,
  type CaptureOutcome,
  type ObservatoryAdapter,
} from './adapter';
import type { Provenance } from './provenance';
import type { NodeReadiness, ObservatoryNode } from './types';

/** A status poll that has not answered in this long is a node that is not there. */
const TIMEOUT_MS = 4_000;

/** The slice of PublicObservatoryStatus Skychaser reads. */
type DarkviewStatus = {
  mode: 'SIMULATED' | 'REAL';
  link: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  weatherStatus: 'CLEAR' | 'CLOUDY' | 'UNSAFE' | 'UNKNOWN';
  weatherHold: boolean;
  weatherNote: string | null;
  missionInProgress: boolean;
};

export class DarkviewAdapter implements ObservatoryAdapter {
  /**
   * Empty when the node declares a link but no address is configured. That is a
   * misconfiguration, not a simulator, and it resolves to offline rather than
   * quietly becoming one.
   */
  constructor(private readonly baseUrl: string) {}

  /**
   * Instrument-grade only while the observatory is in REAL mode and its agent
   * is connected. A DEGRADED link means the heartbeat is late, which is exactly
   * when we know least about what the telescope is doing, so it does not
   * qualify. Every other answer — simulated mode, no link, a malformed reply, a
   * timeout, a thrown error — is 'simulated'.
   */
  async provenanceNow(): Promise<Provenance> {
    const status = await this.status();
    if (!status) return 'simulated';
    return status.mode === 'REAL' && status.link === 'ONLINE' ? 'instrument' : 'simulated';
  }

  /**
   * Not yet possible, and deliberately not guessed at.
   *
   * Darkview's contract carries mission and capture operations, but they are
   * its own customer-facing flows behind a user session — there is no
   * machine-to-machine operation for "take this photograph unattended on
   * Skychaser's behalf". That contract is explicit that a task needing a field
   * which does not exist must stop and raise a contract issue rather than
   * invent a private endpoint, and it is the source of truth for both sides.
   *
   * So this reports a retryable failure: the request keeps its window and
   * waits, and refunds by itself if the window closes. It becomes real when
   * the operation exists — one method, in this file.
   */
  async capture(): Promise<CaptureOutcome> {
    return {
      ok: false,
      kind: 'retry',
      reason: 'Unattended capture is not in the observatory contract yet.',
    };
  }

  async getReadiness(node: ObservatoryNode, now = new Date()): Promise<NodeReadiness> {
    const dark = getTonightDarkWindow(node.lat, node.lon, now);
    const base = {
      nodeId: node.id,
      checkedAt: now.toISOString(),
      nextWindowAt: dark.duskStart?.toISOString() ?? null,
    };

    const status = await this.status();
    if (!status || status.link === 'OFFLINE') {
      return {
        ...base,
        state: 'offline',
        cloudCover: null,
        detail: status ? { key: 'noAgent', values: { site: node.site } } : null,
      };
    }
    if (status.link === 'DEGRADED') {
      return {
        ...base,
        state: 'offline',
        cloudCover: null,
        detail: { key: 'heartbeatLate', values: { site: node.site } },
      };
    }

    // The Sun is Skychaser's own arithmetic, not something to ask a telescope.
    const sunAltitude = getSunAltitude(node.lat, node.lon, now);
    if (sunAltitude > SUN_LIMIT_DEG) {
      return {
        ...base,
        state: 'daylight',
        cloudCover: null,
        detail:
          sunAltitude > 0
            ? { key: 'sunAbove', values: { deg: sunAltitude.toFixed(0), site: node.site } }
            : { key: 'twilight', values: { site: node.site } },
      };
    }

    // Darkview reports a verdict; Skychaser has the number. Neither overrides the
    // other — an operator hold stands whatever the forecast says.
    const cloudCover = await currentCloudCover(node, now);
    if (status.weatherHold || status.weatherStatus === 'UNSAFE') {
      return {
        ...base,
        state: 'weather',
        cloudCover,
        // The operator's own words, when they left any: theirs to say, not
        // ours to translate.
        detail: status.weatherNote
          ? { key: 'operatorNote', values: { note: status.weatherNote } }
          : { key: 'weatherHold', values: { site: node.site } },
      };
    }
    if (status.weatherStatus === 'CLOUDY' || (cloudCover !== null && cloudCover > CLOUD_LIMIT)) {
      return {
        ...base,
        state: 'weather',
        cloudCover,
        detail:
          cloudCover !== null
            ? { key: 'cloud', values: { pct: Math.round(cloudCover), site: node.site } }
            : { key: 'cloudy', values: { site: node.site } },
      };
    }

    if (status.missionInProgress) {
      return { ...base, state: 'busy', cloudCover, detail: { key: 'missionRunning' } };
    }

    return {
      ...base,
      state: 'online',
      cloudCover,
      detail: status.mode === 'SIMULATED' ? { key: 'simulatorMode' } : null,
    };
  }

  /** Null on anything at all going wrong. Callers must treat null as the worst case. */
  private async status(): Promise<DarkviewStatus | null> {
    if (!this.baseUrl) return null;

    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/observatory/state`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      return parse(await res.json());
    } catch {
      return null;
    }
  }
}

/**
 * Validated at the boundary, because this is another service's output.
 *
 * Anything unrecognised in `mode` or `link` fails the whole parse rather than
 * defaulting: a future enum member Skychaser has never heard of must not be
 * guessed at when the guess decides whether something can be minted.
 */
function parse(body: unknown): DarkviewStatus | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  const mode = b.mode;
  const link = b.link;
  if (mode !== 'SIMULATED' && mode !== 'REAL') return null;
  if (link !== 'ONLINE' && link !== 'DEGRADED' && link !== 'OFFLINE') return null;

  const weather = (typeof b.weather === 'object' && b.weather !== null ? b.weather : {}) as Record<
    string,
    unknown
  >;
  const weatherStatus = weather.status;

  return {
    mode,
    link,
    weatherStatus:
      weatherStatus === 'CLEAR' ||
      weatherStatus === 'CLOUDY' ||
      weatherStatus === 'UNSAFE' ||
      weatherStatus === 'UNKNOWN'
        ? weatherStatus
        : 'UNKNOWN',
    // An absent hold flag is treated as held. The cost of a false hold is a
    // customer waiting; the cost of a missed one is a wet telescope.
    weatherHold: weather.holdActive !== false,
    weatherNote: typeof weather.note === 'string' ? weather.note : null,
    missionInProgress: b.missionInProgress === true,
  };
}
