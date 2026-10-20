// Where Stellar Academy meets Stellar Explore: in children's mode a Moon
// mission opens only once the lesson that teaches it is finished. This file
// is small on purpose: the game imports it, and it must not pull the course
// content (or React) into the game's chunk.

import { readAcademy } from '@/lib/academy/store';

/** Each Moon mission and the lesson that opens it, in the order the game
 *  offers them. `src/test/academy-engine.test.ts` and `academy-course.test.ts` keep this in step with the
 *  course and with the game's own mission list. */
export const MISSION_LESSONS: Readonly<Record<string, string>> = Object.freeze({
  firstSteps: 'moon-1',
  power: 'moon-2',
  telescope: 'moon-3',
  comms: 'moon-4',
  expedition: 'moon-5',
});

/** The lesson a mission waits for, or null when it waits for none. */
export function lessonForMission(missionId: string): string | null {
  return Object.prototype.hasOwnProperty.call(MISSION_LESSONS, missionId) ? MISSION_LESSONS[missionId] : null;
}

/** The game's mission gate. Read fresh on every call: a lesson finished in
 *  the Academy (another tab, or before the scene was built) opens the
 *  mission at once. Outside children's mode every mission is open. */
export function academyMissionGate(read: typeof readAcademy = readAcademy): (missionId: string) => boolean {
  return (missionId) => {
    const s = read();
    if (!s.kidsMode) return true;
    const lesson = lessonForMission(missionId);
    return !lesson || !!s.lessons[lesson]?.done;
  };
}
