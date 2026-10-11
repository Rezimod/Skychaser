'use client';

import { useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const LOCALES = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'ka', label: 'ქა', name: 'ქართული' },
] as const;

/** The same cookie the website uses, so a language chosen here holds there too. */
export default function LocaleSwitch() {
  const locale = useLocale();
  const t = useTranslations('exploreSite.nav');
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="xs-locale" role="group" aria-label={t('language')} data-pending={pending || undefined}>
      {LOCALES.map((l) => (
        <button
          key={l.value}
          type="button"
          lang={l.value}
          aria-label={l.name}
          aria-pressed={locale === l.value}
          onClick={() => {
            if (l.value === locale) return;
            document.cookie = `stellar_locale=${l.value}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            start(() => router.refresh());
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
