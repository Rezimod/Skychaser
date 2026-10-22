import type { Metadata, Viewport } from 'next';
import { Orbitron, Geist, JetBrains_Mono, Noto_Sans_Georgian, Space_Grotesk } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import ThemeProvider from '@/components/providers/ThemeProvider';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import './globals.css';
import '../styles/design-tokens.css';
import '../styles/stellar-tokens.css';
import '../styles/animations.css';

const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron', weight: ['400', '500', '600', '700'], display: 'swap' });
const geist = Geist({ subsets: ['latin'], variable: '--font-geist', weight: ['400', '500', '600', '700'], display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '700'], display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk', weight: ['400', '500', '600', '700'], display: 'swap' });
const notoGeorgian = Noto_Sans_Georgian({ subsets: ['georgian'], variable: '--font-georgian', weight: ['400', '600'], display: 'swap', preload: false });

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#050812' };

export const metadata: Metadata = {
  title: { default: 'Stellar Explore', template: '%s' },
  description: 'A space game from Georgia: fly, land on the Moon, Mars and Earth, and learn space with Stellar Academy.',
};

/** Three documents, each without anything the others need. The middleware
 *  says which one a request is: `site` the install page at "/", `1` the
 *  game at /play, `academy` the children's learning app. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  const fonts = `${orbitron.variable} ${geist.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${notoGeorgian.variable}`;
  const kind = (await headers()).get('x-stellar-game');

  if (kind === 'academy') {
    // For children: no sign-in, no wallet, and only its own messages.
    return (
      <html lang={locale} className={fonts}>
        <body className="academy-body">
          <ErrorBoundary>
            <NextIntlClientProvider locale={locale} messages={{ academy: messages.academy }}>{children}</NextIntlClientProvider>
          </ErrorBoundary>
        </body>
      </html>
    );
  }
  if (kind === '1') {
    return (
      <html lang={locale} className={fonts}>
        <body className="game-body">
          <ErrorBoundary>
            {/* No Privy around the game: it loads beside it on demand (StellarAccount). */}
            <NextIntlClientProvider locale={locale} messages={messages}>
              <ThemeProvider>{children}</ThemeProvider>
            </NextIntlClientProvider>
          </ErrorBoundary>
        </body>
      </html>
    );
  }
  return (
    <html lang={locale} className={fonts}>
      <body className="explore-site-body">
        <ErrorBoundary>
          <NextIntlClientProvider locale={locale} messages={{ exploreSite: messages.exploreSite }}>{children}</NextIntlClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
