// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NODES } from '@/lib/observatory/nodes';
import { chooseWeek, weekOf } from '@/lib/skychaser/night';
import type { Observable } from '@/lib/skychaser/target';
import type { card } from '@/lib/schema';

type Card = typeof card.$inferSelect;
const node = NODES[0];
const WEEK = '2026-09-14';

function obs(id: string, targetId: string, altitudeDeg: number): Observable<Card> {
  return {
    card: { id, designation: id.toUpperCase(), targetId, observationStatus: 'eligible' } as Card,
    at: new Date('2026-09-20T19:00:00Z'),
    altitudeDeg,
  };
}

// Highest first, as observableTonight returns them.
const observable = [obs('saturn', 'saturn', 40), obs('moon', 'moon', 30), obs('m31', 'm31', 20)];

describe('the week goes to', () => {
  it('the object standing highest when no holder voted', () => {
    const r = chooseWeek(observable, new Map(), node, WEEK)!;
    expect(r.chosen.card.id).toBe('saturn');
    expect(r.basis).toMatch(/^SATURN: no holder voted for the week of 2026-09-14\. Saturn reaches 40\.0° at 23:00 local time/);
  });

  it('the most weighted votes, over altitude', () => {
    const r = chooseWeek(observable, new Map([['saturn', 3], ['m31', 7]]), node, WEEK)!;
    expect(r.chosen.card.id).toBe('m31');
    expect(r.basis).toMatch(/^M31: 7 of 10 weighted votes cast by holders for the week of 2026-09-14\./);
  });

  it('the higher object on a tie', () => {
    expect(chooseWeek(observable, new Map([['moon', 5], ['m31', 5]]), node, WEEK)!.chosen.card.id).toBe('moon');
  });

  it('nobody when nothing is observable', () => {
    expect(chooseWeek([], new Map(), node, WEEK)).toBeNull();
  });
});

describe('a week', () => {
  it('starts on the Monday', () => {
    expect(weekOf('2026-09-14')).toBe('2026-09-14');
    expect(weekOf('2026-09-16')).toBe('2026-09-14');
    expect(weekOf('2026-09-20')).toBe('2026-09-14');
    expect(weekOf('2026-09-21')).toBe('2026-09-21');
  });

  it('crosses months and years', () => {
    expect(weekOf('2026-10-01')).toBe('2026-09-28');
    expect(weekOf('2027-01-03')).toBe('2026-12-28');
  });
});
