import { describe, expect, it } from 'vitest';
import { RARITY_ODDS_BPS } from '@/lib/skychaser/economics';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { perkFor, votePower } from '@/lib/skychaser/perks';
import { RARITIES, type Rarity } from '@/lib/rarity';

const of = (r: Rarity) => SET_001_CARDS.filter((c) => c.seed.rarity === r).map((c) => c.seed.designation);

describe('the perk tiers', () => {
  it('makes the meteorites and the moon rock, and only they, legendary', () => {
    expect(of('legendary')).toEqual(SET_001_CARDS.filter((c) => c.record.physical).map((c) => c.seed.designation));
    expect(of('legendary')).toHaveLength(7);
  });

  it('makes the eight planets epic, and beside them Phobos, the one special moon, and the limited Roadster', () => {
    expect(of('epic').sort()).toEqual(['EARTH', 'JUPITER', 'MARS', 'MERCURY', 'NEPTUNE', 'PHOBOS', 'ROADSTER', 'SATURN', 'URANUS', 'VENUS']);
  });

  it('makes rare what the telescope will point at beyond the planets, and leaves nothing it can photograph common', () => {
    for (const c of SET_001_CARDS.filter((x) => x.seed.rarity === 'rare')) {
      const pointed = c.seed.observationStatus !== 'not_available' || (c.record.section === 'almanac' && c.seed.designation !== 'GREAT-ECLIPSE');
      expect(pointed, c.seed.designation).toBe(true);
    }
    const photographableCommons = SET_001_CARDS.filter((x) => x.seed.observationStatus !== 'not_available' && x.seed.rarity === 'common');
    expect(photographableCommons.map((c) => c.seed.designation)).toEqual([]);
    expect(of('rare')).toHaveLength(18);
  });

  it('gives every card a perk and every edition a vote', () => {
    for (const c of SET_001_CARDS) {
      const r = c.seed.rarity as Rarity;
      expect(perkFor(c.seed.designation, r).short.length, c.seed.designation).toBeGreaterThan(3);
      expect(votePower(c.seed.designation, r)).toBeGreaterThanOrEqual(1);
    }
  });

  it('lets the former headliners vote harder among the commons, and never past a rare', () => {
    const powers = of('common').map((d) => votePower(d, 'common'));
    expect(new Set(powers)).toEqual(new Set([1, 2, 3]));
    expect(votePower('HALLEY', 'common')).toBe(3);
    expect(votePower('M31', 'common')).toBe(2);
    expect(votePower('VEGA', 'common')).toBe(1);
    expect(Math.max(...powers)).toBeLessThan(votePower('MOON', 'rare'));
    expect(perkFor('HALLEY', 'common').short).toBe('Vote ×3');
  });

  it('draws each tier at about its share of what capsules can draw (limited cards are never drawn)', () => {
    const supply = (r: Rarity) => SET_001_CARDS.filter((c) => c.seed.rarity === r && !c.record.directOnly).reduce((s, c) => s + c.seed.editionSize, 0);
    const total = RARITIES.reduce((s, r) => s + supply(r), 0);
    for (const r of RARITIES) expect(Math.abs(RARITY_ODDS_BPS[r] - (supply(r) / total) * 10_000), r).toBeLessThan(2);
  });
});
