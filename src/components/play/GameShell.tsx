'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { game, STAGE_PROGRESS } from '@/game/state';
import { isGameScene, type GameScene } from '@/game/save';
import { attachConsoleGuards, enterFullscreen, exitFullscreen, unlockPointer } from '@/game/console';
import { exitToSkychaser } from '@/game/platform';
import { currentQuality, governedQuality, onQualityChange, setDetectedQuality, stepQualityDown } from '@/game/quality';
import { CosmicLoader } from '@/components/solar-system/CosmicLoader';
import { useLoadingTips } from '@/components/solar-system/useLoadingTips';
import { warmAudioService } from '@/lib/solar-system/sound-prefs';
import { GameWorld } from './GameWorld';
import { TitleScreen } from './TitleScreen';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';
import { ControlsPanel } from './ControlsPanel';
import { MissionsPanel } from './MissionsPanel';

/** How long the loading screen takes to fade off the scene; the CSS transition matches. */
const LOADER_FADE_MS = 700;

/** A deep link straight onto a scene: /voyage?moon, ?land=mars, ?orbit. */
function sceneFromQuery(): GameScene | undefined {
  const q = new URLSearchParams(window.location.search);
  if (q.has('moon')) return 'moon';
  if (q.has('orbit')) return 'orbit';
  const site = q.get('land') ?? '';
  return isGameScene(site) ? site : undefined;
}

declare global {
  interface Window {
    /** Development only: lets a headless run drive the game's states. */
    __skychaserGame?: typeof game;
    /** Development only: what the quality governor has decided, and a way to make it decide. */
    __skychaserQuality?: {
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
  const tips = useLoadingTips();
  const rootRef = useRef<HTMLDivElement>(null);
  /** The governor had to take a level off: say so once, then get out of the way. */
  const [dropped, setDropped] = useState(false);
  const dropTimer = useRef(0);
  const { state, scene, stage, overlay } = snap;
  /** The loader fades off the first frames rather than vanishing from over them. */
  const [loaderFading, setLoaderFading] = useState(false);
  const wasLoading = useRef(false);
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
      window.__skychaserGame = game;
      window.__skychaserQuality = {
        level: () => currentQuality().level,
        governed: governedQuality,
        step: stepQualityDown,
        pretend: setDetectedQuality,
      };
    }
    const root = rootRef.current;
    const detach = root ? attachConsoleGuards(root) : undefined;
    // Esc pauses and resumes; it is taken in the capture phase so the flight
    // deck, which also listens for it, never sees it twice.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const s = game.get();
      if (s.overlay !== 'none') game.closeOverlay();
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
    void enterFullscreen(rootRef.current ?? undefined);
    game.start(to);
  };
  const resume = () => {
    void enterFullscreen(rootRef.current ?? undefined);
    game.resume();
  };
  const inWorld = state !== 'boot' && state !== 'title' && state !== 'exiting';

  return (
    <div ref={rootRef} className="game-shell" data-state={state}>
      {inWorld && <GameWorld key={snap.generation} scene={scene} state={state} />}
      {(state === 'loading' || loaderFading) && (
        <CosmicLoader className={state === 'loading' ? 'game-shell__loader' : 'game-shell__loader is-done'} variant={scene === 'orbit' ? 'orrery' : 'descent'} body={scene === 'orbit' ? 'earth' : scene}
          label={t(`loading.scene.${scene}`)} detail={t(`loading.${stage}`)} progress={STAGE_PROGRESS[stage]} tips={tips} />
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
