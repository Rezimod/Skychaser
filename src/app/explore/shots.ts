// Frames captured from the running game (public/explore/site/shots), each in
// AVIF and WebP at 1280 and 640 wide, 16:9. `x` is where the subject sits
// across the frame, so a tall crop (a phone held upright) keeps it in view.

export const SHOT_DIR = '/explore/site/shots';

export const SHOTS = {
  'earth-entry': { x: 50 },
  'mars-descent': { x: 54 },
  'moon-jetpack': { x: 45 },
  'mars-suit': { x: 42 },
  'moon-base': { x: 50 },
  'mars-base': { x: 48 },
  'tbilisi-descent': { x: 52 },
  'mars-orbit': { x: 46 },
  'mars-entry': { x: 50 },
  'moon-braking': { x: 50 },
  'moon-powered': { x: 50 },
  'moon-cosmonaut': { x: 46 },
  'mars-arch': { x: 50 },
  'proxima-crystals': { x: 47 },
  'moon-flag': { x: 40 },
  'proxima-giant': { x: 55 },
  'mars-domes': { x: 50 },
} as const;

export type ShotName = keyof typeof SHOTS;

export const shotSrc = (name: ShotName, w: 640 | 1280, ext: 'avif' | 'webp') => `${SHOT_DIR}/${name}-${w}.${ext}`;
export const shotSrcSet = (name: ShotName, ext: 'avif' | 'webp') =>
  `${shotSrc(name, 640, ext)} 640w, ${shotSrc(name, 1280, ext)} 1280w`;

/** The hero frames also come as a tall crop below the game's HUD (380×600),
 *  for a screen taller than it is wide. */
export const PORTRAIT_MEDIA = '(max-aspect-ratio: 4/5)';
export const shotPortraitSrc = (name: ShotName, ext: 'avif' | 'webp') => `${SHOT_DIR}/${name}-portrait.${ext}`;

/** The hero reel opens on this frame; the page preloads it. */
export const HERO_FIRST: ShotName = 'earth-entry';
