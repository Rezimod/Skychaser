/**
 * The set as a page prints it: each card's seed and record, read from
 * set-001.shelf.json (scripts/skychaser-shelf.ts) rather than worked out from
 * the telescope model, so no page carries that model to the browser. The
 * server's judgement of each card stays in ./set-001.
 */
import type { AuthoredCard } from './build';
import SHELF from './set-001.shelf.json';

export type ShelfCard = Pick<AuthoredCard, 'seed' | 'record'>;

export const SHELF_CARDS = SHELF as unknown as ShelfCard[];

export const SHELF_BY_DESIGNATION = new Map(SHELF_CARDS.map((c) => [c.seed.designation, c]));
