'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Circle, Lock, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameAccount } from '@/game/account';
import { localMissionStore } from '@/lib/solar-system/mission-store';
import { MOON_MISSIONS } from '@/lib/solar-system/moon-missions';
import { DISCOVERIES, readDiscoveryCount } from '@/lib/solar-system/flight-missions';
import { localRewardSink } from '@/lib/solar-system/achievements';
import { academyMissionGate } from '@/lib/academy/gates';
import { EXPLORE_MAX_STARS, type ExploreProgress } from '@/lib/games/explore';
import { GamePanel } from './GamePanel';
import { story, objectiveProgress, type StorySnapshot } from '@/game/story';
import { STORY_CHAPTERS } from '@/lib/solar-system/story-chapters';

interface MissionsPanelProps {
  onClose: () => void;
}

/** Where a mission stands for this crew. */
export type MissionState = 'done' | 'next' | 'open' | 'locked' | 'lesson';

interface Progress { missions: { id: string; state: MissionState }[]; discoveries: number; records: number }

/** The five Moon missions as the store has them: done, the one being flown
 *  (or the first that can be), the others that could be taken on, those
 *  still behind one that has not, and (in Stellar Academy's children's mode)
 *  those waiting for their lesson. Pure, so it is tested. */
export function missionStates(done: readonly string[], active: string, gate: (id: string) => boolean = () => true): { id: string; state: MissionState }[] {
  let next = MOON_MISSIONS.find((m) => m.id === active && !done.includes(m.id) && gate(m.id))?.id ?? '';
  return MOON_MISSIONS.map((m) => {
    if (done.includes(m.id)) return { id: m.id, state: 'done' as const };
    const open = (m.requires ?? []).every((r) => done.includes(r));
    if (!open) return { id: m.id, state: 'locked' as const };
    if (!gate(m.id)) return { id: m.id, state: 'lesson' as const };
    if (!next) next = m.id;
    return { id: m.id, state: next === m.id ? 'next' as const : 'open' as const };
  });
}

/** The Grand Tour's chapters for the log: done, the one in hand, and the
 *  rest still ahead of it. Pure, so it is tested. */
export function chapterStates(s: Pick<StorySnapshot, 'active' | 'done'>): { id: string; state: 'done' | 'next' | 'locked' }[] {
  return STORY_CHAPTERS.map((c) => ({
    id: c.id,
    state: s.done.includes(c.id) ? 'done' as const : c.id === s.active ? 'next' as const : 'locked' as const,
  }));
}

/** Story mode's campaign: the chapters, the objectives of the one in hand, and the way to start over. */
function Campaign() {
  const t = useTranslations('play.story');
  const tp = useTranslations('play');
  const s = useSyncExternalStore(story.subscribe, story.get, story.get);
  const [confirm, setConfirm] = useState(false);
  const chapters = chapterStates(s);
  return (
    <>
      <div className="game-missions__head">
        <span>{t('panelTitle')}</span>
        <b>{tp('missionsPanel.count', { n: s.done.length, total: chapters.length })}</b>
      </div>
      <p className="game-missions__empty">{t('panelLead')}</p>
      <ol className="game-missions__list">
        {chapters.map((c, i) => (
          <li key={c.id} className="game-missions__item" data-state={c.state}>
            <span className="game-missions__mark" aria-hidden>
              {c.state === 'done' ? <Check size={14} /> : c.state === 'locked' ? <Lock size={12} /> : <Circle size={10} />}
            </span>
            <span className="game-missions__name">
              {t('chapterTag', { n: i + 1, name: t(`chapters.${c.id}.name`) })}
              {c.state === 'next' && (
                <span className="story-steps">
                  {s.objectives.map((o) => (
                    <small key={o.id} className="story-steps__item" data-done={o.done} data-now={o.id === s.objective}>
                      {o.done ? '✓ ' : ''}{t(`chapters.${c.id}.obj.${o.id}`)}{objectiveProgress(o) ? ` · ${objectiveProgress(o)}` : ''}
                    </small>
                  ))}
                </span>
              )}
            </span>
            <small className="game-missions__state">{tp(`missionsPanel.state.${c.state}`)}</small>
          </li>
        ))}
      </ol>
      {s.complete && <p className="game-missions__empty">{t('panelDone')}</p>}
      {(s.done.length > 0 || s.objectives.some((o) => o.progress > 0)) && (
        confirm ? (
          <p className="game-missions__signin">
            {t('restartAsk')}
            <button type="button" className="game-missions__signin-btn" onClick={() => { story.restart(); setConfirm(false); }}>{t('restartYes')}</button>
            <button type="button" className="game-missions__signin-btn" onClick={() => setConfirm(false)}>{t('restartNo')}</button>
          </p>
        ) : (
          <button type="button" className="game-setting__reset" onClick={() => setConfirm(true)}><RotateCcw size={14} aria-hidden /> {t('restart')}</button>
        )
      )}
    </>
  );
}

