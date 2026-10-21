import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/voyage.en.json';
import './solar-system.css';
import './suit-jet.css';
import './landing.css';
import './voyage.css';

export const metadata: Metadata = {
  title: 'Voyage — Skychaser',
  description: 'Fly the solar system and land on its worlds.',
  alternates: { canonical: '/voyage' },
};

/** Flown with two thumbs: a second finger on the deck is a second key, never a pinch. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050812',
};

/** The game's stylesheets and strings load here and nowhere else. */
export default function VoyageLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
