// Through the airlock and back: the sequence asks for the right walks and
// door actions in the right order, waits for the door it was given, and
// only then lets pressure — and the suit — change.

import { describe, expect, it } from 'vitest';
import { makeAirlockRun, EQUALISE_SECONDS, type AirlockEvent } from '@/lib/solar-system/moon-airlock';
import type { Doorway } from '@/lib/solar-system/moon-base';
import { poseAt, type TrackPose } from '@/lib/solar-system/suit-scripted';
import { boardTrack, doorSide, doorSpot, seatSpot, bailVelocity } from '@/lib/solar-system/moon-rover-seat';

const door: Doorway = {
  outside: { x: 0, y: 1.7, z: 7.7 }, chamber: { x: 0, y: 1.95, z: 5.4 }, inside: { x: 0, y: 1.95, z: 2.8 }, yawIn: Math.PI,
};
const DT = 1 / 60;

/** Drive a run against a door that opens and shuts in its own time; tracks take their duration. */
function play(dir: 'enter' | 'exit') {
  const run = makeAirlockRun(door, dir);
  const events: AirlockEvent['kind'][] = [];
  let open = 0; let cycling = false; let cycleT = 0; let want = 0;
  let trackLeft = 0;
  const from = dir === 'enter' ? { x: 1, y: 1.6, z: 9, yaw: 0 } : { x: 0, y: 1.95, z: 0, yaw: Math.PI };
  const pose: TrackPose = { x: 0, y: 0, z: 0, yaw: 0, k: 0, leg: 0, legK: 0 };
  let t = 0; let pressurisedAt = -1; let doneAt = -1;
  for (let i = 0; i < 60 * 40 && doneAt < 0; i++) {
    if (cycling) { cycleT += DT; if (cycleT >= 1.4) { cycling = false; want = 1; } }
    open += (want - open) * (1 - Math.exp(-DT * 3.2));
    trackLeft = Math.max(0, trackLeft - DT);
    const ev = run.update(DT, { doorOpen: open, cycling, tracking: trackLeft > 0, from });
    if (ev) {
      events.push(ev.kind);
      if (ev.kind === 'track') { trackLeft = ev.track.duration; poseAt(ev.track, ev.track.duration, pose); from.x = pose.x; from.y = pose.y; from.z = pose.z; from.yaw = pose.yaw; }
      if (ev.kind === 'open') { cycling = true; cycleT = 0; }
      if (ev.kind === 'close') want = 0;
      if (ev.kind === 'pressurised' || ev.kind === 'depressurised') pressurisedAt = t;
      if (ev.kind === 'done') doneAt = t;
    }
    t += DT;
  }
  return { events, from, pressurisedAt, doneAt };
}

describe('the airlock sequence', () => {
  it('going in: walk to the mark, open, through, seal, wait for pressure, then on inside', () => {
    const r = play('enter');
    expect(r.events).toEqual(['track', 'open', 'track', 'close', 'pressurised', 'track', 'done']);
    expect(r.from.x).toBeCloseTo(door.inside.x, 3);
    expect(r.from.z).toBeCloseTo(door.inside.z, 3);
    expect(r.from.yaw).toBeCloseTo(door.yawIn, 3);
    expect(r.pressurisedAt).toBeGreaterThan(EQUALISE_SECONDS);
    expect(r.doneAt).toBeGreaterThan(r.pressurisedAt);
  });

  it('coming out: into the chamber, pressure out, open, out to the mark', () => {
    const r = play('exit');
    expect(r.events).toEqual(['track', 'depressurised', 'open', 'track', 'done']);
    expect(r.from.z).toBeCloseTo(door.outside.z, 3);
    expect(r.doneAt - r.pressurisedAt).toBeGreaterThan(EQUALISE_SECONDS + 1.4);
  });

  it('does not walk through a door that has not opened', () => {
    const run = makeAirlockRun(door, 'enter');
    const from = { x: 0, y: 1.7, z: 7.7, yaw: Math.PI };
    expect(run.update(DT, { doorOpen: 0, cycling: false, tracking: false, from })?.kind).toBe('track');
    expect(run.update(DT, { doorOpen: 0, cycling: false, tracking: false, from })?.kind).toBe('open');
    for (let i = 0; i < 100; i++) expect(run.update(DT, { doorOpen: 0.5, cycling: true, tracking: false, from })).toBeNull();
    expect(run.update(DT, { doorOpen: 0.9, cycling: false, tracking: false, from })?.kind).toBe('track');
  });
});

describe('the rover seat', () => {
  const rover = { x: 10, y: 0, z: 5, yaw: 0.3 };
  const clear = () => true;

  it('picks the nearer side, unless something is in the way there', () => {
    const left = doorSpot(rover, -1, 0); const right = doorSpot(rover, 1, 0);
    expect(doorSide(rover, left.x + 0.5, left.z, clear)).toBe(-1);
    expect(doorSide(rover, right.x + 0.5, right.z, clear)).toBe(1);
    const blockedRight = (x: number, z: number) => Math.hypot(x - right.x, z - right.z) > 0.5;
    expect(doorSide(rover, right.x + 0.5, right.z, blockedRight)).toBe(-1);
  });

  it('climbs from the door spot to the seat and back down without a jump in position', () => {
    for (const kind of ['enterVehicle', 'exitVehicle'] as const) {
      const track = boardTrack(kind, rover, -1, 0, true);
      const pose: TrackPose = { x: 0, y: 0, z: 0, yaw: 0, k: 0, leg: 0, legK: 0 };
      let last = poseAt(track, 0, { ...pose });
      let worst = 0;
      for (let t = 0; t <= track.duration; t += 1 / 120) {
        const p = poseAt(track, t, pose);
        worst = Math.max(worst, Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z));
        last = { ...p };
      }
      expect(worst).toBeLessThan(0.08);
      const end = poseAt(track, track.duration, pose);
      const target = kind === 'enterVehicle' ? seatSpot(rover) : doorSpot(rover, -1, 0);
      expect(end.x).toBeCloseTo(target.x, 3);
      expect(end.z).toBeCloseTo(target.z, 3);
      expect(end.y).toBeCloseTo(target.y, 3);
    }
  });

  it("bails sideways with the rover's speed kept, higher and further in low g", () => {
    const low = bailVelocity(rover, -1, 6, true);
    const heavy = bailVelocity(rover, -1, 6, false);
    const along = (v: { vx: number; vz: number }) => v.vx * Math.sin(rover.yaw) + v.vz * Math.cos(rover.yaw);
    expect(along(low)).toBeCloseTo(6, 3);
    expect(low.vy).toBeGreaterThan(heavy.vy);
    expect(Math.hypot(low.vx, low.vz)).toBeGreaterThan(Math.hypot(heavy.vx, heavy.vz));
  });
});
