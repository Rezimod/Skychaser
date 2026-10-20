'use client';

/* eslint-disable @next/next/no-img-element -- a 180px PNG icon, already the size it is shown at */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  captureInstallPrompt, canPrompt, isStandalone, platformHint, promptInstall, subscribe, wasInstalled,
  type InstallPlatform,
} from '@/lib/pwa-install';
import { registerServiceWorker } from '@/game/sw';
import { APPLE_TOUCH_ICON } from '../pwa-meta';

type Outcome = 'accepted' | 'dismissed' | null;
type Guide = 'ios' | 'android' | 'desktop' | 'mac';

interface InstallView {
  /** Null until mounted: the server cannot know the browser. */
  platform: InstallPlatform | null;
  standalone: boolean;
  canPrompt: boolean;
  installed: boolean;
  outcome: Outcome;
}

interface InstallCtx extends InstallView {
  install: () => void;
  openGuide: () => void;
}

const Ctx = createContext<InstallCtx | null>(null);

export function guideFor(platform: InstallPlatform | null): Guide {
  switch (platform) {
    case 'ios-safari':
    case 'ios-other':
      return 'ios';
    case 'android':
    case 'android-firefox':
      return 'android';
    case 'mac-safari':
      return 'mac';
    default:
      return 'desktop';
  }
}

const isMobile = (p: InstallPlatform | null) => p === 'ios-safari' || p === 'ios-other' || p === 'android' || p === 'android-firefox';

/** Install state for the whole page, and the one sheet that explains it. */
export function InstallProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<InstallView>({ platform: null, standalone: false, canPrompt: false, installed: false, outcome: null });
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const detach = captureInstallPrompt();
    const read = () => setView((v) => ({
      ...v,
      platform: platformHint(),
      standalone: isStandalone(),
      canPrompt: canPrompt(),
      installed: wasInstalled(),
    }));
    read();
    const off = subscribe(read);
    const modes = ['standalone', 'fullscreen', 'minimal-ui'].map((m) => window.matchMedia(`(display-mode: ${m})`));
    modes.forEach((mq) => mq.addEventListener('change', read));
    // The same worker as the game: it caches this page, the manifest and the icons for the installed app.
    void registerServiceWorker();
    return () => {
      detach();
      off();
      modes.forEach((mq) => mq.removeEventListener('change', read));
    };
  }, []);

  const openGuide = useCallback(() => {
    const d = sheet.current;
    if (d && !d.open) d.showModal();
  }, []);

  const install = useCallback(() => {
    if (!canPrompt()) { openGuide(); return; }
    void promptInstall().then((outcome) => {
      if (outcome !== 'unavailable') setView((v) => ({ ...v, outcome }));
      else openGuide();
    });
  }, [openGuide]);

  const value = useMemo(() => ({ ...view, install, openGuide }), [view, install, openGuide]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <InstallSheet ref={sheet} />
    </Ctx.Provider>
  );
}

export function useInstall(): InstallCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useInstall outside InstallProvider');
  return c;
}

/** One line on where the install stands, or null when there is nothing to say yet. */
function useStatus(): string | null {
  const t = useTranslations('exploreSite.install');
  const s = useInstall();
  if (s.standalone) return t('inApp');
  if (s.installed || s.outcome === 'accepted') return s.outcome === 'accepted' && !s.installed ? t('accepted') : isMobile(s.platform) ? t('installed') : t('installedDesktop');
  if (s.outcome === 'dismissed') return t('dismissed');
  return null;
}

/** The Install button: the browser's dialog where there is one, the steps where there is not. */
export function InstallButton({ variant = 'solid', long = false, big = false }: { variant?: 'solid' | 'ghost' | 'chip'; long?: boolean; big?: boolean }) {
  const t = useTranslations('exploreSite.install');
  const s = useInstall();
  if (s.standalone || s.installed) {
    return (
      <span className={`xs-btn xs-btn--${variant}${big ? ' xs-btn--big' : ''} is-done`} role="status">
        <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>{s.standalone ? t('inApp') : variant === 'chip' ? '✓' : t(isMobile(s.platform) ? 'installed' : 'installedDesktop')}</span>
      </span>
    );
  }
  return (
    <button type="button" className={`xs-btn xs-btn--${variant}${big ? ' xs-btn--big' : ''}`} onClick={s.install} aria-haspopup={s.canPrompt ? undefined : 'dialog'}>
      <svg viewBox="0 0 16 16" aria-hidden><path d="M8 2v8m0 0L4.8 6.8M8 10l3.2-3.2M3 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{long ? t('buttonLong') : t('button')}</span>
    </button>
  );
}

