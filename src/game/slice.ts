// A long build, cut into pieces the frame loop can run between. A builder
// awaits `slice()` between its steps; once the piece has used its budget,
// the main thread goes back to the browser (a frame is drawn, input is
// read) and the build carries on in the next task. An abandoned build (the
// player pulled away, the scene unmounted) stops at its next `slice()`.

export class BuildAborted extends Error {
  constructor() { super('build aborted'); this.name = 'AbortError'; }
}

/** Back to the browser for a task: long enough for it to draw a frame if one is due. */
export function yieldToBrowser(): Promise<void> {
  const s = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (s?.yield) return s.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type Slice = () => Promise<void>;

/** `budgetMs` of work per piece; `signal` abandons the build. */
export function makeSlicer(budgetMs = 8, signal?: AbortSignal, now: () => number = () => performance.now()): Slice {
  let start = now();
  return async () => {
    if (signal?.aborted) throw new BuildAborted();
    if (now() - start < budgetMs) return;
    await yieldToBrowser();
    if (signal?.aborted) throw new BuildAborted();
    start = now();
  };
}
