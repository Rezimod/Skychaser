// Stellar Academy: the shape of a course. Plain data, no React, no storage:
// the content files (course-*.ts) fill these in, the engine (engine.ts)
// checks answers and keeps score, the store (store.ts) remembers progress.
//
// Every string a child reads is in both languages. Georgian comes first in
// the app; English is the second language and the fallback.

export type AcademyLocale = 'ka' | 'en';

/** One piece of text in both languages. */
export interface Text {
  ka: string;
  en: string;
}

/** Fields every exercise has. `id` is unique within its lesson. */
interface ExerciseBase {
  id: string;
  /** The question or instruction, a sentence or two at most. */
  prompt: Text;
  /** Shown after the answer, right or wrong: why. One or two short sentences. */
  explain: Text;
  /** An optional picture above the question: a path under /public. */
  image?: string;
}

/** Pick the one right answer. Two to four options. */
export interface ChoiceExercise extends ExerciseBase {
  kind: 'choice';
  options: Text[];
  /** Index into `options`. */
  answer: number;
}

/** Is the statement true or false? */
export interface TrueFalseExercise extends ExerciseBase {
  kind: 'truefalse';
  answer: boolean;
}

/** Put the items in order. `items` is written in the RIGHT order; the app
 *  shuffles them. Three to five items. */
export interface OrderExercise extends ExerciseBase {
  kind: 'order';
  items: Text[];
}

/** Match each left item to its right item. `pairs` is written matched; the
 *  app shuffles the right column. Three or four pairs. */
export interface MatchExercise extends ExerciseBase {
  kind: 'match';
  pairs: { left: Text; right: Text }[];
}

export type Exercise = ChoiceExercise | TrueFalseExercise | OrderExercise | MatchExercise;
export type ExerciseKind = Exercise['kind'];

/** A collectible card: a real object or idea, earned by finishing a lesson. */
export interface Card {
  id: string;
  name: Text;
  /** One surprising, true sentence. */
  fact: Text;
  /** A picture under /public. */
  image: string;
}

/** What a finished lesson opens in Stellar Explore. */
export interface MissionUnlock {
  /** Which world's missions (only the Moon has missions so far). */
  world: 'moon';
  /** A mission id from src/lib/solar-system/moon-missions.ts. */
  mission: string;
}

export interface Lesson {
  /** Stable and unique across all courses: `moon-1`, `moon-2`, … */
  id: string;
  title: Text;
  /** The story card before the questions: two or three short sentences. */
  intro: Text;
  exercises: Exercise[];
  /** The card in this lesson's capsule. Every lesson gives exactly one. */
  card: string;
  unlocks?: MissionUnlock;
}

export interface Unit {
  /** `moon`, `mars`, … */
  id: string;
  title: Text;
  /** One line under the title on the path. */
  tagline: Text;
  /** The unit's accent, a CSS colour. */
  color: string;
  /** A picture for the unit's header, under /public. */
  image: string;
  lessons: Lesson[];
}

export interface Course {
  units: Unit[];
  cards: Card[];
}

/** The ages the app is written for. It changes the size of the text and
 *  how much help a lesson offers, never the facts. */
export type AgeBand = '6-9' | '10-13' | '14-17';

export const AGE_BANDS: readonly AgeBand[] = ['6-9', '10-13', '14-17'];
