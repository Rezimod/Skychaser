// The three ways to play, chosen on the title and kept with the checkpoint.
//
// - `free`  Free Fly: the whole solar system open, no objectives, no
//           mission prompts or banners, no story comms. Fly, land, walk,
//           jetpack, collect gems, take off.
// - `story` The Grand Tour (story-chapters.ts): a short guided campaign
//           from the Moon to the planets and home to Tbilisi, with the
//           Moon missions as its opening.
// - `multi` Multiplayer: Free Fly in a shared room, the other explorers'
//           ships and suits drawn where they are. Needs a signed-in account,
//           so it only exists on a host that has accounts.
//
// Pure and dependency-free: the state machine, the surfaces and the menus
// all ask it the same questions.

export type GameMode = 'free' | 'story' | 'multi';

export const GAME_MODES: readonly GameMode[] = ['free', 'story', 'multi'];

/** A checkpoint from before there were modes, a deep link, a forged value:
 *  Free Fly, the game as it always was minus the objectives. */
export const DEFAULT_MODE: GameMode = 'free';

export function isGameMode(v: unknown): v is GameMode {
  return v === 'free' || v === 'story' || v === 'multi';
}

/** The mode a stored value names, or the default. */
export function modeOr(v: unknown, fallback: GameMode = DEFAULT_MODE): GameMode {
  return isGameMode(v) ? v : fallback;
}

/** Objectives, mission prompts and banners, story comms, the Academy's
 *  mission gate: only the story has any of it. Multiplayer plays as Free Fly. */
export function hasObjectives(mode: GameMode): boolean {
  return mode === 'story';
}

/** The modes the title offers. Multiplayer needs a realtime service to meet
 *  in, and nothing else: guests fly in rooms too. Without the service it is
 *  not offered at all rather than offered and refused. */
export function titleModes(opts: { online: boolean }): GameMode[] {
  return opts.online ? ['free', 'story', 'multi'] : ['free', 'story'];
}
