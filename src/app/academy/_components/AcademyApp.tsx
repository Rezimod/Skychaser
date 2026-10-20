'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import type { AcademyLocale, AgeBand, Lesson, Unit } from '@/lib/academy/types';
import { AGE_BANDS } from '@/lib/academy/types';
import {
  AVATARS, DAILY_GOALS, currentStreak, freshAcademy, localDay, readAcademy, writeAcademy, xpToday,
  type AcademyState, type Avatar,
} from '@/lib/academy/store';
import {
  answerRun, finishLesson, isCorrect, isLessonOpen, nextLesson, openCapsule, runDone, runProgress,
  scoreRun, startRun, unitProgress, type Answer, type Finish, type LessonRun, type RunScore,
} from '@/lib/academy/engine';
import { ALL_LESSONS, COURSE, cardById, lessonById } from '@/lib/academy/course';
import { playCue } from '@/lib/academy/sound';
import { Exercise, answerText, tx } from './Exercise';

export const AVATAR_ICON: Record<Avatar, string> = {
  astronaut: '🧑‍🚀', rocket: '🚀', moon: '🌙', saturn: '🪐', comet: '☄️', robot: '🤖',
};

/** Where a finished Moon lesson sends the child: straight onto the Moon. */
const MISSION_HREF = '/play?moon';

type Screen =
  | { name: 'home' }
  | { name: 'lesson'; lessonId: string }
  | { name: 'result'; lessonId: string; score: RunScore; finish: Finish }
  | { name: 'cards' }
  | { name: 'gate' }
  | { name: 'parents' };

