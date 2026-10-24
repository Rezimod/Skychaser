'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { game, STAGE_PROGRESS } from '@/game/state';
import { isGameScene, takeRelocale, takeRelocaleMode, type GameScene } from '@/game/save';
import { type GameMode } from '@/game/mode';
import { useGameAccount } from '@/game/account';
import { createRoomLink, normalizeRoomCode, type RoomLink } from '@/lib/multiplayer/room-link';
import { useExploreRoom } from '@/lib/multiplayer/useExploreRoom';
import { realtimeConfig } from '@/lib/multiplayer/realtime';
import type { EpochRef } from '@/components/solar-system/SolarSystemCanvas';
import { ExploreRoomPanel, MultiplayerLobby, type Pilot } from '@/components/solar-system/ExploreRoomPanel';
import { ExploreRoomBadge } from '@/components/solar-system/ExploreRoomBadge';
import { RoomRadar } from '@/components/solar-system/RoomRadar';
import { guestIdentity, setGuestName } from '@/lib/multiplayer/guest';
import { attachConsoleGuards, enterFullscreen, exitFullscreen, unlockPointer } from '@/game/console';
import { exitToStellar } from '@/game/platform';
import { takeEscape } from '@/game/escape';
import { registerServiceWorker } from '@/game/sw';
import { currentQuality, governedQuality, onQualityChange, setDetectedQuality, stepQualityDown } from '@/game/quality';
import { CosmicLoader, type LoaderBody, type LoaderVariant } from '@/components/solar-system/CosmicLoader';
import { useLoadingTips } from '@/components/solar-system/useLoadingTips';
import { warmAudioService } from '@/lib/solar-system/sound-prefs';
import { isGlobeWorld } from '@/lib/solar-system/planet-frame';
import { LeaderboardPanel } from './LeaderboardPanel';
import dynamic from 'next/dynamic';
import { TitleScreen } from './TitleScreen';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';
import { ControlsPanel } from './ControlsPanel';
import { MissionsPanel } from './MissionsPanel';
import { QA_HOOKS } from '@/game/qa';
import { GameBoundary } from './GameBoundary';
import { retryImport } from '@/game/retry-import';

/** The world (the orrery, the ship, the surfaces) is its own chunk: the
 *  title paints without it, and it is fetched while the title is up. */
const loadWorld = () => retryImport(() => import('./GameWorld'));
const GameWorld = dynamic(() => loadWorld().then((m) => m.GameWorld), { ssr: false });

/** How long the loading screen takes to fade off the scene; the CSS transition matches. */
const LOADER_FADE_MS = 700;

/** A deep link straight onto a scene: /play?moon, ?land=mars, ?orbit — or
 *  the scene (and mode) a language switch reloaded the page out of. */
function sceneFromQuery(): { scene?: GameScene; mode?: GameMode } {
  const back = takeRelocale();
  const mode = takeRelocaleMode() ?? undefined;
  // A room does not survive the reload: back in the lobby rather than alone in a room's mode.
  if (back) return mode === 'multi' ? {} : { scene: back, mode };
  const q = new URLSearchParams(window.location.search);
  if (q.has('moon')) return { scene: 'moon' };
  if (q.has('orbit')) return { scene: 'orbit' };
  const site = q.get('land') ?? '';
  return isGameScene(site) ? { scene: site } : {};
}

declare global {
  interface Window {
    /** Development only: lets a headless run drive the game's states. */
    __stellarGame?: typeof game;
    /** Development only: what the quality governor has decided, and a way to make it decide. */
    __stellarQuality?: {
      level: () => string;
      governed: () => string | null;
      step: () => boolean;
      /** Pretend the device detected this preset. */
      pretend: (level: 'performance' | 'balanced' | 'high') => void;
    };
  }
}

/** A seamless handover that has not drawn by now shows its loading screen. */
const UNSEAM_AFTER_MS = 12_000;
/** A load on the same stage this long offers the way out. */
const STUCK_AFTER_MS = 25_000;

