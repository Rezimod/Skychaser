'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, LogOut, Play, RotateCw, Settings, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { game } from '@/game/state';
import { readCheckpoint, type GameScene } from '@/game/save';
import { GameMenu } from './GameMenu';

interface TitleScreenProps {
  onStart: (scene: GameScene) => void;
}

/** The surface a checkpoint can put the crew straight back onto; orbit is
 *  what Enter already opens, so it is not offered twice. Pure, so it is tested. */
export function resumableScene(scene: GameScene | null | undefined): Exclude<GameScene, 'orbit'> | null {
  return scene && scene !== 'orbit' ? scene : null;
}

/** The front of the game: a world rising out of the bottom of a still
 *  starfield, the Sun just over its limb, the wordmark, and the things to
 *  do. No WebGL until Enter. Enter opens the solar system: the ship, the
 *  Moon and the missions are reached from there by flying — and a crew
 *  that left from a surface is offered the way straight back to it. */
export function TitleScreen({ onStart }: TitleScreenProps) {
  const t = useTranslations('play');
  const tw = useTranslations('solarSystem.flight.worlds');
  // Read after mount: the first paint has nothing to disagree with.
  const [resume, setResume] = useState<Exclude<GameScene, 'orbit'> | null>(null);
  useEffect(() => { setResume(resumableScene(readCheckpoint()?.scene)); }, []);
  return (
    <GameMenu className="game-title" ariaLabel={t('title')} backdrop="horizon">
      <div className="game-title__mark">
        <p className="game-title__brand">Stellar</p>
        <h1 className="game-title__name font-display">{t('title')}</h1>
        <p className="game-title__tagline">{t('tagline')}</p>
      </div>
      <div className="game-menu__list">
        {resume && (
          <button type="button" className="game-menu__item game-menu__item--continue" onClick={() => onStart(resume)}>
            <RotateCw size={18} aria-hidden />
            <span className="game-menu__text">
              <span>{t('continue')}</span>
              <small>{t('continueSub', { place: tw(`${resume}.name`) })}</small>
            </span>
            <ChevronRight className="game-menu__go" size={18} aria-hidden />
          </button>
        )}
        <button type="button" className="game-menu__item game-menu__item--primary game-menu__item--enter" onClick={() => onStart('orbit')} autoFocus>
          <Play size={18} aria-hidden />
          <span className="game-menu__text">
            <span>{t('enter')}</span>
            <small>{t('enterSub')}</small>
          </span>
          <ChevronRight className="game-menu__go" size={18} aria-hidden />
        </button>
        <button type="button" className="game-menu__item" onClick={() => game.openOverlay('missions')}><Trophy size={18} aria-hidden /><span>{t('missions')}</span></button>
        <button type="button" className="game-menu__item" onClick={() => game.openOverlay('settings')}><Settings size={18} aria-hidden /><span>{t('settings')}</span></button>
        <button type="button" className="game-menu__item game-menu__item--exit" onClick={game.exit}><LogOut size={18} aria-hidden /><span>{t('exit')}</span></button>
      </div>
    </GameMenu>
  );
}
