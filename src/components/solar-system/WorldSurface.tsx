'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronsUp, Flame, Flashlight, Hand, HelpCircle, Menu, Rocket, Trophy, Volume2, VolumeX, Wind, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { makeWorldSurface, type WorldSurfaceHandle } from '@/lib/solar-system/world-surface';
import type { ShipKind } from '@/lib/solar-system/ship-mesh';
import { WORLDS, type WorldId } from '@/lib/solar-system/world-profiles';
import { JET_LOW, motionShown, suitLevel, suitShown } from '@/lib/solar-system/moon-hud';
import { formatAltitude, formatRange, formatSpeed, formatVertical, orbitTitle } from '@/lib/solar-system/orbital-descent';
import { loadTbilisi, type EarthData } from '@/lib/solar-system/world-earth-data';
import type { SkyTarget } from '@/lib/solar-system/world-earth-tonight';
import { TelescopeEyepiece } from './TelescopeEyepiece';
import { GemHud, type GemHudHandle } from './GemHud';
import { GameStick, tapKey } from './GameStick';
import { CosmicLoader } from './CosmicLoader';
import { ControlsHelp } from './ControlsHelp';
import { unlockPointer } from '@/game/console';
import { footBinding } from '@/game/bindings';
import { attachSurfaceControls, type SurfaceControls } from '@/game/surface-controls';
import { useLoadingTips } from './useLoadingTips';
import { useSoundPref } from './useSoundPref';
import type { RoomLink } from '@/lib/multiplayer/room-link';
import { game } from '@/game/state';
import { hasObjectives } from '@/game/mode';
import { story, storyLine } from '@/game/story';

interface WorldSurfaceProps {
  world: WorldId;
  onReturn: () => void;
  room: RoomLink;
  /** The game shell's pause: the sim, the sound and the keys all stop. */
  paused?: boolean;
  /** Built behind the arrival (or being left for orbit) and not on screen:
   *  it draws, but takes no keys, pointer or touch. */
  standby?: boolean;
  /** Where the build is; the shell's loading screen follows it and this one stays hidden. */
  onProgress?: (stage: 'build' | 'compile' | 'ready') => void;
  /** The mouse was let go of (Esc under pointer lock): the shell should pause. */
  onPauseRequest?: () => void;
  /** The hull the crew flew here in: it is what comes down and what they board to leave. */
  shipKind?: ShipKind;
}

/** Each world's own notes under the controls: the place, not the keys. */
const KEY_TIPS = ['r5', 'r6', 'r7'] as const;
const TOUCH_TIPS = ['t5', 't6'] as const;
const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtRange = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);
const PPD = 3.1;
const TURNS = 3;

