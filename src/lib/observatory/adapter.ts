/**
 * The boundary between Skychaser and a telescope.
 *
 * Skychaser never talks to hardware — it talks to an adapter. One implementation
 * exists per node kind: the simulator here, and a network adapter per partner
 * platform. See docs/observatory-network.md §4, including the rule that no
 * node platform's source may enter this repository.
 *
 * The interface is deliberately small. Booking, mission leases and command
 * envelopes join it when the booking slice lands; adding them now would be
 * shape without behaviour.
 */

import { getSunAltitude, getTonightDarkWindow } from '@/lib/dark-window';
import { fetchSkyForecast } from '@/lib/sky-data';
import type { Provenance } from './provenance';
import { evaluateSafety } from './safety';
import { SIM_TARGET_BY_ID, targetAltAz, unattendedStack } from './sim-targets';
import { utcHourStamp } from './site-time';
import type { NodeReadiness, ObservatoryNode, ReadinessState } from './types';

export interface ObservatoryAdapter {
  /**
   * What a frame taken *right now* is worth. Declared by the adapter itself,
   * so a capture cannot acquire instrument provenance by passing through a
   * surface that forgot to ask.
   *
   * This was a constant until a real node platform arrived and turned out to
   * have two modes. Darkview's own contract says SIMULATED is its default,
   * always, and REAL is reachable only through an explicit attended operator
   * action — so an adapter that answered 'instrument' because of what it is
   * connected to, rather than what that thing is doing, would mint a
   * simulator's output onto mainnet. Provenance is a property of the frame,
   * not of the class that fetched it.
   *
   * Must never throw and must fail closed: an adapter that cannot find out
   * answers 'simulated'.
   */
  provenanceNow(node: ObservatoryNode, now?: Date): Promise<Provenance>;

  /** Live operational state. Must never throw — a node that cannot answer is offline. */
  getReadiness(node: ObservatoryNode, now?: Date): Promise<NodeReadiness>;

  /**
   * Take a photograph, unattended.
   *
   * This is the half of the network nobody is awake for: a queued request
   * reaches its slot and something has to point the telescope without a
   * browser in the loop. The adapter reports what it did — how long each sub
   * ran and how many were stacked — and never what the frame is *worth*, which
   * stays with `provenanceNow`.
   *
   * Must never throw. A failure is an outcome, because the caller has to
   * decide between trying another night and refunding.
   */
  capture(
    node: ObservatoryNode,
    input: { targetId: string },
    now?: Date,
  ): Promise<CaptureOutcome>;
}

export type CaptureOutcome =
  | {
      ok: true;
      exposureSec: number;
      subs: number;
      opticalTrain: string;
      roi: string;
    }
  | {
      ok: false;
      /** `retry` means another night could work; `terminal` means it never will. */
      kind: 'retry' | 'terminal';
      reason: string;
    };

/** Above this cloud cover the sky is not worth an instrument's time. */
export const CLOUD_LIMIT = 70;
/** The Sun must be at least this far down before a mission can start. */
export const SUN_LIMIT_DEG = -12;

/**
 * Readiness for a node with no hardware link yet.
 *
 * "Simulated" describes the *instrument*, not the sky: the Sun geometry and
 * the cloud cover are the real values for the real site. A node that has been
 * built but not yet wired therefore reports the truth about its conditions,
 * and only its hardware state is assumed.
 */
export class SimNodeAdapter implements ObservatoryAdapter {
  /** A model of the optics can never be evidence, whatever the sky is doing. */
  async provenanceNow(): Promise<Provenance> {
    return 'simulated';
  }

  /**
   * The rehearsal of an unattended capture.
   *
   * It refuses for the same reasons the instrument would — daylight, weather,
   * a target under the horizon or through the zenith — so the queue, the
   * retries and the refunds are all exercised before any hardware exists. What
   * it produces is still simulated, and the rail downstream knows it.
   */
  async capture(
    node: ObservatoryNode,
    input: { targetId: string },
    now = new Date(),
  ): Promise<CaptureOutcome> {
    const target = SIM_TARGET_BY_ID.get(input.targetId);
    if (!target) {
      return { ok: false, kind: 'terminal', reason: 'This instrument does not carry that target.' };
    }

    const readiness = await this.getReadiness(node, now);
    if (readiness.state !== 'online') {
      return {
        ok: false,
        kind: 'retry',
        // A reason recorded for the sweep's own log, not shown to anyone —
        // the customer sees the request go back in the queue, not this.
        reason: readiness.detail?.key ?? readiness.state,
      };
    }

    const verdict = evaluateSafety(node, targetAltAz(target, node, now), now);
    if (!verdict.ok) return { ok: false, kind: 'retry', reason: verdict.reason };

    // Lucky imaging on a bright target, long subs on a faint one — the same
    // two regimes the console offers, at the setting a sensible operator picks.
    const { exposureSec, subs } = unattendedStack(target.brightness);

    return { ok: true, exposureSec, subs, opticalTrain: 'native', roi: 'full' };
  }

  async getReadiness(node: ObservatoryNode, now = new Date()): Promise<NodeReadiness> {
    const base = {
      nodeId: node.id,
      checkedAt: now.toISOString(),
    };

    const sunAltitude = getSunAltitude(node.lat, node.lon, now);
    const dark = getTonightDarkWindow(node.lat, node.lon, now);
    const nextWindowAt = dark.duskStart?.toISOString() ?? null;

    if (sunAltitude > SUN_LIMIT_DEG) {
      return {
        ...base,
        state: 'daylight',
        cloudCover: null,
        nextWindowAt,
        detail:
          sunAltitude > 0
            ? { key: 'sunAbove', values: { deg: sunAltitude.toFixed(0), site: node.site } }
            : { key: 'twilight', values: { site: node.site } },
      };
    }

    const cloudCover = await currentCloudCover(node, now);

    if (cloudCover !== null && cloudCover > CLOUD_LIMIT) {
      return {
        ...base,
        state: 'weather',
        cloudCover,
        nextWindowAt,
        detail: { key: 'cloud', values: { pct: Math.round(cloudCover), site: node.site } },
      };
    }

    const state: ReadinessState = node.status === 'active' ? 'online' : 'offline';
    return {
      ...base,
      state,
      cloudCover,
      nextWindowAt,
      detail: node.status === 'commissioning' ? { key: 'commissioning' } : null,
    };
  }
}

/** Cloud cover at the site for the hour containing `now`, or null if unavailable. */
export async function currentCloudCover(node: ObservatoryNode, now: Date): Promise<number | null> {
  try {
    const days = await fetchSkyForecast(node.lat, node.lon);
    const hours = days.flatMap((d) => d.hours);
    if (hours.length === 0) return null;

    const stamp = utcHourStamp(now);
    return hours.find((h) => h.time.slice(0, 13) === stamp)?.cloudCover ?? null;
  } catch {
    return null;
  }
}
