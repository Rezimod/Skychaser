// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NODES } from '@/lib/observatory/nodes';
import { carryFrom, chooseNight } from '@/lib/skychaser/night';
import type { Observable } from '@/lib/skychaser/target';
import type { card, nightlyTarget } from '@/lib/schema';

type Card = typeof card.$inferSelect;
const node = NODES[0];
const NIGHT = '2026-09-20';

function obs(id: string, targetId: string, altitudeDeg: number): Observable<Card> {
  return {
    card: { id, designation: id.toUpperCase(), targetId, observationStatus: 'eligible' } as Card,
    at: new Date('2026-09-20T19:00:00Z'),
    altitudeDeg,
  };
}

// Highest first, as observableTonight returns them.
const observable = [obs('saturn', 'saturn', 40), obs('moon', 'moon', 30), obs('m31', 'm31', 20)];

describe('the night goes to', () => {
  it('the object standing highest when no holder voted', () => {
    const r = chooseNight(observable, new Map(), node, NIGHT, null)!;
    expect(r.chosen.card.id).toBe('saturn');
    expect(r.basis).toMatch(/^SATURN: no holder voted for the night of 2026-09-20\. Saturn reaches 40\.0° at 23:00 local time/);
  });

  it('the most weighted votes, over altitude', () => {
    const r = chooseNight(observable, new Map([['saturn', 3], ['m31', 7]]), node, NIGHT, null)!;
    expect(r.chosen.card.id).toBe('m31');
    expect(r.basis).toMatch(/^M31: 7 of 10 weighted votes cast by holders for the night of 2026-09-20\./);
  });

  it('the higher object on a tie', () => {
    expect(chooseNight(observable, new Map([['moon', 5], ['m31', 5]]), node, NIGHT, null)!.chosen.card.id).toBe('moon');
  });

  it('the card carried from a night lost to cloud, whatever the votes', () => {
    const r = chooseNight(observable, new Map([['m31', 99]]), node, NIGHT, { cardId: 'moon', night: '2026-09-19' })!;
    expect(r.chosen.card.id).toBe('moon');
    expect(r.basis).toMatch(/carried from the night of 2026-09-19, which was lost to cloud/);
  });

  it('the votes when the carried card is not up', () => {
    const r = chooseNight(observable, new Map([['m31', 1]]), node, NIGHT, { cardId: 'jupiter', night: '2026-09-19' })!;
    expect(r.chosen.card.id).toBe('m31');
  });

  it('nobody when nothing is observable', () => {
    expect(chooseNight([], new Map(), node, NIGHT, null)).toBeNull();
  });
});

type Night = typeof nightlyTarget.$inferSelect;
const lost = (nightDate: string, cardId = 'moon') => ({ nightDate, cardId, lostAt: new Date() }) as Night;
const kept = (nightDate: string, cardId = 'moon') => ({ nightDate, cardId, lostAt: null }) as Night;

describe('a card lost to cloud is carried', () => {
  it('into the next night', () => {
    expect(carryFrom([lost('2026-09-19')])).toEqual({ cardId: 'moon', night: '2026-09-19' });
  });

  it('for three nights in a row, and not a fourth', () => {
    const three = [lost('2026-09-19'), lost('2026-09-18'), lost('2026-09-17'), kept('2026-09-16', 'm31')];
    expect(carryFrom(three)).toEqual({ cardId: 'moon', night: '2026-09-19' });
    expect(carryFrom([lost('2026-09-20'), ...three])).toBeNull();
  });

  it('counting only its own lost nights, day after day', () => {
    expect(carryFrom([lost('2026-09-20'), lost('2026-09-19', 'm31'), lost('2026-09-18'), lost('2026-09-17'), lost('2026-09-16')])).not.toBeNull();
    expect(carryFrom([lost('2026-09-20'), lost('2026-09-18'), lost('2026-09-17'), lost('2026-09-16')])).not.toBeNull();
  });

  it('not at all after a night that was not lost', () => {
    expect(carryFrom([kept('2026-09-19')])).toBeNull();
    expect(carryFrom([])).toBeNull();
  });
});
