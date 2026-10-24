// One frame of whatever is on screen, as a picture: the handover between
// the flight and a surface shows the last real frame (and keeps it moving
// with CSS, off the main thread) while the scene being left is let go and
// the next one is built, instead of a screen of its own.
//
// A WebGL canvas can only be read in the task that drew it (its buffer is
// cleared once it is shown), so the copy is made by the frame loop itself,
// right after it draws: a loop calls `serviceStill` with its canvas, and
// the first one to draw after a request answers it.

interface Request { resolve: (c: HTMLCanvasElement | null) => void; scale: number; timer: number }

let request: Request | null = null;

/** The next drawn frame, at `scale` of the canvas's pixels; null if nothing draws within `timeoutMs`. */
export function requestStill(scale = 0.5, timeoutMs = 1500): Promise<HTMLCanvasElement | null> {
  if (request) { window.clearTimeout(request.timer); request.resolve(null); }
  return new Promise((resolve) => {
    const mine: Request = {
      resolve, scale,
      timer: window.setTimeout(() => { if (request === mine) { request = null; resolve(null); } }, timeoutMs),
    };
    request = mine;
  });
}

/** Called by a frame loop right after it has drawn to `source`. Cheap when nothing is asked. */
export function serviceStill(source: HTMLCanvasElement) {
  if (!request) return;
  const r = request;
  request = null;
  window.clearTimeout(r.timer);
  try {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(source.width * r.scale));
    c.height = Math.max(1, Math.round(source.height * r.scale));
    const ctx = c.getContext('2d');
    if (!ctx) { r.resolve(null); return; }
    ctx.drawImage(source, 0, 0, c.width, c.height);
    r.resolve(c);
  } catch {
    r.resolve(null);
  }
}

export function stillPending(): boolean {
  return request !== null;
}
