// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import WelcomePanel from '@/components/skychaser/WelcomePanel';

it('shows the first card by name and number, and shares its own edition page', () => {
  const html = renderToStaticMarkup(
    createElement(WelcomePanel, {
      edition: { editionId: 'e1', designation: 'FIRST-LIGHT', name: 'First Light', rarity: 'common', editionNumber: 42, editionSize: 300 },
      wallet: 'HOLDER',
      onClose: () => {},
    }),
  );
  expect(html).toContain('Your collection begins');
  expect(html).toContain('First Light');
  expect(html).toContain('No. 042 of 300');
  expect(html).toContain('/collection?wallet=HOLDER');
  expect(html).toContain(encodeURIComponent('https://skychaser.io/card/FIRST-LIGHT'));
  expect(html).not.toMatch(/!/);
});
