// The checkpoint: where the expedition is, for "restart checkpoint" and for
// a later account-synced resume. Mission progress keeps its own keys
// (moon-mission, moon-jobs, flight-missions); this only records the place.

import { isWorldId, type WorldId } from '@/lib/solar-system/world-profiles';

/** Where the player is: in the ship over the orrery, or on a surface. */
export type GameScene = 'orbit' | 'moon' | WorldId;

const KEY = 'stellar_explore_save';
const VERSION = 1;

export interface Checkpoint {
  scene: GameScene;
  savedAt: string;
}

export function isGameScene(v: string): v is GameScene {
  return v === 'orbit' || v === 'moon' || isWorldId(v);
}

export function readCheckpoint(): Checkpoint | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Checkpoint> & { v?: number };
    if (v.v !== VERSION || typeof v.scene !== 'string' || !isGameScene(v.scene)) return null;
    return { scene: v.scene, savedAt: typeof v.savedAt === 'string' ? v.savedAt : '' };
  } catch {
    return null;
  }
}

export function writeCheckpoint(scene: GameScene) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, scene, savedAt: new Date().toISOString() }));
  } catch {
    // Private mode — the expedition restarts from the Moon next time.
  }
}

/** The language changed mid-game: the reload that follows goes straight back
 *  to this scene. One tab, one use — sessionStorage, consumed on boot. */
const RELOCALE_KEY = 'stellar_explore_relocale';

export function markRelocale(snap: { state: string; scene: GameScene }) {
  try {
    if (snap.state === 'playing' || snap.state === 'paused' || snap.state === 'loading') sessionStorage.setItem(RELOCALE_KEY, snap.scene);
    else sessionStorage.removeItem(RELOCALE_KEY);
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
