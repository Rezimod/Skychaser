import type { Metadata } from 'next';
import type { Viewport } from 'next';
import { Orbitron, Geist, JetBrains_Mono, Noto_Sans_Georgian, Space_Grotesk } from 'next/font/google';
import './globals.css';
import '../styles/design-tokens.css';
import '../styles/stellar-tokens.css';
import '../styles/animations.css';
import '../styles/wallet-adapter-overrides.css';

// Hero titles + headings — Orbitron Medium across every page.
const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
// Body / paragraph copy — Geist Medium across every page.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});
// Homepage hero display face — Space Grotesk (hero-only; not a global token).
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const notoGeorgian = Noto_Sans_Georgian({
  subsets: ['georgian'],
  variable: '--font-georgian',
  weight: ['400', '600'],
  display: 'swap',
  preload: false,
});
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import { SolanaWalletProvider } from '@/components/providers/PrivyProvider';
import { WalletAdapterProvider } from '@/components/providers/WalletAdapterProvider';
import ThemeProvider from '@/components/providers/ThemeProvider';
import { LocationProvider } from '@/lib/location';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import { AppStateProvider } from '@/hooks/useAppState';
import WalletSync from '@/components/providers/WalletSync';
import { AnalyticsBoot } from '@/components/providers/AnalyticsBoot';
import SwipeBack from '@/components/providers/SwipeBack';
import Nav from '@/components/shared/Nav';
import StarField from '@/components/shared/StarField';
import Footer from '@/components/shared/Footer';
import BottomNav from '@/components/shared/BottomNav';
import DeferredGlobals from '@/components/shared/DeferredGlobals';
import PageTransition from '@/components/layout/PageTransition';
import { Toaster } from '@/components/ui/Toast';
import JsonLd from '@/components/shared/JsonLd';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050812',
};

export const metadata: Metadata = {
  title: {
    default: 'Stellar — Observe the Night Sky, Earn Rewards, Collect Discoveries',
    template: '%s',
  },
  metadataBase: new URL('https://stellarr.club'),
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Stellar',
  },
  openGraph: {
    title: 'Stellar — Your default astronomy app',
    url: 'https://stellarr.club',
    siteName: 'Stellar',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stellar — Your default astronomy app',
    images: ['/opengraph-image'],
    creator: '@StellarClub26',
  },
  other: {
    'fc:frame': 'vNext',
    'fc:frame:image': 'https://stellarr.club/opengraph-image',
    'fc:frame:image:aspect_ratio': '1.91:1',
    'fc:frame:button:1': "Tonight's Sky →",
    'fc:frame:button:1:action': 'link',
    'fc:frame:button:1:target': 'https://stellarr.club',
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const fonts = `${orbitron.variable} ${geist.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${notoGeorgian.variable}`;

  // The game (/play, flagged by the middleware) is its own document: no site
  // chrome, no scroll, and only the providers it uses — auth and messages.
  // Its platform page (/explore, `site`) is the same document with messages only.
  const gameDocument = (await headers()).get('x-stellar-game');
  if (gameDocument === 'site') {
    return (
      <html lang={locale} className={fonts}>
        <body className="explore-site-body">
          <ErrorBoundary>
            {/* The page renders its copy on the server; the client needs only its own namespace. */}
            <NextIntlClientProvider locale={locale} messages={{ exploreSite: messages.exploreSite }}>{children}</NextIntlClientProvider>
          </ErrorBoundary>
        </body>
      </html>
    );
  }
  if (gameDocument === '1') {
    return (
      <html lang={locale} className={fonts}>
        <body className="game-body">
          <ErrorBoundary>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ThemeProvider>
                <SolanaWalletProvider>{children}</SolanaWalletProvider>
              </ThemeProvider>
            </NextIntlClientProvider>
          </ErrorBoundary>
        </body>
      </html>
    );
  }

  return (
    <html lang={locale} className={fonts}>
      <head>
        <link rel="preconnect" href="https://auth.privy.io" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://api.open-meteo.com" />
        <link rel="dns-prefetch" href="https://astroman.ge" />
        <link rel="dns-prefetch" href="https://explorer-api.walletconnect.com" />
        <meta name="apple-mobile-web-app-title" content="Stellar" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        {/* Prevent theme flash — read localStorage before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('stellar_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}})()` }} />
        <JsonLd />
      </head>
      <body className="bg-canvas text-text-primary min-h-dvh w-full font-body flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <a href="#stellar-main" className="skip-link">Skip to main content</a>
        <ErrorBoundary>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ThemeProvider>
            <SolanaWalletProvider>
            <WalletAdapterProvider>
              <LocationProvider>
              <AppStateProvider>
                <WalletSync />
                <AnalyticsBoot />
                <StarField />
                <Nav />
                <SwipeBack>
                  <main id="stellar-main" role="main" className="relative z-10 flex-1 pt-14 pb-8 sm:pb-12">
                    <PageTransition>{children}</PageTransition>
                  </main>
                </SwipeBack>
                <Footer />
                <BottomNav />
                <DeferredGlobals />
                <Toaster />
              </AppStateProvider>
              </LocationProvider>
            </WalletAdapterProvider>
            </SolanaWalletProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
