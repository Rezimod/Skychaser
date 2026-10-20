// Stellar Academy's rules: answers, shuffles, the lesson run, scoring,
// the path, streaks, capsules, the stored state, and the game's mission gate.

import { describe, expect, it } from 'vitest';
import type { Course, Lesson, Unit } from '@/lib/academy/types';
import {
  answerRun, finishLesson, isCorrect, isLessonOpen, nextLesson, openCapsule, permutation, runDone,
  runProgress, scoreRun, seedOf, startRun, XP_LESSON, XP_PERFECT, XP_PER_FIRST_TRY, XP_REPLAY,
} from '@/lib/academy/engine';
import { currentStreak, freshAcademy, localDay, parseAcademy, previousDay, type AcademyState } from '@/lib/academy/store';
import { academyMissionGate, lessonForMission, MISSION_LESSONS } from '@/lib/academy/gates';
import { MISSION_IDS } from '@/lib/solar-system/moon-missions';

const t = (s: string) => ({ ka: s, en: s });
const lesson = (id: string, card: string): Lesson => ({
  id, title: t(id), intro: t('intro'), card,
  exercises: [
    { kind: 'choice', id: 'a', prompt: t('?'), explain: t('.'), options: [t('x'), t('y'), t('z')], answer: 1 },
    { kind: 'truefalse', id: 'b', prompt: t('?'), explain: t('.'), answer: false },
    { kind: 'order', id: 'c', prompt: t('?'), explain: t('.'), items: [t('1'), t('2'), t('3')] },
    { kind: 'match', id: 'd', prompt: t('?'), explain: t('.'), pairs: [{ left: t('a'), right: t('A') }, { left: t('b'), right: t('B') }, { left: t('c'), right: t('C') }] },
  ],
});
const unit: Unit = { id: 'moon', title: t('Moon'), tagline: t('.'), color: '#9fb7d9', image: '/x.jpg', lessons: [lesson('moon-1', 'c1'), lesson('moon-2', 'c2')] };
const course: Course = { units: [unit], cards: [] };

describe('answers', () => {
  const [choice, tf, order, match] = unit.lessons[0].exercises;
  it('checks each kind', () => {
    expect(isCorrect(choice, { kind: 'choice', pick: 1 })).toBe(true);
    expect(isCorrect(choice, { kind: 'choice', pick: 0 })).toBe(false);
    expect(isCorrect(tf, { kind: 'truefalse', value: false })).toBe(true);
    expect(isCorrect(order, { kind: 'order', order: [0, 1, 2] })).toBe(true);
    expect(isCorrect(order, { kind: 'order', order: [1, 0, 2] })).toBe(false);
    expect(isCorrect(order, { kind: 'order', order: [0, 1] })).toBe(false);
    expect(isCorrect(match, { kind: 'match', pairs: [0, 1, 2] })).toBe(true);
    expect(isCorrect(match, { kind: 'match', pairs: [0, 2, 1] })).toBe(false);
  });
  it('never accepts an answer of another kind', () => {
    expect(isCorrect(choice, { kind: 'truefalse', value: true })).toBe(false);
  });
});

