'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GamePanel } from './GamePanel';

interface ControlsPanelProps {
  onClose: () => void;
}

/** The same rows the in-scene help cards show, in one place. */
const SURFACE_KEYS = ['r1', 'r2', 'r15', 'r9', 'r3', 'r4', 'r16', 'r5', 'r10', 'r6', 'r11', 'r12', 'r8', 'r13', 'r14', 'r7'] as const;
const SURFACE_TOUCH = ['t1', 't2', 't3', 't7', 't4', 't8', 't9', 't6', 't10', 't11', 't5'] as const;
const SHIP_KEYS = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r10', 'r12', 'r13', 'r7', 'r15', 'r8', 'r16', 'r11', 'r14', 'r9'] as const;
const SHIP_TOUCH = ['t1', 't2', 't3', 't11', 't6', 't15', 't13', 't12', 't9', 't14', 't5'] as const;

export function ControlsPanel({ onClose }: ControlsPanelProps) {
  const t = useTranslations('play');
  const tm = useTranslations('solarSystem.moon.keys');
  const tf = useTranslations('solarSystem.flight.keys');
  const [touch, setTouch] = useState(false);
  useEffect(() => { setTouch(window.matchMedia('(pointer: coarse)').matches); }, []);
  return (
    <GamePanel title={t('controls')} onClose={onClose}>
      <p className="game-controls__shell">{t('controlsPanel.shellKeys')}</p>
      <h3 className="game-controls__head">{t('controlsPanel.surface')}</h3>
      {(touch ? SURFACE_TOUCH : SURFACE_KEYS).map((k) => <p key={k} className="game-controls__row">{tm(k)}</p>)}
      <h3 className="game-controls__head">{t('controlsPanel.ship')}</h3>
      {(touch ? SHIP_TOUCH : SHIP_KEYS).map((k) => <p key={k} className="game-controls__row">{tf(k)}</p>)}
    </GamePanel>
  );
}
