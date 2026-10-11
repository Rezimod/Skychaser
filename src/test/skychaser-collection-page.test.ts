// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ db: vi.fn(), holderView: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/skychaser/repo', () => ({ holderView: mocks.holderView }));
// The shell and the wallet gate are client components with a Privy session
// behind them; this test is about what the page itself reads and prints.
vi.mock('@/components/skychaser/SkychaserShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/skychaser/CollectionWallet', () => ({
  default: () => createElement('p', null, 'Sign in to read your Collection'),
}));
import CollectionPage from '@/app/collection/page';

async function render(wallet?: string): Promise<string> {
  const element = await CollectionPage({ searchParams: Promise.resolve(wallet ? { wallet } : {}) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.mockReturnValue({});
});

it('renders an edition that has not been observed yet', async () => {
  mocks.holderView.mockResolvedValue([
    {
      editionId: 'e1',
      designation: 'M31',
      name: 'Andromeda Galaxy',
      editionNumber: 1,
      editionSize: 10,
      rarity: 'rare',
      observationStatus: 'eligible',
      latest: null,
      history: [],
    },
  ]);

  const html = await render('holder-1');
  expect(mocks.holderView).toHaveBeenCalledWith({}, 'holder-1');
  expect(html).toContain('M31');
  expect(html).toContain('edition 001 of 300');
  expect(html).toContain('Photograph after first light');
  expect(html).toContain('No. 001 of 10');
});

it('keeps an edition whose card has left the set, by its number', async () => {
  mocks.holderView.mockResolvedValue([
    {
      editionId: 'e2', designation: 'KRAKEN-MARE', name: 'Kraken Mare', editionNumber: 4, editionSize: 300, rarity: 'common',
      observationStatus: 'eligible', latest: null, history: [],
    },
  ]);
  const html = await render('holder-1');
  expect(html).toContain('sdc-card--blank');
  expect(html).toContain('No. 004');
});

it('captions an observed card with the capture data', async () => {
  const capture = { id: 'c1', targetName: 'The Moon', capturedAt: '2026-09-20T16:17:07.790Z', provenance: 'simulated', nodeId: 'tbilisi-01' };
  mocks.holderView.mockResolvedValue([
    {
      editionId: 'e1', designation: 'M31', name: 'Andromeda Galaxy', editionNumber: 1, editionSize: 10, rarity: 'rare',
      observationStatus: 'eligible', latest: capture, history: [{ ...capture, nightDate: '2026-09-20' }],
    },
  ]);

  const html = await render('holder-1');
  expect(html).toContain('Node tbilisi-01');
  expect(html).toContain('2026-09-20 16:17 UTC');
  expect(html).toContain('Simulated');
  expect(html).not.toContain('Photograph after first light');
});

it('says the Collection cannot be read when there is no database', async () => {
  mocks.db.mockReturnValue(null);
  const html = await render('holder-1');
  expect(html).toContain('cannot be read');
  expect(mocks.holderView).not.toHaveBeenCalled();
});

it('asks for a wallet rather than querying for nothing', async () => {
  const html = await render();
  expect(html).toContain('Sign in to read your Collection');
  expect(mocks.holderView).not.toHaveBeenCalled();
});
