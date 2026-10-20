import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Noto_Serif_Georgian } from 'next/font/google';
import { headers } from 'next/headers';
import { preload } from 'react-dom';
import { getLocale, getTranslations } from 'next-intl/server';
import { isExploreHost, MAIN_SITE_ORIGIN } from '@/middleware';
import { EXPLORE_MAX_STARS } from '@/lib/games/explore';
import { EARLY_CAPTURE_SCRIPT } from '@/lib/pwa-install';
import { PWA_OTHER, PWA_THEME, pwaMetadata } from './pwa-meta';
import Shot from './_components/Shot';
import HeroReel from './_components/HeroReel';
import Header from './_components/Header';
import Gallery from './_components/Gallery';
import { Mark } from './_components/Mark';
import { DetectedPlatform, InstallButton, InstallGuide, InstallProvider, InstallStatus } from './_components/Install';
import { HERO_FIRST, PORTRAIT_MEDIA, shotPortraitSrc, shotSrc, shotSrcSet, type ShotName } from './shots';
import './explore.css';

// Display: a film-title serif; Georgian falls through to its own serif cut.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-xs-serif', display: 'swap' });
const serifKa = Noto_Serif_Georgian({ subsets: ['georgian'], weight: ['400', '500'], variable: '--font-xs-serif-ka', display: 'swap', preload: false });

const OG_IMAGE = '/explore/site/og.jpg';

/** On the game's own host the page is "/", everywhere else "/explore". */
async function siteOrigin(): Promise<{ origin: string; path: string }> {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim().replace(/:\d+$/, '').toLowerCase();
  if (isExploreHost(host)) return { origin: `https://${host}`, path: '/' };
  return { origin: MAIN_SITE_ORIGIN, path: '/explore' };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('exploreSite.meta');
  const locale = await getLocale();
  const { origin, path } = await siteOrigin();
  const title = t('title');
  const description = t('description');
  return {
    ...pwaMetadata,
    title: { absolute: title },
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: path },
    applicationName: 'Stellar Explore',
    openGraph: {
      type: 'website',
      siteName: 'Stellar Explore',
      url: path,
      title,
      description,
      locale: locale === 'ka' ? 'ka_GE' : 'en_US',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: t('ogAlt') }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE], creator: '@StellarClub26' },
    other: {
      ...PWA_OTHER,
      // The website's Farcaster frame points at Tonight's Sky; this page's points at the game.
      'fc:frame:image': `${origin}${OG_IMAGE}`,
      'fc:frame:button:1': 'Play Stellar Explore',
      'fc:frame:button:1:target': `${origin}${path === '/' ? '' : path}`,
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: PWA_THEME,
  colorScheme: 'dark',
};

const FLIGHT: ReadonlyArray<{ key: 'orbit' | 'entry' | 'descent' | 'touchdown' | 'eva'; shot: ShotName }> = [
  { key: 'orbit', shot: 'mars-orbit' },
  { key: 'entry', shot: 'mars-entry' },
  { key: 'descent', shot: 'moon-braking' },
  { key: 'touchdown', shot: 'moon-powered' },
  { key: 'eva', shot: 'moon-cosmonaut' },
];

const WORLDS: ReadonlyArray<{ key: 'moon' | 'mars' | 'earth'; shot: ShotName; href: string; coords: string }> = [
  { key: 'moon', shot: 'moon-base', href: '/play?moon=1', coords: '384 400 km' },
  { key: 'mars', shot: 'mars-base', href: '/play?land=mars', coords: '18.4° N 77.5° E' },
  { key: 'earth', shot: 'tbilisi-descent', href: '/play?land=earth', coords: '41.7° N 44.8° E' },
];

const FEATURES = ['suit', 'jetpack', 'missions', 'multiplayer', 'stars', 'anywhere'] as const;
const REQUIREMENTS = ['phones', 'computers', 'graphics', 'controls', 'network', 'account'] as const;

