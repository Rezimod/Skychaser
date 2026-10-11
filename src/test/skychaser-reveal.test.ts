// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import SkychaserReveal, { type RevealedCard } from '@/components/skychaser/SkychaserReveal';

const card = (designation: string, rarity: string, drawIndex: number): RevealedCard => ({
  drawIndex,
  designation,
  name: designation,
  rarity,
  editionNumber: 3,
  editionSize: 100,
});

const render = (cards: RevealedCard[], extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(SkychaserReveal, { draw: { sequence: 1, secret: 'abcdef0123456789', nonce: 'fedcba9876543210', cards, ...extra } }),
  );

it('waits on the star for one press', () => {
  const html = render([card('EUROPA', 'common', 0)]);
  expect(html).toContain('class="sn-go"');
  expect(html).toContain('Detonate the star');
  expect(html).toContain('data-sn="sky"');
});

it('gives the scarcest card in the capsule', () => {
  const html = render([card('M31', 'rare', 0), card('SATURN', 'legendary', 1), card('EUROPA', 'common', 2)]);
  expect(html).toContain('class="sn" data-rarity="legendary"');
  expect(html).not.toContain('class="sn" data-rarity="common"');
});

it('keeps the other cards of an older two-card capsule beside it', () => {
  const html = render([card('M31', 'rare', 0), card('SATURN', 'epic', 1)]);
  expect(html).toContain('Also in this capsule');
  expect(html).toContain('/card/M31');
  expect(render([card('M31', 'rare', 0)])).not.toContain('Also in this capsule');
});

it('comes out of the capsule face up, with no sealed back', () => {
  const html = render([card('SATURN', 'epic', 0)]);
  expect(html).toContain('/cards/capsule.webp');
  expect(html).toContain('sdc-card--back');
  expect(html).not.toContain('sealed.webp');
});

it('shows a First Light card as the printed card, with its edition in plain text', () => {
  const html = render([card('SATURN', 'epic', 0)]);
  expect(html).toContain('sdc-card');
  expect(html).toContain('edition 003 of 030');
  expect(html).toContain('No. 003 / 100');
});

it('prints the draw’s own provenance so it can be checked', () => {
  const html = render([card('M31', 'rare', 0)]);
  expect(html).toContain('seed abcdef01');
  expect(html).toContain('client fedcba98');
  expect(html).toContain('/capsules/log');
});

it('names the opening plainly, with no banned words and no exclamation marks', () => {
  const html = render([card('M31', 'rare', 0)]);
  const text = html.replace(/<[^>]+>/g, ' ');
  expect(text).not.toMatch(/\b(NFT|mint|drop|payload|manifest|registry|airdrop)\b/i);
  expect(text).not.toContain('!');
});

it('says what the card unlocks, and offers Share', () => {
  const real = render([card('M31', 'rare', 0)]);
  expect(real).toContain('You’re in the draw for a seat at a live session — after first light.');
  expect(real).toContain('Share');
  expect(real).toContain('Detonate another');
});

it('plays without sound for now, and offers no sound toggle', () => {
  const html = render([card('M31', 'rare', 0)]);
  expect(html).not.toContain('Sound on');
  expect(html).not.toContain('Sound off');
});
