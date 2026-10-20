'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import LocaleSwitch from './LocaleSwitch';
import { InstallButton } from './Install';
import { Mark } from './Mark';

/** Clear over the hero, glass once the page moves under it. */
export default function Header() {
  const t = useTranslations('exploreSite.nav');
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <header className={`xs-header${solid ? ' is-solid' : ''}`}>
      <a className="xs-brand" href="#top" aria-label={t('home')}>
        <Mark />
        <span className="xs-brand__name">Stellar <i>Explore</i></span>
      </a>
      <nav className="xs-nav" aria-label="Stellar Explore">
        <a href="#worlds">{t('worlds')}</a>
        <a href="#features">{t('features')}</a>
        <a href="#gallery">{t('gallery')}</a>
        <a href="#install">{t('install')}</a>
        <a href="#requirements">{t('requirements')}</a>
        <a href="/academy">{t('academy')}</a>
      </nav>
      <div className="xs-header__end">
        <LocaleSwitch />
        <span className="xs-header__install"><InstallButton variant="chip" /></span>
        <a className="xs-btn xs-btn--solid xs-btn--small" href="/play">{t('play')}</a>
      </div>
    </header>
  );
}
