'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import LiveView, { type MountSample } from '@/components/observatory/LiveView';
import SkychaserAccount from '@/components/skychaser/SkychaserAccount';
import SkychaserNavLinks from '@/components/skychaser/SkychaserNavLinks';
import type { Rarity } from '@/lib/rarity';
import { getSunAltitude, getTonightDarkWindow } from '@/lib/dark-window';
import { acquisitionStateAt, planAcquisition, slewMs, type Acquisition, type AcquisitionPace } from '@/lib/observatory/mission';
import { ALT_TRAVEL, MountDrive, SPIN_DOWN_S, SPIN_UP_S, type Axis } from '@/lib/observatory/mount-drive';
import { DEFAULT_SEEING_ARCSEC, ROI_BY_ID, TRAIN_BY_ID, effectiveFocalLength, fieldOfView, resolvingPowerArcsec } from '@/lib/observatory/optics';
import { LIMITS, angularSeparation, evaluateSafety, sunPosition, type AltAz } from '@/lib/observatory/safety';
import { SESSION_MINUTES, STATIONS as SIM_STATIONS, skyStateAt, type Station } from '@/lib/observatory/sim-stations';
import { localSiderealHours } from '@/lib/observatory/site-time';
import { skyObjectsNear } from '@/lib/observatory/sky-field';
import { TELESCOPE_TARGET_BY_ID, targetPosition, targetTitle, type TelescopeTarget } from '@/lib/observatory/telescope-targets';
import { CaptureDialog, RefusedDialog, SheetDialog, TargetsDialog, displayName, type Frame, type Refusal } from './dialogs';
import Icon from './icons';
import { Camera, FrameThumbs, Frames, HandControl, Pointing, QuickStart, Session, StationList, Telescopes, type StationRow } from './panels';
import { photoFor } from '@/lib/skychaser/photos';
import { altitudePath, bestOf, cardForTarget, clock, nightSpan, plateArt, settleSkyClock, skyNow } from './sky';
import type { SlewPan } from './SlewField';
import ViewStage, { LOCKED_FEED_FILTER, SCOPE_VIEW, TRAIN_K, type Train } from './ViewStage';
import './console.css';

export type TonightCard = { designation: string; name: string; targetId: string; rarity: Rarity } | null;

type RunState = 'todo' | 'running' | 'done';
type Slew = { from: AltAz; to: AltAz; startedAtMs: number; endsAtMs: number };
type Modal = 'targets' | 'refused' | 'capture' | 'stations' | 'hand' | 'details' | null;

/** Where a freshly connected instrument happens to be pointing. */
const HANDOVER: AltAz = { altitude: 55, azimuth: 200 };
/** An aligned fork lands a few arcminutes off; centring walks the rest. */
const LANDING_ERROR: AltAz = { altitude: 0.04, azimuth: 0.11 };
const CONNECT_MS = 2_000;
const SETTLE_MS = 3_000;
/** The GoTo as the console tells it: the whole sweep in a few seconds, then a short solve and centre. */
const GOTO_PACE: AcquisitionPace = {
  axesMs: (from, to) => Math.min(1_800, Math.max(1_000, slewMs(from, to) / 8)),
  settleMs: 200,
  solveMs: 500,
  centreMs: 600,
};
const gotoMs = (from: AltAz, to: AltAz) => GOTO_PACE.axesMs(from, to) + GOTO_PACE.settleMs + GOTO_PACE.solveMs + GOTO_PACE.centreMs;
const CALIBRATE_MS = 6_000;
const OBJECT_RADIUS_DEG = 1.5;
const TICK_MS = 250;
const NIGHT_KEY = 'stellar.observatory.night';
const NODE_ID = 'tbilisi-01';
/** Parking from the handover position, settling, then aligning. */
const CAL_ESTIMATE_S = Math.round((slewMs(HANDOVER, { altitude: ALT_TRAVEL.max, azimuth: HANDOVER.azimuth }) + SETTLE_MS + CALIBRATE_MS) / 1000);
/** The open station is Live Telescope V1; the rest are listed as coming soon. No station names its city. */
const STATIONS: Station[] = SIM_STATIONS.flatMap((s) =>
  s.id === NODE_ID
    ? [
        { ...s, name: 'Live Telescope V1', site: 'Under the night sky' },
      ]
    : s.id === 'abastumani-sim'
      ? [{ ...s, name: 'Mountain station', site: 'A dark mountain ridge' }]
      : [s],
);

const ARROWS: Record<string, { axis: Axis; dir: 1 | -1 }> = {
  ArrowLeft: { axis: 'az', dir: -1 },
  ArrowRight: { axis: 'az', dir: 1 },
  ArrowUp: { axis: 'alt', dir: 1 },
  ArrowDown: { axis: 'alt', dir: -1 },
};

const wrapDelta = (deg: number) => (deg > 180 ? deg - 360 : deg < -180 ? deg + 360 : deg);
const pad2 = (n: number) => String(n).padStart(2, '0');
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName));
const duration = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} M ${pad2(Math.round(s % 60))} S` : `${Math.round(s)} S`);
const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};
const deg = (v: number, width = 1) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(width)}°`;
const raShort = (h: number) => `${pad2(Math.floor(h))}H ${pad2(Math.floor((h % 1) * 60))}M`;
const decShort = (d: number) => `${d < 0 ? '−' : '+'}${pad2(Math.floor(Math.abs(d)))}° ${pad2(Math.floor((Math.abs(d) % 1) * 60))}′`;
const shortName = (t: TelescopeTarget) => displayName(t).split(' · ')[0];

