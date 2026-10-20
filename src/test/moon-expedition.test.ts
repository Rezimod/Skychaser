// The expedition, the side jobs, the rover's drive, and the landing — the
// pieces of Moon Mode that have rules rather than pixels.

import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeMission, missionComplete, SURVEY_SITE, SURVEY_AREA, ANOMALY_SITE, SCIENCE_TERMINAL, CORE_DEPTH, DRILL_BAND, type MissionHandle,
} from '@/lib/solar-system/moon-mission';
import { makeJobs, SAMPLE_ROCKS, type JobWorld } from '@/lib/solar-system/moon-jobs';
import { makeInteractions, type Interactions } from '@/lib/solar-system/moon-interactions';
import { makeRover, type RoverParts } from '@/lib/solar-system/moon-rover';
import { makeLander } from '@/lib/solar-system/moon-lander';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import type { TerrainHandle } from '@/lib/solar-system/moon-terrain';
import type { PrintsHandle } from '@/lib/solar-system/moon-prints';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { Anchor, AnchorId } from '@/lib/solar-system/moon-base-zones';

const flat = () => 0;
const stamp = vi.fn();
const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };

beforeEach(() => { localStorage.clear(); });
afterEach(() => { localStorage.clear(); });

const DT = 1 / 30;

/** A crew that can walk to places and use the key, one step at a time. */
function crew(mission: MissionHandle) {
  const io: Interactions = makeInteractions();
  for (const i of mission.interactables) io.add(i);
  let t = 0;
  const at = { x: 0, z: 0, driving: false };
  const step = (press = false, held = false) => {
    io.update(DT, { x: at.x, z: at.z, yaw: 0, driving: at.driving, press, held });
    mission.update(DT, t, { crewX: at.x, crewZ: at.z, driving: at.driving });
    t += DT;
  };
  return {
    io, at,
    stand(x: number, z: number, seconds = 0.1) { at.x = x; at.z = z; for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i++) step(); },
    tap() { step(true, true); step(false, false); },
    hold(seconds: number, pulse?: { on: number; off: number }) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        const tt = i * DT;
        const down = pulse ? (tt % (pulse.on + pulse.off)) < pulse.on : true;
        const wasDown = pulse ? i > 0 && ((tt - DT) % (pulse.on + pulse.off)) < pulse.on : i > 0;
        step(down && !wasDown, down);
      }
      step(false, false);
    },
  };
}

