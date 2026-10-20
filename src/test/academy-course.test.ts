// Stellar Academy content checks: the shape rules from types.ts that the
// type checker cannot see, the links between lessons, cards and the game's
// Moon missions, and a guard against English leaking into the Georgian.

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { ALL_LESSONS, COURSE, cardById, lessonById, unitOfLesson } from '@/lib/academy/course';
import { MOON_UNIT } from '@/lib/academy/course-moon';
import type { ExerciseKind, Text } from '@/lib/academy/types';
import { MISSION_IDS } from '@/lib/solar-system/moon-missions';

const KINDS: ExerciseKind[] = ['choice', 'truefalse', 'order', 'match'];
const ALLOWED_LATIN = ['Apollo', 'NASA', 'Stellar'];
const GEORGIAN = /[ა-ჿ]/;

/** Every Text anywhere in the course, with a path for error messages. */
function allTexts(): { where: string; text: Text }[] {
  const out: { where: string; text: Text }[] = [];
  const walk = (v: unknown, where: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('ka' in o && 'en' in o) out.push({ where, text: o as unknown as Text });
      else for (const [k, x] of Object.entries(o)) walk(x, `${where}.${k}`);
    }
  };
  walk(COURSE, 'course');
  return out;
}

function allImages(): string[] {
  const imgs: string[] = [];
  for (const u of COURSE.units) {
    imgs.push(u.image);
    for (const l of u.lessons) for (const e of l.exercises) if (e.image) imgs.push(e.image);
  }
  for (const c of COURSE.cards) imgs.push(c.image);
  return imgs;
}

const distinct = (xs: string[]) => new Set(xs).size === xs.length;

describe('academy course: lessons', () => {
  it('has unique lesson ids of the form moon-1..moon-5', () => {
    const ids = ALL_LESSONS.map((l) => l.id);
    expect(ids).toEqual(['moon-1', 'moon-2', 'moon-3', 'moon-4', 'moon-5']);
    expect(distinct(ids)).toBe(true);
    for (const id of ids) expect(id).toMatch(/^moon-[1-5]$/);
  });

  it.each(ALL_LESSONS.map((l) => [l.id, l] as const))('%s has 7–8 exercises with every kind, unique ids', (_id, lesson) => {
    expect(lesson.exercises.length).toBeGreaterThanOrEqual(7);
    expect(lesson.exercises.length).toBeLessThanOrEqual(8);
    const kinds = new Set(lesson.exercises.map((e) => e.kind));
    for (const k of KINDS) expect(kinds.has(k), `${lesson.id} lacks a ${k}`).toBe(true);
    expect(distinct(lesson.exercises.map((e) => e.id))).toBe(true);
  });

  it('checks each exercise kind against its own rules', () => {
    for (const lesson of ALL_LESSONS) {
      for (const e of lesson.exercises) {
        const at = `${lesson.id}/${e.id}`;
        if (e.kind === 'choice') {
          expect(e.options.length, at).toBeGreaterThanOrEqual(2);
          expect(e.options.length, at).toBeLessThanOrEqual(4);
          expect(Number.isInteger(e.answer), at).toBe(true);
          expect(e.answer, at).toBeGreaterThanOrEqual(0);
          expect(e.answer, at).toBeLessThan(e.options.length);
          expect(distinct(e.options.map((o) => o.en)), at).toBe(true);
          expect(distinct(e.options.map((o) => o.ka)), at).toBe(true);
        } else if (e.kind === 'truefalse') {
          expect(typeof e.answer, at).toBe('boolean');
        } else if (e.kind === 'order') {
          expect(e.items.length, at).toBeGreaterThanOrEqual(3);
          expect(e.items.length, at).toBeLessThanOrEqual(5);
          expect(distinct(e.items.map((i) => i.en)), at).toBe(true);
          expect(distinct(e.items.map((i) => i.ka)), at).toBe(true);
        } else if (e.kind === 'match') {
          expect(e.pairs.length, at).toBeGreaterThanOrEqual(3);
          expect(e.pairs.length, at).toBeLessThanOrEqual(4);
          for (const side of ['left', 'right'] as const) {
            expect(distinct(e.pairs.map((p) => p[side].en)), `${at} ${side} en`).toBe(true);
            expect(distinct(e.pairs.map((p) => p[side].ka)), `${at} ${side} ka`).toBe(true);
          }
        }
      }
    }
  });
});

describe('academy course: cards', () => {
  it('every lesson card exists and every card is given by exactly one lesson', () => {
    const cardIds = COURSE.cards.map((c) => c.id);
    expect(distinct(cardIds)).toBe(true);
    const used = ALL_LESSONS.map((l) => l.card);
    for (const id of used) expect(cardById(id), id).toBeDefined();
    expect([...used].sort()).toEqual([...cardIds].sort());
  });
});

describe('academy course: missions', () => {
  it('unlocks the Moon missions in the order the game opens them', () => {
    expect(ALL_LESSONS.map((l) => l.unlocks)).toEqual([
      { world: 'moon', mission: 'firstSteps' },
      { world: 'moon', mission: 'power' },
      { world: 'moon', mission: 'telescope' },
      { world: 'moon', mission: 'comms' },
      { world: 'moon', mission: 'expedition' },
    ]);
    for (const l of ALL_LESSONS) expect(MISSION_IDS).toContain(l.unlocks!.mission);
  });
});

describe('academy course: text', () => {
  const texts = allTexts();

  it('finds the texts it is checking', () => {
    expect(texts.length).toBeGreaterThan(200);
  });

  it('every text has both languages', () => {
    for (const { where, text } of texts) {
      expect(text.ka.trim(), where).not.toBe('');
      expect(text.en.trim(), where).not.toBe('');
    }
  });

  it('Georgian is Georgian: Georgian letters, no Latin words but proper names', () => {
    for (const { where, text } of texts) {
      expect(GEORGIAN.test(text.ka), `${where}: ${text.ka}`).toBe(true);
      let rest = text.ka;
      for (const name of ALLOWED_LATIN) rest = rest.split(name).join('');
      expect(rest, `${where}: ${text.ka}`).not.toMatch(/[A-Za-z]{3,}/);
    }
  });
});

describe('academy course: images', () => {
  it('every image exists under /public', () => {
    for (const img of allImages()) {
      expect(img.startsWith('/'), img).toBe(true);
      expect(fs.existsSync(path.join(process.cwd(), 'public', img)), img).toBe(true);
    }
  });
});

describe('academy course: lookups', () => {
  it('finds lessons, units and cards by id', () => {
    expect(lessonById('moon-3')?.unlocks?.mission).toBe('telescope');
    expect(lessonById('mars-1')).toBeUndefined();
    expect(unitOfLesson('moon-5')).toBe(MOON_UNIT);
    expect(unitOfLesson('nope')).toBeUndefined();
    expect(cardById('card-maria')?.id).toBe('card-maria');
    expect(cardById('nope')).toBeUndefined();
  });
});
