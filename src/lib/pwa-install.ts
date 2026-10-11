// Installing Stellar Explore as an app: one place that knows how each browser
// does it, for the platform page today and the game's own UI later.
//
//   captureInstallPrompt()  call once, as early as possible (idempotent)
//   canPrompt() / promptInstall()  Chrome, Edge, Samsung Internet: the real dialog
//   isStandalone()  already running as the installed app
//   platformHint()  which instructions to show where there is no dialog
//   subscribe(fn)  re-render when any of the above changes
//
// Chromium fires `beforeinstallprompt` once the page qualifies, sometimes
// before React has hydrated. EARLY_CAPTURE_SCRIPT stashes it on `window` from
// an inline script so nothing is missed; captureInstallPrompt() picks it up.

/** The non-standard event Chromium fires when the page can be installed. */
export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface Window {
    /** Set by EARLY_CAPTURE_SCRIPT before the app's code has loaded. */
    __stellarInstallPrompt?: BeforeInstallPromptEvent | null;
  }
  interface Navigator {
    /** iOS Safari: true when launched from the home screen. */
    standalone?: boolean;
  }
}

/**
 * How this browser installs a web app:
 * - `ios-safari`       iPhone/iPad Safari: Share → Add to Home Screen
 * - `ios-other`        another browser or an in-app view on iOS: open in Safari first
 * - `android`          Chrome, Edge, Samsung Internet…: the install dialog, or the ⋮ menu
 * - `android-firefox`  Firefox for Android: ⋮ menu → Install
 * - `desktop-chromium` Chrome / Edge / Opera / Brave on a computer: dialog or address-bar icon
 * - `mac-safari`       Safari 17+ on macOS Sonoma: File → Add to Dock
 * - `desktop-other`    Firefox and older Safari on a computer: play in the browser
 */
export type InstallPlatform =
  | 'ios-safari'
  | 'ios-other'
  | 'android'
  | 'android-firefox'
  | 'desktop-chromium'
  | 'mac-safari'
  | 'desktop-other';

export interface PlatformEnv {
  userAgent: string;
  /** iPadOS reports a Mac user agent; touch points tell them apart. */
  maxTouchPoints?: number;
}

const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|FB_IAB|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest/i;
const CHROMIUM = /Chrome\/|Chromium\/|Edg\/|OPR\//;

export function platformHint(env?: PlatformEnv): InstallPlatform {
  const e = env ?? (typeof navigator === 'undefined'
    ? { userAgent: '' }
    : { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
  const ua = e.userAgent;
  const iPadAsMac = /Macintosh/.test(ua) && (e.maxTouchPoints ?? 0) > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadAsMac) {
    // In-app views (Instagram, Facebook…) and other browsers; a web view with no "Safari/" token is one too.
    if (IOS_NON_SAFARI.test(ua) || !/Safari\//.test(ua)) return 'ios-other';
    return 'ios-safari';
  }
  if (/Android/.test(ua)) return /Firefox\//.test(ua) ? 'android-firefox' : 'android';
  if (CHROMIUM.test(ua)) return 'desktop-chromium';
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Firefox\//.test(ua)) {
    const v = Number(/Version\/(\d+)/.exec(ua)?.[1] ?? 0);
    return v >= 17 ? 'mac-safari' : 'desktop-other';
  }
  return 'desktop-other';
}

/** Running as the installed app (home screen, dock, app window). */
export function isStandalone(win?: Window): boolean {
  const w = win ?? (typeof window === 'undefined' ? undefined : window);
  if (!w) return false;
  if (w.navigator?.standalone === true) return true;
  if (typeof w.matchMedia !== 'function') return false;
  return ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']
    .some((m) => w.matchMedia(`(display-mode: ${m})`).matches);
}

/** Inline, before hydration: hold on to the install event until the app wants it. */
export const EARLY_CAPTURE_SCRIPT =
  "(function(){try{window.__stellarInstallPrompt=window.__stellarInstallPrompt||null;" +
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__stellarInstallPrompt=e;});" +
  "window.addEventListener('appinstalled',function(){window.__stellarInstallPrompt=null;});}catch(e){}})();";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let attachedTo: Window | null = null;
let detachFn: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Start listening for the install event (and pick up one the early script caught). Safe to call often. */
export function captureInstallPrompt(win?: Window): () => void {
  const w = win ?? (typeof window === 'undefined' ? undefined : window);
  if (!w) return () => {};
  if (attachedTo === w && detachFn) return detachFn;
  detachFn?.();
  if (w.__stellarInstallPrompt) deferred = w.__stellarInstallPrompt;
  const onPrompt = (e: Event) => {
    e.preventDefault(); // our own button replaces Chrome's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    emit();
  };
  const onInstalled = () => {
    deferred = null;
    installed = true;
    w.__stellarInstallPrompt = null;
    emit();
  };
  w.addEventListener('beforeinstallprompt', onPrompt);
  w.addEventListener('appinstalled', onInstalled);
  attachedTo = w;
  detachFn = () => {
    w.removeEventListener('beforeinstallprompt', onPrompt);
    w.removeEventListener('appinstalled', onInstalled);
    attachedTo = null;
    detachFn = null;
  };
  return detachFn;
}

/** The browser's own install dialog is available right now. */
export function canPrompt(): boolean {
  return deferred !== null;
}

/** The app was installed from this page (this visit). */
export function wasInstalled(): boolean {
  return installed;
}

/** Show the install dialog. An event can be used once: after this, canPrompt() is false until the browser offers another. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = deferred;
  if (!e) return 'unavailable';
  deferred = null;
  if (typeof window !== 'undefined') window.__stellarInstallPrompt = null;
  emit();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') installed = true;
    emit();
    return outcome;
  } catch {
    emit();
    return 'unavailable';
  }
}

/** Call fn whenever canPrompt() or wasInstalled() may have changed. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export interface InstallState {
  platform: InstallPlatform;
  standalone: boolean;
  canPrompt: boolean;
  installed: boolean;
}

export function installState(win?: Window): InstallState {
  return { platform: platformHint(), standalone: isStandalone(win), canPrompt: canPrompt(), installed: wasInstalled() };
}

/** Tests only. */
export function __resetInstallForTests() {
  detachFn?.();
  deferred = null;
  installed = false;
  listeners.clear();
}
