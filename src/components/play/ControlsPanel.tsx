'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GamePanel } from './GamePanel';
import { ControlsHelp } from '@/components/solar-system/ControlsHelp';

interface ControlsPanelProps {
  onClose: () => void;
}

/** The same rows the in-scene help cards show, in one place. On foot they
 *  come from the bindings table (as the surfaces' own help does), so a key
 *  that moves is never described twice. */
const SHIP_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r10', 'r12', 'r13', 'r7', 'r15', 'r8', 'r16', 'r11', 'r14', 'r9'] as const;
const SHIP_TOUCH = ['t1', 't2', 't3', 't11', 't6', 't15', 't13', 't12', 't9', 't14', 't5'] as const;

export function ControlsPanel({ onClose }: ControlsPanelProps) {
  const t = useTranslations('play');
  const tf = useTranslations('solarSystem.flight.keys');
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(window.matchMedia('(pointer: coarse)').matches); }, []);
  return (
    <GamePanel title={t('controls')} onClose={onClose}>
      <p className="game-controls__shell">{t('controlsPanel.shellKeys')}</p>
      <h3 className="game-controls__head">{t('controlsPanel.surface')}</h3>
      <div className="game-controls__binds"><ControlsHelp touch={touch} moon tips={[]} /></div>
      <h3 className="game-controls__head">{t('controlsPanel.ship')}</h3>
      {(touch ? SHIP_TOUCH : SHIP_KEYS).map((k) => <p key={k} className="game-controls__row">{tf(k)}</p>)}
    </GamePanel>
  );
}
