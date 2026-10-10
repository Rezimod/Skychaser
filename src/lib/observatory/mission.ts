/**
 * The mission machine.
 *
 * An acquisition — everything between "go to that" and "you are looking at it"
 * — is planned as a deterministic timeline the moment the command is accepted.
 * `acquisitionStateAt` is then pure: the same instant always yields the same
 * state, on the server and in the browser, in a test at 1000x or on a roof in
 * real time. No timers, no drift, nothing to resynchronise.
 *
 * Once the mission reaches OBSERVING it is interactive: a capture appends a
 * phase, a new GoTo replaces the plan.
 */

import type { AltAz } from './safety';

export type MissionState =
  | 'REQUESTED'
  | 'SCHEDULED'
  | 'PREPARING'
  | 'SLEWING'
  | 'VERIFYING'
  | 'CENTERING'
  | 'OBSERVING'
  | 'CAPTURING'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'WEATHER_HOLD'
  | 'NOT_VISIBLE'
  | 'HARDWARE_ERROR'
  | 'CANCELLED'
  | 'FAILED';

/** States from which no further work happens on this mission. */
export const TERMINAL_STATES: readonly MissionState[] = [
  'COMPLETE',
  'CANCELLED',
  'FAILED',
] as const;

export type MissionPhase = {
  state: MissionState;
  startsAtMs: number;
  endsAtMs: number;
  /** What the instrument is doing, in the words the mission log will show. */
  detail: string;
};

export type Acquisition = {
  targetId: string;
  from: AltAz;
  to: AltAz;
  startedAtMs: number;
  phases: MissionPhase[];
  /** When the instrument is on target and the view is live. */
  settledAtMs: number;
};

/** Celestron fork-mount slew rate at maximum, degrees per second. */
const SLEW_RATE_DEG_S = 3;
const PREPARE_MS = 6_000;
/** Mechanical settle after the axes stop. */
const SETTLE_MS = 3_000;
const PLATE_SOLVE_MS = 6_000;
const CENTER_MS = 5_000;

/** Seconds the axes need to cover this angular distance. */
export function slewMs(from: AltAz, to: AltAz): number {
  // The axes move independently; the slew takes as long as the slower one.
  const dAlt = Math.abs(to.altitude - from.altitude);
  const rawAz = Math.abs(to.azimuth - from.azimuth);
  const dAz = rawAz > 180 ? 360 - rawAz : rawAz;
  return (Math.max(dAlt, dAz) / SLEW_RATE_DEG_S) * 1000;
}

export type AcquisitionPace = { axesMs: (from: AltAz, to: AltAz) => number; settleMs: number; solveMs: number; centreMs: number };

export function planAcquisition(input: {
  targetId: string;
  targetName: string;
  from: AltAz;
  to: AltAz;
  startedAtMs: number;
  /** Skip the unpark when the instrument is already awake and on sky. */
  warm?: boolean;
  /** Phase lengths for a brisker telling of the same sequence; the instrument's own when absent. */
  pace?: AcquisitionPace;
}): Acquisition {
  const { targetId, targetName, from, to, startedAtMs, warm = false, pace } = input;

  const durations: Array<[MissionState, number, string]> = [
    ...(warm
      ? []
      : ([['PREPARING', PREPARE_MS, 'Unparking mount, waking camera']] as Array<
          [MissionState, number, string]
        >)),
    ['SLEWING', (pace ? pace.axesMs(from, to) + pace.settleMs : slewMs(from, to) + SETTLE_MS), `Slewing to ${targetName}`],
    ['VERIFYING', pace?.solveMs ?? PLATE_SOLVE_MS, 'Plate-solving the field'],
    ['CENTERING', pace?.centreMs ?? CENTER_MS, `Centring ${targetName}`],
  ];

  let cursor = startedAtMs;
  const phases: MissionPhase[] = durations.map(([state, ms, detail]) => {
    const phase = { state, startsAtMs: cursor, endsAtMs: cursor + ms, detail };
    cursor += ms;
    return phase;
  });

  phases.push({
    state: 'OBSERVING',
    startsAtMs: cursor,
    endsAtMs: Number.POSITIVE_INFINITY,
    detail: `On target — ${targetName}`,
  });

  return { targetId, from, to, startedAtMs, phases, settledAtMs: cursor };
}

export type AcquisitionStatus = {
  state: MissionState;
  detail: string;
  /** 0-1 through the current phase. 1 once observing. */
  progress: number;
  /** Milliseconds until the view is live. 0 once it is. */
  msToSettled: number;
};

export function acquisitionStateAt(acq: Acquisition, nowMs: number): AcquisitionStatus {
  const phase =
    acq.phases.find((p) => nowMs >= p.startsAtMs && nowMs < p.endsAtMs) ??
    (nowMs < acq.startedAtMs ? acq.phases[0] : acq.phases[acq.phases.length - 1]);

  const span = phase.endsAtMs - phase.startsAtMs;
  const progress = Number.isFinite(span)
    ? Math.min(1, Math.max(0, (nowMs - phase.startsAtMs) / span))
    : 1;

  return {
    state: phase.state,
    detail: phase.detail,
    progress,
    msToSettled: Math.max(0, acq.settledAtMs - nowMs),
  };
}

/**
 * Where the instrument is pointing mid-slew.
 *
 * Interpolated along each axis so the telemetry readout moves the way a real
 * mount does, instead of teleporting when the phase flips.
 */
export function pointingAt(acq: Acquisition, nowMs: number): AltAz {
  const slew = acq.phases.find((p) => p.state === 'SLEWING');
  if (!slew || nowMs >= slew.endsAtMs) return acq.to;
  if (nowMs <= slew.startsAtMs) return acq.from;

  const t = (nowMs - slew.startsAtMs) / (slew.endsAtMs - slew.startsAtMs);
  const rawDelta = acq.to.azimuth - acq.from.azimuth;
  // Take the short way round, the way the mount does.
  const delta = rawDelta > 180 ? rawDelta - 360 : rawDelta < -180 ? rawDelta + 360 : rawDelta;

  return {
    altitude: acq.from.altitude + (acq.to.altitude - acq.from.altitude) * t,
    azimuth: (acq.from.azimuth + delta * t + 360) % 360,
  };
}
