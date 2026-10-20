'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Users, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { SolarSystemCanvas, type EpochRef } from '@/components/solar-system/SolarSystemCanvas';
import { PlayerShip, type LandingSite } from '@/components/solar-system/PlayerShip';
import { MoonSurface } from '@/components/solar-system/MoonSurface';
import { WorldSurface } from '@/components/solar-system/WorldSurface';
import { createFlightSession, type FlightSession } from '@/lib/solar-system/player-ship';
import type { SolarBodyId } from '@/lib/solar-system/ephemeris';
import { createRoomLink, normalizeRoomCode, type RoomLink } from '@/lib/multiplayer/room-link';
import { useExploreRoom } from '@/lib/multiplayer/useExploreRoom';
import { useProfile } from '@/hooks/useProfile';
import { ExploreRoomPanel } from '@/components/solar-system/ExploreRoomPanel';
import { ExploreRoomBadge } from '@/components/solar-system/ExploreRoomBadge';
import { game, type GameState } from '@/game/state';
import type { GameScene } from '@/game/save';
import { settle } from '@/game/settle';
import { useExploreRewards } from './useExploreRewards';

/** The climb back to orbit stays up at least this long, and until the deck has flown a few frames. */
const ORBIT_MIN_MS = 1600;
const ORBIT_FRAMES = 2;

const SPEED_STEPS = [
  { id: 'realtime', rate: 1 },
  { id: '10m', rate: 600 },
  { id: '1h', rate: 3600 },
  { id: '1d', rate: 86400 },
] as const;

interface GameWorldProps {
  scene: GameScene;
  state: GameState;
}

/** The orrery, the ship and the surfaces, composed by the game's scene.
 *  The orbit canvas is not built until the player first goes to orbit. */
