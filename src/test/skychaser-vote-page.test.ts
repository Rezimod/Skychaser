// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/components/skychaser/SkychaserShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/skychaser/SkychaserView', () => ({ default: () => null }));
import VotePage from '@/app/vote/page';

it('says the vote opens with first light, and offers no ballot', () => {
  const html = renderToStaticMarkup(createElement(VotePage));
  expect(html).toContain('Coming soon');
  expect(html).toContain('Opens with first light');
  expect(html).toContain('href="/genesis"');
  expect(html).not.toContain('Log in to vote');
  expect(html).not.toContain('Leading the vote');
});
