// The mission engine: what counts, what does not, what is remembered, and
// what a crew who played before the engine existed keeps.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMissions, type Mission, type MissionContext } from '@/lib/solar-system/missions';
import { memoryMissionStore, migrate, localMissionStore } from '@/lib/solar-system/mission-store';
import { MISSION_IDS, MOON_MISSIONS } from '@/lib/solar-system/moon-missions';
import type { InteractEvent, InteractionBus } from '@/lib/solar-system/moon-interactions';

const DT = 1 / 60;

function bus(): InteractionBus & { fire: (e: InteractEvent) => void } {
  const listeners: ((e: InteractEvent) => void)[] = [];
  return {
    on(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1); },
    emit(e) { for (const fn of [...listeners]) fn(e); },
    fire(e) { this.emit(e); },
  };
}
const at = (x = 0, z = 0, driving = false): MissionContext => ({ x, z, driving });

/** Do whatever the objective in hand asks for, and step the engine. */
function satisfy(engine: ReturnType<typeof makeMissions>, b: ReturnType<typeof bus>, mission: Mission) {
  const id = engine.telemetry.objective;
  const o = mission.objectives.find((x) => x.id === id);
  if (!o) throw new Error(`no open objective on ${mission.id}`);
  const [zone, state] = o.target.split(':');
  switch (o.type) {
    case 'TRAVEL':
      engine.update(DT, at(o.at!.x, o.at!.z));
      return;
    case 'DRIVE':
      engine.update(DT, at(o.at!.x, o.at!.z, true));
      return;
    case 'COLLECT':
      b.fire({ type: 'item:picked', item: o.target });
      break;
    case 'PHOTOGRAPH':
    case 'OBSERVE':
    case 'DISCOVER':
      b.fire({ type: 'zone:state', zone, state });
      break;
    default:
      b.fire({ type: 'interaction:completed', id: o.target });
  }
  engine.update(DT, at());
}

describe('the engine counts the right things', () => {
  const trial: Mission[] = [{
    id: 'one',
    reward: 'firstSteps',
    objectives: [
      { id: 'tap', type: 'INTERACT', target: 'panel' },
      { id: 'walk', type: 'TRAVEL', target: 'ridge', at: { x: 10, z: 0, r: 3 } },
      { id: 'grab', type: 'COLLECT', target: 'coupling', required: 2 },
    ],
  }];

  it('takes the objectives in order and ignores what is not asked for', () => {
    const b = bus();
    const e = makeMissions({ missions: trial, bus: b, store: memoryMissionStore() });
    expect(e.telemetry.active).toBe('one');
    expect(e.telemetry.objective).toBe('tap');
    // The later objectives cannot be claimed early.
    b.fire({ type: 'item:picked', item: 'coupling' });
    e.update(DT, at(10, 0));
    expect(e.telemetry.objective).toBe('tap');
    b.fire({ type: 'interaction:completed', id: 'panel' });
    expect(e.telemetry.objective).toBe('walk');
  });

  it('counts a repeated objective and finishes the mission on the last one', () => {
    const b = bus();
    const e = makeMissions({ missions: trial, bus: b, store: memoryMissionStore() });
    b.fire({ type: 'interaction:completed', id: 'panel' });
    e.update(DT, at(10, 0));
    expect(e.telemetry.objective).toBe('grab');
    b.fire({ type: 'item:picked', item: 'coupling' });
    expect(e.telemetry.objectives[2].progress).toBe(1);
    b.fire({ type: 'item:picked', item: 'coupling' });
    e.update(DT, at(10, 0));
    expect(e.telemetry.done).toEqual(['one']);
    expect(e.telemetry.rewards).toEqual(['firstSteps']);
    expect(e.telemetry.complete).toBe(true);
  });

  it('gives the range and bearing to where it is sending the crew', () => {
    const b = bus();
    const e = makeMissions({ missions: trial, bus: b, store: memoryMissionStore() });
    b.fire({ type: 'interaction:completed', id: 'panel' });
    e.update(DT, at(0, 0));
    expect(e.telemetry.distance).toBeCloseTo(10, 5);
    expect(e.telemetry.bearing).toBeCloseTo(Math.PI / 2, 5);
  });

  it('says what finished, once', () => {
    const b = bus();
    const e = makeMissions({ missions: trial, bus: b, store: memoryMissionStore() });
    const seen: string[] = [];
    e.onEvent = (kind, id) => seen.push(`${kind}:${id}`);
    b.fire({ type: 'interaction:completed', id: 'panel' });
    e.update(DT, at(10, 0));
    b.fire({ type: 'item:picked', item: 'coupling' });
    b.fire({ type: 'item:picked', item: 'coupling' });
    expect(seen).toEqual(['objective:tap', 'objective:walk', 'objective:grab', 'mission:one']);
  });
});

