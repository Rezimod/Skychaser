import type { Metadata, Viewport } from 'next';
import { getTranslations } from 'next-intl/server';
import AcademyApp from './_components/AcademyApp';
import './academy.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('academy.meta');
  return {
    title: { absolute: t('title') },
    description: t('description'),
    applicationName: 'Stellar Academy',
    alternates: { canonical: '/academy' },
    openGraph: { type: 'website', siteName: 'Stellar Academy', title: t('title'), description: t('description'), images: ['/images/planets/moon.jpg'] },
    appleWebApp: { capable: true, title: 'Stellar Academy', statusBarStyle: 'black-translucent' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1030',
};

export default function AcademyPage() {
  return <AcademyApp />;
}
