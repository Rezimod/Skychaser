// The browser as a console: fullscreen, the keyboard's reserved keys, the
// pointer, the screen's orientation. Every call is best-effort — iOS Safari
// has none of it and the game must play the same.

interface KeyboardLock { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void }
interface OrientationLock { lock?: (o: string) => Promise<void>; unlock?: () => void }

/** Keys the game wants even where the browser would take them. */
const LOCKED_KEYS = ['Escape', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyE', 'KeyQ', 'KeyR', 'KeyT', 'KeyC', 'KeyV', 'KeyM', 'KeyL', 'Space'];

export function fullscreenSupported(): boolean {
  return typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function';
}

/** Ask for the whole screen; needs a user gesture. Resolves false where it is not on offer. */
export async function enterFullscreen(el: HTMLElement = document.documentElement): Promise<boolean> {
  if (!fullscreenSupported() || document.fullscreenElement) return !!document.fullscreenElement;
  try {
    await el.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    return false;
  }
  lockKeyboard();
  lockLandscape();
  return true;
}

export async function exitFullscreen() {
  unlockKeyboard();
  if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
    try { await document.exitFullscreen(); } catch { /* already out */ }
  }
}

function lockKeyboard() {
  const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  if (kb?.lock) kb.lock(LOCKED_KEYS).catch(() => undefined);
}
function unlockKeyboard() {
  const kb = (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
  try { kb?.unlock?.(); } catch { /* not locked */ }
}

/** A phone turned on its side is a wider deck; only asked for on touch screens, and only in fullscreen. */
function lockLandscape() {
  if (!window.matchMedia('(pointer: coarse)').matches) return;
  const o = (screen.orientation as ScreenOrientation & OrientationLock | undefined);
  if (o?.lock) o.lock('landscape').catch(() => undefined);
}

export function lockPointer(el: HTMLElement) {
  if (document.pointerLockElement === el || typeof el.requestPointerLock !== 'function') return;
  try {
    const req = el.requestPointerLock() as unknown;
    if (req instanceof Promise) req.catch(() => undefined);
  } catch {
    // Pointer lock is optional — drag still looks around.
  }
}

export function unlockPointer() {
  if (document.pointerLockElement && typeof document.exitPointerLock === 'function') document.exitPointerLock();
}

/** The element an event happened on. `selectstart` and some touch events
 *  arrive with a text node as their target, and the document or the window
 *  can be one too: none of those has `closest`. */
export function eventElement(e: Event): Element | null {
  const n = e.target;
  if (typeof Element !== 'undefined' && n instanceof Element) return n;
  if (typeof Node !== 'undefined' && n instanceof Node) return n.parentElement;
  return null;
}

/** No context menu, no text selection, no pull-to-refresh on the game's root. */
export function attachConsoleGuards(root: HTMLElement): () => void {
  const stop = (e: Event) => {
    const el = eventElement(e);
    if (el && el.closest('input, textarea, select, [data-selectable]')) return;
    e.preventDefault();
  };
  root.addEventListener('contextmenu', stop);
  root.addEventListener('selectstart', stop);
  root.addEventListener('dragstart', stop);
  return () => {
    root.removeEventListener('contextmenu', stop);
    root.removeEventListener('selectstart', stop);
    root.removeEventListener('dragstart', stop);
  };
}
