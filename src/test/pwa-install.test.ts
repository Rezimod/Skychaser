import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetInstallForTests, captureInstallPrompt, canPrompt, EARLY_CAPTURE_SCRIPT, installState, isStandalone,
  platformHint, promptInstall, subscribe, wasInstalled, type BeforeInstallPromptEvent,
} from '@/lib/pwa-install';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.68',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  macSafari17: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari16: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
};

describe('platformHint', () => {
  it('tells iPhone Safari from every other way of browsing on iOS', () => {
    expect(platformHint({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toBe('ios-safari');
    expect(platformHint({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toBe('ios-other');
    expect(platformHint({ userAgent: UA.iphoneFirefox, maxTouchPoints: 5 })).toBe('ios-other');
    expect(platformHint({ userAgent: UA.iphoneInstagram, maxTouchPoints: 5 })).toBe('ios-other');
  });

  it('knows an iPad asking for the desktop site by its touch points', () => {
    expect(platformHint({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 })).toBe('ios-safari');
    // The same user agent with no touch is a Mac.
    expect(platformHint({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 0 })).toBe('mac-safari');
  });

  it('sorts Android browsers', () => {
    expect(platformHint({ userAgent: UA.androidChrome })).toBe('android');
    expect(platformHint({ userAgent: UA.androidSamsung })).toBe('android');
    expect(platformHint({ userAgent: UA.androidFirefox })).toBe('android-firefox');
  });

  it('sorts computers: Chromium installs, Safari 17+ adds to the Dock, the rest play in the tab', () => {
    expect(platformHint({ userAgent: UA.winChrome })).toBe('desktop-chromium');
    expect(platformHint({ userAgent: UA.winEdge })).toBe('desktop-chromium');
    expect(platformHint({ userAgent: UA.macChrome, maxTouchPoints: 0 })).toBe('desktop-chromium');
    expect(platformHint({ userAgent: UA.macSafari17, maxTouchPoints: 0 })).toBe('mac-safari');
    expect(platformHint({ userAgent: UA.macSafari16, maxTouchPoints: 0 })).toBe('desktop-other');
    expect(platformHint({ userAgent: UA.macFirefox, maxTouchPoints: 0 })).toBe('desktop-other');
    expect(platformHint({ userAgent: UA.linuxFirefox })).toBe('desktop-other');
  });

  it('reads the real navigator when called bare', () => {
    expect(typeof platformHint()).toBe('string');
  });
});

/** A window whose matchMedia answers only the display modes listed. */
function fakeWindow(modes: string[], standalone?: boolean): Window {
  return {
    navigator: { standalone } as Navigator,
    matchMedia: (q: string) => ({ matches: modes.some((m) => q === `(display-mode: ${m})`) }) as MediaQueryList,
  } as unknown as Window;
}

describe('isStandalone', () => {
  it('is false in a browser tab', () => {
    expect(isStandalone(fakeWindow(['browser']))).toBe(false);
  });

  it('is true in any installed display mode', () => {
    expect(isStandalone(fakeWindow(['standalone']))).toBe(true);
    expect(isStandalone(fakeWindow(['fullscreen']))).toBe(true);
    expect(isStandalone(fakeWindow(['minimal-ui']))).toBe(true);
    expect(isStandalone(fakeWindow(['window-controls-overlay']))).toBe(true);
  });

  it('believes iOS home-screen launches (navigator.standalone)', () => {
    expect(isStandalone(fakeWindow([], true))).toBe(true);
  });

  it('copes with a window that has no matchMedia', () => {
    expect(isStandalone({ navigator: {} } as unknown as Window)).toBe(false);
  });
});

function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as BeforeInstallPromptEvent;
  const prompt = vi.fn(async () => undefined);
  Object.defineProperty(e, 'prompt', { value: prompt });
  Object.defineProperty(e, 'userChoice', { value: Promise.resolve({ outcome, platform: 'web' }) });
  return { e, prompt };
}

describe('the install prompt', () => {
  beforeEach(() => {
    __resetInstallForTests();
    window.__stellarInstallPrompt = null;
  });
  afterEach(() => {
    __resetInstallForTests();
    window.__stellarInstallPrompt = null;
  });

  it('has nothing to prompt with until the browser offers', async () => {
    captureInstallPrompt();
    expect(canPrompt()).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
  });

  it('holds the event, suppresses the mini-infobar, and prompts once', async () => {
    captureInstallPrompt();
    const seen = vi.fn();
    const off = subscribe(seen);
    const { e, prompt } = fakePromptEvent('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(canPrompt()).toBe(true);
    expect(seen).toHaveBeenCalled();

    expect(await promptInstall()).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(wasInstalled()).toBe(true);
    // An event is good for one prompt.
    expect(canPrompt()).toBe(false);
    expect(await promptInstall()).toBe('unavailable');
    off();
  });

  it('reports a dismissal and is not installed', async () => {
    captureInstallPrompt();
    window.dispatchEvent(fakePromptEvent('dismissed').e);
    expect(await promptInstall()).toBe('dismissed');
    expect(wasInstalled()).toBe(false);
  });

  it('picks up an event the early inline script caught before the app loaded', () => {
    // Run the inline script as the page would.
    new Function(EARLY_CAPTURE_SCRIPT)();
    const { e } = fakePromptEvent('accepted');
    window.dispatchEvent(e);
    expect(window.__stellarInstallPrompt).toBe(e);
    expect(canPrompt()).toBe(false); // not yet listening
    captureInstallPrompt();
    expect(canPrompt()).toBe(true);
  });

  it('forgets the event once the app is installed some other way', () => {
    captureInstallPrompt();
    window.dispatchEvent(fakePromptEvent('accepted').e);
    window.dispatchEvent(new Event('appinstalled'));
    expect(canPrompt()).toBe(false);
    expect(wasInstalled()).toBe(true);
    expect(installState().installed).toBe(true);
  });

  it('is idempotent and detaches cleanly', () => {
    const a = captureInstallPrompt();
    const b = captureInstallPrompt();
    expect(a).toBe(b);
    a();
    window.dispatchEvent(fakePromptEvent('accepted').e);
    expect(canPrompt()).toBe(false);
  });
});