describe('the five Moon missions', () => {
  it('plays every one of them start to finish, in order', () => {
    const b = bus();
    const e = makeMissions({ missions: MOON_MISSIONS, bus: b, store: memoryMissionStore() });
    const played: string[] = [];
    for (let guard = 0; guard < 60 && e.telemetry.active; guard++) {
      const m = MOON_MISSIONS.find((x) => x.id === e.telemetry.active)!;
      satisfy(e, b, m);
      if (!e.telemetry.active || e.telemetry.active !== m.id) played.push(m.id);
    }
    expect(played).toEqual(MISSION_IDS);
    expect(e.telemetry.complete).toBe(true);
    expect(e.telemetry.rewards).toHaveLength(MOON_MISSIONS.length);
  });

  it('holds a mission behind an outside gate, asked fresh each time', () => {
    const b = bus();
    const open = new Set<string>();
    const e = makeMissions({ missions: MOON_MISSIONS, bus: b, store: memoryMissionStore(), gate: (id) => open.has(id) });
    expect(e.available()).not.toContain('firstSteps');
    expect(e.statusOf('firstSteps')).toBe('locked');
    expect(e.start('firstSteps')).toBeNull();
    open.add('firstSteps');
    expect(e.available()).toContain('firstSteps');
    expect(e.statusOf('firstSteps')).toBe('open');
    expect(e.start('firstSteps')).toBe('firstSteps');
  });

  it('locks a mission until what it needs is done', () => {
    const b = bus();
    const e = makeMissions({ missions: MOON_MISSIONS, bus: b, store: memoryMissionStore() });
    expect(e.statusOf('firstSteps')).toBe('active');
    expect(e.statusOf('power')).toBe('locked');
    expect(e.start('expedition')).toBe('expedition');
    // It can be forced, but it is not on offer.
    expect(e.available()).not.toContain('expedition');
  });

  it('every objective and mission has a name in both languages', async () => {
    type Block = { solarSystem: { moon: { missions: Record<string, Record<string, string>> } } };
    const en = (await import('@/messages/en.json')).default as unknown as Block;
    const ka = (await import('@/messages/ka.json')).default as unknown as Block;
    for (const messages of [en, ka]) {
      const block = messages.solarSystem.moon.missions;
      for (const m of MOON_MISSIONS) {
        expect(block[m.id]?.title, `${m.id}.title`).toBeTruthy();
        expect(block[m.id]?.brief, `${m.id}.brief`).toBeTruthy();
        expect(block[m.id]?.done, `${m.id}.done`).toBeTruthy();
        for (const o of m.objectives) expect(block[m.id]?.[o.id], `${m.id}.${o.id}`).toBeTruthy();
      }
    }
  });
});

describe('what is remembered', () => {
  beforeEach(() => localStorage.clear());

  it('picks up mid-mission where it left off', () => {
    const store = memoryMissionStore();
    const b1 = bus();
    const first = makeMissions({ missions: MOON_MISSIONS, bus: b1, store });
    b1.fire({ type: 'interaction:completed', id: 'suitCheck' });
    first.update(DT, at());
    expect(first.telemetry.objective).toBe('ridge');
    const b2 = bus();
    const second = makeMissions({ missions: MOON_MISSIONS, bus: b2, store });
    expect(second.telemetry.active).toBe('firstSteps');
    expect(second.telemetry.objective).toBe('ridge');
  });

  it('keeps finished missions and their rewards across a reload', () => {
    const store = memoryMissionStore();
    const b = bus();
    const e = makeMissions({ missions: MOON_MISSIONS, bus: b, store });
    const m = MOON_MISSIONS[0];
    for (let i = 0; i < m.objectives.length; i++) satisfy(e, b, m);
    expect(e.telemetry.done).toContain('firstSteps');
    const again = makeMissions({ missions: MOON_MISSIONS, bus: bus(), store });
    expect(again.telemetry.done).toContain('firstSteps');
    expect(again.telemetry.rewards).toContain('firstSteps');
    expect(again.telemetry.active).toBe('power');
  });

  it('hands a side-job crew the missions that replaced their jobs', () => {
    localStorage.setItem('stellar_moon_jobs_v1', JSON.stringify({ done: ['solar', 'comms'] }));
    const s = migrate(MISSION_IDS);
    expect(s.done).toEqual(['firstSteps', 'power', 'comms']);
  });

  it('keeps an old expedition crew past First Steps, with their rewards', () => {
    localStorage.setItem('stellar_moon_expedition_v2', JSON.stringify({ stage: 'contact', rewards: ['ion'] }));
    const s = migrate(MISSION_IDS);
    expect(s.done).toEqual(['firstSteps']);
    expect(s.rewards).toEqual(['ion']);
  });

  it('leaves a brand-new crew with nothing done', () => {
    expect(migrate(MISSION_IDS).done).toEqual([]);
  });

  it('reads back what it wrote, and shrugs off nonsense', () => {
    const store = localMissionStore(MISSION_IDS);
    store.save({ v: 1, active: 'power', done: ['firstSteps'], rewards: ['firstSteps'], progress: [1, 0] });
    expect(store.load()).toEqual({ v: 1, active: 'power', done: ['firstSteps'], rewards: ['firstSteps'], progress: [1, 0] });
    localStorage.setItem('stellar_moon_missions_v1', '{ not json');
    expect(store.load().done).toEqual([]);
  });

  it('plays on when storage refuses to write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const store = localMissionStore(MISSION_IDS);
    expect(() => store.save({ v: 1, active: '', done: [], rewards: [], progress: [] })).not.toThrow();
    spy.mockRestore();
  });
});