describe('the expedition', () => {
  it('opens at the mission computer, and the briefing gives the bearing', () => {
    const m = makeMission(flat, stamp, dust, true);
    const c = crew(m);
    c.stand(0, 0);
    expect(m.telemetry.stage).toBe('survey');
    expect(m.telemetry.objective).toBe('obj.brief');
    expect(m.telemetry.distance).toBeCloseTo(Math.hypot(SCIENCE_TERMINAL.x, SCIENCE_TERMINAL.z), 0);
    c.stand(SCIENCE_TERMINAL.x, SCIENCE_TERMINAL.z);
    expect(c.io.prompt.label).toBe('terminal');
    c.tap();
    expect(m.telemetry.briefed).toBe(true);
    c.stand(0, 0);
    expect(m.telemetry.objective).toBe('obj.survey');
    expect(m.telemetry.approx).toBe(true);
    // No beacon standing on the target out on the mare.
    expect(m.telemetry.hasMarker).toBe(false);
    m.dispose();
  });

  it('pins the anomaly by scanner, not by standing in the survey area', () => {
    const m = makeMission(flat, stamp, dust, true);
    const c = crew(m);
    c.stand(SCIENCE_TERMINAL.x, SCIENCE_TERMINAL.z); c.tap();
    c.stand(SURVEY_AREA.x, SURVEY_AREA.y, 5);
    expect(m.telemetry.task).toBe('scan');
    expect(m.telemetry.stage).toBe('survey');
    const weak = m.telemetry.signal;
    c.stand(SURVEY_SITE.x + 1, SURVEY_SITE.y, 0.2);
    expect(m.telemetry.signal).toBeGreaterThan(weak);
    expect(m.telemetry.stage).toBe('survey');
    c.stand(SURVEY_SITE.x + 1, SURVEY_SITE.y, 2);
    expect(m.telemetry.stage).toBe('drill');
    m.dispose();
  });

  it('drills only while fed, fastest when the load is kept in the band', () => {
    const run = (strategy: 'pulse' | 'mash') => {
      localStorage.clear();
      const m = makeMission(flat, stamp, dust, true);
      const c = crew(m);
      c.stand(SCIENCE_TERMINAL.x, SCIENCE_TERMINAL.z); c.tap();
      c.stand(SURVEY_SITE.x, SURVEY_SITE.y, 3);
      c.stand(SURVEY_SITE.x + 2.5, SURVEY_SITE.y, 2);
      expect(c.io.prompt.label).toBe('drillStart');
      c.tap();
      expect(m.telemetry.drill.engaged).toBe(true);
      // Engaged but not fed: next to nothing.
      c.stand(SURVEY_SITE.x + 2.5, SURVEY_SITE.y, 3);
      expect(m.telemetry.drill.depth).toBeLessThan(0.3);
      let seconds = 0;
      let peakLoad = 0;
      let stalled = false;
      while (!m.telemetry.drill.ready && seconds < 90) {
        if (strategy === 'pulse') c.hold(1, { on: 0.55, off: 0.35 });
        else c.hold(1);
        seconds += 1;
        peakLoad = Math.max(peakLoad, m.telemetry.drill.load);
        stalled ||= m.telemetry.drill.stalled;
      }
      const result = { seconds, peakLoad, stalled, ready: m.telemetry.drill.ready };
      m.dispose();
      return result;
    };
    const pulse = run('pulse');
    const mash = run('mash');
    expect(pulse.ready).toBe(true);
    expect(pulse.seconds).toBeGreaterThanOrEqual(14);
    expect(pulse.seconds).toBeLessThanOrEqual(26);
    expect(mash.ready).toBe(true);
    expect(mash.stalled).toBe(true);
    expect(mash.seconds).toBeGreaterThan(pulse.seconds);
    expect(DRILL_BAND[0]).toBeLessThan(DRILL_BAND[1]);
  });

  it('will not drill from the saddle', () => {
    const m = makeMission(flat, stamp, dust, true);
    m.advance();
    const c = crew(m);
    c.at.driving = true;
    c.stand(SURVEY_SITE.x + 2.5, SURVEY_SITE.y, 2);
    expect(c.io.prompt.active).toBe(false);
    c.hold(5);
    expect(m.telemetry.drill.depth).toBe(0);
    m.dispose();
  });

  it('clears the hull patch by patch, then asks the crew to open the hatch', () => {
    const m = makeMission(flat, stamp, dust, true);
    m.advance(); m.advance();
    const c = crew(m);
    expect(m.telemetry.stage).toBe('trace');
    expect(m.telemetry.rewards).toContain('core');
    c.stand(ANOMALY_SITE.x - 30, ANOMALY_SITE.y - 30, 1);
    c.stand(ANOMALY_SITE.x, ANOMALY_SITE.y - 12, 0.2);
    expect(m.telemetry.stage).toBe('excavate');
    for (let k = 0; k < 4; k++) {
      // Walk to wherever the telemetry points, and work it.
      c.stand(c.at.x, c.at.z, 0.1);
      const tx = c.at.x + Math.sin(m.telemetry.bearing) * (m.telemetry.distance - 1.2);
      // Bearings are map bearings: north is -z.
      const tz = c.at.z - Math.cos(m.telemetry.bearing) * (m.telemetry.distance - 1.2);
      c.stand(tx, tz, 0.1);
      expect(c.io.prompt.label).toBe('clear');
      c.hold(1);
      expect(m.telemetry.cleared).toBe(k);
      c.hold(2.2);
      expect(m.telemetry.cleared).toBe(k + 1);
    }
    expect(m.telemetry.stage).toBe('contact');
    expect(m.telemetry.rewards).toContain('hull');
    // The seam wakes first; the hatch only answers after it.
    c.stand(m.marker ? m.marker.x : c.at.x, m.marker ? m.marker.z : c.at.z, 0.1);
    const hx = c.at.x + Math.sin(m.telemetry.bearing) * m.telemetry.distance;
    const hz = c.at.z - Math.cos(m.telemetry.bearing) * m.telemetry.distance;
    c.stand(hx, hz, 2);
    expect(m.telemetry.objective).toBe('obj.contactWait');
    c.stand(hx, hz, 5);
    expect(c.io.prompt.label).toBe('openHatch');
    c.tap();
    c.stand(hx, hz, 4);
    expect(m.telemetry.stage).toBe('done');
    expect(m.telemetry.rewards).toEqual(['core', 'hull', 'contact']);
    expect(missionComplete()).toBe(true);
    m.dispose();
  });

  it('keeps what the crew earned across a reload', () => {
    const first = makeMission(flat, stamp, dust, true);
    first.advance(); first.advance();
    first.dispose();
    expect(missionComplete()).toBe(false);
    const second = makeMission(flat, stamp, dust, true);
    expect(second.telemetry.stage).toBe('trace');
    expect(second.telemetry.rewards).toContain('core');
    expect(second.telemetry.briefed).toBe(true);
    second.dispose();
  });

  it('carries progress saved before the new expedition over', () => {
    localStorage.setItem('stellar_moon_expedition_v1', JSON.stringify({ stage: 'done', rewards: ['core', 'hull', 'contact'] }));
    expect(missionComplete()).toBe(true);
    localStorage.clear();
    localStorage.setItem('stellar_moon_expedition_v1', JSON.stringify({ stage: 'excavate', rewards: ['core'] }));
    const m = makeMission(flat, stamp, dust, true);
    expect(m.telemetry.stage).toBe('excavate');
    expect(m.telemetry.briefed).toBe(true);
    expect(m.telemetry.cleared).toBe(0);
    m.dispose();
  });

  it('starts from the beginning when the stored progress is nonsense', () => {
    localStorage.setItem('stellar_moon_expedition_v1', '{"stage":"eaten by a grue","rewards":"none"}');
    const m = makeMission(flat, stamp, dust, true);
    expect(m.telemetry.stage).toBe('survey');
    expect(m.telemetry.rewards).toEqual([]);
    m.dispose();
  });

  it('keeps the drill time inside a sensible expedition', () => {
    expect(CORE_DEPTH).toBeGreaterThan(4);
  });
});

