'use client';

import { BuildAborted, makeSlicer } from '@/game/slice';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, ChevronsDown, ChevronsUp, Drill, Flame, Flashlight, Gauge, HelpCircle,
  LogIn, Menu, Package, Rocket, Trophy, Volume2, VolumeX, Wind, X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { makeMoonSurface, type MoonSurfaceHandle } from '@/lib/solar-system/moon-surface';
import type { ShipKind } from '@/lib/solar-system/ship-mesh';
import { DRILL_BAND } from '@/lib/solar-system/moon-mission';
import { motionShown, suitLevel, suitShown } from '@/lib/solar-system/moon-hud';
import { formatAltitude, formatRange, formatSpeed, formatVertical, orbitTitle } from '@/lib/solar-system/orbital-descent';
import { GameStick, tapKey } from './GameStick';
import { CosmicLoader } from './CosmicLoader';
import { ControlsHelp } from './ControlsHelp';
import { unlockPointer } from '@/game/console';
import { footBinding } from '@/game/bindings';
import { attachSurfaceControls, type SurfaceControls } from '@/game/surface-controls';
import { useLoadingTips } from './useLoadingTips';
import { useSoundPref } from './useSoundPref';
import type { RoomLink } from '@/lib/multiplayer/room-link';
import type { RewardSink } from '@/lib/solar-system/achievements';
import { MissionPanel } from './MissionPanel';
import { GemHud, type GemHudHandle } from './GemHud';
import { game } from '@/game/state';
import { noteContextLoss, rebuildWhenVisible } from '@/game/gpu-recovery';
import { hasObjectives } from '@/game/mode';
import { story } from '@/game/story';

interface MoonSurfaceProps {
  onReturn: () => void;
  room: RoomLink;
  /** Where finished missions go: the shell's sink reports them to the platform. */
  sink?: RewardSink;
  /** The game shell's pause: the sim, the sound and the keys all stop. */
  paused?: boolean;
  /** Built behind the arrival (or being left for orbit) and not on screen:
   *  it draws, but takes no keys, pointer or touch. */
  standby?: boolean;
  /** Arriving straight from the flight deck's dive: begin at the top of the
   *  atmosphere (or the braking burn on an airless world), not in orbit. */
  startAt?: 'entry';
  /** Where the build is; the shell's loading screen follows it and this one stays hidden. */
  onProgress?: (stage: 'build' | 'compile' | 'ready') => void;
  /** The mouse was let go of (Esc under pointer lock): the shell should pause. */
  onPauseRequest?: () => void;
  /** The hull the crew flew here in: it is what comes down and what they board to leave. */
  shipKind?: ShipKind;
}

/** The Moon's own notes under the controls: the place, not the keys. */
const KEY_TIPS = ['r17', 'r16', 'r10', 'r8', 'r13', 'r7'] as const;
const TOUCH_TIPS = ['t11', 't7', 't6', 't10', 't5'] as const;
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtRange = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
/** A rough range: to the nearest ten metres, marked as such. */
const fmtApprox = (m: number) => `~${fmtRange(Math.round(m / 10) * 10)}`;
/** How wide a degree of the compass is, and how far round it is drawn. */
const PPD = 3.1;
const TURNS = 3;

/** Main-thread time a surface build takes before it gives a frame back, ms. */
const BUILD_SLICE_MS = 8;

