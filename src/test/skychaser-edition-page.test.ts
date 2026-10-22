// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const mocks = vi.hoisted(() => ({ db: vi.fn(), readEdition: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/skychaser/repo', () => ({ readEdition: mocks.readEdition }));
vi.mock('@/components/skychaser/SkychaserShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
import EditionPage from '@/app/edition/[designation]/[number]/page';
import { parseEdition } from '@/lib/skychaser/edition-path';

const HOLDER = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';
const render = async (designation: string, number: string) => renderToStaticMarkup(await EditionPage({ params: Promise.resolve({ designation, number }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.mockReturnValue({});
});

describe('an edition page', () => {
  it('reads the card, the number and the holder, and shares its own address', async () => {
    mocks.readEdition.mockResolvedValue({
      editionId: 'e1', designation: 'TYCHO', name: 'Tycho', rarity: 'common', observationStatus: 'dedicated',
      editionNumber: 42, editionSize: 100, ownerWallet: HOLDER, acquiredAt: '2026-10-22T10:00:00.000Z',
      provenance: { kind: 'capsule', capsuleId: '00000000-0000-4000-8000-000000000001', sequence: 12 }, latest: null,
    });
    const html = await render('tycho', '42');
    expect(mocks.readEdition).toHaveBeenCalledWith({}, 'TYCHO', 42);
    expect(html).toContain('No. 042 of 100');
    expect(html).toContain('7xKX…gAsU');
    expect(html).toContain('/collection?wallet=' + HOLDER);
    expect(html).toContain('Capsule No. 012');
    expect(html).toContain('/capsule/00000000-0000-4000-8000-000000000001');
    expect(html).toContain('22 October 2026');
    expect(html).toContain('Not yet');
    expect(html).toContain(encodeURIComponent('https://skychaser.io/edition/TYCHO/42'));
  });

  it('names the first card and a card bought outright', async () => {
    mocks.readEdition.mockResolvedValueOnce({
      editionId: 'e1', designation: 'FIRST-LIGHT', name: 'First Light', rarity: 'common', observationStatus: 'eligible',
      editionNumber: 1, editionSize: 300, ownerWallet: HOLDER, acquiredAt: '2026-10-22T10:00:00.000Z', provenance: { kind: 'welcome' }, latest: null,
    });
    expect(await render('FIRST-LIGHT', '1')).toContain('The first card, on sign-in');
    mocks.readEdition.mockResolvedValueOnce({
      editionId: 'e2', designation: 'TYCHO', name: 'Tycho', rarity: 'common', observationStatus: 'dedicated',
      editionNumber: 2, editionSize: 100, ownerWallet: HOLDER, acquiredAt: '2026-10-22T10:00:00.000Z', provenance: { kind: 'outright' },
      latest: { id: 'c1', targetName: 'Tycho', capturedAt: '2026-10-21T20:00:00.000Z', provenance: 'instrument', nodeId: 'tbilisi-01' },
    });
    const html = await render('TYCHO', '2');
    expect(html).toContain('Bought outright');
    expect(html).toContain('21 October 2026');
  });

  it('is not found for a card that is not in the set, or a number nobody holds', async () => {
    mocks.readEdition.mockResolvedValue(null);
    await expect(render('TYCHO', '9999')).rejects.toThrow();
    await expect(render('NOT-A-CARD', '1')).rejects.toThrow();
    expect(parseEdition({ designation: 'tycho', number: '0' })).toBeNull();
    expect(parseEdition({ designation: 'tycho', number: '12' })).toEqual({ designation: 'TYCHO', number: 12 });
    expect(parseEdition({ designation: '../x', number: '1' })).toBeNull();
  });

  it('says so when the record cannot be read', async () => {
    mocks.readEdition.mockRejectedValue(new Error('down'));
    const html = await render('TYCHO', '3');
    expect(html).toContain('cannot be read');
    expect(html).toContain('No. 003 of 100');
  });
});
