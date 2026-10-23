'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { SolarSystemCanvas, type EpochRef } from '@/components/solar-system/SolarSystemCanvas';
import { PlayerShip, type LandingSite } from '@/components/solar-system/PlayerShip';
import { createFlightSession, type FlightSession } from '@/lib/solar-system/player-ship';
import type { SolarBodyId } from '@/lib/solar-system/ephemeris';
import type { RoomLink } from '@/lib/multiplayer/room-link';
import { game, type GameState, type LoadStage } from '@/game/state';
import { canOverlapScenes } from '@/game/quality';
import type { GameScene } from '@/game/save';
import type { GameMode } from '@/game/mode';
import { StoryHud } from './StoryHud';
import { settle } from '@/game/settle';
import { useExploreRewards } from './useExploreRewards';

/** The surfaces are chunks of their own: the orbit never parses them. They
 *  are fetched once the orbit is up (see the prefetch below), well before
 *  an arrival asks one to build. */
const loadMoon = () => import('@/components/solar-system/MoonSurface');
const loadWorlds = () => import('@/components/solar-system/WorldSurface');
const MoonSurface = dynamic(() => loadMoon().then((m) => m.MoonSurface), { ssr: false });
const WorldSurface = dynamic(() => loadWorlds().then((m) => m.WorldSurface), { ssr: false });

/** The climb back to orbit stays up at least this long, and until the deck has flown a few frames. */
const ORBIT_MIN_MS = 500;
const ORBIT_FRAMES = 2;
/** The cross-fade between the flight and a surface when one hands over to the other, ms (the CSS matches). */
const HANDOVER_FADE_MS = 1100;
/** The veil's way in, ms: the scene being left goes once it is opaque (the CSS matches). */
const VEIL_IN_MS = 450;

const SPEED_STEPS = [
  { id: 'realtime', rate: 1 },
  { id: '10m', rate: 600 },
  { id: '1h', rate: 3600 },
  { id: '1d', rate: 86400 },
] as const;

interface GameWorldProps {
  scene: GameScene;
  state: GameState;
  /** Free Fly, the story, or a room (game/mode.ts). */
  mode: GameMode;
  /** The multiplayer link, owned by the shell so the lobby can join before the world exists. */
  room: RoomLink;
  /** The orrery's clock, owned by the shell so a room can set it. */
  epoch: EpochRef;
}

/** The orrery, the ship and the surfaces, composed by the game's scene.
 *  The orbit canvas is not built until the player first goes to orbit. */
