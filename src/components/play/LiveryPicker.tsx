'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { chooseLivery, chosenLivery, currentLivery, onLiveryChange } from '@/game/livery';
import { SKIN_IDS, SKINS } from '@/lib/solar-system/skin-catalog';

const subscribe = (cb: () => void) => onLiveryChange(cb);
const picked = () => chosenLivery() !== null;

/** The ship's paint: a row of swatches, named. The pick is kept on the
 *  device and painted on the ship the next frame it flies. */
export function LiveryPicker({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('play.livery');
  const skin = useSyncExternalStore(subscribe, currentLivery, () => 'factory' as const);
  const chosen = useSyncExternalStore(subscribe, picked, () => false);
  return (
    <div className="livery" data-compact={compact}>
      <p className="livery__head">
        <span className="livery__title">{t('title')}</span>
        <span className="livery__name">{t(`names.${skin}`)}</span>
      </p>
      <div className="livery__row" role="radiogroup" aria-label={t('title')}>
        {SKIN_IDS.map((id) => (
          <button key={id} type="button" role="radio" aria-checked={id === skin} className="livery__swatch"
            title={t(`names.${id}`)} onClick={() => chooseLivery(id)}>
            <span className="livery__chip" style={{ background: SKINS[id].swatch }} aria-hidden />
            <span className="livery__label">{t(`names.${id}`)}</span>
          </button>
        ))}
      </div>
      {!chosen && <p className="livery__hint">{t('auto')}</p>}
    </div>
  );
}