describe('side jobs', () => {
  const anchor = (x: number, z: number): Anchor => ({ x, z, y: 0, yaw: 0 });
  const world = (over: Partial<JobWorld> = {}) => {
    const anchors = {
      scienceTerminal: anchor(-33, 7), sampleStore: anchor(-29, 9), workbench: anchor(-31, 6),
      powerCabinet: anchor(33, -9), faultyArray: anchor(35, -12), isruPanel: anchor(-38, -12),
      commsControl: anchor(24, -34), charger: anchor(20, 9), serviceBay: anchor(22, 10),
    } as Record<AnchorId, Anchor>;
    const w: JobWorld = {
      anchors, heightAt: flat, arrayFault: { yaw: 0 }, dishFault: { yaw: 0, pitch: 0 },
      setStatus: vi.fn(), rover: () => ({ x: 60, z: 60, yaw: 0 }), setRoverFault: vi.fn(), briefed: () => true,
      ...over,
    };
    return w;
  };
  const drive = (jobs: ReturnType<typeof makeJobs>) => {
    const io = makeInteractions();
    for (const i of jobs.interactables) io.add(i);
    const at = { x: 0, z: 0 };
    const step = (press = false, held = false) => {
      io.update(DT, { x: at.x, z: at.z, yaw: 0, driving: false, press, held });
      jobs.update(DT, { crewX: at.x, crewZ: at.z, driving: false });
    };
    return {
      io, at,
      go(x: number, z: number) { at.x = x; at.z = z; step(); step(); },
      tap() { step(true, true); step(); },
      hold(seconds: number) { for (let i = 0; i < Math.round(seconds / DT); i++) step(i === 0, true); },
      release() { step(false, false); step(); },
    };
  };

  it('are handed out at the mission computer once the crew is briefed', () => {
    const w = world({ briefed: () => false });
    const jobs = makeJobs(w);
    const d = drive(jobs);
    d.go(-33, 7);
    expect(d.io.prompt.active).toBe(false);
    const w2 = world();
    const jobs2 = makeJobs(w2);
    const d2 = drive(jobs2);
    d2.go(-33, 7);
    expect(d2.io.prompt.label).toBe('jobBoard');
    d2.tap();
    expect(jobs2.telemetry.active).toBe('solar');
  });

  it('fixes the array by hand: breaker, reset, then let go on the peak', () => {
    const w = world();
    const jobs = makeJobs(w);
    const d = drive(jobs);
    jobs.start('solar');
    expect(w.arrayFault.yaw).toBeGreaterThan(0.3);
    d.go(33, -9);
    d.tap();
    d.hold(2.2); d.release();
    d.go(35, -12);
    expect(d.io.prompt.label).toBe('alignArray');
    // Hold until the meter peaks, then let go.
    let guard = 0;
    d.hold(DT);
    while (Math.abs(w.arrayFault.yaw) > 0.03 && guard++ < 400) d.hold(DT * 2);
    d.release();
    expect(jobs.telemetry.active).toBe('');
    expect(jobs.telemetry.done).toContain('solar');
    expect(w.arrayFault.yaw).toBe(0);
  });

  it('collects both samples in either order before they can be returned', () => {
    const w = world();
    const jobs = makeJobs(w);
    const d = drive(jobs);
    jobs.start('samples');
    d.go(SAMPLE_ROCKS[1].x, SAMPLE_ROCKS[1].z);
    d.tap();
    expect(jobs.telemetry.objective).toBe('samples.collect');
    d.go(SAMPLE_ROCKS[0].x, SAMPLE_ROCKS[0].z);
    d.tap();
    expect(jobs.telemetry.objective).toBe('samples.return');
    d.go(-29, 9);
    d.tap();
    expect(jobs.telemetry.done).toContain('samples');
  });

  it('needs the rover itself brought to the bay for a service', () => {
    const roverAt = { x: 60, z: 60, yaw: 0 };
    const w = world({ rover: () => roverAt });
    const jobs = makeJobs(w);
    const d = drive(jobs);
    jobs.start('rover');
    expect(w.setRoverFault).toHaveBeenCalledWith(true);
    d.go(22, 10);
    expect(jobs.telemetry.objective).toBe('rover.bring');
    roverAt.x = 22; roverAt.z = 11;
    d.go(22, 10);
    expect(jobs.telemetry.objective).toBe('rover.wheel');
    d.go(22 - 1.9, 11 - 1.55);
    d.hold(3.2); d.release();
    expect(w.setRoverFault).toHaveBeenLastCalledWith(false);
  });
});

