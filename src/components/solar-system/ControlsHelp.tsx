'use client';

import { useTranslations } from 'next-intl';
import { FOOT_BINDINGS } from '@/game/bindings';

interface ControlsHelpProps {
  touch: boolean;
  /** The Moon has the rover and the expedition log; the worlds do not. */
  moon: boolean;
  /** What is particular to this place, after the controls. */
  tips: string[];
}

/** The on-foot controls, written from the bindings table: key, gamepad button, what it does. */
export function ControlsHelp({ touch, moon, tips }: ControlsHelpProps) {
  const t = useTranslations('solarSystem.controls');
  const rows = FOOT_BINDINGS.filter((b) => (moon || !b.moonOnly) && (!touch || b.touch));
  return (
    <>
      {rows.map((b) => (
        <p key={b.action} className="moon-hud__bind">
          {!touch && <kbd>{b.keyLabel === 'mouse' || b.keyLabel === 'wheel' ? t(`keys.${b.keyLabel}`) : b.keyLabel}</kbd>}
          {!touch && b.padLabel && <kbd className="moon-hud__pad">{b.padLabel}</kbd>}
          <span>{t(touch ? `touch.${b.action}` : b.action)}</span>
        </p>
      ))}
      {tips.map((tip) => <p key={tip}>{tip}</p>)}
    </>
  );
}
