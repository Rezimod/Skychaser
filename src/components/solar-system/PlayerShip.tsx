'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, Check, ChevronsUp, Crosshair, Eye, Globe, HelpCircle, LogOut, Menu, Minus, Moon,
  Orbit, Pause, Play, Plus, Radio, Rocket, RotateCcw, Ruler, Satellite, Shield, Smartphone, Sparkles, Star, Volume2, VolumeX, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { attachDesktopControls, clearFlightInput } from '@/lib/solar-system/flight-input';
import { APPROACH_LEGS, APPROACH_SECONDS, approachProfileFor, titleCard } from '@/lib/solar-system/flight-approach';
import { assetsFor, SURFACE_GROUPS } from '@/lib/solar-system/surface-assets';
import { prefetchModels, prefetchDone } from '@/game/models';
import { type FlightSession, type ShipKind } from '@/lib/solar-system/player-ship';
import { LANDING_SITES, type WorldId } from '@/lib/solar-system/world-profiles';
import { CosmicLoader } from './CosmicLoader';
import { FlightGear, FlightJumpCard } from './FlightDrive';

export type LandingSite = 'moon' | WorldId;
import { GameStick, tapKey } from './GameStick';
import { useLoadingTips } from './useLoadingTips';
import { useSoundPref } from './useSoundPref';
import { settle } from '@/game/settle';
import { getSettings } from '@/game/settings';
import { eventElement } from '@/game/console';

/** The launch screen stays at least this long, and until the ship has flown a few frames. */
const LAUNCH_MIN_MS = 600;
const LAUNCH_FRAMES = 3;

interface PlayerShipProps {
  session: FlightSession;
  onActiveChange: (active: boolean) => void;
  /** The ship is low over a world with a surface to fly down to, and the pilot asked to go down. */
  onLand: (site: LandingSite) => void;
  /** The arrival is on its last leg: the surface can start building behind it, unseen. */
  onStandby?: (site: LandingSite) => void;
  /** Take the con as soon as the orbit is up, without the Explore key: the
   *  game modes start in the ship. */
  autoLaunch?: boolean;
  /** A surface has the screen; the deck stays paused underneath. */
  landed: boolean;
  /** The crew have just come up from this surface: the deck launches into
   *  a clean orbit over it rather than leaving them in the orrery. */
  returnedFrom?: LandingSite | null;
  onReturned?: () => void;
  /** The viewport is drawn a quarter turn clockwise — landscape on a phone. */
  landscape: boolean;
  onLandscape: (on: boolean) => void;
  /** The game shell's pause holds the deck too. */
  shellPaused?: boolean;
  /** The deck paused itself (Esc, a lost pointer lock): the shell should show its menu. */
  onPauseRequest?: () => void;
}
const SHIPS: ShipKind[] = ['kestrel', 'xfoil', 'cruiser', 'endurance'];
const BARS = ['shield', 'energy', 'boost'] as const;
const KEY_ROWS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r10', 'r12', 'r13', 'r7', 'r15', 'r8', 'r16', 'r11', 'r14', 'r9'] as const;
const TOUCH_ROWS = ['t1', 't2', 't3', 't11', 't6', 't15', 't12', 't14', 't5'] as const;
const HELP_SEEN = 'stellar_explore_help';
/** The arrival has been watched once; from now on it can be skipped from the first second. */
const ARRIVAL_SEEN = 'stellar_explore_arrival';
/** On the first run the way out opens once the transit is behind them. */
const ARRIVAL_SKIP_AFTER = APPROACH_LEGS[0].seconds + 1;
/** How far through the arrival the surface starts building behind it, 0…1: the last leg, about five seconds out. */
const STANDBY_AT = 0.62;
const ICONS = [Shield, Zap, ChevronsUp];
/** How long a passing moment stays up in the popup. */
const POPUP_MS = 4200;
/** The ship's alerts that are a danger, and the ones that are good news. */
const WARN_ALERTS = new Set(['proximity', 'solar', 'lowshield', 'shielddown', 'hullcritical', 'hostile', 'horizon', 'masslock']);
const OK_ALERTS = new Set(['jumpready', 'arrived', 'docked', 'undocked']);
/** The quick targets in the menu: a named world, or a kind to walk through.
 *  A key only shows when the system it is flown in has one. */
interface RailKey {
  key: string;
  /** A world by name … */
  id?: string;
  /** … or every target of these kinds, walked nearest first. */
  kinds?: string;
  icon: LucideIcon;
}
const RAIL: RailKey[] = [
  { key: 'earth', id: 'earth', icon: Globe },
  { key: 'moon', id: 'moon', icon: Moon },
  { key: 'planets', kinds: 'planet', icon: Sparkles },
  { key: 'iss', id: 'iss', icon: Satellite },
  { key: 'stars', kinds: 'star,blackhole', icon: Star },
];
const RAIL_IDS = new Set(RAIL.map((r) => r.id ?? ''));
const SOLAR_IDS = new Set(['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto']);
const fmt = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)} B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e4 ? `${Math.round(n / 1000)} K` : n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(2);

/** The look pad: a finger dragged across the right of the glass turns the
 *  nose, the way a mouse does on a desk. This is how much of a turn a pixel
 *  of drag is worth against the mouse — a thumb has less room than a hand. */
const LOOK_GAIN = 3.2;

/** ── The pilot's own layout ──
 *  Every control on the deck can be moved and sized by the pilot and the
 *  result kept on the device: each placed control carries an offset as a
 *  fraction of the deck's width and height (so the same layout survives a
 *  turn to landscape or a bigger phone) and a scale. */
const LAYOUT_KEY = 'stellar_hud_layout_v2';
interface Place { x: number; y: number; s: number }
type Layout = Record<string, Place>;
const PLACEABLE = ['head', 'topkeys', 'side', 'move', 'fire', 'boost', 'brake', 'gear', 'console'] as const;
type Placeable = (typeof PLACEABLE)[number];
const loadLayout = (): Layout => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Layout;
    const out: Layout = {};
    for (const id of PLACEABLE) {
      const p = parsed[id];
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.s)) out[id] = { x: p.x, y: p.y, s: Math.min(1.6, Math.max(0.6, p.s)) };
    }
    return out;
  } catch {
    return {};
  }
};
const saveLayout = (layout: Layout) => {
  try {
    if (Object.keys(layout).length) localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    else localStorage.removeItem(LAYOUT_KEY);
  } catch {
    // Private mode — the layout lives for the session only.
  }
};