/** The rover needs a set of parts to articulate; none of them matter here. */
function roverParts(): RoverParts {
  const obj = () => new THREE.Object3D();
  return {
    spin: [obj(), obj(), obj(), obj()],
    steer: [obj(), obj(), obj(), obj()],
    arms: [obj(), obj(), obj(), obj()],
    wheelXZ: [[-0.8, 1.12], [-0.8, -1.12], [0.8, 1.12], [0.8, -1.12]],
    mast: obj(),
    seat: obj(),
    headlight: new THREE.SpotLight(),
    arm: [obj(), obj()],
    brakeLight: new THREE.MeshStandardMaterial(),
    ionMat: new THREE.MeshStandardMaterial(),
  };
}
const terrain = {
  heightAt: () => 0,
  normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
} as unknown as TerrainHandle;
const prints = { track: vi.fn(), stamp: vi.fn() } as unknown as PrintsHandle;

function driveFor(gears?: string[]) {
  const group = new THREE.Group();
  const collider: Collider = { x: 0, z: 0, r: 2.8 };
  const rover = makeRover(group, collider, roverParts(), terrain, dust, prints, gears as never);
  return { rover, collider, run: (s: number, throttle: number, steer = 0) => {
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(s / dt); i++) rover.update(dt, throttle, steer, [collider], 400);
  } };
}

