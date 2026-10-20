import { describe, expect, it } from 'vitest';
import { getNode } from '@/lib/observatory/nodes';
import { DEEP_SKY_BY_ID } from '@/lib/observatory/sky-field';
import { SIM_TARGET_BY_ID } from '@/lib/observatory/sim-targets';
import { isRarity, RARITIES, rarityInfo } from '@/lib/rarity';
import { JUDGING_NODE_ID, subjectOf } from '@/lib/sets/build';
import { SET_GROUPS, groupCards } from '@/lib/sets/groups';
import { SET_001, SET_001_CARD_BY_DESIGNATION, SET_001_CARDS } from '@/lib/sets/set-001';
import { cardStatus, eventLabel, isDirectOnly, isSealed } from '@/lib/skychaser/almanac';
import { EDITION_SIZE } from '@/lib/skychaser/economics';
import { observability } from '@/lib/skychaser/observability';
import { plateFor } from '@/lib/skychaser/plate';

const node = getNode(JUDGING_NODE_ID)!;
const seeds = SET_001_CARDS.map((c) => c.seed);
const byDesignation = (d: string) => SET_001_CARD_BY_DESIGNATION.get(d)!.seed;
const objects = SET_001_CARDS.filter((c) => c.record.section === 'object');
const almanac = SET_001_CARDS.filter((c) => c.record.section === 'almanac');
const pointable = objects.filter((c) => c.seed.targetId !== 'kept' && c.seed.targetId !== 'sight');
const MOVING = new Set(['moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'halley']);

describe('First Light', () => {
  it('is a hundred and seven cards in seven families, the Almanac after the objects, then Phobos and the Roadster, each filed under its own designation', () => {
    expect(SET_001.name).toBe('Genesis');
    expect(seeds.length).toBe(107);
    expect(objects).toHaveLength(99);
    expect(almanac).toHaveLength(8);
    // The original 105 keep their numbers: 97 objects, then the Almanac; Phobos was added after, as No. 106.
    expect(SET_001_CARDS.slice(0, 97)).toEqual(objects.slice(0, 97));
    expect(SET_001_CARDS.slice(97, 105)).toEqual(almanac);
    expect(SET_001_CARDS[105].seed.designation).toBe('PHOBOS');
    expect(plateFor('PHOBOS')!.num).toBe('106');
    expect(SET_001_CARDS[106].seed.designation).toBe('ROADSTER');
    expect(plateFor('ROADSTER')!.num).toBe('107');
    const families = SET_GROUPS.map((g) => groupCards(SET_001_CARDS, g.key).length);
    expect(families).toEqual([41, 16, 17, 12, 5, 8, 8]);
    expect(SET_GROUPS.flatMap((g) => groupCards(SET_001_CARDS, g.key))).toHaveLength(107);
    expect(new Set(seeds.map((c) => c.designation)).size).toBe(seeds.length);
    for (const c of seeds) expect(c.designation).toMatch(/^[A-Z0-9-]+$/);
  });

  it('takes every observation status from the helper, recomputed here', () => {
    for (const { seed, subject } of pointable) {
      const { resolveArcsec, magnitude, sizeArcmin } = subject;
      const recomputed = observability(subjectOf(seed, { resolveArcsec, magnitude, sizeArcmin }), node);
      expect(seed.observationStatus, seed.designation).toBe(recomputed.status);
    }
  });

  it('keeps the first twenty-four in the tiers the perks give them', () => {
    const statuses = Object.fromEntries(seeds.map((c) => [c.designation, `${c.rarity} ${c.observationStatus}`]));
    expect(statuses).toMatchObject({
      'FIRST-LIGHT': 'common not_available',
      IMILAC: 'legendary not_available',
      'LUNAR-FRAGMENT': 'legendary not_available',
      TYCHO: 'rare eligible',
      'OLYMPUS-MONS': 'common not_available',
      JUPITER: 'epic eligible',
      EUROPA: 'common not_available',
      SATURN: 'epic eligible',
      HALLEY: 'common not_available',
      'VOYAGER-1': 'common not_available',
      M45: 'rare eligible',
      M42: 'rare eligible',
      M1: 'common not_available',
      'SGR-A': 'common not_available',
      M31: 'common not_available',
      ORIONIDS: 'rare not_available',
      'HUNTERS-MOON': 'rare not_available',
      'PLEIADES-OCCULTATION': 'rare not_available',
      GEMINIDS: 'rare not_available',
      'CHRISTMAS-SUPERMOON': 'rare not_available',
      'DOUBLE-OPPOSITION': 'rare not_available',
      'SNOW-MOON-ECLIPSE': 'rare not_available',
      'GREAT-ECLIPSE': 'common not_available',
    });
  });

  it('counts the tiers as the perks say: 7 legendary, 10 epic, 18 rare, 72 common', () => {
    const count = (r: string) => seeds.filter((c) => c.rarity === r).length;
    expect([count('legendary'), count('epic'), count('rare'), count('common')]).toEqual([7, 10, 18, 72]);
  });

  it('never offers the telescope what it cannot point at, and says why', () => {
    for (const c of SET_001_CARDS.filter((x) => ['kept', 'event', 'fiction'].includes(x.seed.targetId))) {
      expect(c.seed.observationStatus).toBe('not_available');
      expect(c.observability.reason.length).toBeGreaterThan(20);
    }
    for (const c of almanac) expect(c.seed.targetId).toBe('event');
  });

  it('only offers the night picker targets the node can actually capture', () => {
    for (const c of seeds.filter((s) => s.observationStatus !== 'not_available')) {
      expect(SIM_TARGET_BY_ID.has(c.targetId), c.designation).toBe(true);
    }
  });

  it('sizes editions from the one economics constant, rarer being fewer; a limited card sets its own, smaller', () => {
    for (const { seed: c, record } of SET_001_CARDS) {
      expect(isRarity(c.rarity)).toBe(true);
      const tier = EDITION_SIZE[c.rarity as keyof typeof EDITION_SIZE];
      if (record.directOnly) expect(c.editionSize, c.designation).toBeLessThan(tier);
      else expect(c.editionSize, c.designation).toBe(tier);
    }
    expect(byDesignation('ROADSTER').editionSize).toBe(25);
    const sizes = RARITIES.map((r) => EDITION_SIZE[r]);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it('has a fixed J2000 position for fixed objects and none for the moving ones', () => {
    for (const c of pointable.map((x) => x.seed)) {
      const moving = MOVING.has(c.targetId);
      if (moving) {
        expect(c.raHours, c.designation).toBeNull();
        expect(c.decDeg, c.designation).toBeNull();
      } else {
        expect(c.raHours, c.designation).toBeGreaterThanOrEqual(0);
        expect(c.raHours, c.designation).toBeLessThan(24);
        expect(Math.abs(c.decDeg!), c.designation).toBeLessThanOrEqual(90);
      }
      const onMoon = c.surfaceLat !== null && c.surfaceLat !== undefined;
      expect(onMoon, c.designation).toBe(c.designation === 'TYCHO' || c.designation === 'APOLLO-11');
    }
  });

  it('takes deep-sky positions from the catalogue the node already uses', () => {
    for (const id of ['m42', 'm45', 'm31', 'm1']) {
      const d = DEEP_SKY_BY_ID.get(id)!;
      expect(byDesignation(id.toUpperCase())).toMatchObject({ raHours: d.ra, decDeg: d.dec });
    }
  });

  it('pairs cards both ways, and only with cards in the set', () => {
    for (const c of SET_001_CARDS) {
      const p = c.record.pairsWith;
      if (p === null) continue;
      const other = SET_001_CARD_BY_DESIGNATION.get(p);
      expect(other, `${c.seed.designation} pairs with ${p}`).toBeDefined();
      expect(other!.record.pairsWith).toBe(c.seed.designation);
    }
    expect(SET_001_CARDS.filter((c) => c.record.physical).map((c) => c.seed.designation)).toEqual(['IMILAC', 'LUNAR-FRAGMENT', 'CANYON-DIABLO', 'GIBEON', 'CAMPO-DEL-CIELO', 'MUONIONALUSTA', 'ALLENDE']);
  });

  it('prints three figures and a line on every card, in the logbook’s voice', () => {
    const banned = /\b(nfts?|mint(ed|ing|s)?|drops?|payload|manifest|registry|airdrops?)\b/i;
    for (const c of SET_001_CARDS) {
      expect(c.record.stats).toHaveLength(3);
      expect(c.record.line, c.seed.designation).not.toMatch(banned);
      expect(c.record.line).not.toContain('!');
      expect(c.seed.blurb).toBe(c.record.line);
      expect(c.seed.artUrl).toMatch(/^\/cards\//);
      const plate = plateFor(c.seed.designation)!;
      expect(plate.des.length, plate.des).toBeLessThanOrEqual(60);
      for (const [, value] of plate.data) expect(value.length, value).toBeLessThanOrEqual(17);
    }
  });

  it('lists the Almanac by date, every event with a window', () => {
    const dated = groupCards(SET_001_CARDS, 'almanac');
    expect(dated.map((c) => c.seed.designation)).toEqual([
      'ORIONIDS', 'HUNTERS-MOON', 'PLEIADES-OCCULTATION', 'GEMINIDS', 'CHRISTMAS-SUPERMOON', 'DOUBLE-OPPOSITION', 'SNOW-MOON-ECLIPSE', 'GREAT-ECLIPSE',
    ]);
    for (const c of dated) expect(Date.parse(c.record.eventEndUtc!)).toBeGreaterThan(Date.parse(c.record.eventStartUtc!));
    // An object card has no event; only a limited card has a date, when its sale closes.
    for (const c of objects) expect(c.record.eventStartUtc).toBeNull();
    expect(objects.filter((c) => c.record.eventEndUtc !== null).map((c) => c.seed.designation)).toEqual(['ROADSTER']);
    expect(SET_001_CARDS.filter((c) => c.record.directOnly).map((c) => c.seed.designation)).toEqual(['ROADSTER']);
  });
});

describe('sealing', () => {
  it('seals a limited card when its sale closes, and keeps it out of capsules', () => {
    const roadster = SET_001_CARD_BY_DESIGNATION.get('ROADSTER')!;
    const closes = Date.parse(roadster.record.eventEndUtc!);
    expect(cardStatus(roadster, new Date(closes - 60_000))).toBe('open');
    expect(cardStatus(roadster, new Date(closes))).toBe('sealed');
    expect(isDirectOnly('ROADSTER')).toBe(true);
    expect(isDirectOnly('MARS')).toBe(false);
    expect(isDirectOnly('NOT-A-CARD')).toBe(false);
  });

  const orionids = SET_001_CARD_BY_DESIGNATION.get('ORIONIDS')!;
  const before = new Date('2026-09-26T12:00:00Z');
  const during = new Date('2026-10-21T20:00:00Z');
  const after = new Date('2026-10-23T00:00:00Z');

  it('is open before the event ends and sealed from the moment it does', () => {
    expect(cardStatus(orionids, before)).toBe('open');
    expect(cardStatus(orionids, during)).toBe('open');
    expect(cardStatus(orionids, after)).toBe('sealed');
    expect(isSealed('ORIONIDS', after)).toBe(true);
    expect(isSealed('JUPITER', new Date('2099-01-01T00:00:00Z'))).toBe(false);
    expect(isSealed('NOT-A-CARD', after)).toBe(false);
  });

  it('counts down in days, then says under way, then sealed', () => {
    const { eventStartUtc: s, eventEndUtc: e } = orionids.record;
    expect(eventLabel(s!, e!, before)).toBe('In 25 days');
    expect(eventLabel(s!, e!, new Date('2026-10-20T12:00:00Z'))).toBe('Tonight');
    expect(eventLabel(s!, e!, during)).toBe('Under way');
    expect(eventLabel(s!, e!, after)).toBe('Sealed');
  });
});

describe('rarity', () => {
  it('orders the four card tiers by scarcity', () => {
    expect(RARITIES.map((r) => rarityInfo(r).rank)).toEqual([0, 1, 2, 3]);
    expect(rarityInfo('legendary')).toMatchObject({ label: 'Legendary', glyph: '✦' });
    expect(isRarity('Stellar')).toBe(false);
  });
});
