// Stellar Academy: the whole course, and lookups into it. Units are added
// here as they are written; the Moon is the first.

import type { Card, Course, Lesson, Unit } from '@/lib/academy/types';
import { MOON_CARDS, MOON_UNIT } from '@/lib/academy/course-moon';

export const COURSE: Course = {
  units: [MOON_UNIT],
  cards: [...MOON_CARDS],
};

/** Every lesson in path order, across all units. */
export const ALL_LESSONS: readonly Lesson[] = COURSE.units.flatMap((u) => u.lessons);

export function lessonById(id: string): Lesson | undefined {
  return ALL_LESSONS.find((l) => l.id === id);
}

export function unitOfLesson(id: string): Unit | undefined {
  return COURSE.units.find((u) => u.lessons.some((l) => l.id === id));
}

export function cardById(id: string): Card | undefined {
  return COURSE.cards.find((c) => c.id === id);
}