describe('shuffles', () => {
  it('are permutations, repeatable, and never already solved', () => {
    for (let n = 2; n <= 5; n++) {
      for (let s = 0; s < 200; s++) {
        const p = permutation(n, s);
        expect([...p].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
        expect(p.every((v, i) => v === i)).toBe(false);
        expect(permutation(n, s)).toEqual(p);
      }
    }
    expect(seedOf('moon-1:c')).toBe(seedOf('moon-1:c'));
    expect(seedOf('moon-1:c')).not.toBe(seedOf('moon-1:d'));
  });
});

describe('a lesson run', () => {
  const l = unit.lessons[0];
  it('asks a missed exercise once more at the end, then moves on', () => {
    let run = startRun(l);
    run = answerRun(run, true);   // a
    run = answerRun(run, false);  // b, missed
    expect(run.queue).toEqual([2, 3, 1]);
    run = answerRun(run, true);   // c
    run = answerRun(run, true);   // d
    run = answerRun(run, false);  // b again, missed again: shown and gone
    expect(runDone(run)).toBe(true);
    expect(run.firstTry).toEqual([0, 2, 3]);
    expect(runProgress(run)).toBe(1);
  });
  it('scores first-try answers, with a bonus for a perfect run', () => {
    let run = startRun(l);
    for (let i = 0; i < 4; i++) run = answerRun(run, true);
    const perfect = scoreRun(run, l, false);
    expect(perfect).toEqual({ accuracy: 1, perfect: true, xp: XP_LESSON + 4 * XP_PER_FIRST_TRY + XP_PERFECT });
    expect(scoreRun(run, l, true).xp).toBe(XP_REPLAY + XP_PERFECT);
  });
});

describe('the path and finishing', () => {
  const day = (d: string) => new Date(`${d}T12:00:00`);
  it('opens lessons in order', () => {
    const s = freshAcademy();
    expect(isLessonOpen(s, unit, 'moon-1')).toBe(true);
    expect(isLessonOpen(s, unit, 'moon-2')).toBe(false);
    expect(nextLesson(s, course)?.lesson.id).toBe('moon-1');
  });
  it('a first finish earns XP, a capsule, starts a streak and opens the next lesson', () => {
    const s = freshAcademy();
    const score = { accuracy: 1, perfect: true, xp: 19 };
    const f = finishLesson(s, unit.lessons[0], score, day('2026-10-20'));
    expect(f.firstTime).toBe(true);
    expect(f.capsule).toBe(true);
    expect(f.streak).toBe(1);
    expect(f.state.xp).toBe(19);
    expect(f.state.days['2026-10-20']).toBe(19);
    expect(f.goalReached).toBe(false);
    expect(isLessonOpen(f.state, unit, 'moon-2')).toBe(true);
    // The capsule holds the lesson's own card.
    const opened = openCapsule(f.state, unit.lessons[0]);
    expect(opened.cards).toEqual(['c1']);
    expect(opened.capsules).toEqual([]);
    // A replay earns no second capsule.
    expect(finishLesson(opened, unit.lessons[0], score, day('2026-10-20')).capsule).toBe(false);
  });
  it('the streak grows on consecutive days and resets after a gap', () => {
    const score = { accuracy: 1, perfect: false, xp: 12 };
    let s: AcademyState = freshAcademy();
    s = finishLesson(s, unit.lessons[0], score, day('2026-10-18')).state;
    s = finishLesson(s, unit.lessons[0], score, day('2026-10-19')).state;
    const same = finishLesson(s, unit.lessons[0], score, day('2026-10-19'));
    expect(same.streakUp).toBe(false);
    s = finishLesson(same.state, unit.lessons[0], score, day('2026-10-20')).state;
    expect(currentStreak(s, '2026-10-20')).toBe(3);
    expect(currentStreak(s, '2026-10-21')).toBe(3);
    expect(currentStreak(s, '2026-10-22')).toBe(0);
    expect(finishLesson(s, unit.lessons[0], score, day('2026-10-23')).streak).toBe(1);
  });
  it('reports the daily goal once, when it is crossed', () => {
    const s = { ...freshAcademy(), dailyGoal: 20 };
    const a = finishLesson(s, unit.lessons[0], { accuracy: 1, perfect: false, xp: 12 }, day('2026-10-20'));
    expect(a.goalReached).toBe(false);
    const b = finishLesson(a.state, unit.lessons[1], { accuracy: 1, perfect: false, xp: 12 }, day('2026-10-20'));
    expect(b.goalReached).toBe(true);
    const c = finishLesson(b.state, unit.lessons[1], { accuracy: 1, perfect: false, xp: 5 }, day('2026-10-20'));
    expect(c.goalReached).toBe(false);
  });
  it('local days step back across a month end', () => {
    expect(previousDay('2026-11-01')).toBe('2026-10-31');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    expect(localDay(new Date(2026, 9, 5))).toBe('2026-10-05');
  });
});

describe('the stored state', () => {
  it('starts clean on nothing, nonsense, or another version', () => {
    expect(parseAcademy(null)).toEqual(freshAcademy());
    expect(parseAcademy('{not json')).toEqual(freshAcademy());
    expect(parseAcademy(JSON.stringify({ v: 2, xp: 50 }))).toEqual(freshAcademy());
  });
  it('keeps what is valid and drops what is not', () => {
    const s = parseAcademy(JSON.stringify({
      v: 1, kidsMode: true, xp: 40.4, dailyGoal: 999,
      profile: { name: '  Nino  ', avatar: 'dragon', age: '10-13', createdAt: '2026-10-20' },
      lessons: { 'moon-1': { done: true, best: 3, runs: 2, at: 'x' }, bad: 5 },
      days: { '2026-10-20': 40, nope: 9 },
      streak: { count: 2, last: '2026-10-20' },
      cards: ['c1', 'c1', 7], capsules: ['moon-2'], sound: false,
    }));
    expect(s.profile).toEqual({ name: 'Nino', avatar: 'astronaut', age: '10-13', createdAt: '2026-10-20' });
    expect(s.kidsMode).toBe(true);
    expect(s.xp).toBe(40);
    expect(s.dailyGoal).toBe(20);
    expect(s.lessons['moon-1']).toEqual({ done: true, best: 1, runs: 2, at: 'x' });
    expect(s.lessons.bad).toBeUndefined();
    expect(s.days).toEqual({ '2026-10-20': 40 });
    expect(s.cards).toEqual(['c1']);
    expect(s.sound).toBe(false);
  });
});

describe('the game\'s mission gate', () => {
  it('names a lesson for every Moon mission the game has', () => {
    expect(Object.keys(MISSION_LESSONS).sort()).toEqual([...MISSION_IDS].sort());
    expect(lessonForMission('firstSteps')).toBe('moon-1');
    expect(lessonForMission('nothing')).toBeNull();
    expect(lessonForMission('constructor')).toBeNull();
  });
  it('opens every mission outside children\'s mode', () => {
    const gate = academyMissionGate(() => freshAcademy());
    expect(MISSION_IDS.every((id) => gate(id))).toBe(true);
  });
  it('in children\'s mode, holds each mission until its lesson is done', () => {
    let s: AcademyState = { ...freshAcademy(), kidsMode: true };
    const gate = academyMissionGate(() => s);
    expect(gate('firstSteps')).toBe(false);
    s = { ...s, lessons: { 'moon-1': { done: true, best: 1, runs: 1, at: '' } } };
    expect(gate('firstSteps')).toBe(true);
    expect(gate('power')).toBe(false);
  });
});