export function PlayerShip({ session, onActiveChange, onLand, onStandby, autoLaunch, landed, returnedFrom, onReturned, landscape, onLandscape, shellPaused, onPauseRequest }: PlayerShipProps) {
  const t = useTranslations('solarSystem.flight');
  const tb = useTranslations('solarSystem.bodies');
  const tl = useTranslations('solarSystem.loading');
  const tips = useLoadingTips();
  const [sound, toggleSound] = useSoundPref();
  const [active, setActive] = useState(false);
  /** The launch screen: up while the ship is built and its shaders compile, then fading. */
  const [launch, setLaunch] = useState<'off' | 'on' | 'fading'>('off');
  const [paused, setPaused] = useState(false);
  const [touch, setTouch] = useState(false);
  const [shipKind, setShipKind] = useState<ShipKind>(session.shipKind);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  /** The deck hidden for the view alone: only the eye stays, and the pad
   *  keeps working where it was. */
  const [immersive, setImmersive] = useState(false);
  /** The arrival: the world the ship is flying itself down to, or null. */
  const [arrival, setArrival] = useState<LandingSite | null>(null);
  /** The layout editor: every control a handle to drag, a size to set. */
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Layout>({});
  const [picked, setPicked] = useState<Placeable | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const arrivalRef = useRef<LandingSite | null>(null);
  const arrivalSkipRef = useRef(false);
  const arrivalArmedRef = useRef(0);
  const arrPhaseRef = useRef<HTMLSpanElement>(null);
  const arrPlaceRef = useRef<HTMLSpanElement>(null);
  const arrBarRef = useRef<HTMLSpanElement>(null);
  const arrHintRef = useRef<HTMLParagraphElement>(null);
  const arrListRef = useRef<HTMLUListElement>(null);
  const arrBoxRef = useRef<HTMLDivElement>(null);
  /** The world's name across the glass through the entry. */
  const titleRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const placeRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const velRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const unitRef = useRef<HTMLElement>(null);
  const modeRef = useRef<HTMLSpanElement>(null);
  const rangeLabelRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const markerNameRef = useRef<HTMLSpanElement>(null);
  const commsRef = useRef<HTMLDivElement>(null);
  const commsFromRef = useRef<HTMLSpanElement>(null);
  const commsTextRef = useRef<HTMLParagraphElement>(null);
  const orderRef = useRef<HTMLDivElement>(null);
  const orderTextRef = useRef<HTMLSpanElement>(null);
  const orderBarRef = useRef<HTMLSpanElement>(null);
  const landRef = useRef<HTMLButtonElement>(null);
  const landTextRef = useRef<HTMLSpanElement>(null);
  const landStateRef = useRef<HTMLSpanElement>(null);
  const landFillRef = useRef(-1);
  const dockRef = useRef<HTMLButtonElement>(null);
  const dockTextRef = useRef<HTMLSpanElement>(null);
  const railRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const guardNameRef = useRef<HTMLSpanElement>(null);
  const placedRefs = useRef<Partial<Record<Placeable, HTMLElement | null>>>({});
  const ghostRefs = useRef<Partial<Record<Placeable, HTMLElement | null>>>({});
  const layoutBefore = useRef<Layout>({});
  /** Whether the deck was already paused when the editor was opened. */
  const pausedBefore = useRef(false);
  /** The ghost being dragged: which, by which pointer, from where. Kept
   *  out of render so a re-render mid-drag does not lose the finger. */
  const dragRef = useRef<{ id: Placeable; pointer: number; x: number; y: number } | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const pauseRef = useRef<() => void>(() => {});
  const brakeRef = useRef(false);
  const thrustRef = useRef(0);
  const heldRef = useRef<Partial<Record<'fire' | 'boost' | 'brake', number>>>({});
  const lookRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const zoomRef = useRef(1);
  const landscapeRef = useRef(landscape);
  landscapeRef.current = landscape;
  const onLandscapeRef = useRef(onLandscape);
  onLandscapeRef.current = onLandscape;
  const landedRef = useRef(landed);
  landedRef.current = landed;

  // A phone that already lies on its side needs no turned deck: the toggle
  // is only offered upright, and a real turn clears it.
  const [upright, setUpright] = useState(true);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    setTouch(coarse.matches);
    setLayout(loadLayout());
    const portrait = window.matchMedia('(orientation: portrait)');
    const onTurn = () => {
      setUpright(portrait.matches);
      if (!portrait.matches && landscapeRef.current) onLandscapeRef.current(false);
    };
    onTurn();
    // A tablet with a trackpad reports a fine pointer; the first finger on
    // the glass still brings the touch deck up.
    const onFinger = (e: PointerEvent) => { if (e.pointerType === 'touch') setTouch(true); };
    portrait.addEventListener('change', onTurn);
    window.addEventListener('pointerdown', onFinger, { passive: true });
    return () => {
      portrait.removeEventListener('change', onTurn);
      window.removeEventListener('pointerdown', onFinger);
    };
  }, []);
  // The deck's own guards, on the document: while the ship is flown nothing
  // may be selected, no callout may open, and a touch that is not on a key
  // starts no browser gesture of its own — so two thumbs are two thumbs.
  // Only while the deck is actually flown: on a surface or behind a pause
  // menu, panels, sliders and inputs need their own gestures back.
  useEffect(() => {
    if (!active || landed || shellPaused) return;
    const noSelect = (e: Event) => e.preventDefault();
    const noGesture = (e: TouchEvent) => {
      const el = eventElement(e);
      if (el && el.closest('button, input, select, textarea, label, a, [role="menu"], [role="dialog"], .flight-hud__help, .flight-hud__editor-bar, .room-panel, .room-badge')) return;
      if (e.cancelable) e.preventDefault();
    };
    document.addEventListener('selectstart', noSelect);
    document.addEventListener('contextmenu', noSelect);
    document.addEventListener('touchstart', noGesture, { passive: false });
    document.addEventListener('touchmove', noGesture, { passive: false });
    return () => {
      document.removeEventListener('selectstart', noSelect);
      document.removeEventListener('contextmenu', noSelect);
      document.removeEventListener('touchstart', noGesture);
      document.removeEventListener('touchmove', noGesture);
    };
  }, [active, landed, shellPaused]);
  // Each placed control wears its offset and scale as custom properties;
  // the stylesheet turns them into a transform in deck units.
  useEffect(() => {
    for (const id of PLACEABLE) {
      const el = placedRefs.current[id];
      if (!el) continue;
      const p = layout[id];
      el.style.setProperty('--dx', String(p?.x ?? 0));
      el.style.setProperty('--dy', String(p?.y ?? 0));
      el.style.setProperty('--ds', String(p?.s ?? 1));
    }
  }, [layout, active, touch, immersive, editing]);

  /** Hold the deck: the ship stops, the input lets go. The arrival and the
   *  layout editor hold it for themselves; only a pause the pilot asked
   *  for (`pause`) brings the shell's menu up over it. */
  const holdDeck = useCallback((): boolean => {
    if (!session.active || session.paused) return false;
    zoomRef.current = session.input.camZoom;
    session.paused = true;
    detachRef.current?.();
    detachRef.current = null;
    clearFlightInput(session.input);
    brakeRef.current = false;
    thrustRef.current = 0;
    heldRef.current = {};
    lookRef.current = null;
    setPaused(true);
    return true;
  }, [session]);
  const pause = useCallback(() => {
    if (holdDeck()) onPauseRequestRef.current?.();
  }, [holdDeck]);
  pauseRef.current = pause;
  const onPauseRequestRef = useRef(onPauseRequest);
  onPauseRequestRef.current = onPauseRequest;
  const attach = () => {
    if (!touch && rootRef.current) detachRef.current = attachDesktopControls(session, rootRef.current, () => pauseRef.current());
  };
  const enter = () => {
    session.shipKind = shipKind;
    session.input.fromHome = true;
    session.active = true;
    session.paused = false;
    session.telemetry.kills = 0;
    session.telemetry.odometerKm = 0;
    setActive(true);
    setPaused(false);
    setLaunch('on');
    onActiveChange(true);
    // First flight opens the control card; after that it is in the menu.
    try {
      if (!localStorage.getItem(HELP_SEEN)) {
        setHelp(true);
        localStorage.setItem(HELP_SEEN, '1');
      }
    } catch {
      // Private mode — just fly.
    }
    attach();
  };
  // Started in the ship: once, the first time the deck is idle over a
  // drawn orbit and nothing (a pause, a surface) is in the way.
  // Read from the session, not just the deck's state: an unmount cleanup
  // (React's development double mount included) lets go of the session
  // while the deck still says it is flying, and the ship must come back.
  // A pilot who left the ship on purpose (`exit`) is not put back in it.
  const autoLaunched = useRef(false);
  useEffect(() => {
    if (!autoLaunch || landed || shellPaused || session.active) return;
    if (autoLaunched.current && !active) return;
    autoLaunched.current = true;
    enter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLaunch, active, landed, shellPaused]);
  const resume = () => {
    session.paused = false;
    session.input.camZoom = zoomRef.current;
    setPaused(false);
    attach();
  };
  const landSiteRef = useRef<LandingSite>('moon');
  /** The site and the state the land key's wording was last painted for. */
  const landLabelRef = useRef('');
  const onLandRef = useRef(onLand);
  onLandRef.current = onLand;
  const onStandbyRef = useRef(onStandby);
  onStandbyRef.current = onStandby;
  /** The site the surface has been asked to build for, once per arrival. */
  const standbyRef = useRef<LandingSite | null>(null);
  /** Asked for the ground: the ship flies the arrival itself — transit,
   *  approach, pitch-over — and the surface's files come down while it does. */
  const land = () => {
    const site = landSiteRef.current;
    // The surface's own files, and the ship the crew are flying: it is what comes down.
    prefetchModels(assetsFor(site, session.shipKind));
    // Seen once, and it can be skipped from the first second; the first
    // time, the way out opens when the transit is behind them.
    try {
      arrivalSkipRef.current = !!localStorage.getItem(ARRIVAL_SEEN);
    } catch {
      arrivalSkipRef.current = false;
    }
    arrivalArmedRef.current = performance.now();
    arrivalRef.current = site;
    standbyRef.current = null;
    session.input.approachRequest = site;
    setArrival(site);
  };
  /** Down, or skipped: the deck hands the crew over to the surface. */
  const arrived = () => {
    const site = arrivalRef.current;
    if (!site) return;
    arrivalRef.current = null;
    try {
      localStorage.setItem(ARRIVAL_SEEN, '1');
    } catch {
      // Private mode — it plays in full every time.
    }
    setArrival(null);
    holdDeck();
    onLandRef.current(site);
  };
  const exit = () => {
    detachRef.current?.();
    detachRef.current = null;
    session.active = session.paused = false;
    clearFlightInput(session.input);
    setActive(false);
    setPaused(false);
    setLaunch('off');
    setHelp(false);
    setMenu(false);
    setEditing(false);
    setImmersive(false);
    onLandscape(false);
    onActiveChange(false);
  };
  // The launch screen comes down once the ship has actually flown a few
  // frames — the first ones are slow, every planet material recompiles for
  // the flight lights — and never before it has had its moment. Paused (the
  // window lost focus) the ship flies no frames: the screen comes down
  // anyway rather than sit over a paused deck.
  useEffect(() => {
    if (launch !== 'on') return;
    return settle({
      minMs: LAUNCH_MIN_MS, frames: LAUNCH_FRAMES,
      frame: () => session.telemetry.frame,
      idle: () => !session.active || session.paused,
      onSettled: () => setLaunch('fading'),
    });
  }, [launch, session]);
  // The shell's pause menu holds the deck, and letting go of it flies on.
  const shellPausedWas = useRef(false);
  useEffect(() => {
    if (shellPaused && active && !session.paused) holdDeck();
    else if (!shellPaused && shellPausedWas.current && active && session.paused && !editing) resume();
    shellPausedWas.current = !!shellPaused;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellPaused]);
  // Any key, any tap, and the arrival goes straight to the ground — once
  // the crew have seen it through, or once the transit is behind them.
  useEffect(() => {
    if (!arrival) return;
    // The key or tap that asked for the ground is still coming up: it is not
    // the crew skipping what they have not seen yet.
    const skip = () => {
      if (!arrivalSkipRef.current || performance.now() - arrivalArmedRef.current < 500) return;
      session.input.approachSkip = true;
    };
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [arrival, session]);
  useEffect(() => {
    if (launch !== 'fading') return;
    const id = window.setTimeout(() => setLaunch('off'), 700);
    return () => window.clearTimeout(id);
  }, [launch]);
  // Back up from the surface: the crew came up in the lander, so they come
  // back to the ship in orbit over the world they left — not to the orrery.
  // A deck that was only paused for the landing picks the flight up again;
  // a crew who never flew down (a deep link, a checkpoint) launch into it.
  useEffect(() => {
    if (!returnedFrom) return;
    session.input.relaunchAt = returnedFrom;
    if (active && session.paused) {
      resume();
      session.input.relaunch = true;
    } else if (!active) {
      enter();
      session.input.fromHome = false;
      session.input.relaunch = true;
    }
    onReturned?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedFrom]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', hidden);
      detachRef.current?.();
      session.active = session.paused = false;
      clearFlightInput(session.input);
    };
  }, [pause, session]);

  useEffect(() => {
    if (!active) return;
    const tel = session.telemetry;
    const root = rootRef.current;
    const radar = radarRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let radarPx = 0;
    let vw = 0;
    let vh = 0;
    const resize = () => {
      vw = root?.clientWidth ?? window.innerWidth;
      vh = root?.clientHeight ?? window.innerHeight;
      if (radar) {
        radarPx = radar.clientWidth;
        radar.width = radar.height = Math.round(radarPx * dpr);
      }
    };
    resize();
    window.addEventListener('resize', resize);
    // Turning the deck to landscape changes its box without a window resize.
    const observer = new ResizeObserver(resize);
    if (root) observer.observe(root);
    // The popup's own memory: the last moment worth saying, and until when.
    let popText = '';
    let popTone = '';
    let popUntil = 0;
    let wasReady = false;
    let lastOrder = '';
    const pop = (value: string, tone: string, now: number) => { popText = value; popTone = tone; popUntil = now + POPUP_MS; };
    const name = (id: string) => SOLAR_IDS.has(id) ? tb(`${id}.name`) : t.has(`bodies.${id}`) ? t(`bodies.${id}`) : id.toUpperCase();
    const text = (el: HTMLElement | null, value: string) => { if (el && el.textContent !== value) el.textContent = value; };
    // A custom property on the HUD root restyles the whole deck: written only when it changes.
    const props = new Map<string, string>();
    const prop = (el: HTMLElement | null, name: string, value: string) => {
      if (!el || props.get(name) === value) return;
      props.set(name, value);
      el.style.setProperty(name, value);
    };
    let raf = 0;
    let lastPaint = 0;
    const paint = (now: number) => {
      raf = requestAnimationFrame(paint);
      // Nothing to paint behind the Moon's screen or a hidden tab.
      if (now - lastPaint < 33 || landedRef.current || document.hidden) return;
      lastPaint = now;
      if (session.input.hudToggle) {
        session.input.hudToggle = false;
        setImmersive((v) => !v);
      }
      const system = t(`systems.${tel.systemName}`);
      // Where you are, big; what that is, small underneath.
      text(placeRef.current, tel.nearId ? name(tel.nearId) : system);
      text(subRef.current, tel.nearId ? `${t('orbit')} · ${system}` : t('system'));
      text(altRef.current, tel.nearId ? `${fmt(tel.nearAltKm)} km` : '—');
      text(velRef.current, `${fmt(tel.speedKmS)} ${t('kmS')}`);
      // In the jump the dial counts down the light years still to go.
      const jumping = tel.jumpPhase === 'travel';
      text(speedRef.current, fmt(jumping ? tel.targetLy * (1 - tel.jumpT) : tel.speedKmS));
      text(unitRef.current, jumping ? t('lyLeft') : t('kmS'));
      text(modeRef.current, t(`modes.${tel.pilot === 'eva' ? 'eva' : tel.mode}`));
      // The bar reads the way to the target when there is one, and the
      // distance flown when there is not.
      text(rangeLabelRef.current, tel.navId ? t('distance') : t('odometer'));
      text(rangeRef.current, `${fmt(tel.navId ? tel.navKm : tel.odometerKm)} km`);
      prop(root, '--speed', Math.min(1, tel.speedFrac).toFixed(3));
      prop(root, '--flash', tel.jumpFlash.toFixed(3));
      prop(root, '--warp', (tel.jumpPhase === 'charge' ? tel.jumpT * 0.6
        : tel.jumpPhase === 'travel' ? 0.6 + 0.4 * Math.sin(Math.min(1, tel.jumpT) * Math.PI) : 0).toFixed(3));
      // The air on the hull, at the edges of the glass: the entry, or any
      // dive into an atmosphere. The glide's haze comes up under it.
      prop(root, '--heat', Math.min(1, tel.heat).toFixed(3));
      prop(root, '--glide', (tel.approachPhase === 'glide' ? tel.approachLegT : 0).toFixed(3));
      if (root && root.dataset.view !== tel.view) root.dataset.view = tel.view;
      let status = '';
      if (tel.crashed) status = t('respawn', { n: Math.ceil(tel.respawnIn) });
      else if (tel.docked) status = t('dockedAt', { body: name(tel.dockedTo) });
      else if (tel.alert) status = t(`alerts.${tel.alert}`, { target: t(`systems.${tel.targetName}`), system });
      else if (tel.supply) status = t('supplying');
      else if (tel.pilot === 'eva') status = t(tel.canBoard ? 'evaBoardTouch' : 'evaOut');
      text(statusRef.current, status);
      // A world with ground to reach in the ship. The key comes up as soon as
      // that world is the near one, so you know the way down exists and what
      // it costs — dim, with the height to get under, until you are under it.
      const ceiling = LANDING_SITES[tel.nearId];
      const flyable = tel.pilot === 'ship' && !tel.crashed && tel.jumpPhase === 'none' && !tel.docked && !session.paused;
      const ready = ceiling !== undefined && tel.nearAltKm < ceiling;
      const canLand = ready && flyable;
      const landKey = landRef.current;
      if (landKey) {
        landKey.hidden = ceiling === undefined || !flyable;
        landKey.dataset.ready = String(ready);
        landKey.disabled = !ready;
        const label = `${tel.nearId}:${ready}`;
        if (!landKey.hidden) landSiteRef.current = tel.nearId as LandingSite;
        if (!landKey.hidden && landLabelRef.current !== label) {
          landLabelRef.current = label;
          text(landTextRef.current, t(`landOn.${tel.nearId}`));
          text(landStateRef.current, ready ? t('landReady') : t('landDescend', { n: fmt(ceiling) }));
        }
        // How far down to the ceiling, on a log scale: full once under it.
        if (!landKey.hidden) {
          const fill = ready ? 1 : Math.max(0, Math.min(1, 1 - Math.log(tel.nearAltKm / ceiling) / Math.log(40)));
          if (Math.abs(fill - landFillRef.current) > 0.005) {
            landFillRef.current = fill;
            landKey.style.setProperty('--land', fill.toFixed(3));
          }
        }
      }
      // L on a keyboard: with the pointer held for steering, no key on the
      // deck can be clicked, so the way down has to be on the keys.
      if (session.input.landRequest) {
        session.input.landRequest = false;
        if (canLand && !arrivalRef.current) land();
      }
      // ── The arrival, while the ship flies it: which leg, how far through,
      // what has come down for the surface, and the way out of it. ──
      if (arrivalRef.current) {
        const ph = tel.approachPhase;
        // Down — or the sim refused the run (a wreck, a jump): either way
        // the crew go to the surface rather than sit on a dead screen.
        if (ph === 'done' || (ph === '' && now - arrivalArmedRef.current > 1000)) {
          arrived();
          return;
        }
        // The sim names the leg from its first frame; until then there is
        // nothing to say, and nothing to ask the translator for.
        if (ph !== '') text(arrPhaseRef.current, t(`arrival.${ph}`));
        // The last leg: the surface builds behind it, so the handover at the
        // end of it needs no loading screen.
        const site = arrivalRef.current;
        if (standbyRef.current !== site && (ph === 'orbit' || ph === 'glide' || tel.approachT >= STANDBY_AT)) {
          standbyRef.current = site;
          onStandbyRef.current?.(site);
        }
        if (arrBoxRef.current && arrBoxRef.current.dataset.phase !== ph) arrBoxRef.current.dataset.phase = ph;
        text(arrPlaceRef.current, name(arrivalRef.current));
        arrBarRef.current?.style.setProperty('--t', tel.approachT.toFixed(3));
        // The title card follows the profile's own curve, from the deck's
        // clock: up a beat into the entry, gone before the ground. A world
        // flown down from orbit in its own scene gets its card there.
        titleRef.current?.style.setProperty('--title', titleCard(tel.approachT * APPROACH_SECONDS, approachProfileFor(arrivalRef.current)).toFixed(3));
        if (!arrivalSkipRef.current && tel.approachT * APPROACH_SECONDS >= ARRIVAL_SKIP_AFTER) arrivalSkipRef.current = true;
        const hint = arrHintRef.current;
        if (hint && hint.hidden === arrivalSkipRef.current) hint.hidden = !arrivalSkipRef.current;
        const ready = prefetchDone();
        for (const li of Array.from(arrListRef.current?.children ?? []) as HTMLElement[]) {
          const on = String(ready.has(li.dataset.group ?? ''));
          if (li.dataset.done !== on) li.dataset.done = on;
        }
      }
      // A station in reach: the docking computer's key.
      const dockKey = dockRef.current;
      if (dockKey) {
        const show = (tel.canDock || tel.docking) && !session.paused;
        dockKey.hidden = !show;
        dockKey.dataset.on = String(tel.docking);
        if (show) text(dockTextRef.current, t(tel.docking ? 'docking' : 'dock'));
      }

      // ── The popup. On a phone the deck keeps to the edges and leaves the
      // glass to the view, so what matters comes up in the middle of it and
      // goes again: the ship's own alerts for as long as they stand, and the
      // moments the smaller deck no longer shows — low enough to land, a new
      // standing order, the order done — for a few seconds each. `compact`
      // is the stylesheet's own phone test: narrow, or turned on its side. ──
      const compact = touch && (vw < 600 || vh < 501);
      const landNow = canLand;
      const orderKey = session.combat ? (tel.orderDone ? 'done' : tel.orderId) : '';
      if (compact) {
        if (landNow && !wasReady) pop(`${t(`landOn.${tel.nearId}`)} · ${t('landReady')}`, 'ok', now);
        if (orderKey && orderKey !== lastOrder) pop(tel.orderDone ? t('orderDone') : t('order', { body: name(tel.orderId) }), tel.orderDone ? 'ok' : 'warn', now);
      }
      wasReady = landNow;
      lastOrder = orderKey;
      const toast = toastRef.current;
      if (toast) {
        const showing = !compact ? '' : status || (now < popUntil ? popText : '');
        const tone = status ? (tel.crashed || WARN_ALERTS.has(tel.alert) ? 'warn' : OK_ALERTS.has(tel.alert) || tel.docked ? 'ok' : 'info') : popTone;
        if (toast.hidden !== !showing) toast.hidden = !showing;
        if (showing) {
          text(toast, showing);
          if (toast.dataset.tone !== tone) toast.dataset.tone = tone;
        }
      }

      // The quick targets in the menu: one for every kind of thing this
      // system holds, lit when the deck is locked onto one of them.
      RAIL.forEach((r, i) => {
        const el = railRefs.current[i];
        if (!el) return;
        const kinds = r.kinds ? r.kinds.split(',') : null;
        const on = kinds
          ? tel.navList.some((c) => kinds.includes(c.kind))
          : tel.navList.some((c) => c.id === r.id);
        el.hidden = !on;
        const lit = kinds ? kinds.includes(tel.navKind) && !RAIL_IDS.has(tel.navId) : tel.navId === r.id;
        el.dataset.on = String(lit);
      });

      // Incoming transmission: the harbour that hails, one line at a time.
      const comms = commsRef.current;
      if (comms) {
        const key = `comms.${tel.commsFrom}.l${tel.commsLine}`;
        const on = tel.commsLine > 0 && t.has(key);
        comms.hidden = !on;
        if (on) {
          text(commsFromRef.current, t('commsHeader', { from: name(tel.commsFrom) }));
          text(commsTextRef.current, t(key));
        }
      }

      // Standing order: the world the deck wants taken apart.
      const order = orderRef.current;
      if (order) {
        const on = session.combat && (!!tel.orderId || tel.orderDone);
        order.hidden = !on;
        order.dataset.done = String(tel.orderDone);
        if (on) {
          text(orderTextRef.current, tel.orderDone ? t('orderDone') : t('order', { body: name(tel.orderId) }));
          orderBarRef.current?.style.setProperty('transform', `scaleX(${tel.orderDone ? 0 : tel.orderIntegrity})`);
        }
      }
      // With the shields down the first bar reads the hull instead, in the
      // warning colour: what is left between the crew and the next hit.
      const shieldsDown = tel.shield <= 0 && !tel.crashed;
      const levels = [shieldsDown ? tel.hp / tel.maxHp : tel.shield / tel.maxShield, tel.energy, tel.boostCharge];
      levels.forEach((level, i) => {
        barRefs.current[i]?.style.setProperty('transform', `scaleX(${Math.max(0, Math.min(1, level))})`);
      });
      const guard = shieldsDown ? 'hull' : 'shield';
      if (root && root.dataset.guard !== guard) {
        root.dataset.guard = guard;
        text(guardNameRef.current, t(guard));
      }
      // A hit on the glass: the shield's blue shimmer while it holds, red once
      // the hull is taking it.
      root?.style.setProperty('--hit', tel.hitFlash.toFixed(3));
      const marker = markerRef.current;
      if (marker) {
        const locked = tel.navId && tel.nav.on;
        const show = !tel.crashed && (locked || tel.markerCount > 0);
        marker.hidden = !show;
        if (show) {
          const x = locked ? (tel.nav.x * 0.5 + 0.5) * vw : tel.markers[0];
          const y = locked ? (-tel.nav.y * 0.5 + 0.5) * vh : tel.markers[1];
          marker.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
          const id = locked ? tel.navId : tel.markerIds[0];
          text(markerNameRef.current, id === 'jump' ? t(`systems.${tel.targetName}`) : name(id));
        }
      }

      if (radar && radarPx > 0) {
        const ctx = radar.getContext('2d');
        if (ctx) {
          const c = radar.width / 2;
          const r = c - 3 * dpr;
          ctx.clearRect(0, 0, radar.width, radar.height);
          ctx.lineWidth = dpr;
          ctx.strokeStyle = 'rgba(160, 210, 245, 0.3)';
          for (const k of [0.4, 0.7, 1]) {
            ctx.beginPath(); ctx.arc(c, c, r * k, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.fillStyle = 'rgba(160, 210, 245, 0.9)';
          ctx.beginPath(); ctx.moveTo(c, c - 5 * dpr); ctx.lineTo(c + 3 * dpr, c + 4 * dpr);
          ctx.lineTo(c - 3 * dpr, c + 4 * dpr); ctx.closePath(); ctx.fill();
          for (let i = 0; i < tel.radarCount; i++) {
            ctx.beginPath(); ctx.arc(c + tel.radar[i * 2] * r, c - tel.radar[i * 2 + 1] * r, 2 * dpr, 0, Math.PI * 2); ctx.fill();
          }
          if (tel.navId) {
            ctx.beginPath(); ctx.arc(c + tel.navRadarX * r * 0.9, c - tel.navRadarY * r * 0.9, 3 * dpr, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
    };
    raf = requestAnimationFrame(paint);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); observer.disconnect(); };
  }, [active, paused, touch, session, t, tb]);

  const hold = (key: 'fire' | 'boost' | 'brake') => {
    const release = (e: React.PointerEvent<HTMLButtonElement>) => {
      if (heldRef.current[key] !== e.pointerId) return;
      delete heldRef.current[key];
      if (key === 'brake') {
        brakeRef.current = false;
        session.input.thrust = thrustRef.current;
      } else session.input[key] = false;
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (session.paused || editing || e.button !== 0 || heldRef.current[key] !== undefined) return;
        e.preventDefault();
        heldRef.current[key] = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        if (key === 'brake') {
          brakeRef.current = true;
          session.input.thrust = -1;
        } else session.input[key] = true;
      },
      onPointerUp: release, onPointerCancel: release, onLostPointerCapture: release,
    };
  };
  /** The look pad: one finger, the first one down, owns it until it lifts;
   *  its travel goes to the model as mouse travel, turned with the deck. */
  const look = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (session.paused || editing || lookRef.current) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      lookRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const l = lookRef.current;
      if (!l || l.id !== e.pointerId) return;
      // The same look settings the mouse and the pad answer to.
      const s = getSettings();
      let dx = (e.clientX - l.x) * LOOK_GAIN * s.sensitivity;
      let dy = (e.clientY - l.y) * LOOK_GAIN * s.sensitivity;
      l.x = e.clientX; l.y = e.clientY;
      // A quarter turn clockwise: the pad's right is the screen's down.
      if (landscapeRef.current) [dx, dy] = [dy, -dx];
      session.input.mouseDX += dx;
      session.input.mouseDY += s.invertY ? -dy : dy;
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => { if (lookRef.current?.id === e.pointerId) lookRef.current = null; },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => { if (lookRef.current?.id === e.pointerId) lookRef.current = null; },
  };
  /** A quick target: a named world goes straight on the nav, a kind walks it. */
  const pick = (r: RailKey) => {
    if (session.paused) return;
    if (r.id) session.input.targetRequest = r.id;
    else session.input.targetKind = r.kinds ?? null;
    setMenu(false);
  };
  const railLabel = (key: string) =>
    key === 'earth' ? tb('earth.name') : key === 'planets' || key === 'stars' ? t(`groups.${key}`) : t(`bodies.${key}`);

  // ── The layout editor: no longer offered in the menu (the deck keeps
  // only the keys it needs); a layout saved before still applies. ──
  const closeEditor = (keep: boolean) => {
    if (keep) saveLayout(layout);
    else setLayout(layoutBefore.current);
    setEditing(false);
    setPicked(null);
    if (!pausedBefore.current) resume();
  };
  const nudgeSize = (dir: number) => {
    if (!picked) return;
    setLayout((l) => {
      const p = l[picked] ?? { x: 0, y: 0, s: 1 };
      return { ...l, [picked]: { ...p, s: Math.min(1.6, Math.max(0.6, +(p.s + dir * 0.1).toFixed(2))) } };
    });
  };
  /** Ghosts sit over the controls they move; they are re-fitted from the
   *  live boxes whenever the layout changes. */
  useEffect(() => {
    if (!editing) return;
    const root = rootRef.current;
    if (!root) return;
    const fit = () => {
      const R = root.getBoundingClientRect();
      for (const id of PLACEABLE) {
        const el = placedRefs.current[id];
        const ghost = ghostRefs.current[id];
        if (!el || !ghost) continue;
        const r = el.getBoundingClientRect();
        const off = r.width === 0 || getComputedStyle(el).visibility === 'hidden';
        ghost.hidden = off;
        if (off) continue;
        ghost.style.left = `${r.left - R.left}px`;
        ghost.style.top = `${r.top - R.top}px`;
        ghost.style.width = `${r.width}px`;
        ghost.style.height = `${r.height}px`;
      }
    };
    fit();
    const id = requestAnimationFrame(fit);
    window.addEventListener('resize', fit);
    return () => { cancelAnimationFrame(id); window.removeEventListener('resize', fit); };
  }, [editing, layout, picked]);
  const ghostDrag = (id: Placeable) => ({
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (dragRef.current || e.button !== 0) return;
      e.preventDefault();
      dragRef.current = { id, pointer: e.pointerId, x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPicked(id);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      const root = rootRef.current;
      if (!d || d.id !== id || d.pointer !== e.pointerId || !root) return;
      const dx = (e.clientX - d.x) / root.clientWidth;
      const dy = (e.clientY - d.y) / root.clientHeight;
      d.x = e.clientX; d.y = e.clientY;
      setLayout((l) => {
        const p = l[id] ?? { x: 0, y: 0, s: 1 };
        return { ...l, [id]: { ...p, x: +(p.x + dx).toFixed(4), y: +(p.y + dy).toFixed(4) } };
      });
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointer === e.pointerId) dragRef.current = null; },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => { if (dragRef.current?.pointer === e.pointerId) dragRef.current = null; },
  });
  const placed = (id: Placeable) => ({ 'data-place': id, ref: (el: HTMLElement | null) => { placedRefs.current[id] = el; } });
  const keysOff = (paused && !editing);

  return (
    <div ref={rootRef} className="flight-hud" data-touch={touch} data-phase={active ? 'flying' : 'idle'} data-paused={paused} data-immersive={immersive} data-menu={menu} data-editing={editing} data-arrival={arrival !== null} hidden={landed}>
      {!active ? (
        <div className="flight-hud__launch">
          <button type="button" className="flight-hud__ship" onClick={() => setShipKind(SHIPS[(SHIPS.indexOf(shipKind) + 1) % SHIPS.length])} aria-label={t('hangar')}>
            {t(`ships.${shipKind}`)}
          </button>
          <button type="button" className="flight-hud__explore" onClick={enter}><Rocket size={16} aria-hidden />{t('explore')}</button>
        </div>
      ) : (
        <>
          {launch !== 'off' && (
            <CosmicLoader className={launch === 'fading' ? 'flight-hud__launching is-done' : 'flight-hud__launching'} variant="hyperspace"
              label={tl('preflight')} detail={tl('preflightDetail', { ship: t(`ships.${shipKind}`) })} tips={tips} />
          )}
          {/* The look pad: the right of the glass, under everything else on it. */}
          {touch && <div className="flight-hud__lookpad" {...look} aria-hidden />}
          {/* The jump on the glass: the rim closes in as the drive charges,
              and the flash goes off at both ends of the jump. */}
          <div className="flight-hud__warp" aria-hidden />
          <div className="flight-hud__flash" aria-hidden />
          {/* The air on the hull, seen from the seat: an orange glow at the
              edges of the glass that follows the heat, and the ground's haze
              coming up through the glide. */}
          <div className="flight-heat" aria-hidden />
          <div className="flight-hud__hit" aria-hidden />

          {/* The world's name, letter-spaced across the glass, with one line
              of what it is like down there — the entry's title card. */}
          {arrival !== null && (
            <div ref={titleRef} className="flight-title" aria-hidden>
              <span className="flight-title__name">{t(`worlds.${arrival}.name`)}</span>
              <span className="flight-title__line">{t(`worlds.${arrival}.descriptors`)} · {t(`worlds.${arrival}.temp`)}</span>
            </div>
          )}

          {/* The arrival: the ship has the con. What it is doing, how far
              through it is, what has come down for the surface waiting at
              the end of it, and the way to skip it once it is familiar. */}
          {arrival !== null && (
            <div ref={arrBoxRef} className="flight-arrival" role="status" aria-live="polite">
              <p className="flight-arrival__head">
                <span ref={arrPhaseRef} className="flight-arrival__phase" />
                <span ref={arrPlaceRef} className="flight-arrival__place" />
              </p>
              <span ref={arrBarRef} className="flight-arrival__bar" aria-hidden><i /></span>
              <ul ref={arrListRef} className="flight-arrival__list">
                {SURFACE_GROUPS.filter((g) => assetsFor(arrival, session.shipKind).some((a) => a.group === g)).map((g) => (
                  <li key={g} data-group={g} data-done="false">
                    <Check size={13} aria-hidden />
                    <span>{t(`arrival.load.${g}`)}</span>
                  </li>
                ))}
              </ul>
              <p ref={arrHintRef} className="flight-arrival__skip" hidden>{t('arrival.skip')}</p>
            </div>
          )}

          <div className="flight-hud__head" {...placed('head')}>
            <span ref={placeRef} className="flight-hud__title" />
            <span ref={subRef} className="flight-hud__sub" />
            <div className="flight-hud__readings">
              <span className="flight-hud__reading"><Ruler size={15} aria-hidden /><span>{t('alt')}</span><b ref={altRef} /></span>
              <span className="flight-hud__reading"><Orbit size={15} aria-hidden /><span>{t('speed')}</span><b ref={velRef} /></span>
            </div>
            <span ref={statusRef} className="flight-hud__status" role="status" />
          </div>

          {/* Top right: the menu. Everything else lives in it. */}
          <div className="flight-hud__top-keys" {...placed('topkeys')}>
            <button type="button" className="flight-hud__round" onClick={() => { setMenu((m) => !m); setHelp(false); }} aria-expanded={menu} aria-haspopup="menu" aria-label={t('menu')} title={t('menu')}>
              {menu ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
            </button>
            {menu && (
              <div className="flight-hud__menu" role="menu" aria-label={t('menu')}>
                <button type="button" role="menuitem" onClick={() => { (paused ? resume : pause)(); setMenu(false); }}>
                  {paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}<span>{t(paused ? 'resume' : 'pause')}</span>
                </button>
                <button type="button" role="menuitem" disabled={paused} onClick={() => { session.input.targetStep = 1; setMenu(false); }}>
                  <Crosshair size={16} aria-hidden /><span>{t('nextTarget')}</span>
                </button>
                <div className="flight-hud__menu-group" role="group" aria-label={t('targets')}>
                  {RAIL.map((r, i) => { const Icon = r.icon; return (
                    <button key={r.key} ref={(el) => { railRefs.current[i] = el; }} type="button" role="menuitem" className="flight-hud__rail-key" onClick={() => pick(r)} disabled={paused} hidden>
                      <Icon size={15} aria-hidden /><span>{railLabel(r.key)}</span>
                    </button>
                  ); })}
                </div>
                <button type="button" role="menuitem" disabled={paused} onClick={() => { session.input.viewToggle = true; setMenu(false); }}>
                  <Eye size={16} aria-hidden /><span>{t('view')}</span>
                </button>
                {touch && (upright || landscape) && (
                  <button type="button" role="menuitem" className="flight-hud__turn" data-on={landscape} onClick={() => { onLandscape(!landscape); setMenu(false); }}>
                    <Smartphone size={16} aria-hidden /><span>{t(landscape ? 'portrait' : 'landscape')}</span>
                  </button>
                )}
                <button type="button" role="menuitem" onClick={toggleSound} aria-pressed={sound}>
                  {sound ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}<span>{t(sound ? 'soundOn' : 'soundOff')}</span>
                </button>
                <button type="button" role="menuitem" onClick={() => { setHelp((h) => !h); setMenu(false); }}>
                  <HelpCircle size={16} aria-hidden /><span>{t('help')}</span>
                </button>
                <button type="button" role="menuitem" className="flight-hud__menu-exit" onClick={exit}>
                  <LogOut size={16} aria-hidden /><span>{t('exit')}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right: the drive card and the standing order. */}
          <div className="flight-hud__side" {...placed('side')}>
            <FlightJumpCard session={session} paused={keysOff} touch={touch} />
            <div ref={orderRef} className="flight-hud__card flight-hud__order" hidden>
              <span className="flight-hud__card-icon"><Radio size={18} aria-hidden /></span>
              <span className="flight-hud__card-text">
                <span className="flight-hud__card-label">{t('orderTitle')}</span>
                <span ref={orderTextRef} className="flight-hud__card-value" />
                <span className="flight-hud__track"><span ref={orderBarRef} /></span>
              </span>
              <span className="flight-hud__dot" aria-hidden />
            </div>
          </div>

          {help && (
            <div className="flight-hud__help" role="dialog" aria-label={t('help')}>
              <div className="flight-hud__help-head">
                <span>{t('help')}</span>
                <button type="button" onClick={() => setHelp(false)} aria-label={t('exit')}><X size={14} aria-hidden /></button>
              </div>
              {(touch ? TOUCH_ROWS : KEY_ROWS).map((k) => <p key={k}>{t(`keys.${k}`)}</p>)}
            </div>
          )}
          <div ref={markerRef} className="flight-hud__marker" hidden><span ref={markerNameRef} /></div>
          <div ref={toastRef} className="flight-hud__toast" role="status" aria-live="polite" hidden />
          <div ref={commsRef} className="flight-hud__comms" role="status" hidden>
            <span ref={commsFromRef} className="flight-hud__comms-from" />
            <p ref={commsTextRef} />
          </div>

          {/* The dock: the stick, the thumb keys, the console bar. */}
          <div className="flight-hud__dock">
            <div className="flight-hud__prompts">
              <button ref={landRef} type="button" className="flight-hud__prompt flight-hud__land" {...tapKey(land)} hidden>
                <span className="flight-hud__land-icon"><ArrowDownToLine size={15} aria-hidden /></span>
                <span className="flight-hud__land-text">
                  <span ref={landTextRef} className="flight-hud__land-title">{t('landOn.moon')}</span>
                  <span className="flight-hud__land-gauge" aria-hidden><i /></span>
                  <span ref={landStateRef} className="flight-hud__land-state" />
                </span>
                {!touch && <kbd className="flight-hud__land-key">L</kbd>}
              </button>
            </div>
            {touch && (
              <div className="flight-hud__move" {...placed('move')}>
                {(!paused || editing) && <GameStick label={t('move')} rotated={landscape} onMove={(x, y) => {
                  if (editing) return;
                  thrustRef.current = y;
                  session.input.thrust = brakeRef.current ? -1 : y;
                  session.input.yaw = x;
                }} />}
              </div>
            )}
            <div className="flight-hud__keys" data-combat={session.combat}>
              {touch ? (
                <>
                  {session.combat && <button type="button" className="flight-hud__key flight-hud__key--fire" {...placed('fire')} {...hold('fire')} disabled={keysOff} aria-label={t('fire')} title={t('fire')}><Crosshair size={26} aria-hidden /><span>{t('fire')}</span></button>}
                  <button type="button" className="flight-hud__key" {...placed('boost')} {...hold('boost')} disabled={keysOff} aria-label={t('boost')} title={t('boost')}><ChevronsUp size={20} aria-hidden /><span>{t('boost')}</span></button>
                  <button type="button" className="flight-hud__key" {...placed('brake')} {...hold('brake')} disabled={keysOff} aria-label={t('brake')} title={t('brake')}><Pause size={16} aria-hidden /><span>{t('brake')}</span></button>
                  <div className="flight-hud__gear-slot" {...placed('gear')}><FlightGear session={session} paused={keysOff} touch={touch} /></div>
                </>
              ) : (
                <>
                  <div className="flight-hud__gear-slot" {...placed('gear')}><FlightGear session={session} paused={keysOff} touch={touch} /></div>
                </>
              )}
            </div>
            <div className="flight-hud__console" {...placed('console')}>
              <button type="button" className="flight-hud__radar" aria-label={t('target')} {...tapKey(() => { session.input.targetStep = 1; })} disabled={keysOff}>
                <canvas ref={radarRef} aria-hidden />
              </button>
              <div className="flight-hud__range">
                <span ref={rangeLabelRef} className="flight-hud__console-label" />
                <span ref={rangeRef} className="flight-hud__console-value">0 km</span>
              </div>
              <div className="flight-hud__speed">
                <svg viewBox="0 0 120 120" aria-hidden>
                  <circle cx="60" cy="60" r="52" />
                  <circle className="flight-hud__speed-arc" cx="60" cy="60" r="52" pathLength="1" />
                </svg>
                <span ref={modeRef} className="flight-hud__console-label" />
                <span ref={speedRef} className="flight-hud__speed-value">0</span><small ref={unitRef}>{t('kmS')}</small>
              </div>
              <div className="flight-hud__systems">
                {BARS.map((key, i) => { const Icon = ICONS[i]; return <div key={key} className="flight-hud__sys" aria-label={t(key)}>
                  <Icon size={15} aria-hidden /><span ref={i === 0 ? guardNameRef : undefined} className="flight-hud__sys-name">{t(key)}</span>
                  <span className="flight-hud__track"><span ref={(el) => { barRefs.current[i] = el; }} /></span>
                </div>; })}
              </div>
            </div>
          </div>

          {/* The layout editor: a ghost over every control, a bar to keep or
              drop the result, and a size for whichever ghost is held. */}
          {editing && (
            <div className="flight-hud__editor" role="dialog" aria-label={t('customize')}>
              {PLACEABLE.map((id) => (
                <div key={id} ref={(el) => { ghostRefs.current[id] = el; }} className="flight-hud__ghost" data-picked={picked === id} {...ghostDrag(id)} hidden>
                  <span>{t(`places.${id}`)}</span>
                </div>
              ))}
              <div className="flight-hud__editor-bar">
                <span className="flight-hud__editor-hint">{picked ? t(`places.${picked}`) : t('layoutHint')}</span>
                <button type="button" onClick={() => nudgeSize(-1)} disabled={!picked} aria-label={t('sizeDown')} title={t('sizeDown')}><Minus size={16} aria-hidden /></button>
                <button type="button" onClick={() => nudgeSize(1)} disabled={!picked} aria-label={t('sizeUp')} title={t('sizeUp')}><Plus size={16} aria-hidden /></button>
                <button type="button" onClick={() => { setLayout({}); setPicked(null); }} aria-label={t('layoutReset')} title={t('layoutReset')}><RotateCcw size={16} aria-hidden /></button>
                <button type="button" onClick={() => closeEditor(false)} aria-label={t('layoutCancel')} title={t('layoutCancel')}><X size={16} aria-hidden /></button>
                <button type="button" className="flight-hud__editor-save" onClick={() => closeEditor(true)}><Check size={16} aria-hidden /><span>{t('layoutSave')}</span></button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
