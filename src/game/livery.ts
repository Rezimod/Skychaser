// The player's ship livery. A pilot who never picks one flies the paint their
// id hashes to, so a room of new players is not a room of identical ships.
// The choice is kept on the device in its own key (and copied into the
// checkpoint); plain TypeScript, React subscribes to it.

import { defaultSkinFor, isSkinId, type SkinId } from '@/lib/solar-system/skin-catalog';
import { guestIdentity } from '@/lib/multiplayer/guest';

const KEY = 'stellar_ship_livery';
const VERSION = 1;

const listeners = new Set<(s: SkinId) => void>();
/** What the player picked, null for "from my id"; undefined until read. */
let chosen: SkinId | null | undefined;
/** Whose id the default is taken from: the account's, else the guest's. */
let seed = '';

function readChosen(): SkinId | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: number; skin?: unknown };
    return v.v === VERSION && isSkinId(v.skin) ? v.skin : null;
  } catch {
    return null;
  }
}

/** The livery the player picked, or null if they never did. */
export function chosenLivery(): SkinId | null {
  if (chosen === undefined) chosen = readChosen();
  return chosen;
}

/** The livery the player flies in. */
export function currentLivery(): SkinId {
  const c = chosenLivery();
  if (c) return c;
  if (!seed) {
    try { seed = guestIdentity().id; } catch { seed = 'pilot'; }
  }
  return defaultSkinFor(seed);
}

const notify = () => {
  const s = currentLivery();
  for (const fn of listeners) fn(s);
};

/** The id the default is hashed from: a signed-in player's account id. */
export function setLiverySeed(id: string) {
  if (!id || id === seed) return;
  seed = id;
  if (!chosenLivery()) notify();
}

/** Pick a livery (null: back to the one from the id). */
export function chooseLivery(skin: SkinId | null) {
  chosen = skin;
  try {
    if (skin) localStorage.setItem(KEY, JSON.stringify({ v: VERSION, skin }));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: this visit only.
  }
  notify();
}

export function onLiveryChange(fn: (s: SkinId) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Tests only. */
export function resetLiveryForTests() {
  chosen = undefined;
  seed = '';
  listeners.clear();
}
