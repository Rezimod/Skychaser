// Who is playing, as far as the game needs to know. The game never calls a
// sign-in library itself: the page that hosts it provides this, so the same
// game runs on the Stellar platform (Privy, Stars credits, shared rooms and
// bases) and on a host with no accounts at all.

import { createContext, useContext } from 'react';

export interface GameAccount {
  /** This host has accounts. Without them the game hides every sign-in
   *  prompt, Stars credit and shared room, and keeps progress on the device. */
  available: boolean;
  /** The host's sign-in has loaded and reported in. */
  ready: boolean;
  authenticated: boolean;
  /** A stable id for the player while signed in. */
  userId: string | null;
  /** The name the host knows them by, if any. */
  name: string | null;
  /** The player's own Solana address, where Stars are credited. */
  wallet: string | null;
  /** A token the host's API accepts, or null when there is none. */
  getAccessToken: () => Promise<string | null>;
  /** Open the host's sign-in. */
  login: () => void;
}

/** No accounts: everything stays on the device. */
export const NO_ACCOUNT: GameAccount = Object.freeze({
  available: false,
  ready: true,
  authenticated: false,
  userId: null,
  name: null,
  wallet: null,
  getAccessToken: async () => null,
  login: () => {},
});

export const GameAccountContext = createContext<GameAccount>(NO_ACCOUNT);

export const useGameAccount = (): GameAccount => useContext(GameAccountContext);
