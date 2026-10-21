'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { game, STAGE_PROGRESS } from '@/game/state';
import { isGameScene, takeRelocale, type GameScene } from '@/game/save';
import { attachConsoleGuards, enterFullscreen, exitFullscreen, unlockPointer } from '@/game/console';
import { exitToSkychaser } from '@/game/platform';
import { takeEscape } from '@/game/escape';
import { currentQuality, governedQuality, onQualityChange, setDetectedQuality, stepQualityDown } from '@/game/quality';
import { CosmicLoader, type LoaderBody, type LoaderVariant } from '@/components/solar-system/CosmicLoader';
import { useLoadingTips } from '@/components/solar-system/useLoadingTips';
import { warmAudioService } from '@/lib/solar-system/sound-prefs';
import { isGlobeWorld } from '@/lib/solar-system/planet-frame';
import { GameWorld } from './GameWorld';
import { TitleScreen } from './TitleScreen';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';
import { ControlsPanel } from './ControlsPanel';
import { MissionsPanel } from './MissionsPanel';

/** How long the loading screen takes to fade off the scene; the CSS transition matches. */
const LOADER_FADE_MS = 700;

/** A deep link straight onto a scene: /voyage?moon, ?land=mars, ?orbit — or
 *  the scene a language switch reloaded the page out of. */
function sceneFromQuery(): GameScene | undefined {
  const back = takeRelocale();
  if (back) return back;
  const q = new URLSearchParams(window.location.search);
  if (q.has('moon')) return 'moon';
  if (q.has('orbit')) return 'orbit';
  const site = q.get('land') ?? '';
  return isGameScene(site) ? site : undefined;
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

export default function GameShell() {
  const snap = useSyncExternalStore(game.subscribe, game.get, game.get);
  const t = useTranslations('play');
  const tl = useTranslations('solarSystem.loading');
  const tips = useLoadingTips();
  const rootRef = useRef<HTMLDivElement>(null);
  /** The governor had to take a level off: say so once, then get out of the way. */
  const [dropped, setDropped] = useState(false);
  const dropTimer = useRef(0);
  const { state, scene, stage, overlay } = snap;
  /** The loader fades off the first frames rather than vanishing from over them. */
  const [loaderFading, setLoaderFading] = useState(false);
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
    game.boot(sceneFromQuery());
    if (process.env.NODE_ENV !== 'production') {
      window.__stellarGame = game;
      window.__stellarQuality = {
        level: () => currentQuality().level,
        governed: governedQuality,
        step: stepQualityDown,
        pretend: setDetectedQuality,
      };
    }
    // No service worker here: Skychaser's /sw.js is its own, for push alone.
    const root = rootRef.current;
    const detach = root ? attachConsoleGuards(root) : undefined;
    // Esc pauses and resumes; it is taken in the capture phase so the flight
    // deck, which also listens for it, never sees it twice.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const s = game.get();
      if (s.overlay !== 'none') game.closeOverlay();
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
    if (state === 'exiting') void exitFullscreen().finally(exitToSkychaser);
  }, [state]);

  const start = (to: GameScene) => {
    void enterFullscreen();
    game.start(to);
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
      {inWorld && <GameWorld key={snap.generation} scene={scene} state={state} />}
      {(state === 'loading' || loaderFading) && (
        <CosmicLoader className={state === 'loading' ? 'game-shell__loader' : 'game-shell__loader is-done'} variant={loaderVariant} body={loaderBody}
          label={loaderVariant === 'ascent' ? tl('ascent') : insertion ? t(`loading.insertion.${scene}`) : t(`loading.scene.${scene}`)} detail={t(scene === 'orbit' && stage === 'build' ? 'loading.buildOrbit' : `loading.${stage}`)} progress={STAGE_PROGRESS[stage]} tips={tips} />
      )}
      {dropped && state === 'playing' && <p className="game-shell__notice" role="status">{t('qualityDrop')}</p>}
      {state === 'title' && overlay === 'none' && <TitleScreen onStart={start} />}
      {state === 'paused' && overlay === 'none' && <PauseMenu onResume={resume} />}
      {overlay === 'settings' && <SettingsPanel onClose={game.closeOverlay} />}
      {overlay === 'controls' && <ControlsPanel onClose={game.closeOverlay} />}
      {overlay === 'missions' && <MissionsPanel onClose={game.closeOverlay} />}
    </div>
  );
}
