// Esc belongs to the game shell (pause and resume) — unless something on the
// glass is open that Esc should close first, like build mode. That one thing
// claims it here; the shell asks before pausing.

let taker: (() => boolean) | null = null;

/** While `take` is claimed and returns true, Esc is used up by it instead of pausing. */
export function claimEscape(take: () => boolean): () => void {
  taker = take;
  return () => { if (taker === take) taker = null; };
}

export function takeEscape(): boolean {
  return taker?.() ?? false;
}
