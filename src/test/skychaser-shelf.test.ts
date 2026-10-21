import { describe, expect, it } from 'vitest';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { SHELF_CARDS } from '@/lib/sets/shelf';

describe('the shelf snapshot', () => {
  it('matches the set, card for card (re-run scripts/skychaser-shelf.ts if not)', () => {
    expect(SHELF_CARDS).toEqual(JSON.parse(JSON.stringify(SET_001_CARDS.map(({ seed, record }) => ({ seed, record })))));
  });
});
