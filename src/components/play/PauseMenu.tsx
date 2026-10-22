'use client';

import type { CSSProperties } from 'react';
import { Home, Keyboard, LogOut, Play, RotateCcw, Settings, Trophy, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { game } from '@/game/state';
import type { GameMode } from '@/game/mode';
import { ModeIcon } from './TitleScreen';

interface PauseMenuProps {
  onResume: () => void;
  /** How this game is being played: shown at the top, and it decides the keys. */
  mode: GameMode;
  /** Back to the title, to pick another mode (a room is left on the way). */
  onTitle: () => void;
  /** The room this game is played in, if any. */
  room?: { code: string; count: number } | null;
}

const n = (i: number) => ({ '--n': i }) as CSSProperties;

/** Over the frozen scene, softened: no starfield, one card of glass. */
export function PauseMenu({ onResume, mode, onTitle, room }: PauseMenuProps) {
  const t = useTranslations('play');
  let i = 0;
  return (
    <div className="game-menu game-pause" role="dialog" aria-label={t('paused')}>
      <div className="game-menu__panel">
        <p className="game-pause__title font-display">{t('paused')}</p>
        <p className="game-pause__mode" data-mode={mode}>
          <ModeIcon mode={mode} size={15} />
          <span>{t(`modes.${mode}.name`)}</span>
          {room && <small><Users size={13} aria-hidden /> {t('lobby.inRoom', { code: room.code, n: room.count })}</small>}
        </p>
        <p className="game-pause__hint">{t('pauseHint')}</p>
        <div className="game-menu__list">
          <button type="button" className="game-menu__item game-menu__item--primary" style={n(i++)} onClick={onResume} autoFocus><Play size={18} aria-hidden /><span>{t('resume')}</span></button>
          {mode === 'story' && <button type="button" className="game-menu__item" style={n(i++)} onClick={() => game.openOverlay('missions')}><Trophy size={18} aria-hidden /><span>{t('story.panelTitle')}</span></button>}
          <button type="button" className="game-menu__item" style={n(i++)} onClick={() => game.openOverlay('settings')}><Settings size={18} aria-hidden /><span>{t('settings')}</span></button>
          <button type="button" className="game-menu__item" style={n(i++)} onClick={() => game.openOverlay('controls')}><Keyboard size={18} aria-hidden /><span>{t('controls')}</span></button>
          <button type="button" className="game-menu__item" style={n(i++)} onClick={game.restart}><RotateCcw size={18} aria-hidden /><span>{t('restart')}</span></button>
          {mode === 'multi'
            ? <button type="button" className="game-menu__item game-menu__item--leave" style={n(i++)} onClick={onTitle}><LogOut size={18} aria-hidden /><span>{t('lobby.leaveToTitle')}</span></button>
            : <button type="button" className="game-menu__item" style={n(i++)} onClick={onTitle}><Home size={18} aria-hidden /><span>{t('toTitle')}</span></button>}
          <button type="button" className="game-menu__item game-menu__item--exit" style={n(i++)} onClick={game.exit}><LogOut size={18} aria-hidden /><span>{t('exit')}</span></button>
        </div>
      </div>
    </div>
  );
}
