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

// Skychaser's faces: Orbitron for the wordmark and display, Geist for
// text, JetBrains Mono for figures, Anton for every title and the card
// names, Oswald for the spaced-out labels and buttons. The latin files are
// kept in app/fonts (Google Fonts, OFL), so a build never asks Google for
// them: the Google loader broke on a font URL without an extension on
// 2026-10-13.
const orbitron = localFont({ src: './fonts/orbitron-latin.woff2', weight: '500 700', variable: '--font-orbitron', display: 'swap', preload: false });
const geist = localFont({ src: './fonts/geist-latin.woff2', weight: '400 700', variable: '--font-geist', display: 'swap' });
const anton = localFont({ src: './fonts/anton-latin.woff2', weight: '400', variable: '--font-anton', display: 'swap' });
const oswald = localFont({ src: './fonts/oswald-latin.woff2', weight: '300 700', variable: '--font-oswald', display: 'swap' });
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
 * Skychaser stylesheet, analytics. Wallets and sign-in load on demand
 * (SkychaserAuth); the legacy Skychaser providers and chrome live in app/(skychaser).
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${orbitron.variable} ${geist.variable} ${jetbrainsMono.variable} ${anton.variable} ${oswald.variable}`}>
      <head>
        <meta name="apple-mobile-web-app-title" content="Skychaser" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <JsonLd />
      </head>
      <body>
        <AnalyticsBoot />
        {children}
      </body>
    </html>
  );
}
