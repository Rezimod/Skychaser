// Stellar Academy's rules, all pure: is an answer right, which question
// comes next, what a finished lesson is worth, which lesson is open, and how
// finishing one changes a child's state. No React, no storage, no clock of
// its own: the screens pass the time in, so every rule is testable.

import type { Course, Exercise, Lesson, Unit } from '@/lib/academy/types';
import { currentStreak, localDay, previousDay, pruneDays, type AcademyState } from '@/lib/academy/store';

// ── Answers ──

/** What a child answered, by exercise kind. `order` lists the original item
 *  indices in the order the child put them; `match` gives, for each left
 *  item in turn, the original index of the right item chosen for it. */
export type Answer =
  | { kind: 'choice'; pick: number }
  | { kind: 'truefalse'; value: boolean }
  | { kind: 'order'; order: number[] }
  | { kind: 'match'; pairs: number[] };

export function isCorrect(ex: Exercise, a: Answer): boolean {
  if (ex.kind !== a.kind) return false;
  switch (ex.kind) {
    case 'choice': return (a as { pick: number }).pick === ex.answer;
    case 'truefalse': return (a as { value: boolean }).value === ex.answer;
    case 'order': {
      const o = (a as { order: number[] }).order;
      return o.length === ex.items.length && o.every((v, i) => v === i);
    }
    case 'match': {
      const p = (a as { pairs: number[] }).pairs;
      return p.length === ex.pairs.length && p.every((v, i) => v === i);
    }
  }
}

// ── Shuffling, the same every time for the same seed ──

/** A small seeded generator (mulberry32): the same lesson shows its items in
 *  the same order on a replay, and tests can pin it. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hash of a string, for seeding. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A shuffled order of `0…n-1` that is never the identity when n > 1: an
 *  "order" or "match" question that arrives already solved teaches nothing. */
export function permutation(n: number, seed: number): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  const rnd = seededRandom(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}

// ── A run through one lesson ──

/** A lesson being played. Every exercise is asked once; one answered wrong
 *  comes back once more at the end, and a second miss shows the answer and
 *  moves on — no hearts, no game over, nobody is stuck. */
export interface LessonRun {
  lessonId: string;
  /** Exercise indices still to ask, the next first. */
  queue: number[];
  /** How many times each exercise has been answered. */
  tries: number[];
  /** Exercises right the first time. */
  firstTry: number[];
  /** How many answers have been given, for the progress bar. */
  answered: number;
}

export function startRun(lesson: Lesson): LessonRun {
  return {
    lessonId: lesson.id,
    queue: lesson.exercises.map((_, i) => i),
    tries: lesson.exercises.map(() => 0),
    firstTry: [],
    answered: 0,
  };
}

/** The run after an answer to the exercise at the head of the queue. */
export function answerRun(run: LessonRun, correct: boolean): LessonRun {
  const [head, ...rest] = run.queue;
  if (head === undefined) return run;
  const tries = run.tries.slice();
  tries[head] += 1;
  const firstTry = correct && tries[head] === 1 ? [...run.firstTry, head] : run.firstTry;
  // Wrong the first time: it comes back once, at the end.
  const queue = !correct && tries[head] === 1 ? [...rest, head] : rest;
  return { ...run, queue, tries, firstTry, answered: run.answered + 1 };
}

export function runDone(run: LessonRun): boolean {
  return run.queue.length === 0;
}

/** 0–1, for the bar across the top: answers given against the most the run can need. */
export function runProgress(run: LessonRun): number {
  const total = run.answered + run.queue.length;
  return total === 0 ? 1 : run.answered / total;
}

// ── What a lesson is worth ──

export const XP_LESSON = 10;
export const XP_PER_FIRST_TRY = 1;
export const XP_PERFECT = 5;
/** A replay is still practice, worth a little. */
export const XP_REPLAY = 5;

export interface RunScore {
  /** Share of exercises right the first time, 0–1. */
  accuracy: number;
  perfect: boolean;
  xp: number;
}

