import type { Metadata } from 'next';
import type { Viewport } from 'next';
import { Anton, Orbitron, Geist, JetBrains_Mono, Oswald } from 'next/font/google';
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
// text, JetBrains Mono for figures. The legacy pages add their own in app/(skychaser).
const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  weight: ['500', '600', '700'],
  display: 'swap',
});
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
// Anton for every title and the card names, Oswald for the spaced-out labels and buttons.
const anton = Anton({ subsets: ['latin'], variable: '--font-anton', weight: '400', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], variable: '--font-oswald', weight: ['300', '400', '500', '600', '700'], display: 'swap' });
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

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
