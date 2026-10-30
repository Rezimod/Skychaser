import type { Metadata } from 'next';
import type { Viewport } from 'next';
import localFont from 'next/font/local';
import './skychaser-base.css';
import '../styles/skychaser-theme.css';
import '../styles/skychaser-motion.css';
import '../styles/skychaser-pages.css';
import '../styles/skychaser-reveal.css';
import '../styles/skychaser-supernova.css';
import '../styles/skychaser-type.css';
import '../styles/skychaser-home.css';
import '../styles/skychaser-odyssey.css';
import '../styles/skychaser-booking.css';
import '../styles/skychaser-mobile.css';
import { AnalyticsBoot } from '@/components/providers/AnalyticsBoot';
import JsonLd from '@/components/shared/JsonLd';
import SkychaserAuth from '@/components/skychaser/SkychaserAuth';
import SkychaserNavProgress from '@/components/skychaser/SkychaserNavProgress';

// Skychaser's faces: Anton for titles, card names and prices, Geist for
// text, labels and buttons, JetBrains Mono for figures. The latin files are
// kept in app/fonts (Google Fonts, OFL), so a build never asks Google for
// them: the Google loader broke on a font URL without an extension on
// 2026-10-13.
const geist = localFont({ src: './fonts/geist-latin.woff2', weight: '400 700', variable: '--font-geist', display: 'swap' });
const anton = localFont({ src: './fonts/anton-latin.woff2', weight: '400', variable: '--font-anton', display: 'swap' });
const jetbrainsMono = localFont({ src: './fonts/jetbrains-mono-latin.woff2', weight: '400 700', variable: '--font-mono', display: 'swap', preload: false });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export const metadata: Metadata = {
  title: {
    default: 'Skychaser — the cosmos, issued in editions',
    template: '%s',
  },
  metadataBase: new URL('https://skychaser.io'),
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Skychaser',
  },
  openGraph: {
    siteName: 'Skychaser',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

/**
 * The root every page shares, kept to what a Skychaser page needs: fonts, the
 * Skychaser stylesheet, analytics, and sign-in, mounted here so it outlives a page change. Wallets
 * and sign-in load on demand (SkychaserAuth); the legacy Skychaser providers and chrome live in app/(skychaser).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geist.variable} ${jetbrainsMono.variable} ${anton.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-title" content="Skychaser" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <JsonLd />
      </head>
      <body>
        <AnalyticsBoot />
        <SkychaserNavProgress />
        <SkychaserAuth>{children}</SkychaserAuth>
      </body>
    </html>
  );
}
