// The game's states and the one store React and the surfaces subscribe to.
// No framework: transitions are plain functions, and an impossible one is
// ignored rather than thrown, because input arrives from keys, tabs and
// timers that do not know what the game is doing.

import { setSoundPaused } from '@/lib/solar-system/sound-prefs';
import { dropPrefetch } from './models';
import { type GameScene, writeCheckpoint } from './save';
import { DEFAULT_MODE, type GameMode } from './mode';

export type GameState = 'boot' | 'title' | 'loading' | 'playing' | 'paused' | 'exiting';
/** What the loading screen is waiting on, in order. */
export type LoadStage = 'module' | 'build' | 'compile' | 'ready';
/** `lobby` is the multiplayer lobby: the room to play in, before the game starts. */
export type Overlay = 'none' | 'settings' | 'controls' | 'missions' | 'lobby' | 'leaderboard';

export interface GameSnapshot {
  state: GameState;
  scene: GameScene;
  /** How this game is being played: Free Fly, the story or a room. Chosen on
   *  the title, saved with the checkpoint, changed only from the title. */
  mode: GameMode;
  stage: LoadStage;
  overlay: Overlay;
  /** Bumped by "restart checkpoint": the scene remounts fresh. */
  generation: number;
  /** This load is a handover in flight (orbit to a surface, a surface back
   *  to orbit): the scene being left stays on screen until the next one has
   *  drawn, and no loading screen comes up between them. */
  seamless: boolean;
}

export const STAGE_PROGRESS: Record<LoadStage, number> = { module: 0.1, build: 0.35, compile: 0.7, ready: 1 };

const listeners = new Set<() => void>();
const initial = (): GameSnapshot => ({ state: 'boot', scene: 'moon', mode: DEFAULT_MODE, stage: 'module', overlay: 'none', generation: 0, seamless: false });
let snap: GameSnapshot = initial();

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
  boot(scene?: GameScene, mode: GameMode = DEFAULT_MODE) {
    if (snap.state !== 'boot') return;
    if (scene) { set({ state: 'loading', scene, mode, stage: 'module', overlay: 'none', seamless: false }); return; }
    set({ state: 'title', overlay: 'none' });
  },
  /** Enter from the title into a scene, in a mode (left out, the one the title last had). */
  start(scene: GameScene, mode: GameMode = snap.mode) {
    if (snap.state !== 'title') return;
    set({ state: 'loading', scene, mode, stage: 'module', overlay: 'none', seamless: false });
  },
  /** From the pause menu back to the title, to pick another mode. The world
   *  is let go (the shell unmounts it); the checkpoint stays where it was. */
  toTitle() {
    if (snap.state !== 'paused' && snap.state !== 'playing') return;
    setSoundPaused(false);
    set({ state: 'title', overlay: 'none', seamless: false, generation: snap.generation + 1 });
  },
  /** The surface reports where its load is; `ready` is the first drawn frame. */
  progress(stage: LoadStage) {
    if (snap.state !== 'loading') return;
    if (stage === 'ready') {
      // The scene has its models now; the arrival's hold on them can go.
      dropPrefetch();
      writeCheckpoint(snap.scene, snap.mode);
      set({ state: 'playing', stage });
      return;
    }
    set({ stage });
  },
  /** Leaving one surface for another (or for orbit) while playing. With
   *  `seamless`, the scene being left keeps the screen until the next one
   *  has drawn: no loading screen. */
  travel(scene: GameScene, opts: { seamless?: boolean } = {}) {
    if (snap.state !== 'playing' && snap.state !== 'paused') return;
    setSoundPaused(false);
    set({ state: 'loading', scene, stage: 'module', overlay: 'none', seamless: !!opts.seamless });
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
    set({ state: 'loading', stage: 'module', overlay: 'none', generation: snap.generation + 1, seamless: false });
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
    snap = initial();
    for (const fn of listeners) fn();
  },
};