export function MoonSurface({ onReturn, room, sink, paused, standby, startAt, onProgress, onPauseRequest, shipKind }: MoonSurfaceProps) {
  const t = useTranslations('solarSystem.moon');
  /** The world's own card over the orbit, as the flight deck words it. */
  const tworld = useTranslations('solarSystem.flight.worlds.moon');
  const tl = useTranslations('solarSystem.loading');
  const tc = useTranslations('solarSystem.controls');
  const tips = useLoadingTips();
  const [sound, toggleSound] = useSoundPref();
  const [touch, setTouch] = useState(false);
  /** Bumped when the GPU drops the context; the scene is rebuilt on the surface. */
  const [glGeneration, setGlGeneration] = useState(0);
  const [gpuLost, setGpuLost] = useState(false);
  const resumeRef = useRef(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState(false);
  /** Free Fly and multiplayer keep no mission log (game/mode.ts); the mode does not change under a scene. */
  const [freeFly] = useState(() => !hasObjectives(game.get().mode));
  const freeFlyRef = useRef(freeFly);
  const [immersive, setImmersive] = useState(false);
  const [run, setRun] = useState(false);
  const [crouch, setCrouch] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<MoonSurfaceHandle | null>(null);
  // Landing panel.
  const landAltRef = useRef<HTMLSpanElement>(null);
  // The flight from orbit (and back up to it): its panel, the title card.
  const orbRef = useRef<HTMLDivElement>(null);
  const orbPhaseRef = useRef<HTMLSpanElement>(null);
  const orbAltRef = useRef<HTMLSpanElement>(null);
  const orbSpeedRef = useRef<HTMLSpanElement>(null);
  const orbVsRef = useRef<HTMLSpanElement>(null);
  const orbSiteLabelRef = useRef<HTMLSpanElement>(null);
  const orbSiteRef = useRef<HTMLSpanElement>(null);
  const orbHeatRef = useRef<HTMLElement>(null);
  const orbWarpRef = useRef<HTMLSpanElement>(null);
  const orbSkipRef = useRef<HTMLSpanElement>(null);
  const orbTitleRef = useRef<HTMLDivElement>(null);
  const landTitleRef = useRef<HTMLSpanElement>(null);
  const plaqueExitRef = useRef<HTMLSpanElement>(null);
  // The hull is read once, when the scene is built: a later change is the next landing's.
  const shipKindRef = useRef(shipKind);
  shipKindRef.current = shipKind;
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;
  // Read through a ref: a new sink identity must not rebuild the scene.
  const sinkRef = useRef(sink);
  sinkRef.current = sink;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onPauseRequestRef = useRef(onPauseRequest);
  onPauseRequestRef.current = onPauseRequest;
  const pausedRef = useRef(false);
  pausedRef.current = !!paused || !!standby;
  // The translator is read through a ref: a new identity (a locale switch)
  // must not tear the scene down and rebuild it.
  const tRef = useRef(t);
  tRef.current = t;
  const landRateRef = useRef<HTMLSpanElement>(null);
  const landOffRef = useRef<HTMLSpanElement>(null);
  const landDriftRef = useRef<HTMLSpanElement>(null);
  const landFuelRef = useRef<HTMLSpanElement>(null);
  const landThrRef = useRef<HTMLSpanElement>(null);
  const assistRef = useRef<HTMLDivElement>(null);
  const plaqueRef = useRef<HTMLDivElement>(null);
  const plaqueGradeRef = useRef<HTMLSpanElement>(null);
  const plaqueSpeedRef = useRef<HTMLSpanElement>(null);
  // Surface.
  const stripRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLDivElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const holePipRef = useRef<HTMLDivElement>(null);
  const jobPipRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const meterLabelRef = useRef<HTMLSpanElement>(null);
  const objRef = useRef<HTMLButtonElement>(null);
  const objTextRef = useRef<HTMLSpanElement>(null);
  const objRangeRef = useRef<HTMLSpanElement>(null);
  const jobRef = useRef<HTMLSpanElement>(null);
  const jobTextRef = useRef<HTMLSpanElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const altRowRef = useRef<HTMLSpanElement>(null);
  const speedRowRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const cratersRef = useRef<HTMLSpanElement>(null);
  const poiRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const promptTextRef = useRef<HTMLSpanElement>(null);
  const promptHoldRef = useRef<HTMLElement>(null);
  const promptWorkRef = useRef<HTMLElement>(null);
  const impactRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const radioRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<HTMLDivElement>(null);
  const drillRef = useRef<HTMLDivElement>(null);
  const drillDepthRef = useRef<HTMLSpanElement>(null);
  const drillLoadRef = useRef<HTMLSpanElement>(null);
  const drillHeatRef = useRef<HTMLSpanElement>(null);
  const drillWarnRef = useRef<HTMLSpanElement>(null);
  const suitRef = useRef<HTMLDivElement>(null);
  const o2Ref = useRef<HTMLSpanElement>(null);
  const o2BarRef = useRef<HTMLSpanElement>(null);
  const pwrRef = useRef<HTMLSpanElement>(null);
  const pwrBarRef = useRef<HTMLSpanElement>(null);
  const handsRef = useRef<HTMLSpanElement>(null);
  const handsTextRef = useRef<HTMLSpanElement>(null);
  const hrRef = useRef<HTMLSpanElement>(null);
  const tempRef = useRef<HTMLSpanElement>(null);
  const evaRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  const gemHudRef = useRef<GemHudHandle>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const actionTextRef = useRef<HTMLSpanElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);
  const gearTextRef = useRef<HTMLSpanElement>(null);
  const airlockRef = useRef<HTMLDivElement>(null);
  const stanceRef = useRef<HTMLDivElement>(null);
  // Underground.
  const blackRef = useRef<HTMLDivElement>(null);
  const crackRef = useRef<SVGSVGElement>(null);
  const brRef = useRef<HTMLDivElement>(null);
  const brGravRef = useRef<HTMLSpanElement>(null);
  const brReadRef = useRef<HTMLSpanElement>(null);
  const controlsRef = useRef<SurfaceControls | null>(null);
  const touchRef = useRef(false);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    touchRef.current = coarse;
    setTouch(coarse);
  }, []);

  /** The ticks of the compass ribbon: three turns of it, so it never runs out. */
  const ticks = useMemo(() => {
    const out: { deg: number; label: string | null; major: boolean }[] = [];
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let d = 0; d < 360 * TURNS; d += 15) {
      const c = d % 360;
      out.push({ deg: d, label: c % 45 === 0 ? names[(c / 45) | 0] : null, major: c % 45 === 0 });
    }
    return out;
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    let cancelRebuild: (() => void) | null = null;
    const tt = (key: string, values?: Record<string, string | number>) => tRef.current(key, values);
    onProgressRef.current?.('build');
    const ac = new AbortController();
    let stop: (() => void) | null = null;
    let cancelFailed: (() => void) | null = null;
    const run = (handle: MoonSurfaceHandle): (() => void) => {
      handleRef.current = handle;
      beginEntry();
      onProgressRef.current?.('compile');
      let readyReported = false;
      const controls = attachSurfaceControls({
        mount, input: handle.input, touch: touchRef.current,
        paused: () => pausedRef.current,
        wake: handle.startAudio,
        onCrouch: setCrouch,
        flying: () => !!handleRef.current?.telemetry.flying,
        onPauseRequest: () => onPauseRequestRef.current?.(),
        onMap: () => { if (!freeFlyRef.current) setLog((v) => !v); },
        onGearCycle: () => cycleGear(),
        selectable: '.moon-hud__help, .moon-hud__menu, .moon-hud__log',
      });
      controlsRef.current = controls;

      // HUD paint at ~30 Hz off the telemetry, no React state churn.
      const tel = handle.telemetry;
      // Free Fly and multiplayer: no objective, mission pips or mission banners (game/mode.ts).
      const free = !hasObjectives(game.get().mode);
      const text = (el: HTMLElement | null, v: string) => { if (el && el.textContent !== v) el.textContent = v; };
      const show = (el: HTMLElement | null, on: boolean) => { if (el && el.hidden === on) el.hidden = !on; };
      const setVar = (el: HTMLElement | null, name: string, v: string) => { if (el && el.style.getPropertyValue(name) !== v) el.style.setProperty(name, v); };
      /** How many degrees the ribbon can show either side of the needle. The
       *  strip is narrower on a phone than on a desk, so this is measured
       *  rather than assumed: a fixed clamp put the pip off the end of it. */
      let pipLimit = 58;
      const measureCompass = () => {
        const w = compassRef.current?.clientWidth ?? 0;
        if (w > 0) pipLimit = Math.max(12, (w / 2 - 9) / PPD);
      };
      // Measured when the strip changes size, not on every paint: a read after
      // the paint's own style writes forces a whole-page layout each time.
      const compassSize = new ResizeObserver(measureCompass);
      if (compassRef.current) compassSize.observe(compassRef.current);
      const pipAt = (el: HTMLElement | null, bearing: number, heading: number, on: boolean) => {
        if (!el) return;
        show(el, on);
        if (!on) return;
        let rel = ((bearing * 180) / Math.PI - heading + 540) % 360 - 180;
        const edge = Math.abs(rel) > pipLimit;
        rel = Math.max(-pipLimit, Math.min(pipLimit, rel));
        el.style.transform = `translateX(calc(-50% + ${rel * PPD}px))`;
        el.dataset.edge = String(edge);
      };
      let raf = 0;
      let lastPaint = 0;
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      root.dataset.touch = String(isTouch);
      let lastPoll = performance.now();
      const paint = (now: number) => {
        raf = requestAnimationFrame(paint);
        controls.poll(Math.min(0.1, (now - lastPoll) / 1000));
        lastPoll = now;
        if (now - lastPaint < 33) return;
        lastPaint = now;
        root.dataset.ready = String(tel.ready);
        if (tel.ready && !readyReported) { readyReported = true; onProgressRef.current?.('ready'); }
        root.dataset.phase = tel.phase;
        root.dataset.autoland = String(tel.autoland);
        root.dataset.far = String(tel.baseDistance > 40 && tel.backrooms.phase === '');
        root.dataset.view = tel.view;
        // In flight the jump key is the way down (suit-jet.css swaps its face).
        root.dataset.jetFlying = String(tel.flying);
        root.dataset.driving = String(tel.driving);
        root.dataset.inside = tel.inside;
        const bt = tel.backrooms;
        const under = bt.phase !== '' && bt.phase !== 'fall';
        root.dataset.backrooms = bt.phase;
        root.dataset.helmetOn = String(bt.helmet);
        setVar(blackRef.current, '--black', bt.black.toFixed(3));
        if (crackRef.current) crackRef.current.dataset.on = String(bt.crack);
        const brPanel = brRef.current;
        if (brPanel) {
          show(brPanel, under);
          if (under) {
            text(brGravRef.current, tt('backrooms.gravityRead', { n: bt.gravity.toFixed(2), g: (bt.gravity / 9.81).toFixed(2) }));
            if (brGravRef.current) brGravRef.current.dataset.earth = String(bt.gravity > 5);
            show(brReadRef.current, !!bt.readout);
            if (bt.readout) text(brReadRef.current, tt(`backrooms.readout.${bt.readout}`));
            setVar(brPanel, '--glitch', bt.glitch.toFixed(2));
          }
        }

        // ── The way down. ──
        if (tel.ascended) { tel.ascended = false; onReturnRef.current(); return; }
        // Story mode hears what the Moon is doing (game/story.ts; nothing in the other modes).
        story.observe({ world: 'moon', landed: tel.phase === 'touchdown' || tel.phase === 'surface', outside: tel.phase === 'surface', readout: tel.readout, altitude: tel.altitude, distance: tel.distanceM, missionsDone: tel.missions.done });
        // From orbit, and back up to it: the flight panel, the heat at the
        // edges of the glass and the glass shaking with the air (--heat,
        // --shake), and the world's name over the orbit.
        const ob = tel.orbital;
        const flying = !!ob && (tel.phase === 'orbit' || tel.phase === 'ascent');
        root.dataset.flight = String(flying);
        show(orbRef.current, flying);
        setVar(root, '--heat', flying && ob ? ob.heat.toFixed(3) : '0');
        setVar(root, '--shake', flying && ob ? Math.min(1, ob.turbulence + ob.burn * 0.06).toFixed(3) : '0');
        setVar(orbTitleRef.current, '--title', ob && tel.phase === 'orbit' ? orbitTitle(ob).toFixed(3) : '0');
        if (flying && ob) {
          const down = tel.phase === 'orbit';
          text(orbPhaseRef.current, tt(`landing.orbital.phases.${ob.phase}`));
          text(orbAltRef.current, formatAltitude(ob.altitude));
          text(orbSpeedRef.current, formatSpeed(ob.speed));
          text(orbVsRef.current, formatVertical(ob.vertical));
          text(orbSiteLabelRef.current, tt(down ? 'landing.orbital.toSite' : 'landing.orbital.downrange'));
          text(orbSiteRef.current, formatRange(ob.downrangeKm));
          if (orbHeatRef.current) orbHeatRef.current.style.transform = `scaleX(${Math.min(1, ob.heat).toFixed(3)})`;
          const warp = ob.timeWarp > 1.05;
          text(orbWarpRef.current, warp ? tt('landing.orbital.warp', { n: ob.timeWarp < 10 ? ob.timeWarp.toFixed(1) : Math.round(ob.timeWarp) }) : tt('landing.orbital.realTime'));
          if (orbWarpRef.current) orbWarpRef.current.dataset.warp = String(warp);
          show(orbSkipRef.current, down);
          if (orbRef.current) orbRef.current.dataset.leg = ob.phase;
        }
        if (tel.phase !== 'surface') {
          const l = tel.landing;
          text(landTitleRef.current, tel.phase === 'ascent' ? tt('landing.ascent') : tt('landing.title'));
          text(landAltRef.current, `${l.altitude.toFixed(l.altitude < 10 ? 1 : 0)} m`);
          text(landRateRef.current, `${Math.abs(l.descent).toFixed(1)} m/s`);
          text(landOffRef.current, `${Math.round(l.offset)} m`);
          text(landDriftRef.current, `${l.drift.toFixed(1)} m/s`);
          if (landFuelRef.current) landFuelRef.current.style.width = `${Math.round(l.fuel * 100)}%`;
          if (landThrRef.current) landThrRef.current.style.height = `${Math.round(l.throttle * 100)}%`;
          show(assistRef.current, l.assist);
          show(plaqueRef.current, tel.phase === 'touchdown');
          if (tel.phase === 'touchdown') {
            text(plaqueGradeRef.current, tt(`grades.${tel.grade || 'good'}`));
            text(plaqueSpeedRef.current, tt('landing.touchdown', { n: l.touchdown.toFixed(2) }));
            show(plaqueExitRef.current, tel.exitReady);
          }
          return;
        }

        // ── The compass, and where the crew is being sent. ──
        const heading = tel.heading;
        if (stripRef.current) stripRef.current.style.transform = `translateX(${-(heading + 360) * PPD}px)`;
        const m = tel.mission;
        const j = tel.jobs;
        const ms = tel.missions;
        // The questline takes the compass when it has somewhere to send the
        // crew; the old expedition keeps it the rest of the time.
        const onMission = ms.active !== '' && ms.objective !== '';
        if (free) pipAt(pipRef.current, 0, heading, false);
        else if (onMission && ms.distance >= 0) pipAt(pipRef.current, ms.bearing, heading, true);
        else pipAt(pipRef.current, m.bearing, heading, m.distance >= 0 && (m.task === '' || !m.atSite));
        pipAt(jobPipRef.current, j.bearing, heading, !free && j.active !== '' && j.distance >= 0);
        // The hum on channel two, once the base has mentioned it.
        pipAt(holePipRef.current, bt.bearing, heading, bt.known && !bt.escaped && bt.distance >= 0 && tel.phase === 'surface');
        // One meter under the compass: a job's alignment when there is one,
        // otherwise the expedition's scanner.
        const meter = meterRef.current;
        if (meter) {
          const align = j.meter >= 0;
          const sweep = tel.props.signal;
          const on = align || m.signal >= 0 || sweep >= 0;
          show(meter, on);
          if (on) {
            meter.dataset.kind = align ? 'align' : 'scan';
            meter.dataset.ping = String(sweep >= 0 ? false : m.ping);
            setVar(meter, '--v', (align ? j.meter : sweep >= 0 ? sweep : m.signal).toFixed(3));
            text(meterLabelRef.current,
              align ? tt('jobs.meter')
              : sweep >= 0 ? tt('mission.scanner')
              : m.task === 'scan' ? tt('mission.scanLock', { n: Math.round(m.work * 100) })
              : tt('mission.scanner'));
          }
        }
        show(objRef.current, !free && (onMission || m.distance >= 0 || m.complete || j.active !== '') && !m.banner && !j.banner && !ms.banner);
        text(objTextRef.current, onMission ? tt(`missions.${ms.active}.${ms.objective}`) : tt(`mission.${m.objective || 'obj.done'}`));
        text(objRangeRef.current,
          onMission ? (ms.distance >= 0 ? fmtRange(ms.distance) : '')
          : m.task === 'drill' && m.atSite ? `${m.drill.depth.toFixed(1)} / ${5.2} m`
          : m.task === 'clear' && m.atSite ? tt('mission.patches', { n: m.cleared, total: m.patches })
          : m.distance >= 0 ? (m.approx ? fmtApprox(m.distance) : fmtRange(m.distance)) : '');
        show(jobRef.current, j.active !== '');
        if (j.active && j.objective) text(jobTextRef.current, `${tt(`jobs.steps.${j.objective}`)}${j.distance >= 0 && j.distance > 4 ? ` · ${fmtRange(j.distance)}` : ''}`);

        // ── Speed and height, while there is motion to read. ──
        const motion = motionShown(tel);
        show(motionRef.current, motion.speed || motion.altitude);
        show(speedRowRef.current, motion.speed);
        show(altRowRef.current, motion.altitude);
        if (motion.speed) text(speedRef.current, `${tel.speed.toFixed(1)} m/s`);
        if (motion.altitude) text(altRef.current, `${tel.altitude.toFixed(1)} m`);

        // ── The suit, when it is low, just changed, or in front of the crew. ──
        // The pack never runs dry, so it has no meter: the suit block keeps to the life support.
        const glance = { o2: tel.o2, power: tel.suitPower, sinceChange: tel.pressureAgo, firstPerson: tel.view === 'helmet' };
        const suit = suitRef.current;
        const suitOn = suitShown(glance);
        show(suit, suitOn);
        if (suit && suitOn) {
          suit.dataset.level = suitLevel(glance);
          text(o2Ref.current, `${tel.o2.toFixed(1)}%`);
          if (o2BarRef.current) o2BarRef.current.style.width = `${Math.max(0, Math.min(100, tel.o2))}%`;
          text(pwrRef.current, `${Math.round(tel.suitPower)}%`);
          if (pwrBarRef.current) pwrBarRef.current.style.width = `${Math.max(0, Math.min(100, tel.suitPower))}%`;
        }
        // ── What is in the crew's hands, and whether the lamp is burning. ──
        const carried = tel.props.carrying;
        show(handsRef.current, carried !== '');
        if (carried) text(handsTextRef.current, tt(`items.${carried}`));
        show(lampRef.current, tel.headlamp);
        // The gem tally, and a line on the glass for each one picked up (GemHud).
        gemHudRef.current?.paint(tel);
        // The rest of the suit's numbers live in the log; these refs are only
        // mounted while it is open.
        text(hrRef.current, `${Math.round(tel.heartRate)}`);
        text(tempRef.current, `${tel.suitTemp.toFixed(1)}°`);
        text(evaRef.current, fmtTime(tel.evaSeconds));
        text(distRef.current, fmtRange(tel.distanceM));
        text(cratersRef.current, String(tel.craters));

        // ── The one key: underground, the Backrooms' own. ──
        const p = under ? bt.prompt : tel.prompt;
        const label = !p.active ? '' : under ? tt(`backrooms.act.${p.label}`) : tt(`act.${p.label}`);
        const action = actionRef.current;
        if (action) {
          show(action, p.active);
          if (p.active) {
            action.dataset.mode = p.kind === 'hold' ? 'work' : 'use';
            text(actionTextRef.current, label);
          }
        }
        const prompt = promptRef.current;
        if (prompt) {
          show(prompt, p.active);
          if (p.active) {
            text(promptTextRef.current, label);
            show(promptHoldRef.current, p.kind === 'hold');
          }
        }
        const busy = p.active && p.progress > 0.001;
        const filled = Math.min(1, p.progress).toFixed(3);
        const work = workRef.current;
        if (work) {
          show(work, busy);
          if (busy) setVar(work, '--work', filled);
        }
        const promptWork = promptWorkRef.current;
        if (promptWork) {
          show(promptWork, busy);
          if (busy) setVar(promptWork, '--work', filled);
        }
        // The drill's own panel, while standing at it.
        const drill = drillRef.current;
        if (drill) {
          const on = m.stage === 'drill' && m.atSite && m.drill.engaged;
          show(drill, on);
          if (on) {
            const d = m.drill;
            text(drillDepthRef.current, `${d.depth.toFixed(2)} m`);
            const loadEl = drillLoadRef.current;
            setVar(loadEl, '--v', Math.min(1, d.load).toFixed(3));
            if (loadEl) loadEl.dataset.state = d.load > DRILL_BAND[1] ? 'over' : 'ok';
            const heatEl = drillHeatRef.current;
            setVar(heatEl, '--v', d.heat.toFixed(3));
            if (heatEl) heatEl.dataset.state = d.heat > 0.75 ? 'hot' : 'ok';
            const warn = d.stalled ? tt('mission.drill.stalled') : d.ready ? tt('mission.drill.ready') : d.hard ? tt('mission.drill.hard') : '';
            show(drillWarnRef.current, warn !== '');
            text(drillWarnRef.current, warn);
          }
        }
        const gear = gearRef.current;
        if (gear) {
          show(gear, tel.driving);
          if (tel.driving) {
            gear.dataset.gear = tel.gear;
            text(gearTextRef.current, `${tt(`gears.${tel.gear}`)} · ${Math.round(tel.battery * 100)}%`);
          }
        }
        const stance = stanceRef.current;
        if (stance) {
          const s = tel.driving
            ? (tel.roverFault ? tt('rover.fault') : tel.charging ? tt('rover.charging', { n: Math.round(tel.battery * 100) }) : '')
            : tel.fallen ? tt(isTouch ? 'stance.fallenTouch' : 'stance.fallen') : tel.stumbling ? tt('stance.stumble') : tel.sliding ? tt('stance.slide') : tel.crouched ? tt('stance.crouch') : '';
          show(stance, s !== '');
          text(stance, s);
        }
        const lock = tel.airlock;
        const lockText = !lock.near ? '' : lock.state === 'cycling' ? tt('airlock.cycling', { n: Math.round(lock.cycle * 100) }) : lock.state === 'open' ? tt('airlock.open') : '';
        show(airlockRef.current, lockText !== '');
        text(airlockRef.current, lockText);
        const poi = poiRef.current;
        if (poi) {
          const on = !!tel.poiId && !p.active;
          show(poi, on);
          if (on) text(poi, tt(`pois.${tel.poiId}`));
        }
        const hintKey = tel.hint ? (isTouch ? `hints.${tel.hint}Touch` : `hints.${tel.hint}`) : '';
        const hint = hintRef.current;
        if (hint) {
          show(hint, !!hintKey && !p.active);
          if (hintKey) text(hint, tt(hintKey));
        }
        const banner = bannerRef.current;
        if (banner) {
          const key = free ? '' : ms.banner ? `missions.${ms.banner}` : m.banner ? `mission.${m.banner}` : j.banner ? `jobs.${j.banner}` : '';
          show(banner, key !== '');
          if (key) text(banner.firstElementChild as HTMLElement, tt(key));
        }
        const radio = radioRef.current;
        if (radio) {
          const line = bt.radio ? tt(`backrooms.radio.${bt.radio}`) : m.radio && !free ? tt(`mission.${m.radio}`) : '';
          show(radio, line !== '');
          if (line) text(radio, line);
          radio.dataset.static = String(!!bt.radio);
        }
        const readout = readoutRef.current;
        if (readout) {
          show(readout, !!tel.readout);
          if (tel.readout) text(readout, tel.readout === 'charger' ? tt('readout.charger', { n: Math.round(tel.battery * 100) }) : tt(`readout.${tel.readout}`));
        }
        const scope = scopeRef.current;
        if (scope) {
          const o = tel.props;
          show(scope, o.observedHold > 0 && !!o.observed);
          if (o.observedHold > 0 && o.observed) {
            text(scope.firstElementChild as HTMLElement, tt('missions.observed.line', { target: tt(`missions.observed.names.${o.observed}`), alt: o.observedAlt }));
            text(scope.lastElementChild as HTMLElement, tt(`missions.observed.${o.observed}`));
          }
        }
        const impact = impactRef.current;
        if (impact) {
          impact.hidden = tel.impactHold <= 0;
          if (tel.impactHold > 0) text(impact, tt('impact', { n: Math.round(tel.impactDist) }));
        }
      };
      raf = requestAnimationFrame(paint);
      return () => {
        cancelAnimationFrame(raf);
        compassSize.disconnect();
        cancelRebuild?.();
        controls.detach();
        controlsRef.current = null;
        handle.dispose();
        handleRef.current = null;
      };
    };
    // Built in steps that hand the frame back (game/slice), so the scene
    // being left keeps drawing; unmounted mid-build, the build stops.
    makeMoonSurface(mount, {
      slice: makeSlicer(BUILD_SLICE_MS, ac.signal),
      room,
      sink: sinkRef.current,
      shipKind: shipKindRef.current,
      startOnSurface: resumeRef.current,
      onContextLost: () => {
        setGpuLost(true);
        cancelRebuild?.();
        cancelRebuild = rebuildWhenVisible(() => {
          resumeRef.current = true;
          setGpuLost(false);
          setGlGeneration((g) => g + 1);
        }, noteContextLoss());
      },
    }).then((handle) => {
      if (ac.signal.aborted) { handle.dispose(); return; }
      stop = run(handle);
    }, (e: unknown) => {
      if (ac.signal.aborted || e instanceof BuildAborted) return;
      // No context to be had (the browser is out of them, or the GPU is
      // still coming back): the loader says so, the way back to orbit is
      // offered, and the build is tried again in a moment.
      console.error(e);
      setGpuLost(true);
      onProgressRef.current?.('ready');
      cancelFailed = rebuildWhenVisible(() => {
          resumeRef.current = true;
          setGpuLost(false);
          setGlGeneration((g) => g + 1);
      }, noteContextLoss());
    });
    return () => { ac.abort(); stop?.(); cancelFailed?.(); cancelRebuild?.(); };
  }, [glGeneration, room]);
  // Begin at the entry once the surface is on screen (it may have been built
  // hidden first); only once, so a GPU rebuild resumes where it was.
  const enteredRef = useRef(false);
  const startAtRef = useRef(startAt);
  startAtRef.current = startAt;
  const standbyRef = useRef(standby);
  standbyRef.current = standby;
  const beginEntry = () => {
    if (enteredRef.current || startAtRef.current !== 'entry' || standbyRef.current) return;
    const h = handleRef.current;
    if (!h) return;
    enteredRef.current = true;
    h.skipToEntry();
  };
  useEffect(beginEntry, [startAt, standby, glGeneration]);
  useEffect(() => {
    handleRef.current?.setPaused(!!paused);
    if (paused) unlockPointer();
  }, [paused, glGeneration]);

  /** Capture the finger so a key stays down when it slides off, but never at
   *  the cost of the key itself: the press is registered first either way. */
  const capture = (e: React.PointerEvent<HTMLElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no live pointer: the key still works */ }
  };
  /** A key that is down while the finger is on it. */
  const hold = (set: (on: boolean) => void) => {
    const off = () => set(false);
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        set(true);
        capture(e);
      },
      onPointerUp: off, onPointerCancel: off, onLostPointerCapture: off,
    };
  };
  /** Hold a key on the touch deck. */
  const deck = (key: 'jump' | 'jet' | 'throttle' | 'use') => hold((on) => {
    const c = controlsRef.current;
    if (!c) return;
    c.touchDeck[key] = on;
    c.sync();
  });
  /** The jump key: a jump on the ground; in flight, held, the way down. */
  const jumpKey = hold((on) => {
    const c = controlsRef.current;
    if (!c) return;
    const down = on && !!handleRef.current?.telemetry.flying;
    c.touchDeck.jump = on && !down;
    c.touchDeck.descend = down;
    c.sync();
  });
  /** The jet key: held, it lifts off and climbs; dragged down a thumb's width, it descends instead. */
  const jetFrom = useRef(0);
  const jetSet = (jet: boolean, descend: boolean) => {
    const c = controlsRef.current;
    if (!c || (c.touchDeck.jet === jet && c.touchDeck.descend === descend)) return;
    c.touchDeck.jet = jet; c.touchDeck.descend = descend;
    c.sync();
  };
  const jetHold = hold((on) => jetSet(on, false));
  const jetKey = {
    ...jetHold,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { jetFrom.current = e.clientY; jetHold.onPointerDown(e); },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const c = controlsRef.current;
      if (!c || !(c.touchDeck.jet || c.touchDeck.descend)) return;
      const dy = e.clientY - jetFrom.current;
      if (dy > 26) jetSet(false, true);
      else if (dy < 14) jetSet(true, false);
    },
  };
  const throttleKey = deck('throttle');
  /** The action key: pressing it presses the job in front of you; holding it holds it. */
  const useKey = deck('use');
  const actionKey = {
    ...useKey,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button === 0 && handleRef.current) handleRef.current.input.interact = true;
      useKey.onPointerDown(e);
    },
  };
  const cycleView = () => { const h = handleRef.current; if (h) h.input.viewCycle = true; };
  const cycleGear = () => {
    const h = handleRef.current;
    if (!h) return;
    const list = h.telemetry.gears;
    h.input.gearRequest = (list.indexOf(h.telemetry.gear) + 1) % list.length;
  };
  const toggleRun = () => {
    const c = controlsRef.current;
    if (!c) return;
    c.touchDeck.run = !c.touchDeck.run;
    c.sync();
    setRun(c.touchDeck.run);
  };
  const rewards = handleRef.current?.telemetry.mission.rewards ?? [];
  const jobsDone = handleRef.current?.telemetry.jobs.done ?? [];
  const underground = handleRef.current?.telemetry.backrooms;
  const missions = handleRef.current?.telemetry.missions;
  const achievements = handleRef.current?.telemetry.achievements ?? [];
  const crewAt = { x: handleRef.current?.telemetry.crewX ?? 0, z: handleRef.current?.telemetry.crewZ ?? 0 };

  return (
    <div ref={rootRef} className="moon-surface" data-world="moon" data-phase="descent" data-ready="false" data-immersive={immersive}>
      <div ref={mountRef} className="moon-surface__canvas" />
      {(gpuLost || !onProgress) && <CosmicLoader className={gpuLost ? 'moon-surface__loader is-forced' : 'moon-surface__loader'} variant="descent"
        label={gpuLost ? tl('gpu') : tl('moon')} detail={gpuLost ? undefined : tl('moonDetail')} tips={tips} />}
      {gpuLost && (
        <div className="earth-hud__recover">
          <button type="button" className="moon-hud__key earth-hud__retry" onClick={onReturn}>
            <Rocket size={18} aria-hidden /><span>{t('returnOrbit')}</span>
          </button>
        </div>
      )}
      <div className="moon-hud">
        <div className="moon-hud__visor" aria-hidden />
        <div ref={blackRef} className="moon-hud__black" aria-hidden />
        <svg ref={crackRef} className="moon-hud__crack" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden data-on="false">
          <path d="M612 318 L655 262 L668 180 L702 120 M655 262 L742 246 L820 262 M612 318 L560 290 L498 300 L430 262 M612 318 L640 392 L628 470 L672 540 M640 392 L716 420 L790 404 L860 440 M560 290 L540 220 L552 150" />
          <path className="moon-hud__crack-fine" d="M668 180 L640 150 M742 246 L760 200 M498 300 L470 350 M628 470 L590 500 M716 420 L730 470 M540 220 L500 205" />
          <circle cx="612" cy="318" r="9" />
        </svg>
        <div ref={brRef} className="moon-hud__br" role="status" hidden>
          <span className="moon-hud__br-place">{t('backrooms.place')}</span>
          <span ref={brGravRef} className="moon-hud__br-grav" data-earth="true" />
          <span ref={brReadRef} className="moon-hud__br-read" hidden />
          <span className="moon-hud__br-carrier">{t('backrooms.noCarrier')}</span>
        </div>

        {/* ── The way down. ── */}
        <button type="button" className="moon-hud__basekey moon-hud__autoland" data-action="autoland"
          onClick={() => { const h = handleRef.current; if (h) h.input.autoland = true; }}>
          <ChevronsDown size={16} aria-hidden /><span>{t('landAtBase')}</span>
        </button>
        <button type="button" className="moon-hud__basekey moon-hud__gobase" data-action="go-base"
          onClick={() => { const h = handleRef.current; if (h) h.input.goBase = true; }}>
          <Rocket size={16} aria-hidden /><span>{t('goBase')}</span>
        </button>
        <div className="moon-hud__landing">
          {/* From orbit: the air at the edges of the glass, the world's
              name over the orbit, and the flight's own numbers. */}
          <div className="orbital-heat" aria-hidden />
          <div ref={orbTitleRef} className="flight-title orbital-title" aria-hidden>
            <span className="flight-title__name">{tworld('name')}</span>
            <span className="flight-title__line">{tworld('descriptors')} · {tworld('temp')}</span>
          </div>
          <div ref={orbRef} className="orbital-hud" role="status" hidden>
            <span ref={orbPhaseRef} className="moon-hud__land-title" />
            <span ref={orbAltRef} className="moon-hud__land-alt" />
            <div className="moon-hud__land-rows">
              <span className="moon-hud__reading"><span>{t('landing.orbital.speed')}</span><span ref={orbSpeedRef} /></span>
              <span className="moon-hud__reading"><span>{t('landing.orbital.vertical')}</span><span ref={orbVsRef} /></span>
              <span className="moon-hud__reading"><span ref={orbSiteLabelRef}>{t('landing.orbital.toSite')}</span><span ref={orbSiteRef} /></span>
            </div>
            <span className="orbital-hud__heat"><span>{t('landing.orbital.heat')}</span><i><b ref={orbHeatRef} /></i></span>
            <span ref={orbWarpRef} className="orbital-hud__warp" data-warp="true" />
            <span ref={orbSkipRef} className="orbital-hud__skip">
              {touch
                ? <button type="button" onClick={() => handleRef.current?.skipOrbit()}>{t('landing.orbital.skipTouch')}</button>
                : <><kbd>E</kbd>{t('landing.orbital.skip')}</>}
            </span>
          </div>
          <div className="moon-hud__land-card">
            <span ref={landTitleRef} className="moon-hud__land-title">{t('landing.title')}</span>
            <span className="moon-hud__land-alt" ref={landAltRef} />
            <div className="moon-hud__land-rows">
              <span className="moon-hud__reading"><span>{t('landing.rate')}</span><span ref={landRateRef} /></span>
              <span className="moon-hud__reading"><span>{t('landing.offset')}</span><span ref={landOffRef} /></span>
              <span className="moon-hud__reading"><span>{t('landing.drift')}</span><span ref={landDriftRef} /></span>
            </div>
            <span className="moon-hud__land-fuel"><i ref={landFuelRef} /></span>
            <span className="moon-hud__land-fuel-label">{t('landing.fuel')}</span>
          </div>
          <div ref={assistRef} className="moon-hud__assist" role="status" hidden>{t('landing.assist')}</div>
          <div ref={plaqueRef} className="moon-hud__plaque" role="status" hidden>
            <span ref={plaqueGradeRef} className="moon-hud__plaque-grade" />
            <span ref={plaqueSpeedRef} className="moon-hud__plaque-speed" />
            <span ref={plaqueExitRef} className="moon-hud__plaque-exit" hidden>
              {touch
                ? <button type="button" onClick={() => { const h = handleRef.current; if (h) h.input.interact = true; }}>{t('landing.exit')}</button>
                : <><kbd>E</kbd>{t('landing.exit')}</>}
            </span>
          </div>
        </div>

        {/* ── The compass ribbon, what it points at, and the meter under it. ── */}
        <div ref={compassRef} className="moon-hud__compass" aria-hidden>
          <div className="moon-hud__strip-wrap">
            <div ref={stripRef} className="moon-hud__strip">
              {ticks.map((k) => (
                <span key={k.deg} className="moon-hud__tick" data-major={k.major} style={{ left: `${k.deg * PPD}px` }}>
                  {k.label && <b>{k.label}</b>}
                </span>
              ))}
            </div>
          </div>
          <div ref={pipRef} className="moon-hud__pip" hidden />
          <div ref={jobPipRef} className="moon-hud__pip moon-hud__pip--job" hidden />
          <div ref={holePipRef} className="moon-hud__pip moon-hud__pip--hole" hidden />
          <span className="moon-hud__needle" />
        </div>
        <div ref={meterRef} className="moon-hud__meter" hidden>
          <span className="moon-hud__meter-bar"><i /></span>
          <span ref={meterLabelRef} />
        </div>
        <div ref={radioRef} className="moon-hud__radio" role="status" hidden />

        {/* ── Top left: the place, the mission, and one line of what to do. ── */}
        <div className="moon-hud__topleft">
          <div className="moon-hud__head">
            <span className="moon-hud__place">{t('place')}</span>
            <div ref={motionRef} className="moon-hud__head-rows" hidden>
              <span ref={speedRowRef} className="moon-hud__reading" hidden><span>{t('speed')}</span><span ref={speedRef} /></span>
              <span ref={altRowRef} className="moon-hud__reading" hidden><span>{t('altitude')}</span><span ref={altRef} /></span>
            </div>
          </div>
          <button ref={objRef} type="button" className="moon-hud__objective" onClick={() => setLog(true)} hidden>
            <span className="moon-hud__objective-tag">{t('mission.title')}</span>
            <span ref={objTextRef} className="moon-hud__objective-text" />
            <span ref={objRangeRef} className="moon-hud__objective-range" />
            <span ref={jobRef} className="moon-hud__objective-job" hidden>
              <span className="moon-hud__objective-tag">{t('jobs.title')}</span>
              <span ref={jobTextRef} />
            </span>
          </button>
        </div>

        {/* ── Bottom left: the suit, when it has something to say. ── */}
        <div ref={suitRef} className="moon-hud__suit" data-level="ok" role="status" hidden>
          <span className="moon-hud__vital"><i>O₂</i><span ref={o2Ref} /><b className="moon-hud__bar"><i ref={o2BarRef} /></b></span>
          <span className="moon-hud__vital"><i>{t('suitPower')}</i><span ref={pwrRef} /><b className="moon-hud__bar"><i ref={pwrBarRef} /></b></span>
        </div>

        {/* ── Bottom right: the hands, and the lamp. ── */}
        <div className="moon-hud__hands">
          <span ref={handsRef} className="moon-hud__carry" hidden><Package size={14} aria-hidden /><span ref={handsTextRef} /></span>
          <span ref={lampRef} className="moon-hud__carry moon-hud__lamp" hidden><Flashlight size={14} aria-hidden /><i>{tc('lampOn')}</i></span>
          <GemHud ref={gemHudRef} />
        </div>

        {/* ── Right rail: the drill's instruments while it runs. ── */}
        <div ref={drillRef} className="moon-hud__drill" hidden
          style={{ '--lo': DRILL_BAND[0], '--hi': DRILL_BAND[1] } as React.CSSProperties}>
          <span className="moon-hud__drill-row"><span>{t('mission.drill.depth')}</span><span ref={drillDepthRef} className="moon-hud__drill-depth" /></span>
          <span className="moon-hud__drill-row"><span>{t('mission.drill.load')}</span><span ref={drillLoadRef} className="moon-hud__gauge"><b /><i /></span></span>
          <span className="moon-hud__drill-row"><span>{t('mission.drill.temp')}</span><span ref={drillHeatRef} className="moon-hud__gauge"><i /></span></span>
          <span ref={drillWarnRef} className="moon-hud__drill-warn" hidden />
        </div>


        {/* ── Top right: the menu. ── */}
        <div className="moon-hud__top">
          <button type="button" className="moon-hud__round" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" aria-label={t('menu')} title={t('menu')}>
            {menu ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
          </button>
          {menu && (
            <div className="moon-hud__menu" role="menu" aria-label={t('menu')}>
              {!freeFly && <button type="button" role="menuitem" onClick={() => { setLog(true); setMenu(false); }}>
                <Trophy size={16} aria-hidden /><span>{t('mission.log')}</span>
              </button>}
              <button type="button" role="menuitem" onClick={() => { cycleView(); setMenu(false); }}>
                <Camera size={16} aria-hidden /><span>{t('camera')}</span>
              </button>
              <button type="button" role="menuitem" onClick={toggleSound} aria-pressed={sound}>
                {sound ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}<span>{t(sound ? 'soundOn' : 'soundOff')}</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { setHelp((h) => !h); setMenu(false); }}>
                <HelpCircle size={16} aria-hidden /><span>{t('help')}</span>
              </button>
              <button type="button" role="menuitem" className="moon-hud__menu-exit" onClick={onReturn}>
                <Rocket size={16} aria-hidden /><span>{t('returnOrbit')}</span>
              </button>
            </div>
          )}
        </div>

        {help && (
          <div className="moon-hud__help" role="dialog" aria-label={t('help')}>
            <div className="moon-hud__help-head">
              <span>{t('help')}</span>
              <button type="button" onClick={() => setHelp(false)} aria-label={t('close')}><X size={14} aria-hidden /></button>
            </div>
            <ControlsHelp touch={touch} moon tips={(touch ? TOUCH_TIPS : KEY_TIPS).map((k) => t(`keys.${k}`))} />
          </div>
        )}
        {log && (
          <div className="moon-hud__log" role="dialog" aria-label={t('mission.log')}>
            <div className="moon-hud__help-head">
              <span>{t('missions.title')}</span>
              <button type="button" onClick={() => setLog(false)} aria-label={t('close')}><X size={14} aria-hidden /></button>
            </div>
            <div className="moon-log__suit">
              <span className="moon-hud__reading"><span>{t('eva')}</span><span ref={evaRef} /></span>
              <span className="moon-hud__reading"><span>{t('distance')}</span><span ref={distRef} /></span>
              <span className="moon-hud__reading"><span>{t('pulse')}</span><span ref={hrRef} /></span>
              <span className="moon-hud__reading"><span>{t('suitTemp')}</span><span ref={tempRef} /></span>
              <span className="moon-hud__reading"><span>{t('craters')}</span><span ref={cratersRef}>0</span></span>
            </div>
            {missions ? (
              <MissionPanel
                missions={missions}
                crew={crewAt}
                achievements={achievements}
                extras={[
                  ...(underground?.escaped ? [{ key: 'backrooms', label: t('backrooms.log', { time: fmtTime(underground.bestSeconds) }) }] : []),
                  ...rewards.map((r) => ({ key: `old-${r}`, label: t(`mission.rewards.${r}`) })),
                  ...jobsDone.map((id) => ({ key: `job-${id}`, label: t(`jobs.names.${id}`) })),
                ]}
              />
            ) : (
              <p className="moon-hud__log-brief">{t('mission.brief')}</p>
            )}
          </div>
        )}

        <div ref={impactRef} className="moon-hud__impact" role="status" hidden />
        <div ref={bannerRef} className="moon-hud__banner" role="status" hidden><span /></div>
        <div ref={readoutRef} className="moon-hud__readout" role="status" hidden />
        <div ref={scopeRef} className="moon-hud__scope" role="status" hidden><strong /><span /></div>

        {/* ── The middle of the glass: what is in front of the crew. ── */}
        <div className="moon-hud__foot">
          <div ref={promptRef} className="moon-hud__prompt" hidden>
            <kbd>{footBinding('interact').keyLabel}</kbd><span ref={promptTextRef} /><small ref={promptHoldRef} hidden>{t('hold')}</small>
            <i ref={promptWorkRef} className="moon-hud__prompt-work" hidden />
          </div>
          <div ref={airlockRef} className="moon-hud__airlock" hidden />
          <div ref={stanceRef} className="moon-hud__stance" hidden />
          <div ref={poiRef} className="moon-hud__poi" hidden />
          <p ref={hintRef} className="moon-hud__hint" hidden />
        </div>

        {/* ── The thumbs. ── */}
        <div className="moon-hud__move">
          <GameStick label={t('move')} onMove={(x, y) => {
            const c = controlsRef.current;
            if (!c) return;
            if (x !== 0 || y !== 0) handleRef.current?.startAudio();
            c.touchDeck.x = x; c.touchDeck.y = y;
            c.sync();
          }} />
          <div className="moon-hud__stance-keys">
            <button type="button" className="moon-hud__key moon-hud__run" data-on={run} {...tapKey(toggleRun)} aria-pressed={run} title={t('run')}>
              <ChevronsUp size={18} aria-hidden /><span>{t('run')}</span>
            </button>
          </div>
        </div>

        <div className="moon-hud__thumb">
          <div ref={workRef} className="moon-hud__work" hidden><span /></div>
          <button ref={gearRef} type="button" className="moon-hud__key moon-hud__gear" {...tapKey(cycleGear)} hidden>
            <Gauge size={16} aria-hidden /><span ref={gearTextRef} />
          </button>
          <button ref={actionRef} type="button" className="moon-hud__action" {...actionKey} hidden>
            {/* The icon is set by the mode in CSS; the word says the rest. */}
            <Drill className="moon-hud__ico-work" size={20} aria-hidden />
            <LogIn className="moon-hud__ico-use" size={20} aria-hidden />
            <span ref={actionTextRef} />
          </button>
          <button type="button" className="moon-hud__jump" {...jumpKey} aria-label={t('jump')}>
            <Wind className="moon-hud__ico-jump" size={18} aria-hidden /><ChevronsDown className="moon-hud__ico-down" size={18} aria-hidden />
            <span className="moon-hud__word-jump">{t('jump')}</span><span className="moon-hud__word-down">{t('descend')}</span>
          </button>
          <button type="button" className="moon-hud__jet" {...jetKey} aria-label={t('jet')}>
            <Rocket size={18} aria-hidden /><span>{t('jet')}</span>
          </button>
          <button type="button" className="moon-hud__throttle" {...throttleKey} aria-label={t('landing.throttle')}>
            <span className="moon-hud__throttle-fill"><i ref={landThrRef} /></span>
            <Flame size={22} aria-hidden /><span>{t('landing.throttle')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