export function scoreRun(run: LessonRun, lesson: Lesson, replay: boolean): RunScore {
  const n = lesson.exercises.length;
  const right = run.firstTry.length;
  const perfect = n > 0 && right === n;
  const accuracy = n === 0 ? 1 : right / n;
  const xp = replay ? XP_REPLAY + (perfect ? XP_PERFECT : 0) : XP_LESSON + right * XP_PER_FIRST_TRY + (perfect ? XP_PERFECT : 0);
  return { accuracy, perfect, xp };
}

// ── The path ──

/** A lesson is open when it is a unit's first or the one before it is done. */
export function isLessonOpen(state: AcademyState, unit: Unit, lessonId: string): boolean {
  const i = unit.lessons.findIndex((l) => l.id === lessonId);
  if (i < 0) return false;
  return i === 0 || !!state.lessons[unit.lessons[i - 1].id]?.done;
}

/** The lesson to offer next: the first open one not yet done, or null when
 *  the whole course is finished. */
export function nextLesson(state: AcademyState, course: Course): { unit: Unit; lesson: Lesson } | null {
  for (const unit of course.units) {
    for (const lesson of unit.lessons) {
      if (!state.lessons[lesson.id]?.done && isLessonOpen(state, unit, lesson.id)) return { unit, lesson };
    }
  }
  return null;
}

export function unitProgress(state: AcademyState, unit: Unit): { done: number; total: number } {
  return { done: unit.lessons.filter((l) => state.lessons[l.id]?.done).length, total: unit.lessons.length };
}

// ── Finishing a lesson ──

export interface Finish {
  state: AcademyState;
  xp: number;
  firstTime: boolean;
  /** The streak after this lesson, and whether this lesson moved it on. */
  streak: number;
  streakUp: boolean;
  /** This lesson took today past the daily goal. */
  goalReached: boolean;
  /** A capsule was earned (the first finish only, and only if its card is not held). */
  capsule: boolean;
}

export function finishLesson(state: AcademyState, lesson: Lesson, score: RunScore, now: Date = new Date()): Finish {
  const today = localDay(now);
  const prev = state.lessons[lesson.id];
  const firstTime = !prev?.done;
  const before = state.days[today] ?? 0;
  const afterXp = before + score.xp;

  let streak = state.streak;
  let streakUp = false;
  if (state.streak.last !== today) {
    const continues = state.streak.last === previousDay(today);
    streak = { count: continues ? state.streak.count + 1 : 1, last: today };
    streakUp = true;
  }

  const capsule = firstTime && !state.cards.includes(lesson.card) && !state.capsules.includes(lesson.id);
  const next: AcademyState = {
    ...state,
    lessons: {
      ...state.lessons,
      [lesson.id]: {
        done: true,
        best: Math.max(prev?.best ?? 0, score.accuracy),
        runs: (prev?.runs ?? 0) + 1,
        at: now.toISOString(),
      },
    },
    xp: state.xp + score.xp,
    days: pruneDays({ ...state.days, [today]: afterXp }, today),
    streak,
    capsules: capsule ? [...state.capsules, lesson.id] : state.capsules,
  };
  return {
    state: next,
    xp: score.xp,
    firstTime,
    streak: currentStreak(next, today),
    streakUp,
    goalReached: before < state.dailyGoal && afterXp >= state.dailyGoal,
    capsule,
  };
}

/** Open a lesson's capsule: its card joins the collection. What a capsule
 *  holds is fixed by the lesson and shown before it is opened — nothing here
 *  is left to chance, and nothing can be bought. */
export function openCapsule(state: AcademyState, lesson: Lesson): AcademyState {
  if (!state.capsules.includes(lesson.id)) return state;
  return {
    ...state,
    capsules: state.capsules.filter((id) => id !== lesson.id),
    cards: state.cards.includes(lesson.card) ? state.cards : [...state.cards, lesson.card],
  };
}