export function InstallStatus() {
  const status = useStatus();
  return <p className="xs-install__status" role="status" aria-live="polite">{status ?? ''}</p>;
}

/** The detected device, in words. */
export function DetectedPlatform() {
  const t = useTranslations('exploreSite.install');
  const { platform } = useInstall();
  if (!platform) return null;
  return (
    <p className="xs-install__device">
      <span>{t('detected')}</span> {t(`platforms.${platform}`)}
    </p>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="xs-steps">
      {items.map((s, i) => (
        <li key={i}><span className="xs-steps__n">{i + 1}</span><span>{s}</span></li>
      ))}
    </ol>
  );
}

function CopyLink() {
  const t = useTranslations('exploreSite.install');
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="xs-btn xs-btn--ghost xs-btn--small"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => setDone(true), () => setDone(false));
      }}
    >
      {done ? t('copied') : t('copyLink')}
    </button>
  );
}

/** The steps for one kind of device. `here` is true for the visitor's own. */
function GuideBody({ guide, here }: { guide: Guide; here: boolean }) {
  const t = useTranslations('exploreSite.install');
  const s = useInstall();
  if (guide === 'ios') {
    return (
      <div className="xs-guide">
        {here && s.platform === 'ios-other' && (
          <div className="xs-guide__warn">
            <p>{t('ios.otherBrowser')}</p>
            <CopyLink />
          </div>
        )}
        <IosIllustration />
        <Steps items={[t('ios.s1'), t('ios.s2'), t('ios.s3'), t('ios.s4')]} />
      </div>
    );
  }
  if (guide === 'android') {
    return (
      <div className="xs-guide">
        {here && s.canPrompt && <p className="xs-guide__ready">{t('android.ready')}</p>}
        <Steps items={[t('android.s1'), t('android.s2'), t('android.s3')]} />
        <p className="xs-guide__note">{t('android.firefox')}</p>
      </div>
    );
  }
  if (guide === 'mac') {
    return (
      <div className="xs-guide">
        <Steps items={[t('mac.s1'), t('mac.s2'), t('mac.s3')]} />
      </div>
    );
  }
  return (
    <div className="xs-guide">
      {here && s.platform === 'desktop-other' && <p className="xs-guide__warn"><span>{t('other')}</span></p>}
      {here && s.canPrompt && <p className="xs-guide__ready">{t('desktop.ready')}</p>}
      <Steps items={[t('desktop.s1'), t('desktop.s2'), t('desktop.s3')]} />
    </div>
  );
}

const GUIDES: Guide[] = ['ios', 'android', 'desktop', 'mac'];

/** Every device's steps, the visitor's own first open. */
export function InstallGuide() {
  const t = useTranslations('exploreSite.install');
  const { platform } = useInstall();
  const mine = guideFor(platform);
  const [chosen, setChosen] = useState<Guide | null>(null);
  const tab = chosen ?? mine;
  return (
    <div className="xs-tabs">
      <div className="xs-tabs__list" role="tablist" aria-label={t('how')}>
        {GUIDES.map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            id={`xs-tab-${g}`}
            aria-selected={tab === g}
            aria-controls={`xs-panel-${g}`}
            tabIndex={tab === g ? 0 : -1}
            className="xs-tabs__tab"
            onClick={() => setChosen(g)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
              const next = GUIDES[(GUIDES.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : GUIDES.length - 1)) % GUIDES.length];
              setChosen(next);
              document.getElementById(`xs-tab-${next}`)?.focus();
            }}
          >
            {t(`tabs.${g}`)}
            {platform && g === mine && <span className="xs-tabs__here" aria-hidden />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`xs-panel-${tab}`} aria-labelledby={`xs-tab-${tab}`} className="xs-tabs__panel" tabIndex={0}>
        <GuideBody guide={tab} here={platform !== null && tab === mine} />
      </div>
    </div>
  );
}