describe('the rover', () => {
  it('holds each gear to its own top speed', () => {
    const tops: number[] = [];
    for (const gear of ['creep', 'cruise', 'sprint'] as const) {
      const d = driveFor();
      d.rover.driving = true;
      d.rover.select(['creep', 'cruise', 'sprint'].indexOf(gear));
      d.run(6, 1);
      tops.push(d.rover.speed);
    }
    expect(tops[0]).toBeGreaterThan(2.5);
    expect(tops[0]).toBeLessThan(3.2);
    expect(tops[1]).toBeGreaterThan(7.5);
    expect(tops[1]).toBeLessThan(8.2);
    expect(tops[2]).toBeGreaterThan(14);
    expect(tops[2]).toBeLessThan(15.2);
  });

  it('answers the throttle at once from a standstill', () => {
    const d = driveFor();
    d.rover.driving = true;
    d.rover.select(1);
    d.run(0.25, 1);
    expect(d.rover.speed).toBeGreaterThan(1.1);
  });

  it('turns on the spot in creep, and not at all standing in cruise', () => {
    const creep = driveFor();
    creep.rover.driving = true;
    creep.rover.select(0);
    creep.run(1, 0, 1);
    expect(Math.abs(creep.rover.yaw)).toBeGreaterThan(0.5);
    expect(Math.hypot(creep.collider.x, creep.collider.z)).toBeLessThan(0.05);
    const cruise = driveFor();
    cruise.rover.driving = true;
    cruise.rover.select(1);
    cruise.run(1, 0, 1);
    expect(Math.abs(cruise.rover.yaw)).toBeLessThan(0.05);
  });

  it('slides wide on a hard turn at sprint, and grips again once straight', () => {
    const d = driveFor();
    d.rover.driving = true;
    d.rover.select(2);
    d.run(5, 1);
    d.run(1.2, 1, 1);
    const sliding = d.rover.slip;
    d.run(2.5, 1, 0);
    expect(sliding).toBeGreaterThan(1);
    expect(d.rover.slip).toBeLessThan(0.2);
  });

  it('will not shift past the gears this crew has, until one is earned', () => {
    const d = driveFor();
    expect(d.rover.gears).toHaveLength(3);
    d.rover.shift(1); d.rover.shift(1); d.rover.shift(1);
    expect(d.rover.gear).toBe('sprint');
    d.rover.shift(-9);
    expect(d.rover.gear).toBe('creep');
    d.rover.unlock('ion');
    d.rover.select(3);
    expect(d.rover.gear).toBe('ion');
  });

  it('gives the fourth gear its own, much higher top', () => {
    const d = driveFor(['creep', 'cruise', 'sprint', 'ion']);
    d.rover.driving = true;
    d.rover.select(3);
    d.run(6, 1);
    expect(d.rover.speed).toBeGreaterThan(24);
  });

  it('lets the back go on the handbrake, and bites again without it', () => {
    const d = driveFor();
    d.rover.driving = true;
    d.rover.select(1);
    d.run(4, 1);
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) d.rover.update(dt, 0, 1, [d.collider], 400, true);
    const sliding = d.rover.slip;
    expect(sliding).toBeGreaterThan(0.8);
    d.run(2, 0.5, 0);
    expect(d.rover.slip).toBeLessThan(0.3);
  });

  it('leaves the ground over a drop and comes down again', () => {
    const cliff = { heightAt: (_x: number, z: number) => (z > 20 ? -3 : 0), normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0) } as unknown as TerrainHandle;
    const group = new THREE.Group();
    const collider: Collider = { x: 0, z: 0, r: 2.8 };
    const rover = makeRover(group, collider, roverParts(), cliff, dust, prints);
    rover.driving = true;
    rover.select(2);
    const dt = 1 / 60;
    let flew = false; let landed = false;
    for (let i = 0; i < 60 * 12; i++) {
      rover.update(dt, 1, 0, [collider], 400);
      if (rover.airborne) flew = true;
      if (flew && !rover.airborne) landed = true;
    }
    expect(flew).toBe(true);
    expect(landed).toBe(true);
    expect(rover.position.y).toBeCloseTo(-3, 1);
  });

  it('coasts to a stop when nobody is driving it', () => {
    const d = driveFor();
    d.rover.driving = true;
    d.run(6, 1);
    expect(d.rover.speed).toBeGreaterThan(5);
    d.rover.driving = false;
    d.run(6, 0);
    expect(Math.abs(d.rover.speed)).toBeLessThan(0.1);
  });
});