export default async function ExploreSitePage() {
  const t = await getTranslations('exploreSite');
  const { origin } = await siteOrigin();
  // Links to the rest of Stellar: relative on the website, absolute from the game's own host.
  const stellar = (p: string) => (origin === MAIN_SITE_ORIGIN ? p : `${MAIN_SITE_ORIGIN}${p}`);
  const max = EXPLORE_MAX_STARS;
  // The hero's first frame is the largest paint: fetch it with the document.
  preload(shotSrc(HERO_FIRST, 1280, 'avif'), {
    as: 'image', type: 'image/avif', fetchPriority: 'high', imageSrcSet: shotSrcSet(HERO_FIRST, 'avif'), imageSizes: '100vw', media: `not all and ${PORTRAIT_MEDIA}`,
  });
  preload(shotPortraitSrc(HERO_FIRST, 'avif'), { as: 'image', type: 'image/avif', fetchPriority: 'high', media: PORTRAIT_MEDIA });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'Stellar Explore',
    description: t('meta.description'),
    url: `${origin}${origin === MAIN_SITE_ORIGIN ? '/explore' : '/'}`,
    image: `${origin}${OG_IMAGE}`,
    genre: ['Space flight', 'Exploration', 'Educational'],
    gamePlatform: ['Web browser', 'iOS', 'Android', 'Windows', 'macOS', 'Linux'],
    applicationCategory: 'Game',
    operatingSystem: 'Any (web browser with WebGL 2)',
    playMode: ['SinglePlayer', 'MultiPlayer'],
    inLanguage: ['en', 'ka'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: 'Stellar', url: MAIN_SITE_ORIGIN },
  };

  return (
    <div className={`xs ${serif.variable} ${serifKa.variable}`} id="top">
      {/* Chromium can offer the install before the app's code has loaded: hold the event for it. */}
      <script dangerouslySetInnerHTML={{ __html: EARLY_CAPTURE_SCRIPT }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <InstallProvider>
        <Header />
        <main id="main">
          {/* ── Hero: the descent on a loop ── */}
          <section className="xs-hero" aria-labelledby="xs-hero-title">
            <HeroReel />
            <div className="xs-hero__copy">
              <p className="xs-eyebrow">{t('hero.eyebrow')}</p>
              <h1 id="xs-hero-title" className="xs-display">
                <span>{t('hero.titleA')}</span>
                <em>{t('hero.titleB')}</em>
              </h1>
              <p className="xs-hero__lede">{t('hero.lede')}</p>
              <div className="xs-hero__cta">
                <a className="xs-btn xs-btn--solid xs-btn--big" href="/play">
                  <svg viewBox="0 0 16 16" aria-hidden><path d="M4.5 2.8v10.4L13 8z" fill="currentColor" /></svg>
                  <span>{t('hero.play')}</span>
                </a>
                <InstallButton variant="ghost" big />
              </div>
              <p className="xs-hero__note">{t('hero.note')}</p>
            </div>
            <a className="xs-hero__scroll" href="#flight">{t('hero.scroll')}</a>
          </section>

          {/* ── The descent, step by step ── */}
          <section className="xs-section xs-flight" id="flight" aria-labelledby="xs-flight-title">
            <header className="xs-section__head">
              <p className="xs-kicker"><span>01</span>{t('flight.kicker')}</p>
              <h2 id="xs-flight-title" className="xs-display xs-h2">{t('flight.title')}</h2>
              <p className="xs-section__lede">{t('flight.lede')}</p>
            </header>
            <ol className="xs-flight__track">
              {FLIGHT.map((s, i) => (
                <li key={s.key} className="xs-flight__step" style={{ ['--i' as string]: i }}>
                  <div className="xs-flight__frame">
                    <Shot name={s.shot} alt="" sizes="(max-width: 720px) 72vw, 22vw" />
                  </div>
                  <h3><span>{String(i + 1).padStart(2, '0')}</span>{t(`flight.steps.${s.key}.name`)}</h3>
                  <p>{t(`flight.steps.${s.key}.body`)}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Worlds ── */}
          <section className="xs-section xs-worlds" id="worlds" aria-labelledby="xs-worlds-title">
            <header className="xs-section__head">
              <p className="xs-kicker"><span>02</span>{t('worlds.kicker')}</p>
              <h2 id="xs-worlds-title" className="xs-display xs-h2">{t('worlds.title')}</h2>
            </header>
            <ul className="xs-worlds__list">
              {WORLDS.map((w) => (
                <li key={w.key} className={`xs-world is-${w.key}`}>
                  <Shot name={w.shot} alt="" sizes="(max-width: 900px) 100vw, 34vw" className="xs-world__img" />
                  <div className="xs-world__body">
                    <p className="xs-world__place"><span>{t(`worlds.${w.key}.place`)}</span><span>{w.coords}</span></p>
                    <h3 className="xs-display">{t(`worlds.${w.key}.name`)}</h3>
                    <p>{t(`worlds.${w.key}.body`)}</p>
                    <a className="xs-world__cta" href={w.href}>
                      {t('worlds.cta')}
                      <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8h10m-4-4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
            <p className="xs-worlds__beyond">{t('worlds.beyond')}</p>
          </section>

          {/* ── What you do there ── */}
          <section className="xs-section xs-features" id="features" aria-labelledby="xs-features-title">
            <header className="xs-section__head xs-features__head">
              <p className="xs-kicker"><span>03</span>{t('features.kicker')}</p>
              <h2 id="xs-features-title" className="xs-display xs-h2">{t('features.title')}</h2>
              <div className="xs-features__stars" aria-hidden>
                <span className="xs-features__num">{max}</span>
                <span className="xs-features__unit">★ {t('features.maxStars', { max })}</span>
              </div>
            </header>
            <ul className="xs-features__list">
              {FEATURES.map((f, i) => (
                <li key={f}>
                  <span className="xs-features__idx">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{t(`features.items.${f}.title`)}</h3>
                  <p>{t(`features.items.${f}.body`, { max })}</p>
                </li>
              ))}
            </ul>
          </section>

          {/* ── Gallery ── */}
          <section className="xs-section xs-gallery-section" id="gallery" aria-labelledby="xs-gallery-title">
            <header className="xs-section__head">
              <p className="xs-kicker"><span>04</span>{t('gallery.kicker')}</p>
              <h2 id="xs-gallery-title" className="xs-display xs-h2">{t('gallery.title')}</h2>
              <p className="xs-section__lede">{t('gallery.lede')}</p>
            </header>
            <Gallery />
          </section>

          {/* ── Install ── */}
          <section className="xs-section xs-install" id="install" aria-labelledby="xs-install-title">
            <div className="xs-install__intro">
              <p className="xs-kicker"><span>05</span>{t('install.kicker')}</p>
              <h2 id="xs-install-title" className="xs-display xs-h2">{t('install.title')}</h2>
              <p className="xs-section__lede">{t('install.lede')}</p>
              <div className="xs-install__actions">
                <InstallButton variant="solid" long />
                <a className="xs-btn xs-btn--ghost" href="/play">{t('nav.play')}</a>
              </div>
              <InstallStatus />
              <DetectedPlatform />
            </div>
            <InstallGuide />
          </section>

          {/* ── Requirements ── */}
          <section className="xs-section xs-reqs" id="requirements" aria-labelledby="xs-reqs-title">
            <header className="xs-section__head">
              <p className="xs-kicker"><span>06</span>{t('requirements.kicker')}</p>
              <h2 id="xs-reqs-title" className="xs-display xs-h2">{t('requirements.title')}</h2>
            </header>
            <dl className="xs-reqs__sheet">
              {REQUIREMENTS.map((r) => (
                <div key={r}>
                  <dt>{t(`requirements.rows.${r}.label`)}</dt>
                  <dd>{t(`requirements.rows.${r}.value`)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── Finale ── */}
          <section className="xs-finale" aria-labelledby="xs-finale-title">
            <Shot name="mars-arch" alt="" sizes="100vw" className="xs-finale__img" />
            <div className="xs-finale__copy">
              <h2 id="xs-finale-title" className="xs-display">{t('finale.title')}</h2>
              <p>{t('finale.body')}</p>
              <div className="xs-hero__cta">
                <a className="xs-btn xs-btn--solid xs-btn--big" href="/play">
                  <svg viewBox="0 0 16 16" aria-hidden><path d="M4.5 2.8v10.4L13 8z" fill="currentColor" /></svg>
                  <span>{t('finale.play')}</span>
                </a>
                <InstallButton variant="ghost" big />
              </div>
            </div>
          </section>
        </main>

        <footer className="xs-footer">
          <a className="xs-brand" href={stellar('/')}>
            <Mark />
            <span className="xs-brand__name">Stellar</span>
          </a>
          <p>{t('footer.made')}</p>
          <nav aria-label="Stellar">
            <a href={stellar('/')}>{t('footer.site')}</a>
            <a href={stellar('/privacy')}>{t('footer.privacy')}</a>
            <a href={stellar('/terms')}>{t('footer.terms')}</a>
          </nav>
        </footer>
      </InstallProvider>
    </div>
  );
}