export function WorldSurface({ world, onReturn, room, paused, standby, onProgress, onPauseRequest, shipKind }: WorldSurfaceProps) {
  const t = useTranslations('solarSystem.moon');
  const tw = useTranslations(`solarSystem.worlds.${world}`);
  /** The world's own card over the orbit, as the flight deck words it. */
  const tworld = useTranslations(`solarSystem.flight.worlds.${world}`);
  const tl = useTranslations('solarSystem.loading');
  const tc = useTranslations('solarSystem.controls');
  const tips = useLoadingTips();
  const [sound, toggleSound] = useSoundPref();
  const [touch, setTouch] = useState(false);
  const [glGeneration, setGlGeneration] = useState(0);
  const [gpuLost, setGpuLost] = useState(false);
  const resumeRef = useRef(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const [log, setLog] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [run, setRun] = useState(false);
  const [crouch, setCrouch] = useState(false);
  const isEarth = world === 'earth';
  /** Story mode: the chapter's objective goes in the objective card; the
   *  other modes have no objectives at all (game/mode.ts). Fixed for the scene. */
  const [storyMode] = useState(() => hasObjectives(game.get().mode));
  const ts = useTranslations('play.story');
  const tsRef = useRef(ts);
  tsRef.current = ts;
  const objTagRef = useRef<HTMLSpanElement>(null);
  const breathable = !!WORLDS[world].breathable;
  const [earthData, setEarthData] = useState<EarthData | null>(null);
  const [earthError, setEarthError] = useState(false);
  const [eyepiece, setEyepiece] = useState<{ target: SkyTarget; date: Date } | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<WorldSurfaceHandle | null>(null);
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
  const orbMachRef = useRef<HTMLSpanElement>(null);
  const orbSkipRef = useRef<HTMLSpanElement>(null);
  const orbTitleRef = useRef<HTMLDivElement>(null);
  const landRateRef = useRef<HTMLSpanElement>(null);
  const landOffRef = useRef<HTMLSpanElement>(null);
  const landDriftRef = useRef<HTMLSpanElement>(null);
  const plaqueExitRef = useRef<HTMLSpanElement>(null);
  // The hull is read once, when the scene is built: a later change is the next landing's.
  const shipKindRef = useRef(shipKind);
  shipKindRef.current = shipKind;
  const landFuelRef = useRef<HTMLElement>(null);
  const landThrRef = useRef<HTMLElement>(null);
  const assistRef = useRef<HTMLDivElement>(null);
  const plaqueRef = useRef<HTMLDivElement>(null);
  const plaqueGradeRef = useRef<HTMLSpanElement>(null);
  const plaqueSpeedRef = useRef<HTMLSpanElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const gravRef = useRef<HTMLSpanElement>(null);
  const poiRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  const promptTextRef = useRef<HTMLSpanElement>(null);
  const promptHoldRef = useRef<HTMLElement>(null);
  const promptWorkRef = useRef<HTMLElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const speedRowRef = useRef<HTMLSpanElement>(null);
  const altRowRef = useRef<HTMLSpanElement>(null);
  const suitRef = useRef<HTMLDivElement>(null);
  const bannerRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogWhoRef = useRef<HTMLSpanElement>(null);
  const dialogTextRef = useRef<HTMLSpanElement>(null);
  const o2Ref = useRef<HTMLSpanElement>(null);
  const o2BarRef = useRef<HTMLElement>(null);
  const hrRef = useRef<HTMLSpanElement>(null);
  const tempRef = useRef<HTMLSpanElement>(null);
  const jetRef = useRef<HTMLSpanElement>(null);
  const gemHudRef = useRef<GemHudHandle>(null);
  const jetBarRef = useRef<HTMLElement>(null);
  const outRef = useRef<HTMLSpanElement>(null);
  const evaRef = useRef<HTMLSpanElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  const lampRef = useRef<HTMLSpanElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const actionTextRef = useRef<HTMLSpanElement>(null);
  const stanceRef = useRef<HTMLDivElement>(null);
  const objRef = useRef<HTMLButtonElement>(null);
  const objTextRef = useRef<HTMLSpanElement>(null);
  const objRangeRef = useRef<HTMLSpanElement>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const meterRef = useRef<HTMLDivElement>(null);
  const meterLabelRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const landTitleRef = useRef<HTMLSpanElement>(null);
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;
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
  const twRef = useRef(tw);
  twRef.current = tw;
  const controlsRef = useRef<SurfaceControls | null>(null);
  const touchRef = useRef(false);

  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    touchRef.current = coarse;
    setTouch(coarse);
  }, []);

  const ticks = useMemo(() => {
    const out: { deg: number; label: string | null; major: boolean }[] = [];
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    for (let d = 0; d < 360 * TURNS; d += 15) {
      const c = d % 360;
      out.push({ deg: d, label: c % 45 === 0 ? names[(c / 45) | 0] : null, major: c % 45 === 0 });
    }
    return out;
  }, []);

  // Tbilisi's ground and city are real data: fetch them before building the scene.
  useEffect(() => {
    if (!isEarth || earthData) return;
    const abort = new AbortController();
    setEarthError(false);
    loadTbilisi(abort.signal).then(setEarthData, (e: unknown) => {
      if ((e as { name?: string })?.name !== 'AbortError') setEarthError(true);
    });
    return () => abort.abort();
  }, [isEarth, earthData]);

  useEffect(() => {
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    if (isEarth && !earthData) return;
    let rebuildTimer = 0;
    const tt = (key: string, values?: Record<string, string | number>) => tRef.current(key, values);
    const ttw = (key: string, values?: Record<string, string | number>) => twRef.current(key, values);
    onProgressRef.current?.('build');
    const handle = makeWorldSurface(mount, world, {
      room,
      earth: earthData ?? undefined,
      shipKind: shipKindRef.current,
      startOnSurface: resumeRef.current,
      onContextLost: () => {
        setGpuLost(true);
        rebuildTimer = window.setTimeout(() => {
          resumeRef.current = true;
          setGpuLost(false);
          setGlGeneration((g) => g + 1);
        }, 1200);
      },
    });
    handleRef.current = handle;
    onProgressRef.current?.('compile');
    let readyReported = false;
    const controls = attachSurfaceControls({
      mount, input: handle.input, touch: touchRef.current,
      paused: () => pausedRef.current,
      wake: handle.startAudio,
      onCrouch: setCrouch,
      onPauseRequest: () => onPauseRequestRef.current?.(),
      selectable: '.moon-hud__help, .moon-hud__menu, .moon-hud__log',
    });
    controlsRef.current = controls;

    const tel = handle.telemetry;
    const text = (el: HTMLElement | null, v: string) => { if (el && el.textContent !== v) el.textContent = v; };
    const show = (el: HTMLElement | null, on: boolean) => { if (el && el.hidden === on) el.hidden = !on; };
    let eyepieceOpen = false;
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
      root.dataset.view = tel.view;

      if (tel.ascended) { tel.ascended = false; onReturnRef.current(); return; }
      // Story mode hears what this world is doing (game/story.ts; nothing in the other modes).
      story.observe({ world, landed: tel.phase === 'touchdown' || tel.phase === 'surface', outside: tel.phase === 'surface', readout: tel.readout, altitude: tel.altitude, distance: tel.distanceM });
      // From orbit, and back up to it: the flight panel, the heat at the
      // edges of the glass and the glass shaking with the air (--heat,
      // --shake), and the world's name over the orbit.
      const ob = tel.orbital;
      const flying = !!ob && (tel.phase === 'orbit' || tel.phase === 'ascent');
      root.dataset.flight = String(flying);
      show(orbRef.current, flying);
      root.style.setProperty('--heat', flying && ob ? ob.heat.toFixed(3) : '0');
      root.style.setProperty('--shake', flying && ob ? Math.min(1, ob.turbulence + ob.burn * 0.06).toFixed(3) : '0');
      orbTitleRef.current?.style.setProperty('--title', ob && tel.phase === 'orbit' ? orbitTitle(ob).toFixed(3) : '0');
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
        // The speed of sound, once there is air enough to have one.
        show(orbMachRef.current, ob.mach > 0.05);
        if (ob.mach > 0.05) text(orbMachRef.current, tt('landing.orbital.mach', { n: ob.mach.toFixed(ob.mach < 3 ? 2 : 1) }));
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

      if (stripRef.current) stripRef.current.style.transform = `translateX(${-(tel.heading + 360) * PPD}px)`;

      // ── Speed and height, while there is motion to read. ──
      const motion = motionShown({ driving: tel.driving, speed: tel.speed, airborne: tel.altitude > 0.4, altitude: tel.altitude });
      show(motionRef.current, motion.speed || motion.altitude);
      show(speedRowRef.current, motion.speed);
      show(altRowRef.current, motion.altitude);
      if (motion.speed) text(speedRef.current, tel.driving ? `${Math.round(tel.speed * 3.6)} km/h` : `${tel.speed.toFixed(1)} m/s`);
      if (motion.altitude) text(altRef.current, `${tel.altitude.toFixed(1)} m`);

      // ── The suit, on a world that needs one, when it is low or in front of
      // the crew. There is no suit power out here, so the oxygen decides. ──
      const glance = { o2: tel.o2, power: 100, sinceChange: 99, firstPerson: tel.view === 'helmet', jetFuel: tel.jetFuel, jetting: tel.jetting };
      const suit = suitRef.current;
      const suitOn = !breathable && suitShown(glance);
      show(suit, suitOn);
      if (suit && suitOn) {
        suit.dataset.level = suitLevel(glance);
        text(o2Ref.current, `${tel.o2.toFixed(1)}%`);
        if (o2BarRef.current) o2BarRef.current.style.width = `${Math.max(0, Math.min(100, tel.o2))}%`;
        text(tempRef.current, `${tel.suitTemp.toFixed(1)}°`);
        suit.dataset.jet = tel.jetFuel < JET_LOW ? 'low' : tel.jetting ? 'on' : '';
        text(jetRef.current, `${Math.round(tel.jetFuel * 100)}%`);
        if (jetBarRef.current) jetBarRef.current.style.width = `${Math.max(0, Math.min(100, tel.jetFuel * 100))}%`;
      }
      show(lampRef.current, tel.headlamp);
      // The gem tally, and a line on the glass for each one picked up (GemHud).
      gemHudRef.current?.paint(tel);
      // The rest are read rather than watched: these refs are only mounted
      // while the log is open.
      text(gravRef.current, `${handle.profile.gravity.toFixed(2)} m/s²`);
      text(hrRef.current, `${Math.round(tel.heartRate)}`);
      text(outRef.current, tel.earth && tel.earth.outsideC === null ? '—' : `${tel.outsideC}°`);
      text(evaRef.current, fmtTime(tel.evaSeconds));
      text(distRef.current, fmtRange(tel.distanceM));

      const p = tel.prompt;
      const label = p.active ? ttw(`act.${p.label}`) : '';
      const action = actionRef.current;
      if (action) {
        show(action, p.active);
        if (p.active) text(actionTextRef.current, label);
      }
      const prompt = promptRef.current;
      if (prompt) {
        show(prompt, p.active);
        if (p.active) {
          text(promptTextRef.current, label);
          show(promptHoldRef.current, p.kind === 'hold');
        }
      }
      // The prompt carries its own hold progress, as the Moon's does.
      const promptWork = promptWorkRef.current;
      if (promptWork) {
        const busy = p.active && p.progress > 0.001;
        show(promptWork, busy);
        if (busy) promptWork.style.setProperty('--work', Math.min(1, p.progress).toFixed(3));
      }
      const stance = stanceRef.current;
      if (stance) {
        const s = tel.stumbling ? tt('stance.stumble') : tel.sliding ? tt('stance.slide') : tel.crouched ? tt('stance.crouch') : '';
        show(stance, s !== '');
        text(stance, s);
      }
      const poi = poiRef.current;
      if (poi) {
        const on = !!tel.poiId && !p.active;
        show(poi, on);
        if (on) text(poi, ttw(`pois.${tel.poiId}`));
      }
      const hintKey = tel.hint ? (isTouch ? `hints.${tel.hint}Touch` : `hints.${tel.hint}`) : '';
      const hint = hintRef.current;
      if (hint) {
        show(hint, !!hintKey && !p.active);
        if (hintKey) text(hint, ttw(hintKey));
      }
      const banner = bannerRef.current;
      if (banner) {
        show(banner, tel.banner !== '');
        if (tel.banner) text(banner.firstElementChild as HTMLElement, ttw(`banner.${tel.banner}`));
      }
      // The story's objective, while its chapter is on this world: it has the card.
      const sl = storyMode ? storyLine(story.get(), world) : null;
      const storyCard = !!sl;
      if (objRef.current) {
        objRef.current.dataset.story = String(storyCard);
        if (sl) {
          show(objRef.current, true);
          text(objTagRef.current, tsRef.current('chapterTag', { n: sl.index, name: tsRef.current(`chapters.${sl.chapter}.name`) }));
          text(objTextRef.current, tsRef.current(sl.key));
          text(objRangeRef.current, sl.progress);
        } else if (!isEarth) show(objRef.current, false);
      }
      const ea = tel.earth;
      if (ea) {
        const ex = ea.expedition;
        text(clockRef.current, ea.clock);
        const obj = objRef.current;
        if (obj && !storyCard) {
          const on = storyMode && !!ex.objective;
          show(obj, on);
          if (on) {
            text(objTagRef.current, ttw('expedition.title'));
            text(objTextRef.current, ttw(`expedition.obj.${ex.objective}`));
            const range = ex.stage === 'overlook'
              ? ttw('expedition.found', { n: ex.found.length })
              : ex.distance >= 0 && ex.distance > 6 ? fmtRange(ex.distance) : '';
            text(objRangeRef.current, range);
          }
        }
        const pip = pipRef.current;
        if (pip) {
          const on = storyMode && ex.bearing >= 0 && ex.distance > 6;
          show(pip, on);
          if (on) {
            let rel = ((ex.bearing - tel.heading + 540) % 360) - 180;
            pip.dataset.edge = String(Math.abs(rel) > 58);
            rel = Math.max(-58, Math.min(58, rel));
            pip.style.transform = `translateX(calc(-50% + ${rel * PPD}px))`;
          }
        }
        const meter = meterRef.current;
        if (meter) {
          const spotting = storyMode && ex.stage === 'overlook' && !!ex.spotting;
          const working = storyMode && ex.work > 0 && !spotting;
          show(meter, spotting || working);
          if (spotting) {
            meter.style.setProperty('--v', ex.spotWork.toFixed(3));
            text(meterLabelRef.current, ttw('expedition.spot', { name: ttw(`expedition.names.${ex.spotting}`) }));
          } else if (working) {
            meter.style.setProperty('--v', ex.work.toFixed(3));
            text(meterLabelRef.current, label || ttw(`expedition.obj.${ex.objective}`));
          }
        }
        if (ex.eyepiece !== eyepieceOpen) {
          eyepieceOpen = ex.eyepiece;
          setEyepiece(ex.eyepiece && ea.target ? { target: ea.target, date: new Date(ea.date) } : null);
        }
        if (!tel.banner && ex.banner && storyMode) {
          const bannerEl = bannerRef.current;
          if (bannerEl) {
            show(bannerEl, true);
            text(bannerEl.firstElementChild as HTMLElement, ttw(`banner.${ex.banner}`));
          }
        }
      }
      const readout = readoutRef.current;
      if (readout) {
        show(readout, !!tel.readout);
        if (tel.readout) text(readout, ttw(`readout.${tel.readout}`));
      }
      const dialog = dialogRef.current;
      if (dialog) {
        const al = tel.aliens;
        const on = !!al && al.phrase !== '';
        show(dialog, on);
        if (on && al) {
          text(dialogWhoRef.current, ttw('dialog.who', { n: al.speaker + 1 }));
          text(dialogTextRef.current, ttw(`dialog.${al.phrase}`));
        }
      }
    };
    raf = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(rebuildTimer);
      controls.detach();
      controlsRef.current = null;
      handle.dispose();
      handleRef.current = null;
    };
  }, [world, glGeneration, isEarth, earthData, room]);
  useEffect(() => {
    handleRef.current?.setPaused(!!paused);
    if (paused) unlockPointer();
  }, [paused, glGeneration]);

  const capture = (e: React.PointerEvent<HTMLElement>) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no live pointer: the key still works */ }
  };
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
  const jumpKey = deck('jump');
  const jetKey = deck('jet');
  const throttleKey = deck('throttle');
  const useKey = deck('use');
  const actionKey = {
    ...useKey,
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.button === 0 && handleRef.current) handleRef.current.input.interact = true;
      useKey.onPointerDown(e);
    },
  };
  const cycleView = () => { const h = handleRef.current; if (h) h.input.viewCycle = true; };
  const toggleRun = () => {
    const c = controlsRef.current;
    if (!c) return;
    c.touchDeck.run = !c.touchDeck.run;
    c.sync();
    setRun(c.touchDeck.run);
  };

  return (
    <div ref={rootRef} className={`moon-surface moon-surface--${world}`} data-world={world} data-phase="descent" data-ready="false" data-immersive={immersive}>
      <div ref={mountRef} className="moon-surface__canvas" />
      {(gpuLost || earthError || !onProgress) && <CosmicLoader className={gpuLost || earthError ? 'moon-surface__loader is-forced' : 'moon-surface__loader'} variant="descent" body={world}
        label={gpuLost ? tl('gpu') : earthError ? tw('loadError') : tw('loading')} detail={gpuLost || earthError ? undefined : tw('loadingDetail')} tips={tips} />}
      {earthError && (
        <button type="button" className="moon-hud__key earth-hud__retry" onClick={onReturn}>
          <Rocket size={18} aria-hidden /><span>{t('returnOrbit')}</span>
        </button>
      )}
      <div className="moon-hud">
        <div className="moon-hud__visor" aria-hidden />

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
            <span className="orbital-hud__foot">
              <span ref={orbWarpRef} className="orbital-hud__warp" data-warp="true" />
              <span ref={orbMachRef} className="orbital-hud__mach" hidden />
            </span>
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

        <div className="moon-hud__compass" aria-hidden>
          <div className="moon-hud__strip-wrap">
            <div ref={stripRef} className="moon-hud__strip">
              {ticks.map((k) => (
                <span key={k.deg} className="moon-hud__tick" data-major={k.major} style={{ left: `${k.deg * PPD}px` }}>
                  {k.label && <b>{k.label}</b>}
                </span>
              ))}
            </div>
          </div>
          {isEarth && <div ref={pipRef} className="moon-hud__pip" hidden />}
          <span className="moon-hud__needle" />
        </div>
        {isEarth && (
          <div ref={meterRef} className="moon-hud__meter" hidden>
            <span className="moon-hud__meter-bar"><i /></span>
            <span ref={meterLabelRef} />
          </div>
        )}

        {/* ── Top left: where this is, and how fast it is going past. ── */}
        <div className="moon-hud__topleft">
          <div className="moon-hud__head">
            <span className="moon-hud__place">{tw('place')}</span>
            <div ref={motionRef} className="moon-hud__head-rows" hidden>
              <span ref={speedRowRef} className="moon-hud__reading" hidden><span>{t('speed')}</span><span ref={speedRef} /></span>
              <span ref={altRowRef} className="moon-hud__reading" hidden><span>{t('altitude')}</span><span ref={altRef} /></span>
            </div>
          </div>
          {(isEarth || storyMode) && (
            <button ref={objRef} type="button" className="moon-hud__objective" onClick={() => setLog(true)} hidden>
              <span ref={objTagRef} className="moon-hud__objective-tag">{isEarth ? tw('expedition.title') : ''}</span>
              <span ref={objTextRef} className="moon-hud__objective-text" />
              <span ref={objRangeRef} className="moon-hud__objective-range" />
            </button>
          )}
        </div>

        {/* ── Bottom left: the suit, on a world that needs one. ── */}
        <div ref={suitRef} className="moon-hud__suit" data-level="ok" role="status" hidden>
          <span className="moon-hud__vital"><i>O₂</i><span ref={o2Ref} /><b className="moon-hud__bar"><i ref={o2BarRef} /></b></span>
          <span className="moon-hud__vital"><i>{t('suitTemp')}</i><span ref={tempRef} /></span>
          <span className="moon-hud__vital moon-hud__vital--jet"><i>{t('jetpack')}</i><span ref={jetRef} /><b className="moon-hud__bar"><i ref={jetBarRef} /></b></span>
        </div>

        {/* ── Bottom right: the lamp. ── */}
        <div className="moon-hud__hands">
          <span ref={lampRef} className="moon-hud__carry moon-hud__lamp" hidden><Flashlight size={14} aria-hidden /><i>{tc('lampOn')}</i></span>
          <GemHud ref={gemHudRef} />
        </div>

        <div className="moon-hud__top">
          <button type="button" className="moon-hud__round" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" aria-label={t('menu')} title={t('menu')}>
            {menu ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
          </button>
          {menu && (
            <div className="moon-hud__menu" role="menu" aria-label={t('menu')}>
              <button type="button" role="menuitem" onClick={() => { setLog(true); setMenu(false); }}>
                <Trophy size={16} aria-hidden /><span>{t('mission.log')}</span>
              </button>
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
            <ControlsHelp touch={touch} moon={false} tips={(touch ? TOUCH_TIPS : KEY_TIPS).map((k) => tw(`keys.${k}`))} />
          </div>
        )}

        {log && (
          <div className="moon-hud__log" role="dialog" aria-label={t('mission.log')}>
            <div className="moon-hud__help-head">
              <span>{t('mission.log')}</span>
              <button type="button" onClick={() => setLog(false)} aria-label={t('close')}><X size={14} aria-hidden /></button>
            </div>
            <div className="moon-log__suit">
              <span className="moon-hud__reading"><span>{t('eva')}</span><span ref={evaRef} /></span>
              <span className="moon-hud__reading"><span>{t('distance')}</span><span ref={distRef} /></span>
              <span className="moon-hud__reading"><span>{t('pulse')}</span><span ref={hrRef} /></span>
              <span className="moon-hud__reading"><span>{t('gravity')}</span><span ref={gravRef} /></span>
              <span className="moon-hud__reading"><span>{tw('outside')}</span><span ref={outRef} /></span>
              {isEarth && <span className="moon-hud__reading"><span>{tw('localTime')}</span><span ref={clockRef} /></span>}
            </div>
          </div>
        )}

        <div ref={bannerRef} className="moon-hud__banner" role="status" hidden><span /></div>
        <div ref={readoutRef} className="moon-hud__readout" role="status" hidden />
        <div ref={dialogRef} className="moon-hud__dialog" role="status" hidden>
          <span ref={dialogWhoRef} className="moon-hud__dialog-who" />
          <span ref={dialogTextRef} className="moon-hud__dialog-text" />
        </div>

        <div className="moon-hud__foot">
          <div ref={promptRef} className="moon-hud__prompt" hidden>
            <kbd>{footBinding('interact').keyLabel}</kbd><span ref={promptTextRef} /><small ref={promptHoldRef} hidden>{t('hold')}</small>
            <i ref={promptWorkRef} className="moon-hud__prompt-work" hidden />
          </div>
          <div ref={stanceRef} className="moon-hud__stance" hidden />
          <div ref={poiRef} className="moon-hud__poi" hidden />
          <p ref={hintRef} className="moon-hud__hint" hidden />
        </div>
        {isEarth && <p className="earth-hud__credits">{tw('credits')}</p>}

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
              <ChevronsUp size={18} aria-hidden /><span>{tw('run')}</span>
            </button>
          </div>
        </div>

        <div className="moon-hud__thumb">
          <button ref={actionRef} type="button" className="moon-hud__action" data-mode="use" {...actionKey} hidden>
            <Hand className="moon-hud__ico-use" size={20} aria-hidden />
            <span ref={actionTextRef} />
          </button>
          <button type="button" className="moon-hud__jump" {...jumpKey} aria-label={t('jump')}>
            <Wind size={18} aria-hidden /><span>{t('jump')}</span>
          </button>
          {/* No pack where there is air to breathe: the pilot came out without it. */}
          {!breathable && (
            <button type="button" className="moon-hud__jet" {...jetKey} aria-label={t('jet')}>
              <Rocket size={18} aria-hidden /><span>{t('jet')}</span>
            </button>
          )}
          <button type="button" className="moon-hud__throttle" {...throttleKey} aria-label={t('landing.throttle')}>
            <span className="moon-hud__throttle-fill"><i ref={landThrRef} /></span>
            <Flame size={22} aria-hidden /><span>{t('landing.throttle')}</span>
          </button>
        </div>
      </div>
      {eyepiece && (
        <TelescopeEyepiece target={eyepiece.target} date={eyepiece.date} onClose={() => {
          const ex = handleRef.current?.telemetry.earth?.expedition;
          if (ex) ex.eyepiece = false;
        }} />
      )}
    </div>
  );
}