export function GameWorld({ scene, state, mode, room, epoch }: GameWorldProps) {
  const t = useTranslations('solarSystem');
  const tp = useTranslations('play');
  const format = useFormatter();
  const landed = scene === 'orbit' ? null : scene;
  // The platform connection: records the surfaces write go out as Stars.
  const rewards = useExploreRewards();
  const paused = state === 'paused';
  const flightRef = useRef<FlightSession | null>(null);
  if (!flightRef.current) flightRef.current = createFlightSession({ combat: false });
  const session = flightRef.current;
  // The clock the canvas reads is a mutable cell; React only sees it once a
  // second, for the mini-clock, so ticking it never re-renders the deck.
  const [clockMs, setClockMs] = useState(epoch.current);
  const [selectedId, setSelectedId] = useState<SolarBodyId | null>(null);
  // The orrery runs at an hour a second; the clock keys are gone from the
  // deck (it keeps only the keys the game needs), so it is not changed here.
  const playing = true;
  const speedIdx = 2;
  const [flightActive, setFlightActive] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [zoomTo, setZoomTo] = useState<number | null>(null);
  const [orbitReady, setOrbitReady] = useState(false);
  const [orbitVisited, setOrbitVisited] = useState(scene === 'orbit');
  const onSceneReady = useCallback(() => setOrbitReady(true), []);
  // The surfaces' code, fetched once the orbit has drawn: an arrival then builds without a wait.
  useEffect(() => {
    if (!orbitReady) return;
    const id = window.setTimeout(() => { void loadMoon(); void loadWorlds(); }, 1500);
    return () => window.clearTimeout(id);
  }, [orbitReady]);
  const zoomToSun = useCallback(() => { setSelectedId(null); setZoomTo(26); }, []);
  const consumeZoom = useCallback(() => setZoomTo(null), []);
  useEffect(() => { if (scene === 'orbit') setOrbitVisited(true); }, [scene]);
  // ── The handover between the flight and a surface, with no loading screen.
  // On the way down the surface is built behind the arrival's last leg
  // (`standby`), drawn but not shown, and revealed by a cross-fade once the
  // game says it is the scene; on the way up the surface stays on screen
  // until the orbit has drawn, then fades off it. ──
  //
  // Holding two scenes at once doubles what the game holds, and a phone's
  // browser kills a tab that grows like that (it reloads: the game seemed to
  // restart on its own, worst on Earth). So only a desktop with room
  // overlaps them (`overlap`); everywhere else the scene being left goes
  // first, behind a veil: the entry's plasma on the way down, the dark of
  // space on the way up, lifted once the next scene has drawn.
  const overlap = useRef<boolean | null>(null);
  if (overlap.current === null) overlap.current = canOverlapScenes();
  const [veil, setVeil] = useState<null | { kind: 'entry' | 'ascent'; to: GameScene; lifting: boolean }>(null);
  /** The world the ship flew into: its surface picks the flight up at the top of the entry. */
  const [entryInto, setEntryInto] = useState<LandingSite | null>(null);
  const [standby, setStandby] = useState<LandingSite | null>(null);
  /** The surface just left, kept up over the orbit while the orbit builds. */
  const [leaving, setLeaving] = useState<LandingSite | null>(null);
  const surfaceSite: LandingSite | null = landed ?? standby ?? leaving;
  const surfaceShown = landed !== null && state !== 'loading';
  const surfaceReady = useRef<LandingSite | null>(null);
  const onSurfaceProgress = useCallback((stage: LoadStage) => {
    if (stage === 'ready') surfaceReady.current = surfaceSiteRef.current;
    game.progress(stage);
  }, []);
  const surfaceSiteRef = useRef(surfaceSite);
  surfaceSiteRef.current = surfaceSite;
  useEffect(() => { if (surfaceSite === null) surfaceReady.current = null; }, [surfaceSite]);
  // Built in standby and already drawn: the moment it becomes the scene it is ready.
  useEffect(() => {
    if (state === 'loading' && landed !== null && surfaceReady.current === landed) game.progress('ready');
  }, [state, landed]);
  useEffect(() => { if (landed !== null) setStandby(null); }, [landed]);
  // The orbit has drawn: the surface left behind fades off it, then goes.
  useEffect(() => {
    if (leaving === null || scene !== 'orbit' || state === 'loading') return;
    const id = window.setTimeout(() => setLeaving(null), HANDOVER_FADE_MS);
    return () => window.clearTimeout(id);
  }, [leaving, scene, state]);
  // The surface is shown: the flight under it is let go once the fade is over.
  const [flightGone, setFlightGone] = useState(landed !== null);
  useEffect(() => {
    if (landed === null) { setFlightGone(false); return; }
    if (!surfaceShown) return;
    const id = window.setTimeout(() => setFlightGone(true), HANDOVER_FADE_MS);
    return () => window.clearTimeout(id);
  }, [landed, surfaceShown]);
  // Without the overlap the flight is never up under a surface.
  const flightUp = landed === null || (!!overlap.current && !flightGone);
  // The veil is opaque: the scene being left can go, and the game travels.
  useEffect(() => {
    if (!veil || veil.lifting) return;
    if (game.get().scene === veil.to) return;
    const id = window.setTimeout(() => {
      if (veil.kind === 'ascent') setLeaving(null);
      game.travel(veil.to, { seamless: true });
    }, VEIL_IN_MS);
    return () => window.clearTimeout(id);
  }, [veil]);
  // The next scene has drawn: the veil lifts off it, then goes.
  useEffect(() => {
    if (!veil || veil.lifting || scene !== veil.to || state === 'loading') return;
    setVeil({ ...veil, lifting: true });
  }, [veil, scene, state]);
  useEffect(() => {
    if (!veil?.lifting) return;
    const id = window.setTimeout(() => setVeil(null), HANDOVER_FADE_MS);
    return () => window.clearTimeout(id);
  }, [veil]);
  useEffect(() => { if (landed === null) setEntryInto(null); }, [landed]);
  // The orbit canvas is torn down while a surface has the screen (its
  // context, maps and galaxy layers would sit under the Moon's renderer) and
  // rebuilt on the way back, so the loader waits for its first frame again.
  useEffect(() => { if (landed !== null) setOrbitReady(false); }, [landed]);
  // Orbit: the canvas builds on mount and reports its first frame; the
  // screen then waits for the deck to have flown a little, or to be idle.
  useEffect(() => {
    if (scene !== 'orbit' || state !== 'loading') return;
    if (!orbitReady) { game.progress('build'); return; }
    return settle({
      minMs: ORBIT_MIN_MS, frames: ORBIT_FRAMES,
      frame: () => session.telemetry.frame,
      idle: () => !session.active || session.paused,
      onSettled: () => game.progress('ready'),
    });
  }, [scene, state, orbitReady, session]);
  // The turned viewport has new sides; the renderer refits on the resize it
  // would otherwise never hear about.
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [landscape]);
  // The orrery's clock stands still while a surface is open or the game is
  // paused: ticking it would re-render the whole surface HUD every frame.
  useEffect(() => {
    if (!playing || flightActive || landed !== null || paused) return;
    let last = performance.now();
    let shown = last;
    let raf = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      epoch.current += SPEED_STEPS[speedIdx].rate * dt * 1000;
      if (now - shown >= 1000) { shown = now; setClockMs(epoch.current); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speedIdx, flightActive, landed, paused, epoch]);
  const returnToOrbit = useCallback(() => {
    if (!overlap.current) { setVeil({ kind: 'ascent', to: 'orbit', lifting: false }); return; }
    setLeaving(game.get().scene === 'orbit' ? null : (game.get().scene as LandingSite));
    game.travel('orbit', { seamless: true });
  }, []);
  /** Into a world's air: straight down from the flight, no key and no loading screen. */
  const enterWorld = useCallback((site: LandingSite) => {
    setLandscape(false);
    setEntryInto(site);
    if (overlap.current) {
      setStandby(site);
      game.travel(site, { seamless: true });
      return;
    }
    setStandby(null);
    setVeil({ kind: 'entry', to: site, lifting: false });
  }, []);
  const onStandbyChange = useCallback((site: LandingSite | null) => setStandby(overlap.current ? site : null), []);
  // The climb out of a surface ends in the ship, over the world just left.
  const [returnedFrom, setReturnedFrom] = useState<LandingSite | null>(null);
  const wasLanded = useRef(landed);
  useEffect(() => {
    if (wasLanded.current !== null && landed === null) setReturnedFrom(wasLanded.current);
    wasLanded.current = landed;
  }, [landed]);
  const onReturned = useCallback(() => setReturnedFrom(null), []);
  const showChrome = !flightActive && landed === null;

  return (
    <div className="solar-system solar-system--immersive" data-flying={flightActive}>
      {showChrome && <div className="solar-system__chrome-float">
        <button type="button" className="solar-system__fab solar-system__fab--close" onClick={game.exit} aria-label={t('immersive.exit')}>
          <X size={20} aria-hidden />
        </button>
        <span className="solar-system__mini-clock">
          {selectedId ? t(`bodies.${selectedId}.name`) : format.dateTime(new Date(clockMs), { month: 'short', day: 'numeric' })}
        </span>
      </div>}
      <div className="solar-system__viewport solar-system__viewport--fill" data-rotate={landscape && flightActive ? 'cw' : undefined}>
        {orbitVisited && <>
          {flightUp && <SolarSystemCanvas epoch={epoch} scaleMode="orrery" includePluto selectedId={selectedId} focusBodyId={selectedId}
            onSelect={setSelectedId} onZoomToSun={zoomToSun} zoomTo={zoomTo} onZoomToConsumed={consumeZoom} flight={session}
            room={room} onReady={onSceneReady} paused={paused} />}
          <PlayerShip session={session} autoLaunch onActiveChange={(on) => { setFlightActive(on); if (!on) setStandby(null); }} onStandby={onStandbyChange}
            onLand={enterWorld} landed={landed !== null} returnedFrom={returnedFrom} onReturned={onReturned}
            landscape={landscape} onLandscape={setLandscape} shellPaused={paused} onPauseRequest={game.pause} />
        </>}
        {/* One place in the tree for the surface, whether it is being built behind the arrival,
            is the scene, or is being left: React keeps the same scene through all three. */}
        {surfaceSite !== null && (
          <div className="game-world__surface" data-shown={surfaceShown || (leaving !== null && (scene !== 'orbit' || state === 'loading'))}>
            {surfaceSite === 'moon'
              ? <MoonSurface key="moon" onReturn={returnToOrbit} room={room} sink={rewards.sink} paused={paused} standby={!surfaceShown} startAt={entryInto === 'moon' ? 'entry' : undefined} onProgress={onSurfaceProgress} onPauseRequest={game.pause} shipKind={session.shipKind} />
              : <WorldSurface key={surfaceSite} world={surfaceSite} onReturn={returnToOrbit} room={room} paused={paused} standby={!surfaceShown} startAt={entryInto === surfaceSite ? 'entry' : undefined} onProgress={onSurfaceProgress} onPauseRequest={game.pause} shipKind={session.shipKind} />}
          </div>
        )}
        {veil && <div className="game-world__veil" data-kind={veil.kind} data-lifting={veil.lifting} data-world={veil.to} aria-hidden />}
      </div>
      {rewards.award && (
        <p className="game-shell__notice game-shell__notice--stars" role="status">
          {tp('stars.awarded', { n: rewards.award.stars, name: t(`moon.missions.records.${rewards.award.id.split('.').pop()}`) })}
        </p>
      )}
      {/* Story mode: the briefing and the objective in flight, the card when a chapter is done. */}
      {mode === 'story' && state !== 'loading' && <StoryHud session={session} scene={scene} flying={flightActive} paused={paused} />}
    </div>
  );
}