/** The sheet the Install button opens where the browser has no dialog of its own. */
function InstallSheet({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  const t = useTranslations('exploreSite.install');
  const { platform } = useInstall();
  const guide = guideFor(platform);
  return (
    <dialog
      ref={ref}
      className="xs-sheet"
      aria-labelledby="xs-sheet-title"
      onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
    >
      <div className="xs-sheet__inner">
        <div className="xs-sheet__grab" aria-hidden />
        <header className="xs-sheet__head">
          <img src={APPLE_TOUCH_ICON} alt="" width={56} height={56} loading="lazy" />
          <div>
            <h2 id="xs-sheet-title">{t('sheetTitle')}</h2>
            {platform && <p>{t(`platforms.${platform}`)}</p>}
          </div>
          <form method="dialog">
            <button className="xs-sheet__close" aria-label={t('close')}>
              <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </form>
        </header>
        <GuideBody guide={guide} here />
        <a className="xs-btn xs-btn--ghost xs-sheet__play" href="/play">{t('openGame')}</a>
      </div>
    </dialog>
  );
}

/** Safari, step by step: the Share button, the menu row, the icon on the home screen. */
function IosIllustration() {
  const t = useTranslations('exploreSite.install.ios');
  return (
    <div className="xs-illo">
      <figure className="xs-illo__panel">
        <svg viewBox="0 0 200 120" role="img" aria-label={t('illoToolbar')}>
          <rect x="1" y="1" width="198" height="118" rx="14" className="xs-illo__screen" />
          <rect x="16" y="20" width="168" height="26" rx="13" className="xs-illo__pill" />
          <text x="100" y="37" textAnchor="middle" className="xs-illo__url">stellarr.club</text>
          <g className="xs-illo__bar" transform="translate(0 72)">
            <path d="M28 18l-6-6 6-6" />
            <path d="M58 6l6 6-6 6" />
            <g className="xs-illo__share" transform="translate(100 12)">
              <circle r="17" className="xs-illo__ring" />
              <path d="M-6 -1v9h12v-9M0 -9v12M-4 -5l4-4 4 4" />
            </g>
            <path d="M136 4v14l5-4 5 4V4z" />
            <rect x="164" y="5" width="12" height="12" rx="2.5" />
          </g>
        </svg>
        <figcaption>1 · {t('share')}</figcaption>
      </figure>
      <figure className="xs-illo__panel">
        <svg viewBox="0 0 200 120" role="img" aria-label={t('illoSheet')}>
          <rect x="1" y="1" width="198" height="118" rx="14" className="xs-illo__screen" />
          <rect x="14" y="14" width="172" height="22" rx="6" className="xs-illo__row" />
          <rect x="14" y="44" width="172" height="28" rx="7" className="xs-illo__row is-hot" />
          <g transform="translate(32 58)" className="xs-illo__plus"><rect x="-8" y="-8" width="16" height="16" rx="3.5" /><path d="M0 -4v8M-4 0h8" /></g>
          <text x="50" y="62" className="xs-illo__label">{t('addToHome')}</text>
          <rect x="14" y="80" width="172" height="22" rx="6" className="xs-illo__row" />
        </svg>
        <figcaption>2 · {t('addToHome')}</figcaption>
      </figure>
      <figure className="xs-illo__panel">
        <div className="xs-illo__home" role="img" aria-label={t('illoHome')}>
          {Array.from({ length: 7 }, (_, i) => <span key={i} className="xs-illo__app" />)}
          <span className="xs-illo__app is-ours"><img src={APPLE_TOUCH_ICON} alt="" width={180} height={180} loading="lazy" /><em>Explore</em></span>
        </div>
        <figcaption>3 · Explore</figcaption>
      </figure>
    </div>
  );
}
