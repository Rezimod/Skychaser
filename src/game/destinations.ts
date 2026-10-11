// The holder's cards, as places the game can take them. Signed out, nothing
// is held and every destination stays visible and locked. React and the
// flight code both read this one store.

import type { VoyageDestination } from '@/lib/skychaser/voyage';

export type Holdings = {
  status: 'signedOut' | 'loading' | 'ready' | 'unavailable';
  held: VoyageDestination[];
};

let current: Holdings = { status: 'signedOut', held: [] };
const listeners = new Set<() => void>();

export const holdings = {
  get: (): Holdings => current,
  set(next: Holdings) {
    current = next;
    for (const fn of listeners) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  /** Every edition the holder has of the card at this game id. */
  heldAt: (gameId: string): VoyageDestination[] => current.held.filter((d) => d.gameId === gameId),
};
