// Everything the game says to the rest of Skychaser goes through here, so the
// game code never knows a URL and the website never reaches into the game.

/** The page the game goes back to. */
export const EXIT_URL = '/';

/** A hard navigation: leaving the page is how fullscreen, pointer lock and
 *  keyboard lock are all released at once. */
export function exitToSkychaser() {
  window.location.assign(EXIT_URL);
}
