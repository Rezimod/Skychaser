// The one key: which thing it picks, what a hold takes, what a missing part
// stops, and what the bus says happened.

import { describe, expect, it, vi } from 'vitest';
import { makeInteractions, type Interactable, type InteractEvent } from '@/lib/solar-system/moon-interactions';

const DT = 1 / 60;

function tap(id: string, x: number, z: number, over: Partial<Interactable> = {}): Interactable {
  return {
    id,
    where: () => ({ x, z, r: 2 }),
    kind: () => 'tap',
    label: () => id,
    use: vi.fn(),
    ...over,
  };
}

/** A hold that takes `seconds` of held key to finish. */
function hold(id: string, x: number, z: number, seconds: number, over: Partial<Interactable> = {}): Interactable {
  const state = { t: 0 };
  return {
    id,
    where: () => ({ x, z, r: 2 }),
    kind: () => 'hold',
    label: () => id,
    use: (dt: number) => { state.t = Math.min(seconds, state.t + dt); },
    progress: () => state.t / seconds,
    ...over,
  };
}

const at = (x: number, z: number, yaw = 0, over = {}) => ({ x, z, yaw, driving: false, press: false, held: false, ...over });

describe('interaction resolver', () => {
  it('picks the nearer of two in reach', () => {
    const io = makeInteractions();
    io.add(tap('far', 0, 1.8));
    io.add(tap('near', 0, 0.6));
    io.update(DT, at(0, 0));
    expect(io.prompt.id).toBe('near');
  });

  it('lets priority beat distance', () => {
    const io = makeInteractions();
    io.add(tap('near', 0, 0.6));
    io.add(tap('important', 0, 1.8, { priority: 1 }));
    io.update(DT, at(0, 0));
    expect(io.prompt.id).toBe('important');
  });

  it('keeps the one it is showing rather than flickering', () => {
    const io = makeInteractions();
    io.add(tap('a', 0, 1.0));
    io.add(tap('b', 0, 1.1));
    io.update(DT, at(0, 0));
    const first = io.prompt.id;
    // Step to where the other is marginally nearer: the prompt holds.
    io.update(DT, at(0, 0.1));
    expect(io.prompt.id).toBe(first);
  });

  it('shows nothing out of reach', () => {
    const io = makeInteractions();
    io.add(tap('a', 0, 5));
    io.update(DT, at(0, 0));
    expect(io.prompt.active).toBe(false);
  });

  it('keeps foot jobs off the rover and rover jobs off foot', () => {
    const io = makeInteractions();
    io.add(tap('onFoot', 0, 0.6));
    io.add(tap('driving', 0, 0.8, { mode: 'rover' }));
    io.update(DT, at(0, 0));
    expect(io.prompt.id).toBe('onFoot');
    io.update(DT, at(0, 0, 0, { driving: true }));
    expect(io.prompt.id).toBe('driving');
  });
});

describe('using what is in front', () => {
  it('fires a tap once per press and says so on the bus', () => {
    const io = makeInteractions();
    const events: InteractEvent[] = [];
    io.bus.on((e) => events.push(e));
    const i = tap('hatch', 0, 0.6);
    io.add(i);
    io.update(DT, at(0, 0, 0, { press: true, held: true }));
    io.update(DT, at(0, 0, 0, { press: false, held: true }));
    expect(i.use).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ type: 'interaction:completed', id: 'hatch' }]);
  });

  it('runs a hold while the key is down and reports it once, at the end', () => {
    const io = makeInteractions();
    const events: InteractEvent[] = [];
    io.bus.on((e) => events.push(e));
    io.add(hold('drill', 0, 0.6, 0.5));
    io.update(DT, at(0, 0, 0, { press: true, held: true }));
    for (let k = 0; k < 40; k++) io.update(DT, at(0, 0, 0, { held: true }));
    expect(io.prompt.progress).toBeCloseTo(1, 5);
    expect(events.filter((e) => e.type === 'interaction:completed')).toHaveLength(1);
  });

  it('does not start a hold the press did not land on', () => {
    const io = makeInteractions();
    io.add(hold('drill', 0, 0.6, 0.5));
    // The key was already down when the crew walked up: nothing runs.
    for (let k = 0; k < 20; k++) io.update(DT, at(0, 0, 0, { held: true }));
    expect(io.prompt.progress).toBe(0);
    expect(io.prompt.holding).toBe(false);
  });
});

describe('carrying and gating', () => {
  it('holds one thing at a time and says what changed', () => {
    const io = makeInteractions();
    const events: InteractEvent[] = [];
    io.bus.on((e) => events.push(e));
    expect(io.carry.take('coupling')).toBe(true);
    expect(io.carry.take('sample')).toBe(false);
    expect(io.carry.has('coupling')).toBe(true);
    expect(io.carry.drop()).toBe('coupling');
    expect(io.carry.item).toBe(null);
    expect(events).toEqual([
      { type: 'item:picked', item: 'coupling' },
      { type: 'item:dropped', item: 'coupling' },
    ]);
  });

  it('shows a job whose part is missing, blocked, and refuses the key', () => {
    const io = makeInteractions();
    const i = tap('install', 0, 0.6, { requires: () => io.carry.has('coupling') });
    io.add(i);
    io.update(DT, at(0, 0, 0, { press: true, held: true }));
    expect(io.prompt.active).toBe(true);
    expect(io.prompt.blocked).toBe(true);
    expect(i.use).not.toHaveBeenCalled();
    // With the part in hand it goes through.
    io.carry.take('coupling');
    io.update(DT, at(0, 0, 0, { press: true, held: true }));
    expect(io.prompt.blocked).toBe(false);
    expect(i.use).toHaveBeenCalledTimes(1);
  });
});