function resolveTarget(id: string) {
  return TELESCOPE_TARGET_BY_ID.get(id) ?? TELESCOPE_TARGET_BY_ID.get(`star-${id}`) ?? null;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * The observatory console: connect to a station, park and calibrate, choose a
 * target, point, capture. The mount, the safety envelope and the sky are the
 * same engine the simulator runs; every frame is drawn by the sky model and
 * says so. A target that is a First Light card is drawn with its card's plate.
 */
export default function ObservatoryConsole({ tonight, nodeCloud }: { tonight: TonightCard; nodeCloud: number | null }) {
  const [clockMs, setClockMs] = useState<number | null>(null);
  const now = clockMs ?? 0;
  // The sky the console draws: tonight's, while the Sun is up at the telescope.
  const [skyAheadMs, setSkyAheadMs] = useState(0);
  const skyMs = now + skyAheadMs;

  const [selectedId, setSelectedId] = useState(NODE_ID);
  const [station, setStation] = useState<Station | null>(null);
  const [connectedAtMs, setConnectedAtMs] = useState(0);
  const [park, setPark] = useState<RunState>('todo');
  const [cal, setCal] = useState<RunState>('todo');
  const [calEndsAtMs, setCalEndsAtMs] = useState(0);
  const [chainCal, setChainCal] = useState(false);
  const [auto, setAuto] = useState<TelescopeTarget | null>(null);
  const [target, setTarget] = useState<TelescopeTarget | null>(null);
  const [acquisition, setAcquisition] = useState<Acquisition | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [viewing, setViewing] = useState<Frame | null>(null);

  const [train, setTrain] = useState<Train>('native');
  const [exp, setExp] = useState(8);
  const [subsGoal, setSubsGoal] = useState(8);
  const [gain, setGain] = useState(200);
  const [rate, setRate] = useState(5);
  const [trackingOn, setTrackingOn] = useState(true);
  const [focus, setFocus] = useState(0);
  const [reticle, setReticle] = useState(true);
  const [labels, setLabels] = useState(false);
  const [night, setNight] = useState(false);
  const [full, setFull] = useState(false);
  const [stack, setStack] = useState<{ startsAtMs: number } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [pointing, setPointing] = useState<AltAz>(HANDOVER);
  const [history, setHistory] = useState<{ rms: number[]; seeing: number[] }>({ rms: [], seeing: [] });

  const driveRef = useRef<MountDrive | null>(null);
  if (driveRef.current === null) driveRef.current = new MountDrive();
  const parkSlewRef = useRef<Slew | null>(null);
  const acquisitionRef = useRef(acquisition);
  acquisitionRef.current = acquisition;
  const trackingOnRef = useRef(trackingOn);
  trackingOnRef.current = trackingOn;
  const sampleRef = useRef<MountSample>({ pointing: HANDOVER, azRate: 0, altRate: 0 });
  const viewRef = useRef<HTMLDivElement>(null);
  const capturingRef = useRef(false);

  useEffect(() => {
    setSkyAheadMs(settleSkyClock(STATIONS.find((s) => s.id === NODE_ID)!));
    setClockMs(Date.now());
    try {
      setNight(localStorage.getItem(NIGHT_KEY) === '1');
    } catch {
      /* storage can be blocked; day mode stands */
    }
    const id = setInterval(() => setClockMs(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const date = useMemo(() => new Date(skyMs), [skyMs]);
  const selected = STATIONS.find((s) => s.id === selectedId) ?? STATIONS[0];
  const connecting = station !== null && now < connectedAtMs + CONNECT_MS;
  const lstHours = useMemo(() => (station ? localSiderealHours(station.lon, date) : 0), [station, date]);
  const sunAltitude = useMemo(() => (station ? getSunAltitude(station.lat, station.lon, date) : 0), [station, date]);
  const sun = useMemo(() => (station ? sunPosition(station, date) : null), [station, date]);
  const sunRef = useRef(sun);
  sunRef.current = sun;

  const trainInfo = TRAIN_BY_ID.get(train)!;
  const instrument = (station ?? selected).instrument;
  const fov = useMemo(() => fieldOfView(instrument, trainInfo, ROI_BY_ID.get('full')!), [instrument, trainInfo]);
  const focal = effectiveFocalLength(instrument, trainInfo);
  const fRatio = focal / instrument.apertureMm;
  const seeing = DEFAULT_SEEING_ARCSEC + Math.abs(focus) * 0.6;

  const status = acquisition ? acquisitionStateAt(acquisition, now) : null;
  const gotoState = !status ? 'idle' : status.state === 'SLEWING' ? 'slewing' : status.state === 'VERIFYING' ? 'solving' : status.state === 'CENTERING' ? 'centring' : 'tracking';
  const onTarget = gotoState === 'tracking';
  const inGoto = gotoState === 'slewing' || gotoState === 'solving' || gotoState === 'centring';

  const targetNow = useMemo(() => (station && target ? targetPosition(target, station, date) : null), [station, target, date]);
  const targetNowRef = useRef(targetNow);
  targetNowRef.current = targetNow;
  const trackedRef = useRef<AltAz | null>(null);
  const pan = useMemo<SlewPan | null>(() => {
    const slew = acquisition?.phases.find((ph) => ph.state === 'SLEWING');
    if (!acquisition || !slew) return null;
    const { from, to } = acquisition;
    const cosAlt = Math.cos((((from.altitude + to.altitude) / 2) * Math.PI) / 180);
    return { startsAtMs: slew.startsAtMs, stopsAtMs: slew.endsAtMs - GOTO_PACE.settleMs, dx: wrapDelta(to.azimuth - from.azimuth) * cosAlt, dy: from.altitude - to.altitude };
  }, [acquisition]);

  const cameraOn = station !== null && !connecting && cal !== 'todo';
  const objects = useMemo(
    () => (station && cameraOn ? skyObjectsNear(station, date, pointing, OBJECT_RADIUS_DEG, lstHours) : []),
    [station, cameraOn, date, pointing, lstHours],
  );
  const stacking = stack !== null;
  const subsDone = stack ? Math.min(subsGoal, Math.floor((now - stack.startsAtMs) / (exp * 1000))) : 0;
  const padEnabled = cal === 'done' && park !== 'running' && !stacking;
  const timeLeftMs = station ? connectedAtMs + SESSION_MINUTES * 60_000 - now : null;
  const step = !station || connecting ? 0 : cal !== 'done' ? 1 : inGoto ? 3 : onTarget ? 4 : 2;

  /* --- the mount, once per animation frame --------------------------- */

  const stepMount = useCallback((perfNow: number) => {
    const drive = driveRef.current!;
    const simNow = Date.now();
    const acq = acquisitionRef.current;
    const st = acq ? acquisitionStateAt(acq, simNow) : null;
    const parkSlew = parkSlewRef.current;
    let azRate = 0;
    let altRate = 0;
    const envelope = (startedAtMs: number, endsAtMs: number) => {
      const seconds = (endsAtMs - startedAtMs) / 1000;
      const s = (simNow - startedAtMs) / 1000;
      return Math.max(0, Math.min(1, s / SPIN_UP_S, (seconds - s) / SPIN_DOWN_S));
    };

    if (parkSlew && simNow < parkSlew.endsAtMs) {
      const t01 = Math.min(1, (simNow - parkSlew.startedAtMs) / Math.max(1, parkSlew.endsAtMs - SETTLE_MS - parkSlew.startedAtMs));
      drive.setPointing({ altitude: parkSlew.from.altitude + (parkSlew.to.altitude - parkSlew.from.altitude) * t01, azimuth: parkSlew.from.azimuth });
      drive.halt();
      const seconds = (parkSlew.endsAtMs - SETTLE_MS - parkSlew.startedAtMs) / 1000;
      altRate = seconds > 0 ? (Math.abs(parkSlew.to.altitude - parkSlew.from.altitude) / seconds) * envelope(parkSlew.startedAtMs, parkSlew.endsAtMs) : 0;
    } else if (acq && st && st.state !== 'OBSERVING') {
      const targetAt = targetNowRef.current ?? acq.to;
      // The axes run for the slew itself and stand still through the settle that ends the phase.
      const slew = acq.phases.find((ph) => ph.state === 'SLEWING')!;
      const axesMs = slew.endsAtMs - slew.startsAtMs - GOTO_PACE.settleMs;
      const landed = { altitude: acq.to.altitude + LANDING_ERROR.altitude, azimuth: acq.to.azimuth + LANDING_ERROR.azimuth };
      let p: AltAz;
      if (st.state === 'CENTERING') {
        p = {
          altitude: landed.altitude + (targetAt.altitude - landed.altitude) * st.progress,
          azimuth: landed.azimuth + wrapDelta(targetAt.azimuth - landed.azimuth) * st.progress,
        };
      } else if (st.state === 'VERIFYING') {
        p = landed;
      } else {
        const t = Math.max(0, Math.min(1, (simNow - slew.startsAtMs) / Math.max(1, axesMs)));
        p = {
          altitude: acq.from.altitude + (acq.to.altitude - acq.from.altitude) * t,
          azimuth: (acq.from.azimuth + wrapDelta(acq.to.azimuth - acq.from.azimuth) * t + 360) % 360,
        };
      }
      drive.setPointing(p);
      drive.halt();
      trackedRef.current = null;
      if (st.state === 'SLEWING' && axesMs > 0) {
        const seconds = axesMs / 1000;
        const e = envelope(slew.startsAtMs, slew.startsAtMs + axesMs);
        azRate = (Math.abs(wrapDelta(acq.to.azimuth - acq.from.azimuth)) / seconds) * e;
        altRate = (Math.abs(acq.to.altitude - acq.from.altitude) / seconds) * e;
      }
    } else {
      if (acq && st && trackingOnRef.current) {
        // On target: the tracking drive follows the sky; the hand control adds to it.
        const targetAt = targetNowRef.current ?? acq.to;
        const last = trackedRef.current;
        if (!last) {
          drive.setPointing(targetAt);
          drive.halt();
        } else if (last !== targetAt) {
          drive.setPointing({
            altitude: drive.altitude + (targetAt.altitude - last.altitude),
            azimuth: drive.azimuth + wrapDelta(targetAt.azimuth - last.azimuth),
          });
        }
        trackedRef.current = targetAt;
      } else {
        trackedRef.current = null;
      }
      const before = drive.pointing;
      drive.step(perfNow);
      if (drive.moving && sunRef.current && angularSeparation(drive.pointing, sunRef.current) < LIMITS.sunAvoidanceDeg) {
        drive.setPointing(before);
        drive.halt();
      }
      azRate = drive.rates.az;
      altRate = drive.rates.alt;
    }
    sampleRef.current = { pointing: drive.pointing, azRate, altRate };
  }, []);

  useEffect(() => {
    let handle = 0;
    let live = true;
    const loop = (t: number) => {
      if (!live) return;
      stepMount(t);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      live = false;
      cancelAnimationFrame(handle);
    };
  }, [stepMount]);

  /* --- full view ------------------------------------------------------ */

  const setFullView = useCallback((on: boolean) => {
    setFull(on);
    if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  /* --- commands ------------------------------------------------------ */

  const disconnect = useCallback(() => {
    driveRef.current!.halt();
    driveRef.current!.setPointing(HANDOVER);
    parkSlewRef.current = null;
    trackedRef.current = null;
    setStation(null);
    setPark('todo');
    setCal('todo');
    setChainCal(false);
    setAuto(null);
    setTarget(null);
    setAcquisition(null);
    setStack(null);
    setFrames([]);
    setFullView(false);
  }, [setFullView]);

  const connect = useCallback((s: Station) => {
    disconnect();
    driveRef.current!.setPointing(HANDOVER);
    setSelectedId(s.id);
    setStation(s);
    setConnectedAtMs(Date.now());
  }, [disconnect]);

  const pick = useCallback((s: Station) => {
    if (s.soon) return;
    if (station && station.id !== s.id) disconnect();
    setSelectedId(s.id);
    setModal((m) => (m === 'stations' ? null : m));
  }, [station, disconnect]);

  const parkAtZenith = useCallback(() => {
    const drive = driveRef.current!;
    drive.halt();
    setAcquisition(null);
    setStack(null);
    const from = drive.pointing;
    const to = { altitude: ALT_TRAVEL.max, azimuth: from.azimuth };
    const startedAtMs = Date.now();
    parkSlewRef.current = { from, to, startedAtMs, endsAtMs: startedAtMs + slewMs(from, to) + SETTLE_MS };
    setPark('running');
  }, []);

  const calibrate = useCallback(() => {
    setCalEndsAtMs(Date.now() + CALIBRATE_MS);
    setCal('running');
  }, []);

  const pointAt = useCallback((next: TelescopeTarget) => {
    if (!station) return;
    const at = new Date(skyNow());
    const to = targetPosition(next, station, at);
    const verdict = evaluateSafety(station, to, at);
    if (!verdict.ok) {
      setRefusal({ target: next, reason: verdict.reason });
      setModal('refused');
      return;
    }
    const drive = driveRef.current!;
    drive.halt();
    setTarget(next);
    setStack(null);
    setModal(null);
    setAcquisition(planAcquisition({ targetId: next.id, targetName: targetTitle(next), from: drive.pointing, to, startedAtMs: Date.now(), warm: true, pace: GOTO_PACE }));
  }, [station]);

  const cancelGoto = useCallback(() => {
    driveRef.current!.halt();
    setAcquisition(null);
  }, []);

  const press = useCallback((axis: Axis, dir: 1 | -1) => {
    if (acquisitionRef.current && acquisitionStateAt(acquisitionRef.current, Date.now()).state !== 'OBSERVING') {
      acquisitionRef.current = null;
      setAcquisition(null);
    }
    driveRef.current!.press(axis, dir, rate);
  }, [rate]);
  const release = useCallback((axis: Axis) => driveRef.current!.release(axis), []);

  const quickStart = useCallback(() => {
    const t = tonight ? resolveTarget(tonight.targetId) : null;
    if (!t) return;
    const node = STATIONS.find((s) => s.id === NODE_ID)!;
    setModal(null);
    if (station?.id === NODE_ID && cal === 'done') {
      pointAt(t);
      return;
    }
    connect(node);
    setAuto(t);
  }, [tonight, station, cal, connect, pointAt]);

  const capture = useCallback(async (subs: number) => {
    const canvas = viewRef.current?.querySelector('canvas');
    if (!canvas || !target || !station || capturingRef.current) return;
    capturingRef.current = true;
    try {
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d')!;
      ctx.filter = LOCKED_FEED_FILTER;
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = 'none';
      const plate = cardForTarget(target.id);
      let composed = false;
      if (plate) {
        try {
          const real = SCOPE_VIEW[plate] ?? photoFor(plate)?.file;
          const img = await loadImage(real ?? plateArt(plate, 'object'));
          if (real) {
            // A photograph on black, screened onto the stars exactly where and as large as the eyepiece shows it.
            const shown = viewRef.current?.parentElement?.querySelector('.sdo-art--photo img');
            if (shown) {
              const c = canvas.getBoundingClientRect();
              const r = shown.getBoundingClientRect();
              const k = out.width / c.width;
              ctx.globalCompositeOperation = 'screen';
              ctx.drawImage(img, (r.left - c.left) * k, (r.top - c.top) * k, r.width * k, r.height * k);
              ctx.globalCompositeOperation = 'source-over';
            }
          } else {
            const s = Math.max(out.width / 582, out.height / 620) * TRAIN_K[train];
            ctx.drawImage(img, (out.width - 582 * s) / 2, (out.height - 620 * s) / 2, 582 * s, 620 * s);
          }
          composed = true;
        } catch {
          /* the plate would not draw; the frame keeps the sky alone */
        }
      }
      ctx.globalCompositeOperation = 'lighten';
      ctx.fillStyle = '#1b1a24';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.globalCompositeOperation = 'source-over';
      const toBlob = (c: HTMLCanvasElement) => new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      let source = out;
      let blob: Blob | null = null;
      try {
        blob = await toBlob(out);
      } catch {
        // A browser that taints canvases drawn from SVG: keep the sky alone.
        source = canvas;
        blob = composed ? await toBlob(canvas) : null;
      }
      if (!blob) return;
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const n = frames.length + 1;
      const frame: Frame = {
        id: `${stamp}-${n}`, n, dataUrl: source.toDataURL('image/png'), filename: `skychaser_${stamp}_${target.id}.png`, hash,
        targetName: shortName(target), subs, exposureSec: exp, capturedAt: Date.now(),
        optics: `${Math.round(focal)} MM · F/${fRatio.toFixed(1).replace(/\.0$/, '')}`, scale: `${fov.plateScaleArcsecPx.toFixed(2)}″ / PX`,
        seeing: `${seeing.toFixed(1)}″`, stationName: station.name,
      };
      setFrames((prev) => [frame, ...prev]);
      setViewing(frame);
      setModal('capture');
    } finally {
      capturingRef.current = false;
    }
  }, [target, station, train, frames.length, exp, focal, fRatio, fov.plateScaleArcsecPx, seeing]);

  // Retire timed steps, run the chains, and copy the drive out once a tick.
  useEffect(() => {
    if (clockMs === null) return;
    const p = sampleRef.current.pointing;
    setPointing((prev) => (Math.abs(prev.altitude - p.altitude) < 1e-4 && Math.abs(prev.azimuth - p.azimuth) < 1e-4 ? prev : p));
    if (auto && station && !connecting && park === 'todo') parkAtZenith();
    if (park === 'running' && parkSlewRef.current && now >= parkSlewRef.current.endsAtMs) {
      parkSlewRef.current = null;
      setPark('done');
      if (chainCal || auto) calibrate();
    }
    if (cal === 'running' && now >= calEndsAtMs) {
      setCal('done');
      setChainCal(false);
      if (auto) {
        pointAt(auto);
        setAuto(null);
      }
    }
    if (stack && subsDone >= subsGoal) {
      setStack(null);
      void capture(subsGoal);
    }
    if (timeLeftMs !== null && timeLeftMs <= 0) disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Telemetry traces, once a second.
  const second = Math.floor(now / 1000);
  useEffect(() => {
    if (!station) return;
    const t = second;
    const rms = onTarget && trackingOn ? 0.55 + 0.12 * Math.sin(t / 3.1) + 0.05 * Math.sin(t * 1.7) : 0;
    const see = seeing + 0.25 * Math.sin(t / 4.3) + 0.12 * Math.sin(t * 1.3);
    setHistory((h) => ({ rms: [...h.rms, rms].slice(-28), seeing: [...h.seeing, see].slice(-28) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [second]);

  const closeModal = useCallback(() => {
    setModal(null);
    setViewing(null);
  }, []);

  const toggleNight = useCallback(() => {
    setNight((v) => {
      try {
        localStorage.setItem(NIGHT_KEY, v ? '0' : '1');
      } catch {
        /* private mode */
      }
      return !v;
    });
  }, []);

  /* --- the step bar: one primary action, a few secondary ------------- */

  const tonightTarget = tonight ? resolveTarget(tonight.targetId) : null;
  const stepLabel = target ? shortName(target) : 'target';
  const expTotal = `${subsGoal} × ${exp} S · ${duration(subsGoal * exp)}`;
  const pointEstimate = acquisition
    ? Math.round((acquisition.settledAtMs - acquisition.startedAtMs) / 1000)
    : targetNow ? Math.round(gotoMs(pointing, targetNow) / 1000) : 7;

  let primary: { label: string; run: () => void; disabled?: boolean };
  let secondary: Array<{ label: string; run: () => void; disabled?: boolean }> = [];
  if (step === 0) {
    primary = connecting ? { label: 'Connecting…', run: () => undefined, disabled: true } : { label: `Connect to ${selected.name}`, run: () => connect(selected) };
    secondary = [{ label: 'Station details', run: () => setModal('details') }];
  } else if (step === 1) {
    primary = park === 'running'
      ? { label: 'Parking…', run: () => undefined, disabled: true }
      : cal === 'running' ? { label: 'Calibrating…', run: () => undefined, disabled: true }
      : park === 'done' ? { label: 'Calibrate', run: calibrate }
      : { label: 'Park & calibrate', run: () => { setChainCal(true); parkAtZenith(); } };
    secondary = park === 'todo' ? [{ label: 'Park at zenith', run: parkAtZenith }] : [];
  } else if (step === 2) {
    primary = target && !acquisition ? { label: `Point to ${stepLabel}`, run: () => pointAt(target) } : { label: 'Choose a target', run: () => setModal('targets') };
    secondary = [
      ...(tonightTarget && tonight ? [{ label: tonight.name, run: () => pointAt(tonightTarget) }] : []),
      { label: 'Search', run: () => setModal('targets') },
    ];
  } else if (step === 3) {
    primary = { label: `Point to ${stepLabel}`, run: () => undefined, disabled: true };
    secondary = [{ label: 'Cancel GoTo', run: cancelGoto }];
  } else {
    primary = stacking
      ? { label: `Stacking ${subsDone} / ${subsGoal}`, run: () => undefined, disabled: true }
      : { label: `Capture ${subsGoal} × ${exp} s`, run: () => setStack({ startsAtMs: Date.now() }) };
    secondary = stacking
      ? [{ label: 'Stop stack', run: () => setStack(null) }]
      : [{ label: 'Re-centre', run: () => target && pointAt(target) }, { label: 'Change target', run: () => setModal('targets') }];
  }
  const hints = [
    'Connect to the telescope to start.',
    'Park at zenith, then calibrate to start the feed.',
    `Select a target that has risen.${tonight ? ` Quick start points at ${tonight.name}.` : ''}`,
    `GoTo, plate-solve and centre. About ${pointEstimate} seconds.`,
    stacking ? `Stacking ${subsDone} of ${subsGoal} frames of ${exp} s.` : trackingOn ? 'On target and tracking. Frames stack into one image.' : 'Tracking is off: the sky drifts through the field.',
  ];
  const flowSteps: Array<[string, string]> = [
    ['Connect', `≈ ${CONNECT_MS / 1000} s`],
    ['Calibrate', `≈ ${CAL_ESTIMATE_S} s`],
    ['Target', 'you pick'],
    ['Point', `≈ ${pointEstimate} s`],
    ['Capture', expTotal],
  ];
  const goStep = (i: number) => {
    if (i === 0) disconnect();
    else if (i === 1) { setAcquisition(null); setStack(null); setCal('todo'); }
    else if (i === 2) { setAcquisition(null); setStack(null); setModal('targets'); }
    else if (i === 3 && target) pointAt(target);
  };

  /* --- the keyboard ---------------------------------------------------- */

  const keysRef = useRef({ padEnabled, station, modal, full, press, release, setFullView, primary, quickStart });
  keysRef.current = { padEnabled, station, modal, full, press, release, setFullView, primary, quickStart };
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = keysRef.current;
      if (e.key === 'Escape' && k.full) return k.setFullView(false);
      if (k.modal || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const arrow = ARROWS[e.key];
      if (arrow && k.station) {
        if (!k.padEnabled) return;
        e.preventDefault();
        if (!e.repeat) k.press(arrow.axis, arrow.dir);
      } else if (e.key === 'f' || e.key === 'F') {
        k.setFullView(!k.full);
      } else if (e.key === 's' || e.key === 'S') {
        k.quickStart();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) && !k.primary.disabled) {
        k.primary.run();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const arrow = ARROWS[e.key];
      if (arrow) keysRef.current.release(arrow.axis);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const sample = useCallback(() => sampleRef.current, []);

  /* --- what the panels read -------------------------------------------- */

  const span = useMemo(() => (station ? nightSpan(station, new Date(Math.floor(skyMs / 60_000) * 60_000)) : null), [station, Math.floor(skyMs / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const path = useMemo(() => (station && target && span ? altitudePath(target, station, span, 40) : null), [station, target, span]);
  const best = path ? bestOf(path) : null;
  const darkWin = useMemo(() => getTonightDarkWindow(selected.lat, selected.lon, new Date(Math.floor(skyMs / 60_000) * 60_000), selected.timezone), [selected, Math.floor(skyMs / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps

  // The station list changes once a minute; the tick must not redraw it.
  const minute = Math.floor(skyMs / 60_000);
  const stationRows = useMemo<StationRow[]>(() => {
    const at = new Date(minute * 60_000);
    return STATIONS.map((s) => {
      const state = skyStateAt(s, at);
      return { station: s, dark: state === 'night', twilight: state === 'twilight', local: clock(at.getTime(), s.timezone) };
    });
  }, [minute]);

  if (clockMs === null) return <div className="sdo" aria-busy="true" />;

  const skyState = skyStateAt(selected, date);
  const rows = stationRows;
  const hoursLeft = (label: string, ms: number) => {
    const m = Math.max(0, Math.round(ms / 60_000));
    return [label, `${Math.floor(m / 60)} h ${pad2(m % 60)} m`] as const;
  };
  const dark = darkWin.isCurrentlyDark && darkWin.dawnEnd
    ? hoursLeft('Dark left', darkWin.dawnEnd.getTime() - skyMs)
    : darkWin.duskStart && darkWin.duskStart.getTime() > skyMs ? hoursLeft('Dark in', darkWin.duskStart.getTime() - skyMs) : (['Dark left', '—'] as const);

  const plate = target ? cardForTarget(target.id) : null;
  const art: 'none' | 'pan' | 'sharp' = !plate || !cameraOn ? 'none' : gotoState === 'slewing' ? 'pan' : onTarget || inGoto ? 'sharp' : 'none';
  // The mount lands a little off the target; centring walks it in, as the feed does.
  const landedBy = gotoState === 'centring' && status ? 1 - status.progress : inGoto ? 1 : 0;
  const artOffset = {
    x: -LANDING_ERROR.azimuth * Math.cos(((targetNow ?? pointing).altitude * Math.PI) / 180) * landedBy,
    y: -LANDING_ERROR.altitude * landedBy,
  };
  const statusText = !station ? 'Standby'
    : connecting ? 'Connecting'
    : stacking ? `Stacking · ${subsDone} / ${subsGoal}`
    : gotoState === 'slewing' ? 'Slewing · plate-solving'
    : gotoState === 'solving' ? 'Plate-solving'
    : gotoState === 'centring' ? 'Centring'
    : onTarget ? (trackingOn ? 'On target · tracking' : 'On target · drifting')
    : park === 'running' ? 'Parking'
    : cal === 'running' ? 'Calibrating'
    : cal === 'done' ? 'Calibrated · ready'
    : park === 'done' ? 'Connected · parked'
    : 'Connected';
  const idle = step >= 3 ? null
    : step < 2 || !cameraOn
      ? { title: 'Observatory', text: tonight ? `Connect and calibrate to start the feed, or use Quick start to go straight to ${tonight.name}.` : 'Connect and calibrate to start the feed.', note: 'Live Telescope V1' }
      : { title: 'Ready to point', text: target ? `Point to ${shortName(target)} to begin.` : 'Choose a target that has risen.' };
  const battery = station ? Math.max(5, 100 - Math.floor(((now - connectedAtMs) / 60_000) * 0.3)) : null;
  const stationName = (station ?? selected).name;
  const fovText = `FOV ${(fov.widthArcmin / 60).toFixed(2)}° × ${(fov.heightArcmin / 60).toFixed(2)}°`;
  const scaleText = `${fov.plateScaleArcsecPx.toFixed(2)}″ / PX · FRAMES ${frames.length}`;
  const opticsLine = `${instrument.camera.replace(/^ZWO /, '')} · ${Math.round(focal)} MM · F/${fRatio.toFixed(1).replace(/\.0$/, '')}`;
  const sessionTime = station ? hms(now - connectedAtMs) : '00:00:00';
  const rmsNow = onTarget && trackingOn ? `${history.rms[history.rms.length - 1]?.toFixed(1) ?? '0.6'}″` : '—';
  const skyRow: [string, string][] = [
    ['Sky', skyState === 'night' ? 'Dark' : skyState === 'twilight' ? 'Twilight' : 'Day'],
    ['Cloud', selected.id === NODE_ID && nodeCloud !== null ? `${nodeCloud}%` : '—'],
    ['Seeing', `${seeing.toFixed(1)}″`],
  ];
  const quickName = tonight && tonightTarget ? tonight.name : null;

  const feed = station && cameraOn ? (
    <LiveView
      sample={sample}
      objects={art !== 'none' && target ? objects.filter((o) => o.id !== target.id && `star-${o.id}` !== target.id) : objects}
      latDeg={station.lat}
      lstHours={lstHours}
      sunAltitudeDeg={sunAltitude}
      exposureSec={exp}
      fovArcmin={fov.widthArcmin}
      seeingArcsec={seeing}
      diffractionArcsec={resolvingPowerArcsec(station.instrument)}
      plateScaleArcsecPx={fov.plateScaleArcsecPx}
      bortle={station.bortle}
      subs={Math.max(1, subsDone)}
      gain={gain / 5}
      splitAt={null}
    />
  ) : null;

  const actionButtons = (
    <div className="sdo-act__btns">
      {secondary.map((b) => (
        <button key={b.label} className="sdo-sec" type="button" onClick={b.run} disabled={b.disabled}>{b.label}</button>
      ))}
      <button className="sdo-btn sdo-btn--primary sdo-btn--xl" type="button" onClick={primary.run} disabled={primary.disabled}>
        {primary.label}<span className="sdo-kbd" aria-hidden="true">↵</span>
      </button>
    </div>
  );

  const hand = (
    <HandControl rate={rate} onRate={setRate} tracking={trackingOn} onTracking={setTrackingOn} focus={focus}
      onFocus={(d) => setFocus((f) => Math.max(-5, Math.min(5, f + d)))} enabled={padEnabled} onPress={press} onRelease={release}
      onCentre={() => target && pointAt(target)} canCentre={onTarget && !stacking} />
  );

  return (
    <div className={`sdo${night ? ' is-night' : ''}`}>
      <div className="sdo-atmo" aria-hidden="true">
        <div className="sdo-atmo__glow" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sdo-atmo__sky" src={plateArt('SATURN', 'sky')} alt="" />
        <div className="sdo-atmo__aurora sdo-atmo__aurora--a" />
        <div className="sdo-atmo__aurora sdo-atmo__aurora--b" />
        <div className="sdo-atmo__aurora sdo-atmo__aurora--c" />
        <div className="sdo-atmo__dots" />
        <div className="sdo-atmo__ring" />
        <div className="sdo-atmo__ring sdo-atmo__ring--b" />
      </div>

      <header className="sdo-head">
        <Link href="/" className="sdo-head__mark" aria-label="Skychaser, home">
          <img src="/brand/logo-mark.svg" alt="" width={22} height={22} aria-hidden="true" />
          <img src="/brand/wordmark.svg" alt="Skychaser" width={172} height={26} />
        </Link>
        <SkychaserNavLinks />
        <div className="sdo-head__right">
          <div className="sdo-clocks">
            <span><span className="sdo-lbl">UTC</span><b>{clock(skyMs, 'UTC', true)}</b></span>
            <span><span className="sdo-lbl">{selected.site.split(',')[0]}</span><b>{clock(skyMs, selected.timezone, true)}</b></span>
            <span><span className="sdo-lbl">{dark[0]}</span><b>{dark[1]}</b></span>
          </div>
          <span className="sdo-pill sdo-pill--live" title="Live Telescope V1"><span className="sdo-led" />Live<span className="sdo-pill__long">&nbsp;· Telescope V1</span></span>
          <button className={`sdo-ib${night ? ' is-on' : ''}`} type="button" onClick={toggleNight} aria-pressed={night} aria-label="Night mode" title="Night mode"><Icon name="moon" /></button>
          <SkychaserAccount />
        </div>
      </header>


      <div className="sdo-phone">
        <div className="sdo-phead">
          <p className="sdo-phead__t">Observatory</p>
          <div>
            <span className="sdo-pill sdo-pill--live"><span className="sdo-led" />Live</span>
            <button className={`sdo-ib${night ? ' is-on' : ''}`} type="button" onClick={toggleNight} aria-pressed={night} aria-label="Night mode"><Icon name="moon" /></button>
          </div>
        </div>
        <button className="sdo-panel sdo-pstation" type="button" onClick={() => setModal('stations')} aria-haspopup="dialog">
          <span>
            <span className={`sdo-led${skyState === 'night' ? ' is-go' : skyState === 'twilight' ? ' is-hold' : ''}`} />
            <span>
              <b>{selected.name} · {selected.site.split(',')[0]}</b>
              <small>{skyRow.map(([k, v]) => (k === 'Sky' ? v : `${k} ${v}`)).join(' · ')}</small>
            </span>
          </span>
          <Icon name="down" />
        </button>
      </div>

      <main className="sdo-grid">
        <h1 className="sdo-sr">Observatory — Live Telescope V1</h1>
        <div className="sdo-col sdo-desk">
          <QuickStart name={quickName} designation={tonight?.designation ?? null} rarity={tonight?.rarity ?? null} onStart={quickStart} />
          <Telescopes rows={rows} selectedId={selectedId} onPick={pick} sky={skyRow} />
          <Session elapsed={sessionTime} connected={station !== null} onEnd={disconnect} />
        </div>

        <div className="sdo-col sdo-col--center">
          <ViewStage
            viewRef={viewRef}
            feed={feed}
            backdrop={plateArt(tonight?.designation ?? 'SATURN', 'sky')}
            plate={plate}
            art={art}
            offsetDeg={artOffset}
            fovDeg={fov.widthArcmin / 60}
            pan={pan}
            train={train}
            onTrain={setTrain}
            reticle={reticle}
            onReticle={() => setReticle((v) => !v)}
            labels={labels}
            onLabels={() => setLabels((v) => !v)}
            full={full}
            onFull={() => setFullView(!full)}
            status={{ text: statusText, go: onTarget || stacking, blink: inGoto || connecting || park === 'running' || cal === 'running' }}
            hudLive={[cameraOn ? 'Live feed' : 'Standby', stationName, opticsLine]}
            objectSrc={plate ? SCOPE_VIEW[plate] ?? photoFor(plate)?.file ?? plateArt(plate, 'object') : null}
            scope={!!plate && plate in SCOPE_VIEW}
            hudTarget={target && targetNow ? [shortName(target), `RA ${raShort(targetNow.raHours)} · DEC ${decShort(targetNow.decDeg)}`] : null}
            hudField={[fovText, scaleText]}
            idle={idle}
          />
          <section className="sdo-panel sdo-flowbar" aria-label="Steps">
            <ol className="sdo-flow">
              {flowSteps.map(([name, time], i) => (
                <li key={name}>
                  <button type="button" className={`sdo-fs${i < step ? ' is-done' : i === step ? ' is-now' : ''}`} onClick={() => goStep(i)} disabled={i >= step} aria-current={i === step ? 'step' : undefined}>
                    <span className="sdo-fs__dot">{i < step ? <Icon name="check" size={14} /> : `0${i + 1}`}</span>
                    <span className="sdo-fs__nm">{name}</span>
                    <span className="sdo-fs__tm">{time}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="sdo-hr" style={{ margin: 0 }} />
            <div className="sdo-act">
              <div className="sdo-act__hint">
                <span className="sdo-lbl">Step {step + 1} of 5</span>
                <p>{hints[step]}</p>
              </div>
              {actionButtons}
            </div>
          </section>

          <div className="sdo-phone">
            <div className="sdo-pprog" aria-hidden="true">
              {flowSteps.map(([n], i) => <span key={n} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} />)}
            </div>
            <div className="sdo-pstep"><span>Step {step + 1} / 5 · {flowSteps[step][0]}</span><span>{expTotal}</span></div>
            <p className="sdo-phint">{hints[step]}</p>
            {secondary.length > 0 && (
              <div className="sdo-row" style={{ padding: '10px 16px 0' }}>
                {secondary.map((b) => (
                  <button key={b.label} className="sdo-sec" type="button" onClick={b.run} disabled={b.disabled}>{b.label}</button>
                ))}
              </div>
            )}
            <div className="sdo-pstats">
              <div className="sdo-stat"><span className="sdo-lbl">Tracking</span><span className="sdo-v sdo-v--sm">{rmsNow}</span></div>
              <div className="sdo-stat"><span className="sdo-lbl">Seeing</span><span className="sdo-v sdo-v--sm">{seeing.toFixed(1)}″</span></div>
              <div className="sdo-stat"><span className="sdo-lbl">Frames</span><span className="sdo-v sdo-v--sm">{frames.length}</span><span className="sdo-mono" style={{ fontSize: 11, color: 'var(--o-ink-3)' }}>THIS SESSION</span></div>
            </div>
            <div className="sdo-pcap">
              <div className="sdo-pcap__head"><span className="sdo-lbl">Captured</span></div>
              <div className="sdo-pcap__grid">
                <FrameThumbs frames={frames} onOpen={(f) => { setViewing(f); setModal('capture'); }} />
                <button type="button" className="sdo-pcap__add" aria-label="Capture a new frame" disabled={step !== 4 || stacking} onClick={() => setStack({ startsAtMs: Date.now() })}>
                  <Icon name="plus" size={20} />
                </button>
              </div>
            </div>
            <div className="sdo-pdock">
              <button className="sdo-btn" type="button" aria-label="Hand control" onClick={() => setModal('hand')}><Icon name="target" size={22} /></button>
              <button className="sdo-btn sdo-btn--primary sdo-btn--xl" type="button" onClick={primary.run} disabled={primary.disabled}>
                {step === 4 && !stacking && <Icon name="camera" size={18} />}{primary.label}
              </button>
            </div>
          </div>
        </div>

        <div className="sdo-col sdo-desk">
          <Pointing
            path={path}
            pointing={station ? pointing : null}
            rows={[
              ['Altitude', station ? deg(pointing.altitude) : '—'],
              ['Azimuth', station ? deg(pointing.azimuth) : '—'],
              ['Best at', best && best.altitude > 0 && station ? clock(best.t, station.timezone) : '—'],
            ]}
            rms={rmsNow}
            rmsHistory={history.rms}
            seeing={`${seeing.toFixed(1)}″`}
            seeingHistory={history.seeing}
            battery={battery}
            sensor={instrument.camera.includes('585') ? 'IMX585' : instrument.camera}
          />
          <Camera exp={exp} subs={subsGoal} gain={gain} total={expTotal} locked={stacking}
            onExp={(v) => setExp(Math.max(1, Math.min(64, v)))} onSubs={(v) => setSubsGoal(Math.max(1, Math.min(64, v)))} onGain={setGain} />
          {hand}
          <Frames frames={frames} onOpen={(f) => { setViewing(f); setModal('capture'); }} />
        </div>
      </main>

      {modal === 'targets' && station && (
        <TargetsDialog night={night} station={station} tonightId={tonightTarget?.id ?? null} onPoint={pointAt} onClose={closeModal} />
      )}
      {modal === 'refused' && refusal && station && (
        <RefusedDialog night={night} station={station} refusal={refusal} onChoose={() => setModal('targets')} onClose={closeModal} />
      )}
      {modal === 'capture' && viewing && <CaptureDialog night={night} frame={viewing} timezone={(station ?? selected).timezone} onClose={closeModal} />}
      {modal === 'stations' && (
        <SheetDialog night={night} title="Telescopes" onClose={closeModal}>
          <StationList rows={rows} selectedId={selectedId} onPick={pick} />
          <p className="sdo-note" style={{ padding: 0 }}>One telescope is open; the rest come after first light</p>
        </SheetDialog>
      )}
      {modal === 'hand' && <SheetDialog night={night} title="Hand control" onClose={closeModal}>{hand}</SheetDialog>}
      {modal === 'details' && (
        <SheetDialog night={night} title={`${selected.name} · details`} onClose={closeModal}>
          <dl className="sdo-dl" style={{ gridTemplateColumns: '1fr' }}>
            {([
              ['Site', selected.site],
              ['Elevation', `${selected.elevationM} m`],
              ['Sky', `Bortle ${selected.bortle}`],
              ['Optics', selected.instrument.optics],
              ['Aperture', `${selected.instrument.apertureMm} mm`],
              ['Focal length', `${selected.instrument.focalLengthMm} mm`],
              ['Mount', selected.instrument.mount],
              ['Camera', selected.instrument.camera],
              ['Session', `${SESSION_MINUTES / 60} hours`],
            ] as const).map(([k, v]) => (
              <div key={k}><dt className="sdo-lbl">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        </SheetDialog>
      )}
    </div>
  );
}