export default function AcademyApp() {
  const locale: AcademyLocale = useLocale() === 'ka' ? 'ka' : 'en';
  const [state, setState] = useState<AcademyState | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  // The device's progress is read after mount: the server has none to render.
  useEffect(() => { setState(readAcademy()); }, []);
  // Another tab (or the game) may change it; follow along.
  useEffect(() => {
    const onStorage = () => setState(readAcademy());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((next: AcademyState) => { writeAcademy(next); setState(next); }, []);
  // Every new screen starts at its top, after it has rendered.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [screen]);

  if (!state) return <div className="ac-app ac-app--loading" aria-busy="true"><div className="ac-spinner" /></div>;
  if (!state.profile) return <Onboarding state={state} save={save} />;

  const go = (s: Screen) => setScreen(s);
  const tabs = screen.name === 'home' || screen.name === 'cards' || screen.name === 'parents' || screen.name === 'gate';

  return (
    <div className="ac-app" data-age={state.profile.age}>
      {screen.name === 'home' && <Home state={state} save={save} locale={locale} onStart={(id) => go({ name: 'lesson', lessonId: id })} />}
      {screen.name === 'lesson' && (
        <LessonPlayer
          key={screen.lessonId}
          lesson={lessonById(screen.lessonId)!}
          locale={locale}
          sound={state.sound}
          onLeave={() => go({ name: 'home' })}
          onDone={(run) => {
            const lesson = lessonById(screen.lessonId)!;
            const fresh = readAcademy();
            const score = scoreRun(run, lesson, !!fresh.lessons[lesson.id]?.done);
            const finish = finishLesson(fresh, lesson, score);
            save(finish.state);
            playCue('done', fresh.sound);
            go({ name: 'result', lessonId: lesson.id, score, finish });
          }}
        />
      )}
      {screen.name === 'result' && (
        <Result
          key={screen.lessonId}
          state={state}
          save={save}
          locale={locale}
          lesson={lessonById(screen.lessonId)!}
          score={screen.score}
          finish={screen.finish}
          onNext={(id) => go(id ? { name: 'lesson', lessonId: id } : { name: 'home' })}
        />
      )}
      {screen.name === 'cards' && <Cards state={state} locale={locale} />}
      {screen.name === 'gate' && <ParentGate onPass={() => go({ name: 'parents' })} onBack={() => go({ name: 'home' })} />}
      {screen.name === 'parents' && <Parents state={state} save={save} locale={locale} onBack={() => go({ name: 'home' })} />}
      {tabs && <TabBar current={screen.name === 'gate' ? 'parents' : screen.name} onGo={(n) => go(n === 'parents' ? { name: 'gate' } : { name: n })} />}
    </div>
  );
}

// ── Onboarding ──

function Onboarding({ state, save }: { state: AcademyState; save: (s: AcademyState) => void }) {
  const t = useTranslations('academy.onboarding');
  const ta = useTranslations('academy.avatars');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<Avatar>('astronaut');
  const [age, setAge] = useState<AgeBand>('10-13');
  const ok = name.trim().length > 0;
  return (
    <div className="ac-app ac-onboard">
      <form
        className="ac-onboard__card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok) return;
          playCue('right', state.sound);
          // A child's profile starts in children's mode: the game's Moon
          // missions wait for their lessons until a parent says otherwise.
          save({ ...state, kidsMode: true, profile: { name: name.trim().slice(0, 24), avatar, age, createdAt: new Date().toISOString() } });
        }}
      >
        <div className="ac-onboard__hero" aria-hidden="true">
          <Image src="/images/planets/moon.jpg" alt="" width={160} height={160} priority />
        </div>
        <h1 className="ac-title">{t('welcome')}</h1>
        <p className="ac-lead">{t('lead')}</p>

        <label className="ac-field">
          <span className="ac-field__label">{t('nameLabel')}</span>
          <input
            className="ac-input"
            value={name}
            maxLength={24}
            autoComplete="off"
            autoCapitalize="words"
            placeholder={t('namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <fieldset className="ac-field">
          <legend className="ac-field__label">{t('avatarLabel')}</legend>
          <div className="ac-avatars" role="radiogroup">
            {AVATARS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={avatar === a} aria-label={ta(a)} className="ac-avatar" data-on={avatar === a} onClick={() => setAvatar(a)}>
                <span aria-hidden="true">{AVATAR_ICON[a]}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="ac-field">
          <legend className="ac-field__label">{t('ageLabel')}</legend>
          <div className="ac-seg" role="radiogroup">
            {AGE_BANDS.map((b) => (
              <button key={b} type="button" role="radio" aria-checked={age === b} className="ac-seg__btn" data-on={age === b} onClick={() => setAge(b)}>{b}</button>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="ac-btn ac-btn--primary ac-btn--block" disabled={!ok}>{t('start')}</button>
        <p className="ac-fine">{t('privacy')}</p>
      </form>
    </div>
  );
}

// ── Home: the path ──

function Home({ state, save, locale, onStart }: { state: AcademyState; save: (s: AcademyState) => void; locale: AcademyLocale; onStart: (lessonId: string) => void }) {
  const t = useTranslations('academy.home');
  const [sheet, setSheet] = useState<{ unit: Unit; lesson: Lesson } | null>(null);
  const [hint, setHint] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const today = localDay();
  const streak = currentStreak(state, today);
  const done = xpToday(state, today);
  const next = nextLesson(state, COURSE);
  const profile = state.profile!;

  useEffect(() => {
    if (!hint) return;
    const id = window.setTimeout(() => setHint(false), 2400);
    return () => window.clearTimeout(id);
  }, [hint]);

  return (
    <main className="ac-screen ac-home">
      <header className="ac-top">
        <span className="ac-top__avatar" aria-hidden="true">{AVATAR_ICON[profile.avatar]}</span>
        <div className="ac-top__who">
          <p className="ac-top__hello">{t('hello', { name: profile.name })}</p>
          <p className="ac-top__stats">
            <span className="ac-pill ac-pill--streak" data-on={streak > 0}>🔥 {streak > 0 ? t('streak', { n: streak }) : t('streakNone')}</span>
            <span className="ac-pill ac-pill--xp">⭐ {t('xp', { n: state.xp })}</span>
          </p>
        </div>
      </header>

      <section className="ac-goal" aria-label={t('goal', { done, goal: state.dailyGoal })}>
        <div className="ac-goal__text">{done >= state.dailyGoal ? t('goalMet') : t('goal', { done: Math.min(done, state.dailyGoal), goal: state.dailyGoal })}</div>
        <div className="ac-bar"><div className="ac-bar__fill" style={{ width: `${Math.min(1, done / state.dailyGoal) * 100}%` }} /></div>
      </section>

      {state.capsules.length > 0 && (
        <section className="ac-capsules">
          <span className="ac-capsules__icon" aria-hidden="true">🎁</span>
          <span className="ac-capsules__text">{t('capsules', { n: state.capsules.length })}</span>
          <button
            type="button"
            className="ac-btn ac-btn--gold ac-btn--small"
            onClick={() => {
              const lesson = lessonById(state.capsules[0]);
              if (!lesson) { save({ ...state, capsules: state.capsules.slice(1) }); return; }
              playCue('capsule', state.sound);
              save(openCapsule(state, lesson));
              setReveal(lesson.card);
            }}
          >
            {t('openCapsules')}
          </button>
        </section>
      )}

      {COURSE.units.map((unit) => {
        const p = unitProgress(state, unit);
        return (
          <section key={unit.id} className="ac-unit" style={{ '--unit': unit.color } as React.CSSProperties}>
            <div className="ac-unit__head">
              <Image src={unit.image} alt="" fill sizes="(max-width: 640px) 100vw, 560px" className="ac-unit__img" />
              <div className="ac-unit__text">
                <h1 className="ac-unit__title">{tx(unit.title, locale)}</h1>
                <p className="ac-unit__tag">{tx(unit.tagline, locale)}</p>
                <p className="ac-unit__progress">{t('unitProgress', { done: p.done, total: p.total })}</p>
              </div>
            </div>
            <ol className="ac-path">
              {unit.lessons.map((lesson, i) => {
                const rec = state.lessons[lesson.id];
                const open = isLessonOpen(state, unit, lesson.id);
                const current = next?.lesson.id === lesson.id;
                const status = rec?.done ? 'done' : open ? 'open' : 'locked';
                return (
                  <li key={lesson.id} className="ac-node" data-status={status} data-current={current} data-side={['c', 'r', 'c', 'l'][i % 4]}>
                    <button
                      type="button"
                      className="ac-node__btn"
                      aria-label={`${i + 1}. ${tx(lesson.title, locale)}${status === 'locked' ? ` — ${t('locked')}` : ''}`}
                      onClick={() => {
                        playCue('tap', state.sound);
                        if (status === 'locked') { setHint(true); return; }
                        setSheet({ unit, lesson });
                      }}
                    >
                      <span aria-hidden="true">{status === 'done' ? '✓' : status === 'locked' ? '🔒' : lesson.unlocks ? '🚀' : '★'}</span>
                    </button>
                    <span className="ac-node__label">{tx(lesson.title, locale)}</span>
                    {current && <span className="ac-node__start" aria-hidden="true">{t('start')}</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {!next && <p className="ac-alldone">{t('allDone')}</p>}
      {hint && <div className="ac-toast" role="status">{t('locked')}</div>}

      {sheet && (
        <Sheet onClose={() => setSheet(null)}>
          <LessonIntro
            lesson={sheet.lesson}
            locale={locale}
            done={!!state.lessons[sheet.lesson.id]?.done}
            onStart={() => { setSheet(null); onStart(sheet.lesson.id); }}
          />
        </Sheet>
      )}
      {reveal && <CardReveal cardId={reveal} locale={locale} onClose={() => setReveal(null)} />}
    </main>
  );
}

function LessonIntro({ lesson, locale, done, onStart }: { lesson: Lesson; locale: AcademyLocale; done: boolean; onStart: () => void }) {
  const t = useTranslations('academy.home');
  const tl = useTranslations('academy.lesson');
  return (
    <div className="ac-intro">
      <h2 className="ac-intro__title">{tx(lesson.title, locale)}</h2>
      <p className="ac-intro__body">{tx(lesson.intro, locale)}</p>
      {lesson.unlocks && (
        <p className="ac-intro__mission" data-open={done}>🚀 {done ? t('missionOpen') : t('missionLocked')}</p>
      )}
      <button type="button" className="ac-btn ac-btn--primary ac-btn--block" onClick={onStart} autoFocus>
        {done ? t('again') : tl('begin')}
      </button>
    </div>
  );
}

// ── The lesson ──

function LessonPlayer({ lesson, locale, sound, onLeave, onDone }: { lesson: Lesson; locale: AcademyLocale; sound: boolean; onLeave: () => void; onDone: (run: LessonRun) => void }) {
  const t = useTranslations('academy.lesson');
  const [run, setRun] = useState(() => startRun(lesson));
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [checked, setChecked] = useState<null | { correct: boolean }>(null);
  const [leaving, setLeaving] = useState(false);
  const feedbackRef = useRef<HTMLButtonElement>(null);

  const index = run.queue[0];
  const exercise = lesson.exercises[index];
  const retry = run.tries[index] > 0;

  useEffect(() => { if (checked) feedbackRef.current?.focus(); }, [checked]);

  if (exercise === undefined) return null;

  const check = () => {
    if (!answer || checked) return;
    const correct = isCorrect(exercise, answer);
    playCue(correct ? 'right' : 'wrong', sound);
    setChecked({ correct });
  };
  const next = () => {
    if (!checked) return;
    const after = answerRun(run, checked.correct);
    if (runDone(after)) { onDone(after); return; }
    setRun(after);
    setAnswer(null);
    setChecked(null);
  };

  return (
    <main className="ac-screen ac-lesson">
      <header className="ac-lesson__top">
        <button type="button" className="ac-icon-btn" aria-label={t('quit')} onClick={() => setLeaving(true)}>✕</button>
        <div className="ac-bar ac-bar--lesson" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(runProgress(run) * 100)}>
          <div className="ac-bar__fill" style={{ width: `${runProgress(run) * 100}%` }} />
        </div>
      </header>

      {retry && <p className="ac-retry">{t('again')}</p>}
      <Exercise
        key={`${index}:${run.answered}`}
        exercise={exercise}
        lessonId={lesson.id}
        locale={locale}
        locked={!!checked}
        onAnswer={setAnswer}
      />

      <footer className="ac-lesson__foot" data-state={checked ? (checked.correct ? 'right' : 'wrong') : 'idle'}>
        {checked && (
          <div className="ac-feedback" role="status" aria-live="assertive">
            <p className="ac-feedback__title">{checked.correct ? t('right') : t('wrong')}</p>
            {!checked.correct && (
              <p className="ac-feedback__answer"><strong>{t('answerWas')}</strong> {answerText(exercise, locale, (k) => t(k))}</p>
            )}
            <p className="ac-feedback__explain">{tx(exercise.explain, locale)}</p>
          </div>
        )}
        {checked ? (
          <button ref={feedbackRef} type="button" className={`ac-btn ac-btn--block ${checked.correct ? 'ac-btn--primary' : 'ac-btn--warn'}`} onClick={next}>{t('continue')}</button>
        ) : (
          <button type="button" className="ac-btn ac-btn--primary ac-btn--block" disabled={!answer} onClick={check}>{t('check')}</button>
        )}
      </footer>

      {leaving && (
        <Sheet onClose={() => setLeaving(false)}>
          <div className="ac-confirm">
            <h2 className="ac-intro__title">{t('leave')}</h2>
            <p className="ac-intro__body">{t('leaveBody')}</p>
            <button type="button" className="ac-btn ac-btn--primary ac-btn--block" onClick={() => setLeaving(false)} autoFocus>{t('stay')}</button>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={onLeave}>{t('quit')}</button>
          </div>
        </Sheet>
      )}
    </main>
  );
}

// ── The result ──

function Result({ state, save, locale, lesson, score, finish, onNext }: {
  state: AcademyState; save: (s: AcademyState) => void; locale: AcademyLocale; lesson: Lesson; score: RunScore; finish: Finish;
  onNext: (lessonId: string | null) => void;
}) {
  const t = useTranslations('academy.result');
  const [reveal, setReveal] = useState(false);
  const card = cardById(lesson.card);
  const capsuleWaiting = state.capsules.includes(lesson.id);
  const next = nextLesson(state, COURSE);
  return (
    <main className="ac-screen ac-result">
      <div className="ac-result__burst" aria-hidden="true">🎉</div>
      <h1 className="ac-title">{t('title')}</h1>
      <p className="ac-result__lesson">{tx(lesson.title, locale)}</p>

      <div className="ac-stats">
        <div className="ac-stat ac-stat--xp"><span className="ac-stat__big">{t('xp', { n: finish.xp })}</span></div>
        <div className="ac-stat"><span className="ac-stat__big">{score.perfect ? t('perfect') : t('accuracy', { n: Math.round(score.accuracy * 100) })}</span></div>
        {finish.streak > 0 && <div className="ac-stat ac-stat--streak" data-up={finish.streakUp}><span className="ac-stat__big">🔥 {t('streak', { n: finish.streak })}</span></div>}
      </div>
      {finish.goalReached && <p className="ac-banner ac-banner--goal">🏅 {t('goal')}</p>}

      {(finish.capsule || capsuleWaiting) && card && (
        <section className="ac-capsule" data-open={!capsuleWaiting}>
          <p className="ac-capsule__title">🎁 {t('capsule')}</p>
          <p className="ac-capsule__contains">{t('contains', { name: tx(card.name, locale) })}</p>
          {capsuleWaiting && (
            <button
              type="button"
              className="ac-btn ac-btn--gold ac-btn--block"
              onClick={() => { playCue('capsule', state.sound); save(openCapsule(state, lesson)); setReveal(true); }}
            >
              {t('open')}
            </button>
          )}
        </section>
      )}
      {reveal && <CardReveal cardId={lesson.card} locale={locale} onClose={() => setReveal(false)} title={t('newCard')} />}

      {lesson.unlocks && finish.firstTime && (
        <section className="ac-mission">
          <p className="ac-mission__text">🚀 {t('mission')}</p>
          <a className="ac-btn ac-btn--secondary ac-btn--block" href={MISSION_HREF}>{t('play')}</a>
        </section>
      )}

      <div className="ac-result__actions">
        {next && <button type="button" className="ac-btn ac-btn--primary ac-btn--block" onClick={() => onNext(next.lesson.id)}>{t('next')}</button>}
        <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={() => onNext(null)}>{t('home')}</button>
      </div>
    </main>
  );
}

function CardReveal({ cardId, locale, onClose, title }: { cardId: string; locale: AcademyLocale; onClose: () => void; title?: string }) {
  const t = useTranslations('academy.lesson');
  const tr = useTranslations('academy.result');
  const card = cardById(cardId);
  if (!card) return null;
  return (
    <Sheet onClose={onClose}>
      <div className="ac-reveal">
        <p className="ac-reveal__kicker">{title ?? tr('newCard')}</p>
        <CardFace image={card.image} name={tx(card.name, locale)} fact={tx(card.fact, locale)} big />
        <button type="button" className="ac-btn ac-btn--primary ac-btn--block" onClick={onClose} autoFocus>{t('close')}</button>
      </div>
    </Sheet>
  );
}

function CardFace({ image, name, fact, big }: { image: string; name: string; fact?: string; big?: boolean }) {
  return (
    <figure className="ac-card" data-big={!!big}>
      <div className="ac-card__img"><Image src={image} alt="" fill sizes={big ? '320px' : '180px'} /></div>
      <figcaption>
        <span className="ac-card__name">{name}</span>
        {fact && <span className="ac-card__fact">{fact}</span>}
      </figcaption>
    </figure>
  );
}

// ── Cards ──

function Cards({ state, locale }: { state: AcademyState; locale: AcademyLocale }) {
  const t = useTranslations('academy.cards');
  const [open, setOpen] = useState<string | null>(null);
  const lessonOfCard = useMemo(() => new Map(ALL_LESSONS.map((l) => [l.card, l])), []);
  const have = COURSE.cards.filter((c) => state.cards.includes(c.id)).length;
  return (
    <main className="ac-screen ac-cards">
      <h1 className="ac-title">{t('title')}</h1>
      <p className="ac-lead">{t('count', { have, total: COURSE.cards.length })}</p>
      {have === 0 && <p className="ac-empty">{t('empty')}</p>}
      <ul className="ac-grid">
        {COURSE.cards.map((c) => {
          const held = state.cards.includes(c.id);
          const lesson = lessonOfCard.get(c.id);
          return (
            <li key={c.id}>
              {held ? (
                <button type="button" className="ac-grid__btn" onClick={() => setOpen(c.id)}>
                  <CardFace image={c.image} name={tx(c.name, locale)} />
                </button>
              ) : (
                <div className="ac-card ac-card--locked">
                  <div className="ac-card__img ac-card__img--locked" aria-hidden="true">?</div>
                  <span className="ac-card__locked">{t('locked', { lesson: lesson ? tx(lesson.title, locale) : '…' })}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {open && <CardReveal cardId={open} locale={locale} onClose={() => setOpen(null)} title={tx(cardById(open)!.name, locale)} />}
    </main>
  );
}

// ── For grown-ups ──

function ParentGate({ onPass, onBack }: { onPass: () => void; onBack: () => void }) {
  const t = useTranslations('academy.parents');
  const tl = useTranslations('academy.lesson');
  // Two numbers a young child is unlikely to multiply: 6–9 × 6–9.
  const [q] = useState(() => ({ a: 6 + Math.floor(Math.random() * 4), b: 6 + Math.floor(Math.random() * 4) }));
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  return (
    <main className="ac-screen ac-gate">
      <form
        className="ac-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number(value) === q.a * q.b) onPass();
          else { setWrong(true); setValue(''); }
        }}
      >
        <h1 className="ac-title">{t('gateTitle')}</h1>
        <label className="ac-field">
          <span className="ac-field__label">{t('gateQuestion', { a: q.a, b: q.b })}</span>
          <input className="ac-input ac-input--num" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value} onChange={(e) => { setValue(e.target.value.replace(/\D/g, '').slice(0, 3)); setWrong(false); }} />
        </label>
        {wrong && <p className="ac-error" role="alert">{t('gateWrong')}</p>}
        <button type="submit" className="ac-btn ac-btn--primary ac-btn--block" disabled={!value}>{tl('continue')}</button>
        <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={onBack}>{t('back')}</button>
      </form>
    </main>
  );
}

function Parents({ state, save, locale, onBack }: { state: AcademyState; save: (s: AcademyState) => void; locale: AcademyLocale; onBack: () => void }) {
  const t = useTranslations('academy.parents');
  const [confirm, setConfirm] = useState(false);
  const setLocale = (l: AcademyLocale) => {
    if (l === locale) return;
    document.cookie = `stellar_locale=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  };
  return (
    <main className="ac-screen ac-parents">
      <h1 className="ac-title">{t('title')}</h1>

      <section className="ac-panel">
        <Toggle label={t('kidsMode')} body={t('kidsModeBody')} on={state.kidsMode} onText={t('on')} offText={t('off')} onChange={(v) => save({ ...state, kidsMode: v })} />
        <Toggle label={t('sound')} on={state.sound} onText={t('on')} offText={t('off')} onChange={(v) => save({ ...state, sound: v })} />
        <div className="ac-row">
          <span className="ac-row__label">{t('goal')}</span>
          <div className="ac-seg" role="radiogroup">
            {DAILY_GOALS.map((g) => (
              <button key={g} type="button" role="radio" aria-checked={state.dailyGoal === g} className="ac-seg__btn" data-on={state.dailyGoal === g} onClick={() => save({ ...state, dailyGoal: g })}>{t('goalValue', { n: g })}</button>
            ))}
          </div>
        </div>
        <div className="ac-row">
          <span className="ac-row__label">{t('language')}</span>
          <div className="ac-seg" role="radiogroup">
            {(['ka', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={locale === l} className="ac-seg__btn" data-on={locale === l} onClick={() => setLocale(l)}>{l === 'ka' ? 'ქართული' : 'English'}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="ac-panel">
        <h2 className="ac-panel__title">{t('prizesTitle')}</h2>
        <p className="ac-panel__body">{t('prizesBody')}</p>
      </section>
      <section className="ac-panel">
        <h2 className="ac-panel__title">{t('privacyTitle')}</h2>
        <p className="ac-panel__body">{t('privacyBody')}</p>
      </section>

      <section className="ac-panel">
        {confirm ? (
          <>
            <p className="ac-panel__body">{t('resetConfirm')}</p>
            <button type="button" className="ac-btn ac-btn--danger ac-btn--block" onClick={() => { save(freshAcademy()); onBack(); }}>{t('resetYes')}</button>
            <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={() => setConfirm(false)}>{t('cancel')}</button>
          </>
        ) : (
          <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={() => setConfirm(true)}>{t('reset')}</button>
        )}
      </section>
      <button type="button" className="ac-btn ac-btn--ghost ac-btn--block" onClick={onBack}>{t('back')}</button>
    </main>
  );
}

function Toggle({ label, body, on, onText, offText, onChange }: { label: string; body?: string; on: boolean; onText: string; offText: string; onChange: (v: boolean) => void }) {
  return (
    <div className="ac-row ac-row--toggle">
      <div className="ac-row__text">
        <span className="ac-row__label">{label}</span>
        {body && <span className="ac-row__body">{body}</span>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="ac-switch" data-on={on} onClick={() => onChange(!on)}>
        <span className="ac-switch__knob" />
        <span className="ac-switch__text">{on ? onText : offText}</span>
      </button>
    </div>
  );
}

// ── Shared pieces ──

function TabBar({ current, onGo }: { current: string; onGo: (n: 'home' | 'cards' | 'parents') => void }) {
  const t = useTranslations('academy.nav');
  const items = [
    { id: 'home', icon: '🪐', label: t('path') },
    { id: 'cards', icon: '🃏', label: t('cards') },
    { id: 'parents', icon: '👪', label: t('parents') },
  ] as const;
  return (
    <nav className="ac-tabs" aria-label="Stellar Academy">
      {items.map((it) => (
        <button key={it.id} type="button" className="ac-tab" aria-current={current === it.id ? 'page' : undefined} onClick={() => onGo(it.id)}>
          <span className="ac-tab__icon" aria-hidden="true">{it.icon}</span>
          <span className="ac-tab__label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="ac-sheet" role="dialog" aria-modal="true">
      <button type="button" className="ac-sheet__scrim" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div className="ac-sheet__panel">{children}</div>
    </div>
  );
}
