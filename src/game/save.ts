// The checkpoint: where the expedition is, and how it is being played, for
// "restart checkpoint", for Continue on the title and for a later
// account-synced resume. Mission progress keeps its own keys (moon-mission,
// moon-jobs, flight-missions, the story's); this only records the place and
// the mode.

import { isWorldId, type WorldId } from '@/lib/solar-system/world-profiles';
import { DEFAULT_MODE, isGameMode, modeOr, type GameMode } from './mode';

/** Where the player is: in the ship over the orrery, or on a surface. */
export type GameScene = 'orbit' | 'moon' | WorldId;

const KEY = 'stellar_explore_save';
const VERSION = 1;

export interface Checkpoint {
  scene: GameScene;
  /** Free Fly, the story or a room. A save from before the modes has none:
   *  it reads as Free Fly, the game it was played as minus the objectives. */
  mode: GameMode;
  savedAt: string;
}

export function isGameScene(v: string): v is GameScene {
  return v === 'orbit' || v === 'moon' || isWorldId(v);
}

export function readCheckpoint(): Checkpoint | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: number; scene?: unknown; mode?: unknown; savedAt?: unknown };
    if (v.v !== VERSION || typeof v.scene !== 'string' || !isGameScene(v.scene)) return null;
    return { scene: v.scene, mode: modeOr(v.mode), savedAt: typeof v.savedAt === 'string' ? v.savedAt : '' };
  } catch {
    return null;
  }
}

export function writeCheckpoint(scene: GameScene, mode: GameMode = DEFAULT_MODE) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, scene, mode, savedAt: new Date().toISOString() }));
  } catch {
    // Private mode — the expedition restarts from the Moon next time.
  }
}

/** The language changed mid-game: the reload that follows goes straight back
 *  to this scene. One tab, one use — sessionStorage, consumed on boot. */
const RELOCALE_KEY = 'stellar_explore_relocale';
/** …and the mode it was being played in, beside it. */
const RELOCALE_MODE_KEY = 'stellar_explore_relocale_mode';

export function markRelocale(snap: { state: string; scene: GameScene; mode?: GameMode }) {
  try {
    if (snap.state === 'playing' || snap.state === 'paused' || snap.state === 'loading') {
      sessionStorage.setItem(RELOCALE_KEY, snap.scene);
      sessionStorage.setItem(RELOCALE_MODE_KEY, snap.mode ?? DEFAULT_MODE);
    } else {
      sessionStorage.removeItem(RELOCALE_KEY);
      sessionStorage.removeItem(RELOCALE_MODE_KEY);
    }
  } catch {
    // No storage: the reload opens on the title.
  }
}

/** The scene to resume after a language switch, once; null on any other load. */
export function takeRelocale(): GameScene | null {
  try {
    const v = sessionStorage.getItem(RELOCALE_KEY);
    sessionStorage.removeItem(RELOCALE_KEY);
    return v && isGameScene(v) ? v : null;
  } catch {
    return null;
  }
}

/** The mode to resume in after a language switch, once; null on any other load. */
export function takeRelocaleMode(): GameMode | null {
  try {
    const v = sessionStorage.getItem(RELOCALE_MODE_KEY);
    sessionStorage.removeItem(RELOCALE_MODE_KEY);
    return isGameMode(v) ? v : null;
  } catch {
    return null;
  }
}
