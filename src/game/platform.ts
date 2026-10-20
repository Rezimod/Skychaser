// Everything the game says to the rest of Stellar goes through here, so the
// game code never knows a URL and the website never reaches into the game.

/** The page the game came from, and goes back to. */
export const EXIT_URL = '/solar-system';

/** A hard navigation: the game page has its own document, and leaving it is
 *  how fullscreen, pointer lock and keyboard lock are all released at once. */
export function exitToStellar() {
  window.location.assign(EXIT_URL);
}

/** Tonight's sky for an object the game just pointed at. */
export function skyUrl(target?: string): string {
  return target ? `/sky?target=${encodeURIComponent(target)}` : '/sky';
}
