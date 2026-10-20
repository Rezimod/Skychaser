// Stellar Academy: what a child has done, kept on the device.
//
// One versioned key. Nothing here leaves the device: no account, no name
// sent anywhere, no analytics. A parent account and syncing between devices
// are the next phase (docs/academy-plan.md); this shape is what they will
// sync. Every reader tolerates a damaged or foreign value and starts clean.

import type { AgeBand } from '@/lib/academy/types';
import { AGE_BANDS } from '@/lib/academy/types';

export const ACADEMY_KEY = 'stellar_academy_v1';

/** The avatars a child can pick: no photos, no real faces. */
export const AVATARS = ['astronaut', 'rocket', 'moon', 'saturn', 'comet', 'robot'] as const;
export type Avatar = (typeof AVATARS)[number];

export interface AcademyProfile {
  /** A first name or a nickname, never checked against anything. */
  name: string;
  avatar: Avatar;
  age: AgeBand;
  /** ISO date the profile was made on this device. */
  createdAt: string;
}

export interface LessonRecord {
  done: boolean;
  /** Best share of exercises right first time, 0–1. */
  best: number;
  /** How many times it has been finished. */
  runs: number;
  /** ISO time of the last finish. */
  at: string;
}

export interface AcademyState {
  v: 1;
  profile: AcademyProfile | null;
  /** Children's mode: the game's Moon missions wait for their lessons, and
   *  anything that leaves the app is behind the parent check. */
  kidsMode: boolean;
  lessons: Record<string, LessonRecord>;
  xp: number;
  /** XP earned per local day, `YYYY-MM-DD` → XP, the last few weeks only. */
  days: Record<string, number>;
  streak: { count: number; last: string };
  /** XP a day that counts as the day's goal met. */
  dailyGoal: number;
  /** Cards collected, in the order they were opened. */
  cards: string[];
  /** Lessons whose capsule has been earned but not opened yet. */
  capsules: string[];
  sound: boolean;
}

export const DAILY_GOALS = [10, 20, 30] as const;
const DAYS_KEPT = 60;

export function freshAcademy(): AcademyState {
  return {
    v: 1, profile: null, kidsMode: false, lessons: {}, xp: 0, days: {},
    streak: { count: 0, last: '' }, dailyGoal: 20, cards: [], capsules: [], sound: true,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown, max = 200): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, max) : []);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A stored value, made safe: anything unexpected falls back to a clean field. */
export function parseAcademy(raw: string | null): AcademyState {
  const base = freshAcademy();
  if (!raw) return base;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return base; }
  if (!isObj(v) || v.v !== 1) return base;
  let profile: AcademyProfile | null = null;
  if (isObj(v.profile) && typeof v.profile.name === 'string') {
    const p = v.profile;
    profile = {
      name: (p.name as string).trim().slice(0, 24),
      avatar: (AVATARS as readonly string[]).includes(p.avatar as string) ? (p.avatar as Avatar) : 'astronaut',
      age: (AGE_BANDS as readonly string[]).includes(p.age as string) ? (p.age as AgeBand) : '10-13',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : '',
    };
    if (!profile.name) profile = null;
  }
  const lessons: Record<string, LessonRecord> = {};
  if (isObj(v.lessons)) {
    for (const [id, r] of Object.entries(v.lessons)) {
      if (!isObj(r) || typeof id !== 'string' || id.length > 40) continue;
      lessons[id] = {
        done: r.done === true,
        best: num(r.best, 0, 1, 0),
        runs: Math.round(num(r.runs, 0, 1e5, 0)),
        at: typeof r.at === 'string' ? r.at : '',
      };
    }
  }
  const days: Record<string, number> = {};
  if (isObj(v.days)) {
    for (const [d, x] of Object.entries(v.days)) if (DAY.test(d)) days[d] = Math.round(num(x, 0, 1e5, 0));
  }
  const streak = isObj(v.streak) ? v.streak : {};
  return {
    v: 1,
    profile,
    kidsMode: v.kidsMode === true,
    lessons,
    xp: Math.round(num(v.xp, 0, 1e8, 0)),
    days,
    streak: { count: Math.round(num(streak.count, 0, 1e5, 0)), last: typeof streak.last === 'string' && DAY.test(streak.last) ? streak.last : '' },
    dailyGoal: (DAILY_GOALS as readonly number[]).includes(v.dailyGoal as number) ? (v.dailyGoal as number) : 20,
    cards: [...new Set(strings(v.cards))],
    capsules: [...new Set(strings(v.capsules))],
    sound: v.sound !== false,
  };
}

// ── Reading and writing ──

let cachedRaw: string | null | undefined;
let cached: AcademyState = freshAcademy();

/** The device's state. Cheap to call often: the game's mission gate asks on
 *  every check, so the parse is skipped while the stored text is unchanged. */
export function readAcademy(): AcademyState {
  let raw: string | null = null;
  try { raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(ACADEMY_KEY); } catch { raw = null; }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseAcademy(raw);
  }
  return cached;
}

/** Keep a state. A window that refuses storage still plays: the progress
 *  lives for the session and is simply not there next time. */
export function writeAcademy(s: AcademyState): void {
  const raw = JSON.stringify(s);
  cachedRaw = raw;
  cached = s;
  try { localStorage.setItem(ACADEMY_KEY, raw); } catch { /* private window */ }
}

// ── Local days, for streaks and the daily goal ──

/** `YYYY-MM-DD` in the device's own time zone: a streak is the child's days, not UTC's. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The day before a `YYYY-MM-DD`, by the calendar. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

/** The streak as it stands today: one broken by a missed day reads 0 until
 *  the next lesson starts it again. */
export function currentStreak(s: AcademyState, today: string = localDay()): number {
  if (!s.streak.last) return 0;
  if (s.streak.last === today || s.streak.last === previousDay(today)) return s.streak.count;
  return 0;
}

/** XP earned today. */
export function xpToday(s: AcademyState, today: string = localDay()): number {
  return s.days[today] ?? 0;
}

export function pruneDays(days: Record<string, number>, today: string): Record<string, number> {
  const keep = Object.keys(days).sort().slice(-DAYS_KEPT);
  const out: Record<string, number> = {};
  for (const d of keep) if (d <= today) out[d] = days[d];
  return out;
}