export default function GameShell() {
  const snap = useSyncExternalStore(game.subscribe, game.get, game.get);
  const t = useTranslations('play');
  const ts = useTranslations('solarSystem');
  const tl = useTranslations('solarSystem.loading');
  const tips = useLoadingTips();
  const rootRef = useRef<HTMLDivElement>(null);
  /** The governor had to take a level off: say so once, then get out of the way. */
  const [dropped, setDropped] = useState(false);
  const dropTimer = useRef(0);
  const { state, scene, mode, stage, overlay, seamless } = snap;
  const account = useGameAccount();
  // ── Multiplayer lives here, not in the world: the lobby on the title joins
  // the room the game then starts in. One link, shared by the deck and both
  // surfaces; one clock cell, so the room's planets are where its first
  // explorer had them. ──
  const roomLinkRef = useRef<RoomLink | null>(null);
  if (!roomLinkRef.current) roomLinkRef.current = createRoomLink(crypto.randomUUID());
  const epochRef = useRef<EpochRef>({ current: Date.now() });
  /** Multiplayer is offered wherever there is a realtime service to meet in.
   *  Nobody has to sign in: a guest flies under a callsign kept on the device,
   *  a signed-in player under their account's name. */
  const online = realtimeConfig() !== null;
  const [guest, setGuest] = useState(guestIdentity);
  const signedIn = account.authenticated;
  const pilotName = signedIn
    ? account.name || ts('room.defaultName', { tag: (account.userId ?? '').slice(-4).toUpperCase() })
    : guest.name || ts('room.guestName', { tag: guest.tag });
  const pilot: Pilot = {
    name: pilotName,
    guest: !signedIn,
    onRename: (name) => setGuest(setGuestName(name)),
    onSignIn: account.available && account.ready ? account.login : undefined,
  };
  // An invite link carries the room: it opens the lobby, already in it.
  const [invite, setInvite] = useState(() => normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? ''));
  /** Where the lobby's Launch starts: orbit, or a multiplayer checkpoint's surface. */
  const [lobbyScene, setLobbyScene] = useState<GameScene>('orbit');
  /** In a room's game: the roster panel over the scene. */
  const [roomPanel, setRoomPanel] = useState(false);
  const inWorldNow = state !== 'boot' && state !== 'title' && state !== 'exiting';
  const multiPlaying = inWorldNow && mode === 'multi';
  const room = useExploreRoom(roomLinkRef.current, {
    name: pilotName,
    epochMs: epochRef.current.current,
    watchLobby: overlay === 'lobby' || (multiPlaying && roomPanel),
    onEpoch: (ms: number) => { epochRef.current.current = ms; },
  });
  // The world's code comes down while the title is up: Enter then waits on nothing.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (idle) idle(() => { void loadWorld(); }, { timeout: 1500 });
    else window.setTimeout(() => { void loadWorld(); }, 600);
  }, []);
  useEffect(() => {
    if (!QA_HOOKS) return;
    // Development only: the capture harness puts pretend explorers into the room.
    window.__stellarRoom = roomLinkRef.current!;
    return () => { delete window.__stellarRoom; };
  }, []);
  // The invite: straight into that room, signed in or not.
  useEffect(() => {
    if (!invite || !online) return;
    if (room.status === 'idle') { room.join(invite); setInvite(null); }
  }, [invite, online, room]);
  // A room's game without a room (left from the panel, or the room was full): the panel, to find one.
  useEffect(() => {
    if (multiPlaying && state === 'playing' && room.status === 'idle') setRoomPanel(true);
  }, [multiPlaying, state, room.status]);
  useEffect(() => { if (!multiPlaying) setRoomPanel(false); }, [multiPlaying]);
  /** The loader fades off the first frames rather than vanishing from over them. */
  const [loaderFading, setLoaderFading] = useState(false);
  // ── The loading watchdog. A handover that has not drawn in a while shows
  // its loading screen after all, and a load that has sat on one stage too
  // long offers the way out, so a load can never be a screen that cannot be
  // left. Esc during a load asks for the way out at once. ──
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    setStuck(false);
    if (state !== 'loading') return;
    const unseam = window.setTimeout(() => game.unseam(), UNSEAM_AFTER_MS);
    const offer = window.setTimeout(() => { game.unseam(); setStuck(true); }, STUCK_AFTER_MS);
    return () => { window.clearTimeout(unseam); window.clearTimeout(offer); };
  }, [state, stage, scene, snap.generation]);
  const wasLoading = useRef(false);
  // The scene last played, so the wait between two reads as the way between
  // them: orbit to a surface is the entry, a surface back to orbit the climb.
  const playedScene = useRef<GameScene | null>(null);
  useEffect(() => { if (state === 'playing') playedScene.current = scene; }, [state, scene]);
  useEffect(() => {
    if (state === 'loading') { warmAudioService(); wasLoading.current = true; setLoaderFading(false); return; }
    if (!wasLoading.current) return;
    wasLoading.current = false;
    setLoaderFading(true);
    const id = window.setTimeout(() => setLoaderFading(false), LOADER_FADE_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  useEffect(() => {
    document.body.setAttribute('data-solar-immersive', '1');
    const deep = sceneFromQuery();
    game.boot(deep.scene, deep.mode);
    // The deep link has been read: off the address, so a reload (or a tab
    // the browser restores after it was killed) starts at the title rather
    // than straight back into whatever scene the link named.
    if (deep.scene) {
      try {
        const url = new URL(window.location.href);
        for (const k of ['moon', 'orbit', 'land']) url.searchParams.delete(k);
        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      } catch { /* the address stays as it was */ }
    }
    // An invite lands in Multiplayer: the title, with its lobby open.
    if (!deep.scene && invite && online) game.openOverlay('lobby');
    if (QA_HOOKS) {
      window.__stellarGame = game;
      window.__stellarQuality = {
        level: () => currentQuality().level,
        governed: governedQuality,
        step: stepQualityDown,
        pretend: setDetectedQuality,
      };
    }
    void registerServiceWorker();
    const root = rootRef.current;
    const detach = root ? attachConsoleGuards(root) : undefined;
    // Esc pauses and resumes; it is taken in the capture phase so the flight
    // deck, which also listens for it, never sees it twice.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const s = game.get();
      if (s.overlay !== 'none') game.closeOverlay();
      else if (s.state === 'loading') { game.unseam(); setStuck(true); }
      else if (s.state === 'playing' && takeEscape()) { /* build mode closed instead */ }
      else if (s.state === 'playing') game.pause();
      else if (s.state === 'paused') game.resume();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // A hidden tab or a closed fullscreen pauses; a lost pointer lock comes
    // up through the deck or the surface that held it.
    const onHidden = () => { if (document.hidden) game.pause(); };
    const onFullscreen = () => { if (!document.fullscreenElement) game.pause(); };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onHidden);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.body.removeAttribute('data-solar-immersive');
      detach?.();
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('visibilitychange', onHidden);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);
  useEffect(() => {
    const off = onQualityChange(() => {
      if (!governedQuality()) return;
      setDropped(true);
      window.clearTimeout(dropTimer.current);
      dropTimer.current = window.setTimeout(() => setDropped(false), 7000);
    });
    return () => { off(); window.clearTimeout(dropTimer.current); };
  }, []);
  useEffect(() => {
    if (state === 'paused') unlockPointer();
    if (state === 'exiting') void exitFullscreen().finally(exitToStellar);
  }, [state]);

  const start = (to: GameScene, as: GameMode) => {
    // Free Fly and the story are played alone.
    if (as !== 'multi' && room.code) room.leave();
    void enterFullscreen();
    game.start(to, as);
  };
  /** Multiplayer from the title: the lobby first, the game once in a room. */
  const openLobby = (to: GameScene) => {
    setLobbyScene(to);
    game.openOverlay('lobby');
  };
  const closeLobby = () => {
    if (room.code) room.leave();
    game.closeOverlay();
  };
  const toTitle = () => {
    if (room.code) room.leave();
    game.toTitle();
  };
  const resume = () => {
    void enterFullscreen();
    game.resume();
  };
  const inWorld = state !== 'boot' && state !== 'title' && state !== 'exiting';
  const from = playedScene.current;
  const fromSurface = from !== null && from !== 'orbit';
  // The Moon, Mars and Earth are flown down from orbit in their own scene:
  // the wait on the way there is orbit insertion, calm, with the entry still
  // to come. Proxima b keeps the plasma of the entry here.
  const insertion = scene !== 'orbit' && isGlobeWorld(scene);
  const loaderVariant: LoaderVariant = scene === 'orbit' ? (fromSurface ? 'ascent' : 'orrery') : insertion ? 'insertion' : 'entry';
  const loaderBody: LoaderBody = scene === 'orbit' ? (fromSurface ? from : 'earth') : scene;

  return (
    <div ref={rootRef} className="game-shell" data-state={state}>
      {inWorld && (
        <GameBoundary key={snap.generation} onRetry={() => game.recover()} onTitle={toTitle}
          labels={{ title: t('failed.title'), body: t('failed.body'), retry: t('failed.retry'), toTitle: t('loading.toTitle') }}>
          <GameWorld scene={scene} state={state} mode={mode} room={roomLinkRef.current} epoch={epochRef.current} />
        </GameBoundary>
      )}
      {/* A handover in flight has no loading screen: the scene being left stays up until the next has drawn. */}
      {(state === 'loading' || loaderFading) && !seamless && (
        <CosmicLoader className={state === 'loading' ? 'game-shell__loader' : 'game-shell__loader is-done'} variant={loaderVariant} body={loaderBody}
          label={loaderVariant === 'ascent' ? tl('ascent') : insertion ? t(`loading.insertion.${scene}`) : t(`loading.scene.${scene}`)} detail={t(scene === 'orbit' && stage === 'build' ? 'loading.buildOrbit' : `loading.${stage}`)} progress={STAGE_PROGRESS[stage]} tips={tips} />
      )}
      {state === 'loading' && stuck && (
        <div className="game-shell__rescue" role="alert">
          <p>{t('loading.stuck')}</p>
          <div className="game-shell__rescue-keys">
            <button type="button" className="game-menu__item" onClick={() => game.rescue()}>
              {t(scene === 'orbit' ? 'loading.toTitle' : 'loading.toOrbit')}
            </button>
            <button type="button" className="game-menu__item" onClick={() => setStuck(false)}>{t('loading.keepWaiting')}</button>
          </div>
        </div>
      )}
      {dropped && state === 'playing' && <p className="game-shell__notice" role="status">{t('qualityDrop')}</p>}
      {/* In a room: the roster badge over the scene, and the panel it opens. */}
      {multiPlaying && (state !== 'loading' || seamless) && room.code && !roomPanel && (
        <ExploreRoomBadge code={room.code} roster={room.roster} reconnecting={room.status === 'reconnecting'} onOpen={() => setRoomPanel(true)} />
      )}
      {/* The others in flight: arrows to the ones off the screen, and the nearest few. */}
      {multiPlaying && state === 'playing' && room.code && <RoomRadar link={roomLinkRef.current} />}
      {multiPlaying && state === 'playing' && roomPanel && (
        <ExploreRoomPanel room={room} pilot={pilot} onClose={() => setRoomPanel(false)} />
      )}
      {state === 'title' && overlay === 'none' && <TitleScreen onStart={start} onMultiplayer={online ? openLobby : undefined} />}
      {state === 'paused' && overlay === 'none' && (
        <PauseMenu onResume={resume} mode={mode} onTitle={toTitle} room={mode === 'multi' && room.code ? { code: room.code, count: room.roster.length } : null} />
      )}
      {overlay === 'lobby' && (
        <MultiplayerLobby room={room} pilot={pilot} onClose={closeLobby}
          onLaunch={() => { void enterFullscreen(); game.start(lobbyScene, 'multi'); }} />
      )}
      {overlay === 'settings' && <SettingsPanel onClose={game.closeOverlay} />}
      {overlay === 'controls' && <ControlsPanel onClose={game.closeOverlay} />}
      {overlay === 'missions' && <MissionsPanel onClose={game.closeOverlay} />}
      {overlay === 'leaderboard' && <LeaderboardPanel onClose={game.closeOverlay} />}
    </div>
  );
}