describe('the landing', () => {
  const fly = (throttle: () => number, seconds = 60) => {
    const lander = makeLander(0, 0, flat, dust, true);
    const dt = 1 / 60;
    for (let i = 0; i < Math.round(seconds / dt) && !lander.telemetry.landed; i++) {
      lander.update(dt, { throttle: throttle(), moveX: 0, moveY: 0 }, flat);
    }
    return lander;
  };

  it('never lets a pilot who does nothing at all crash', () => {
    const l = fly(() => 0);
    expect(l.telemetry.landed).toBe(true);
    expect(l.telemetry.assist).toBe(true);
    expect(l.telemetry.touchdown).toBeLessThan(2.5);
    l.dispose();
  });

  it('lets a pilot who flies it down keep the stick all the way', () => {
    const l = makeLander(0, 0, flat, dust, true);
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 90 && !l.telemetry.landed; i++) {
      const tel = l.telemetry;
      const want = Math.max(0.45, Math.sqrt(2 * (3.9 - 1.62) * Math.max(0, tel.altitude - 1.2)) * 0.68);
      l.update(dt, {
        throttle: tel.descent > want ? 1 : 0.2,
        moveX: Math.max(-1, Math.min(1, -l.position.x * 0.1 - tel.driftX * 0.9)),
        moveY: Math.max(-1, Math.min(1, l.position.z * 0.1 + tel.driftZ * 0.9)),
      }, flat);
    }
    expect(l.telemetry.landed).toBe(true);
    expect(l.telemetry.assist).toBe(false);
    expect(l.telemetry.touchdown).toBeLessThan(1);
    expect(l.telemetry.offset).toBeLessThan(32);
    l.dispose();
  });

  it('burns fuel only when the engine is lit', () => {
    const l = makeLander(0, 0, flat, dust, true);
    const dt = 1 / 60;
    for (let i = 0; i < 120; i++) l.update(dt, { throttle: 0, moveX: 0, moveY: 0 }, flat);
    expect(l.telemetry.fuel).toBe(1);
    for (let i = 0; i < 120; i++) l.update(dt, { throttle: 1, moveX: 0, moveY: 0 }, flat);
    expect(l.telemetry.fuel).toBeLessThan(1);
    l.dispose();
  });

  it('puts the crew out beside the vehicle it actually came down on', () => {
    const l = fly(() => 0);
    expect(Math.hypot(l.telemetry.egressX - l.position.x, l.telemetry.egressZ - l.position.z)).toBeCloseTo(6.5, 1);
    l.dispose();
  });
});
