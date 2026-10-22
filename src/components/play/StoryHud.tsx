'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { BookOpen, ChevronRight, Radio, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { story, objectiveProgress } from '@/game/story';
import type { GameScene } from '@/game/save';
import type { FlightSession } from '@/lib/solar-system/player-ship';
import { BRIEF_LINES, STORY_CHAPTERS, chapterNumber } from '@/lib/solar-system/story-chapters';

/** How long a briefing line stays on the comms before the next, ms. */
const LINE_MS = 7500;
/** How long after the deck takes the con the briefing comes in, ms: past the launch screen. */
const BRIEF_AFTER_MS = 2200;
/** How often the nav lock is put back on the chapter's world when nothing is locked, ms. */
const NAV_EVERY_MS = 3000;
/** How long a chapter's card stays if nobody closes it, ms. */
const CARD_MS = 12000;

interface StoryHudProps {
  session: FlightSession;
  scene: GameScene;
  /** The deck has the con. */
  flying: boolean;
  /** The game is paused: nothing advances. */
  paused: boolean;
}

/** Story mode over the game: in flight, the comms briefing for the chapter
 *  in hand, then one line of what to do; the nav target set to the chapter's
 *  world; and, wherever the crew is, the card when a chapter is done. On the
 *  surfaces the objective is in the surface's own card (WorldSurface, and the
 *  Moon's mission card for the opening). */
export function StoryHud({ session, scene, flying, paused }: StoryHudProps) {
  const s = useSyncExternalStore(story.subscribe, story.get, story.get);
  const t = useTranslations('play.story');
  const inFlight = scene === 'orbit';
  const toLand = s.objective === 'land' && !!s.world;

  // The chapter's world is the nav target while the way there is the job.
  useEffect(() => {
    if (!flying || !inFlight || !toLand || !s.world) return;
    const dest = s.world;
    session.input.targetRequest = dest;
    const id = window.setInterval(() => { if (!session.telemetry.navId) session.input.targetRequest = dest; }, NAV_EVERY_MS);
    return () => window.clearInterval(id);
  }, [flying, inFlight, toLand, s.world, session]);

  // The briefing, once a session for each chapter, when the ship is flying.
  useEffect(() => {
    if (!flying || !inFlight || !toLand || paused) return;
    const id = window.setTimeout(() => story.brief(), BRIEF_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [flying, inFlight, toLand, paused, s.active]);
  const line = s.briefing?.line ?? 0;
  useEffect(() => {
    if (!line || paused) return;
    const id = window.setTimeout(() => story.nextLine(), LINE_MS);
    return () => window.clearTimeout(id);
  }, [line, paused, s.briefing?.chapter]);
  // Down on a surface (or out of the ship's seat), the comms go quiet.
  useEffect(() => { if ((!inFlight || !flying) && s.briefing) story.endBriefing(); }, [inFlight, flying, s.briefing]);

  const card = s.card;
  // The card goes by itself too: under a held pointer (a desk, mid-walk) its key cannot be clicked.
  useEffect(() => {
    if (!card || paused) return;
    const id = window.setTimeout(() => story.dismissCard(), CARD_MS);
    return () => window.clearTimeout(id);
  }, [card, paused]);
  const cardNo = card ? chapterNumber(card) : 0;
  const next = cardNo ? STORY_CHAPTERS[cardNo] : undefined;
  const cur = s.objectives.find((o) => o.id === s.objective);

  return (
    <>
      {inFlight && flying && s.briefing && (
        <button type="button" className="story-comms" onClick={() => story.nextLine()} aria-live="polite">
          <span className="story-comms__from"><Radio size={13} aria-hidden /> {t('commsFrom')}</span>
          <span className="story-comms__text">{t(`chapters.${s.briefing.chapter}.brief.l${s.briefing.line}`)}</span>
          <span className="story-comms__dots" aria-hidden>
            {Array.from({ length: BRIEF_LINES }, (_, i) => <i key={i} data-on={i < s.briefing!.line} />)}
          </span>
        </button>
      )}
      {inFlight && !s.briefing && s.active && s.objective && !card && (
        <button type="button" className="story-chip" onClick={() => story.brief(true)} aria-label={t('replay')}>
          <span className="story-chip__tag"><BookOpen size={12} aria-hidden /> {t('chapterTag', { n: s.index, name: t(`chapters.${s.active}.name`) })}</span>
          <span className="story-chip__text">{t(`chapters.${s.active}.obj.${s.objective}`)}</span>
          {objectiveProgress(cur) && <b className="story-chip__count">{objectiveProgress(cur)}</b>}
        </button>
      )}
      {card && (
        <div className="story-card" role="dialog" aria-labelledby="story-card-title">
          <div className="story-card__panel">
            <span className="story-card__icon"><Sparkles size={22} aria-hidden /></span>
            <p className="story-card__kicker">{next ? t('cardKicker', { n: cardNo }) : t('finaleKicker')}</p>
            <h2 id="story-card-title" className="story-card__title font-display">{next ? t(`chapters.${card}.name`) : t('finaleTitle')}</h2>
            <p className="story-card__fact">{t(`chapters.${card}.done`)}</p>
            {next ? <p className="story-card__next">{t('cardNext', { name: t(`chapters.${next.id}.name`) })}</p> : <p className="story-card__next">{t('finaleLine')}</p>}
            <button type="button" className="story-card__go" onClick={() => story.dismissCard()} autoFocus>
              <span>{t(next ? 'onward' : 'finaleClose')}</span><ChevronRight size={18} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
