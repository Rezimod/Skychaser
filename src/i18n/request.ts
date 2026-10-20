import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const locale = (await cookies()).get('stellar_locale')?.value ?? 'en';
  const validLocale = ['en', 'ka'].includes(locale) ? locale : 'en';

  return {
    locale: validLocale,
    messages: (await import(`../messages/${validLocale}.json`)).default,
  };
});
