/**
 * How a card is authored.
 *
 * The author states the facts — what the object is, where it is, how large and
 * how bright — and the rarity, which is a decision. Everything else follows:
 * the edition size from the rarity, the observation status from Live Telescope V1's
 * optics and sky. Nothing that can be derived is typed by hand.
 */

import type { card } from '@/lib/schema';
import type { Rarity } from '@/lib/rarity';
import { getNode } from '@/lib/observatory/nodes';
import { EDITION_SIZE } from '@/lib/skychaser/economics';
import { observability, type Observability, type ObservabilitySubject } from '@/lib/skychaser/observability';

/** A card row as a set declares it, before it is filed under a set. */
export type CardSeed = Omit<typeof card.$inferInsert, 'id' | 'setId' | 'createdAt'>;

export type CardFacts = Omit<CardSeed, 'rarity' | 'observationStatus' | 'editionSize' | 'artUrl'> & {
  rarity: Rarity;
};

/** What decides whether the node can record it, beyond position. */
export type CardOptics = Pick<ObservabilitySubject, 'resolveArcsec' | 'magnitude' | 'sizeArcmin'>;

export type Section = 'object' | 'almanac';

/** Where a card sits on the shelf. The Rare Sights are what the sky does now and then — eclipses, aurorae, great comets — not things in it. */
export type Family = 'near' | 'stars' | 'deep' | 'galaxies' | 'extremes' | 'sights' | 'almanac';

/** What the card prints and how it is sold, beyond the row the database keeps. */
export type CardRecord = {
  section: Section;
  family: Family;
  /** An Almanac card's event, ISO 8601 UTC. Null for an object. */
  eventStartUtc: string | null;
  eventEndUtc: string | null;
  /** The designation of the card this one is paired with, if any. */
  pairsWith: string | null;
  /** Includes a physical fragment, redeemable later. */
  physical: boolean;
  /** Three figures on the face: label and value. */
  stats: [[string, string], [string, string], [string, string]];
  /** One short line of card text. */
  line: string;
  /** Two lines on the back: what this is, said simply, and why it matters. */
  story: [string, string] | null;
  /** The object's own light, for the glow its tile sits on. */
  glow: string | null;
  /** The name as it runs on the back: "When Live Telescope V1 photographs the Moon". */
  noun: string | null;
};

export type AuthoredCard = {
  seed: CardSeed;
  subject: ObservabilitySubject;
  observability: Observability;
  record: CardRecord;
};

export type Extras = Pick<CardRecord, 'stats' | 'line'> &
  Partial<Pick<CardRecord, 'pairsWith' | 'physical' | 'family' | 'story' | 'glow' | 'noun'>>;

const record = (extras: Extras, event: Pick<CardRecord, 'section' | 'eventStartUtc' | 'eventEndUtc'>): CardRecord => ({
  ...event,
  family: extras.family ?? (event.section === 'almanac' ? 'almanac' : 'near'),
  pairsWith: extras.pairsWith ?? null,
  physical: extras.physical ?? false,
  stats: extras.stats,
  line: extras.line,
  story: extras.story ?? null,
  glow: extras.glow ?? null,
  noun: extras.noun ?? null,
});

const OBJECT = { section: 'object', eventStartUtc: null, eventEndUtc: null } as const;

/** The node every First Light card is judged against. */
export const JUDGING_NODE_ID = 'tbilisi-01';

/** One placeholder until the art exists. */
export const PLACEHOLDER_ART = '/cards/placeholder.svg';

/** Rendered from Explore's own planet maps by the phase-7 card renderer (since retired) —
 *  art, not a Live Telescope V1 frame. Everything else is drawn from its record. */
const RENDERED = new Set(['SATURN', 'JUPITER']);

export function subjectOf(facts: Pick<CardSeed, 'targetId' | 'decDeg'>, optics: CardOptics): ObservabilitySubject {
  return { targetId: facts.targetId, decDeg: facts.decDeg ?? null, ...optics };
}

export function authorCard(facts: CardFacts, optics: CardOptics, extras: Extras): AuthoredCard {
  const node = getNode(JUDGING_NODE_ID);
  if (!node) throw new Error(`${JUDGING_NODE_ID} is not in the node registry`);

  const subject = subjectOf(facts, optics);
  const judged = observability(subject, node);
  return {
    seed: {
      ...facts,
      observationStatus: judged.status,
      editionSize: EDITION_SIZE[facts.rarity],
      artUrl: RENDERED.has(facts.designation) ? `/cards/${facts.designation}.webp` : PLACEHOLDER_ART,
    },
    subject,
    observability: judged,
    record: record(extras, OBJECT),
  };
}

type NoSky = Omit<CardFacts, 'targetId' | 'raHours' | 'decDeg' | 'surfaceLat' | 'surfaceLon'>;

const unpointable = (facts: NoSky, targetId: string, reason: string, rec: CardRecord): AuthoredCard => {
  const seed: CardSeed = {
    ...facts,
    targetId,
    raHours: null,
    decDeg: null,
    surfaceLat: null,
    surfaceLon: null,
    observationStatus: 'not_available',
    editionSize: EDITION_SIZE[facts.rarity],
    artUrl: PLACEHOLDER_ART,
  };
  return {
    seed,
    subject: { targetId, decDeg: null, resolveArcsec: null, magnitude: null, sizeArcmin: null },
    observability: { status: 'not_available', reason },
    record: rec,
  };
};

/**
 * A card of something Live Telescope V1 cannot point at — a specimen in a case, a
 * spacecraft beyond any telescope, the observatory's own first frame. The
 * author says why.
 */
export function authorKept(facts: NoSky, reason: string, extras: Extras): AuthoredCard {
  return unpointable(facts, 'kept', reason, record(extras, OBJECT));
}

/**
 * A Rare Sight: something the sky does, now and then, that people travel to
 * see — an eclipse, an aurora, a great comet. Not a thing to point at; a
 * moment to be under.
 */
export function authorSight(facts: NoSky, reason: string, extras: Extras): AuthoredCard {
  return unpointable(facts, 'sight', reason, record({ ...extras, family: 'sights' }, OBJECT));
}

/**
 * An Almanac card: a dated event in the real sky. Sold until the event ends,
 * then sealed. No vote decides it; Live Telescope V1 records it on the night,
 * unless it happens at the Sun, which the telescope never points at.
 */
export function authorAlmanac(
  facts: NoSky,
  event: { start: string; end: string },
  extras: Extras,
  reason = 'A dated event. The Live Telescope records it on the night, weather allowing; no vote decides it.',
): AuthoredCard {
  return unpointable(
    facts,
    'event',
    reason,
    record(extras, { section: 'almanac', eventStartUtc: event.start, eventEndUtc: event.end }),
  );
}

