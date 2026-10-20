// The game's states and the one store React and the surfaces subscribe to.
// No framework: transitions are plain functions, and an impossible one is
// ignored rather than thrown, because input arrives from keys, tabs and
// timers that do not know what the game is doing.

import { setSoundPaused } from '@/lib/solar-system/sound-prefs';
import { dropPrefetch } from './models';
import { type GameScene, writeCheckpoint } from './save';

export type GameState = 'boot' | 'title' | 'loading' | 'playing' | 'paused' | 'exiting';
/** What the loading screen is waiting on, in order. */
export type LoadStage = 'module' | 'build' | 'compile' | 'ready';
export type Overlay = 'none' | 'settings' | 'controls' | 'missions';

export interface GameSnapshot {
  state: GameState;
  scene: GameScene;
  stage: LoadStage;
  overlay: Overlay;
  /** Bumped by "restart checkpoint": the scene remounts fresh. */
  generation: number;
}

export const STAGE_PROGRESS: Record<LoadStage, number> = { module: 0.1, build: 0.35, compile: 0.7, ready: 1 };

const listeners = new Set<() => void>();
let snap: GameSnapshot = { state: 'boot', scene: 'moon', stage: 'module', overlay: 'none', generation: 0 };

function set(patch: Partial<GameSnapshot>) {
  snap = { ...snap, ...patch };
  for (const fn of listeners) fn();
}

export const game = {
  get: (): GameSnapshot => snap,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  /** The shell is mounted: show the title, or go straight to a deep-linked scene. */
  boot(scene?: GameScene) {
    if (snap.state !== 'boot') return;
    if (scene) { set({ state: 'loading', scene, stage: 'module', overlay: 'none' }); return; }
    set({ state: 'title', overlay: 'none' });
  },
  /** Enter from the title into a scene. */
  start(scene: GameScene) {
    if (snap.state !== 'title') return;
    set({ state: 'loading', scene, stage: 'module', overlay: 'none' });
  },
  /** The surface reports where its load is; `ready` is the first drawn frame. */
  progress(stage: LoadStage) {
    if (snap.state !== 'loading') return;
    if (stage === 'ready') {
      // The scene has its models now; the arrival's hold on them can go.
      dropPrefetch();
      writeCheckpoint(snap.scene);
      set({ state: 'playing', stage });
      return;
    }
    set({ stage });
  },
  /** Leaving one surface for another (or for orbit) while playing. */
  travel(scene: GameScene) {
    if (snap.state !== 'playing' && snap.state !== 'paused') return;
    setSoundPaused(false);
    set({ state: 'loading', scene, stage: 'module', overlay: 'none' });
  },
  pause() {
    if (snap.state !== 'playing') return;
    setSoundPaused(true);
    set({ state: 'paused', overlay: 'none' });
  },
  resume() {
    if (snap.state !== 'paused') return;
    setSoundPaused(false);
    set({ state: 'playing', overlay: 'none' });
  },
  /** Reload the current scene from its last checkpoint. */
  restart() {
    if (snap.state !== 'paused') return;
    setSoundPaused(false);
    set({ state: 'loading', stage: 'module', overlay: 'none', generation: snap.generation + 1 });
  },
  openOverlay(overlay: Overlay) {
    if (snap.state !== 'title' && snap.state !== 'paused') return;
    set({ overlay });
  },
  closeOverlay() {
    if (snap.overlay === 'none') return;
    set({ overlay: 'none' });
  },
  /** Back to the website. The shell watches for this and navigates. */
  exit() {
    if (snap.state === 'exiting' || snap.state === 'boot') return;
    setSoundPaused(false);
    set({ state: 'exiting', overlay: 'none' });
  },
  /** Tests only: back to the start. */
  reset() {
    setSoundPaused(false);
    snap = { state: 'boot', scene: 'moon', stage: 'module', overlay: 'none', generation: 0 };
    for (const fn of listeners) fn();
  },
};