/** What the saves say — the same mission store the Moon reads and writes —
 *  read after mount so the first paint has nothing to disagree with; and
 *  what the platform has credited for it. */
export function MissionsPanel({ onClose }: MissionsPanelProps) {
  const t = useTranslations('play');
  const tm = useTranslations('solarSystem.moon.missions');
  const { available, ready, authenticated, getAccessToken, login } = useGameAccount();
  const [p, setP] = useState<Progress | null>(null);
  const [credited, setCredited] = useState<ExploreProgress | null>(null);
  useEffect(() => {
    const saved = localMissionStore(MOON_MISSIONS.map((m) => m.id)).load();
    setP({ missions: missionStates(saved.done, saved.active, academyMissionGate()), discoveries: readDiscoveryCount(), records: localRewardSink().list().length });
  }, []);
  useEffect(() => {
    if (!ready || !authenticated) { setCredited(null); return; }
    let cancelled = false;
    getAccessToken().catch(() => null).then((token) => {
      if (cancelled || !token) return;
      fetch('/api/games/explore', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: ExploreProgress | null) => { if (!cancelled && d) setCredited(d); })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [ready, authenticated, getAccessToken]);
  const doneCount = p?.missions.filter((m) => m.state === 'done').length ?? 0;
  const empty = p && doneCount === 0 && p.discoveries === 0 && p.records === 0;
  const max = credited?.maxStars ?? EXPLORE_MAX_STARS;
  const stars = credited?.totalStars ?? 0;
  return (
    <GamePanel title={t('missions')} onClose={onClose}>
      <Campaign />
      {p && (
        <>
          <div className="game-missions__head">
            <span>{t('missionsPanel.moon')}</span>
            <b>{t('missionsPanel.count', { n: doneCount, total: p.missions.length })}</b>
          </div>
          <ol className="game-missions__list">
            {p.missions.map((m) => (
              <li key={m.id} className="game-missions__item" data-state={m.state}>
                <span className="game-missions__mark" aria-hidden>
                  {m.state === 'done' ? <Check size={14} /> : m.state === 'locked' || m.state === 'lesson' ? <Lock size={12} /> : <Circle size={10} />}
                </span>
                <span className="game-missions__name">{tm(`${m.id}.title`)}</span>
                <small className="game-missions__state">{t(`missionsPanel.state.${m.state}`)}</small>
              </li>
            ))}
          </ol>
          {p.missions.some((m) => m.state === 'lesson') && (
            <p className="game-missions__empty">
              {t('missionsPanel.academy')} <a className="game-missions__signin-btn" href="/academy">{t('missionsPanel.academyAction')}</a>
            </p>
          )}
          {empty && <p className="game-missions__empty">{t('missionsPanel.empty')}</p>}
          <dl className="game-missions">
            <dt>{t('missionsPanel.discoveries', { n: p.discoveries, total: DISCOVERIES.length })}</dt>
            <dd><span className="game-missions__track"><i style={{ width: `${(p.discoveries / DISCOVERIES.length) * 100}%` }} /></span></dd>
            {ready && authenticated && (
              <>
                <dt>{t('stars.credited', { n: stars, max })}</dt>
                <dd data-done={stars >= max}><span className="game-missions__track"><i style={{ width: `${Math.min(100, (stars / max) * 100)}%` }} /></span></dd>
              </>
            )}
          </dl>
        </>
      )}
      {p && available && ready && !authenticated && (
        <p className="game-missions__signin">
          {t('stars.signIn', { max })}
          <button type="button" className="game-missions__signin-btn"
            onClick={login}>
            {t('stars.signInAction')}
          </button>
        </p>
      )}
    </GamePanel>
  );
}
