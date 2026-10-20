import type { Metadata, Viewport } from 'next';
import PlayClient from '@/components/play/PlayClient';
import { PWA_THEME, pwaMetadata } from '../explore/pwa-meta';
import '../solar-system/solar-system.css';
import '../solar-system/suit-jet.css';
import '../solar-system/landing.css';
import './play.css';

export const metadata: Metadata = {
  // Manifest, icons and the iOS home-screen tags: the installed app starts here.
  ...pwaMetadata,
  title: 'Stellar Explore',
  description: 'Land at Stellar Base on the Moon. A lunar expedition from Georgia, inside a real astronomy platform.',
  applicationName: 'Stellar Explore',
  alternates: { canonical: '/play' },
  robots: { index: false, follow: false },
};

/** Flown with two thumbs: a second finger on the deck is a second key, never a pinch. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: PWA_THEME,
};

export default function PlayPage() {
  return <PlayClient />;
}