export function GameWorld({ scene, state }: GameWorldProps) {
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
  const epochRef = useRef<EpochRef>({ current: Date.now() });
  const epoch = epochRef.current;
  const [clockMs, setClockMs] = useState(epoch.current);
  const [selectedId, setSelectedId] = useState<SolarBodyId | null>(null);
  const [playing, setPlaying] = useState(true);
  const [speedIdx, setSpeedIdx] = useState(2);
  const [flightActive, setFlightActive] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [zoomTo, setZoomTo] = useState<number | null>(null);
  const [orbitReady, setOrbitReady] = useState(false);
  const [orbitVisited, setOrbitVisited] = useState(scene === 'orbit');
  // ── Playing together: one link, shared by the deck and both surfaces. ──
  const roomLinkRef = useRef<RoomLink | null>(null);
  if (!roomLinkRef.current) roomLinkRef.current = createRoomLink(crypto.randomUUID());
  // Development only: the capture harness puts pretend explorers into the room.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    window.__stellarRoom = roomLinkRef.current!;
    return () => { delete window.__stellarRoom; };
  }, []);
  const { user } = usePrivy();
  const { login } = useLogin();
  const { profile } = useProfile();
  const [roomOpen, setRoomOpen] = useState(false);
  // An invite link carries the room; it is joined once the explorer is signed in.
  const [pendingRoom, setPendingRoom] = useState(() => normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''));
  const room = useExploreRoom(roomLinkRef.current, {
    name: profile?.username || t('room.defaultName', { tag: (user?.id ?? '').slice(-4).toUpperCase() }),
    // The clock is a mutable cell here, read once a second: that is close
    // enough to share, and it keeps the deck from re-rendering per frame.
    epochMs: clockMs,
    watchLobby: roomOpen,
    onEpoch: (ms: number) => { epoch.current = ms; setClockMs(ms); },
  });
  useEffect(() => {
    if (!pendingRoom) return;
    if (room.status === 'signedOut') setRoomOpen(true);
    if (room.status === 'idle') {
      room.join(pendingRoom);
      setPendingRoom(null);
    }
  }, [pendingRoom, room]);
  useEffect(() => {
    if (room.error) setRoomOpen(true);
  }, [room.error]);
  const onSceneReady = useCallback(() => setOrbitReady(true), []);
  const zoomToSun = useCallback(() => { setSelectedId(null); setZoomTo(26); }, []);
  const consumeZoom = useCallback(() => setZoomTo(null), []);
  useEffect(() => { if (scene === 'orbit') setOrbitVisited(true); }, [scene]);
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
  const returnToOrbit = useCallback(() => game.travel('orbit'), []);
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
        {landed === null && <button type="button" className="solar-system__fab" onClick={() => setRoomOpen((o) => !o)} aria-label={t('room.open')} aria-expanded={roomOpen}>
          <Users size={20} aria-hidden />
        </button>}
        <span className="solar-system__mini-clock">
          {selectedId ? t(`bodies.${selectedId}.name`) : format.dateTime(new Date(clockMs), { month: 'short', day: 'numeric' })}
        </span>
      </div>}
      <div className="solar-system__viewport solar-system__viewport--fill" data-rotate={landscape && flightActive ? 'cw' : undefined}>
        {orbitVisited && <>
          {landed === null && <SolarSystemCanvas epoch={epoch} scaleMode="orrery" includePluto selectedId={selectedId} focusBodyId={selectedId}
            onSelect={setSelectedId} onZoomToSun={zoomToSun} zoomTo={zoomTo} onZoomToConsumed={consumeZoom} flight={session}
            room={roomLinkRef.current} onReady={onSceneReady} paused={paused} />}
          <PlayerShip session={session} onActiveChange={setFlightActive} onLand={(site) => { setLandscape(false); game.travel(site); }} landed={landed !== null} returnedFrom={returnedFrom} onReturned={onReturned}
            landscape={landscape} onLandscape={setLandscape} shellPaused={paused} onPauseRequest={game.pause} />
        </>}
        {landed === 'moon' && <MoonSurface onReturn={returnToOrbit} room={roomLinkRef.current} sink={rewards.sink} paused={paused} onProgress={game.progress} onPauseRequest={game.pause} shipKind={session.shipKind} />}
        {landed !== null && landed !== 'moon' && <WorldSurface world={landed} onReturn={returnToOrbit} room={roomLinkRef.current} paused={paused} onProgress={game.progress} onPauseRequest={game.pause} shipKind={session.shipKind} />}
      </div>
      {rewards.award && (
        <p className="game-shell__notice game-shell__notice--stars" role="status">
          {tp('stars.awarded', { n: rewards.award.stars, name: t(`moon.missions.records.${rewards.award.id.split('.').pop()}`) })}
        </p>
      )}
      {room.code && !roomOpen && <ExploreRoomBadge code={room.code} roster={room.roster} onOpen={() => setRoomOpen(true)} />}
      {roomOpen && (
        <ExploreRoomPanel room={room} onClose={() => setRoomOpen(false)}
          onSignIn={() => login({ loginMethods: ['email', 'google', 'wallet'], walletChainType: 'solana-only' })} />
      )}
      {showChrome && <div className="solar-system__dockbar" role="group" aria-label={t('time.title')}>
        <button type="button" className="solar-system__dockbtn" onClick={() => setPlaying((p) => !p)} aria-label={t(playing ? 'time.pause' : 'time.play')}>
          {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
        </button>
        <button type="button" className="solar-system__chip solar-system__ratebtn" onClick={() => setSpeedIdx((i) => (i + 1) % SPEED_STEPS.length)} aria-label={t('time.speedAria')}>
          {t(`time.speed.${SPEED_STEPS[speedIdx].id}`)}
        </button>
        <button type="button" className="solar-system__dockbtn" onClick={() => { epoch.current = Date.now(); setClockMs(epoch.current); zoomToSun(); }} aria-label={t('time.now')}>
          <RotateCcw size={16} aria-hidden />
        </button>
      </div>}
    </div>
  );
}
