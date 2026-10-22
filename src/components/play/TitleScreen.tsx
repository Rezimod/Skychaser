'use client';

import { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, LogOut, Rocket, RotateCw, Settings, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { game } from '@/game/state';
import { readCheckpoint, type Checkpoint, type GameScene } from '@/game/save';
import { titleModes, type GameMode } from '@/game/mode';
import { useGameAccount } from '@/game/account';
import { story } from '@/game/story';
import { GameMenu } from './GameMenu';

interface TitleScreenProps {
  /** Into the game, in a mode, at a scene. */
  onStart: (scene: GameScene, mode: GameMode) => void;
  /** Multiplayer's lobby, starting the game at this scene once in a room.
   *  Left out (no realtime service), Multiplayer is not offered. */
  onMultiplayer?: (scene: GameScene) => void;
}

const ICONS = { free: Rocket, story: BookOpen, multi: Users } as const;

export function ModeIcon({ mode, size = 22 }: { mode: GameMode; size?: number }) {
  const Icon = ICONS[mode];
  return <Icon size={size} aria-hidden />;
}

/** Where Continue goes: the checkpoint's scene in the mode it was played in.
 *  A room's checkpoint where rooms are not offered plays on as Free Fly.
 *  Pure, so it is tested. */
export function continueTarget(cp: Pick<Checkpoint, 'scene' | 'mode'> | null | undefined, multiplayer: boolean): { scene: GameScene; mode: GameMode } | null {
  if (!cp) return null;
  return { scene: cp.scene, mode: cp.mode === 'multi' && !multiplayer ? 'free' : cp.mode };
}

/** The front of the game: a world rising out of the bottom of a still
 *  starfield, the Sun just over its limb, the wordmark, and the three ways to
 *  play — Free Fly, the story, and (on a host with accounts) Multiplayer —
 *  with Continue over them when there is a checkpoint. No WebGL until one is
 *  picked: each starts in the ship. */
export function TitleScreen({ onStart, onMultiplayer }: TitleScreenProps) {
  const t = useTranslations('play');
  const tw = useTranslations('solarSystem.flight.worlds');
  const ts = useTranslations('play.story');
  const { available } = useGameAccount();
  const multiplayer = available && !!onMultiplayer;
  const modes = titleModes({ accounts: available, online: !!onMultiplayer });
  // Read after mount: the first paint has nothing to disagree with.
  const [resume, setResume] = useState<{ scene: GameScene; mode: GameMode } | null>(null);
  const [chapter, setChapter] = useState<{ index: number; total: number; id: string; complete: boolean } | null>(null);
  useEffect(() => {
    setResume(continueTarget(readCheckpoint(), multiplayer));
    const s = story.get();
    setChapter({ index: s.index, total: s.total, id: s.active, complete: s.complete });
  }, [multiplayer]);
  const go = (mode: GameMode, scene: GameScene = 'orbit') => {
    if (mode === 'multi') onMultiplayer?.(scene);
    else onStart(scene, mode);
  };
  const place = (scene: GameScene) => (scene === 'orbit' ? t('continueShip') : tw(`${scene}.name`));
  const sub = (mode: GameMode) => {
    if (mode !== 'story' || !chapter) return t(`modes.${mode}.sub`);
    if (chapter.complete) return ts('titleDone');
    if (chapter.index > 1 || chapter.id !== 'moon') return ts('titleChapter', { n: chapter.index, total: chapter.total, name: ts(`chapters.${chapter.id}.name`) });
    return t('modes.story.sub');
  };
  return (
    <GameMenu className="game-title" ariaLabel={t('title')} backdrop="horizon">
      <div className="game-title__mark">
        <p className="game-title__brand">Stellar</p>
        <h1 className="game-title__name font-display">{t('title')}</h1>
        <p className="game-title__tagline">{t('tagline')}</p>
      </div>
      <div className="game-menu__list game-title__list">
        {resume && (
          <button type="button" className="game-menu__item game-menu__item--continue" onClick={() => go(resume.mode, resume.scene)}>
            <RotateCw size={18} aria-hidden />
            <span className="game-menu__text">
              <span>{t('continue')}</span>
              <small>{t('continueMode', { mode: t(`modes.${resume.mode}.name`), place: place(resume.scene) })}</small>
            </span>
            <ChevronRight className="game-menu__go" size={18} aria-hidden />
          </button>
        )}
        <div className="game-modes" role="group" aria-label={t('modesLabel')}>
          {modes.map((m, i) => (
            <button key={m} type="button" className="game-mode" data-mode={m} onClick={() => go(m)} autoFocus={!resume && i === 0}>
              <span className="game-mode__icon"><ModeIcon mode={m} /></span>
              <span className="game-mode__text">
                <span className="game-mode__name">{t(`modes.${m}.name`)}</span>
                <small className="game-mode__sub">{sub(m)}</small>
              </span>
              <ChevronRight className="game-mode__go" size={20} aria-hidden />
            </button>
          ))}
        </div>
        <div className="game-title__row">
          <button type="button" className="game-menu__item" onClick={() => game.openOverlay('settings')}><Settings size={18} aria-hidden /><span>{t('settings')}</span></button>
          <button type="button" className="game-menu__item game-menu__item--exit" onClick={game.exit}><LogOut size={18} aria-hidden /><span>{t('exitShort')}</span></button>
        </div>
      </div>
    </GameMenu>
  );
}
