'use client';

import { useSyncExternalStore } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FOV_RANGE, getSettings, onSettingsChange, resetSettings, SENSITIVITY_RANGE, updateSettings, type QualityPreset } from '@/game/settings';
import { clearQualityGovernor, governedQuality, QUALITY_LEVELS, type QualityLevel } from '@/game/quality';
import { game } from '@/game/state';
import { markRelocale } from '@/game/save';
import { GamePanel } from './GamePanel';

interface SettingsPanelProps {
  onClose: () => void;
}

const LOCALES = ['en', 'ka'] as const;
const QUALITY_LABEL: Record<QualityLevel, string> = { performance: 'qualityPerformance', balanced: 'qualityBalanced', high: 'qualityHigh', ultra: 'qualityUltra' };

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const t = useTranslations('play');
  const locale = useLocale();
  const s = useSyncExternalStore(onSettingsChange, getSettings, getSettings);
  const governed = governedQuality();
  const setLocale = (next: string) => {
    if (next === locale) return;
    document.cookie = `stellar_locale=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    // The new language needs a reload; a player mid-game comes back to the
    // scene they were in, not to the title.
    markRelocale(game.get());
    window.location.reload();
  };
  return (
    <GamePanel title={t('settings')} onClose={onClose}>
      <div className="game-setting">
        <label htmlFor="gs-quality">{t('settingsPanel.quality')}</label>
        <select id="gs-quality" value={s.quality} onChange={(e) => {
          // The player has an opinion: the governor's own finding gives way.
          clearQualityGovernor();
          updateSettings({ quality: e.target.value as QualityPreset });
        }}>
          <option value="auto">{t('settingsPanel.qualityAuto')}</option>
          {QUALITY_LEVELS.map((q) => <option key={q} value={q}>{t(`settingsPanel.${QUALITY_LABEL[q]}`)}</option>)}
        </select>
        <p className="game-setting__note">
          {governed && s.quality === 'auto'
            ? t('settingsPanel.qualityGoverned', { level: t(`settingsPanel.${QUALITY_LABEL[governed]}`) })
            : s.quality === 'ultra'
              ? t('settingsPanel.qualityUltraNote')
              : t('settingsPanel.qualityNote')}
        </p>
      </div>
      <div className="game-setting">
        <label htmlFor="gs-sens">{t('settingsPanel.sensitivity')} <b>{s.sensitivity.toFixed(1)}×</b></label>
        <input id="gs-sens" type="range" min={SENSITIVITY_RANGE[0]} max={SENSITIVITY_RANGE[1]} step={0.1} value={s.sensitivity}
          onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })} />
      </div>
      <div className="game-setting game-setting--row">
        <label htmlFor="gs-invert">{t('settingsPanel.invertY')}</label>
        <input id="gs-invert" type="checkbox" checked={s.invertY} onChange={(e) => updateSettings({ invertY: e.target.checked })} />
      </div>
      <div className="game-setting">
        <label htmlFor="gs-fov">{t('settingsPanel.fov')} <b>{Math.round(s.fov)}°</b></label>
        <input id="gs-fov" type="range" min={FOV_RANGE[0]} max={FOV_RANGE[1]} step={1} value={s.fov}
          onChange={(e) => updateSettings({ fov: Number(e.target.value) })} />
      </div>
      <div className="game-setting">
        <label htmlFor="gs-vol">{t('settingsPanel.volume')} <b>{Math.round(s.volume * 100)}%</b></label>
        <input id="gs-vol" type="range" min={0} max={1} step={0.05} value={s.volume}
          onChange={(e) => updateSettings({ volume: Number(e.target.value) })} />
      </div>
      <div className="game-setting">
        <span className="game-setting__label">{t('settingsPanel.language')}</span>
        <div className="game-setting__choices" role="group" aria-label={t('settingsPanel.language')}>
          {LOCALES.map((l) => (
            <button key={l} type="button" className="game-setting__choice" aria-pressed={locale === l} onClick={() => setLocale(l)}>{t(`settingsPanel.${l}`)}</button>
          ))}
        </div>
      </div>
      <button type="button" className="game-setting__reset" onClick={resetSettings}>{t('settingsPanel.reset')}</button>
    </GamePanel>
  );
}
