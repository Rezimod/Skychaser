'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CosmicSky } from '@/components/solar-system/CosmicLoader';

interface GamePanelProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A sheet over the title or the pause menu: a heading, a close key, content that scrolls. */
export function GamePanel({ title, onClose, children }: GamePanelProps) {
  const t = useTranslations('play');
  return (
    <div className="game-menu game-panel" role="dialog" aria-label={title}>
      {/* The title's sky, when the sheet opens over the title (CSS drops it over a paused scene). */}
      <CosmicSky />
      <div className="game-menu__panel game-panel__sheet">
        <div className="game-panel__head">
          <h2 className="game-panel__title">{title}</h2>
          <button type="button" className="game-panel__close" onClick={onClose} aria-label={t('back')}><X size={18} aria-hidden /></button>
        </div>
        <div className="game-panel__body" data-selectable>{children}</div>
      </div>
    </div>
  );
}
