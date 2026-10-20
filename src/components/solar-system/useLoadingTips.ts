'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

const TIP_COUNT = 8;

/** The lines the loading screens hand out, in a different order each
 *  mount so a returning pilot does not read the same first one every time.
 *  The shuffle waits for the mount: the server and the first paint agree. */
export function useLoadingTips(): string[] {
  const t = useTranslations('solarSystem.loading.tips');
  const [start, setStart] = useState(0);
  useEffect(() => { setStart(Math.floor(Math.random() * TIP_COUNT)); }, []);
  return useMemo(() => {
    const all = Array.from({ length: TIP_COUNT }, (_, i) => t(`t${i + 1}`));
    return [...all.slice(start), ...all.slice(0, start)];
  }, [t, start]);
}
