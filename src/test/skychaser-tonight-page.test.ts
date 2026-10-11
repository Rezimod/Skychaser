// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TonightView } from '@/lib/skychaser/night';
const mocks = vi.hoisted(() => ({ db: vi.fn(), tonightView: vi.fn() }));
vi.mock('@/lib/db', () => ({ getDb: mocks.db }));
vi.mock('@/lib/skychaser/night', async (orig) => ({ ...(await orig<typeof import('@/lib/skychaser/night')>()), tonightView: mocks.tonightView }));
vi.mock('@/components/skychaser/SkychaserShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/skychaser/SkychaserView', () => ({ default: () => null }));
import TonightPage from '@/app/tonight/page';

const base: TonightView = {
  night: '2026-09-20',
  decided: null,
  voting: { night: '2026-09-20', carried: null, window: null, candidates: [] },
  recent: [],
};

async function render(view: TonightView): Promise<string> {
  mocks.tonightView.mockResolvedValue(view);
  return renderToStaticMarkup(await TonightPage());
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.mockReturnValue({});
});

it('opens the vote before the night is decided', async () => {
  const html = await render({
    ...base,
    voting: { ...base.voting, candidates: [{ designation: 'SATURN', name: 'Saturn', rarity: 'legendary', altitudeDeg: 41.2, at: '2026-09-20T19:15:00Z', votes: 12, track: [] }] },
  });
  expect(html).toContain('Leading the vote');
  expect(html).toContain('<p class="sd-lead">Saturn</p>');
  expect(html).toContain('Tonight’s vote · 20 September');
  expect(html).toContain('41° at 23:15');
  expect(html).toContain('aria-label="Log in to vote for Saturn"');
  expect(html).toContain('transform:scaleX(1)');
  expect(html).toContain('lock tonight’s card at 13:00 UTC');
});

it('says plainly that a cloudy night was lost, and what takes the next', async () => {
  const html = await render({
    ...base,
    decided: {
      designation: 'TYCHO',
      name: 'Tycho',
      rarity: 'rare',
      artUrl: null,
      basis: 'TYCHO: carried from the night of 2026-09-19, which was lost to cloud. Moon reaches 38.0° at 22:30 local time.',
      plannedAt: '2026-09-20T18:30:00Z',
      cloudForecast: 20,
      capture: null,
    },
    voting: { night: '2026-09-21', carried: null, window: null, candidates: [] },
    recent: [{ night: '2026-09-19', designation: 'TYCHO', name: 'Tycho', result: 'lost', lostReason: 'Cloud cover was 96% at 22:30 local time, over the 70% limit.' }],
  });
  expect(html).toContain('19 September was lost to cloud.</strong> Cloud cover was 96% at 22:30 local time, over the 70% limit.');
  expect(html).toContain('carried from the night of 2026-09-19');
  expect(html).toContain('Lost to cloud');
  expect(html).toContain('Live Telescope — coming soon, first light in November. No photograph is taken yet.');
  expect(html).not.toMatch(/sorry|apolog|countdown|!/i);
});

it('warns when the forecast cloud is over the limit, and only then', async () => {
  const decided = { designation: 'M45', name: 'Pleiades', rarity: 'common', artUrl: null, basis: 'x', plannedAt: '2026-09-20T21:54:00Z', cloudForecast: 98, capture: null };
  const cloudy = await render({ ...base, decided });
  expect(cloudy).toContain('Cloud is forecast over the 70% limit.');
  expect(cloudy).toContain('If it holds at 01:54, the night is lost and Pleiades is carried to the next night, if it is up — for up to three nights in a row.');
  const clear = await render({ ...base, decided: { ...decided, cloudForecast: 40 } });
  expect(clear).not.toContain('Cloud is forecast over');
});

it('holds the vote for a card carried into the night', async () => {
  const html = await render({ ...base, voting: { ...base.voting, carried: 'TYCHO' } });
  expect(html).toContain('TYCHO takes this night, carried from a night lost to cloud.');
});

it('prints the capture beneath a photographed night', async () => {
  const html = await render({
    ...base,
    decided: {
      designation: 'SATURN', name: 'Saturn', rarity: 'rare', artUrl: null, basis: 'x', plannedAt: null, cloudForecast: null,
      capture: { capturedAt: '2026-09-20T19:02:11Z', nodeId: 'tbilisi-01', provenance: 'instrument', exposureSec: 0.02, subs: 400, opticalTrain: 'barlow2x' },
    },
  });
  expect(html).toContain('19:02 UTC');
  expect(html).toContain('400 × 0.02 s');
  expect(html).not.toContain('commissioning. No photograph');
});
