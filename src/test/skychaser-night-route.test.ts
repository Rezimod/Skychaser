// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ runNight: vi.fn(), chosen: vi.fn(), photographed: vi.fn(), select: vi.fn() }));
process.env.CRON_SECRET = 'cron';
vi.mock('@/lib/db', () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock('@/lib/skychaser/night', async (actual) => ({ ...(await actual<typeof import('@/lib/skychaser/night')>()), runNight: mocks.runNight }));
vi.mock('@/lib/skychaser/notify', () => ({ notifyWeekChosen: mocks.chosen, notifyPhotographed: mocks.photographed, notifyConfigured: () => true }));
import { GET as night } from '@/app/api/cron/skychaser-night/route';

const get = () => night(new NextRequest('http://localhost/api/cron/skychaser-night', { headers: { authorization: 'Bearer cron' } }));
const cardRow = (id: string) => [{ id, designation: id.toUpperCase(), name: id }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where']) chain[m] = () => chain;
    chain.limit = async () => cardRow('saturn');
    return chain;
  });
  mocks.chosen.mockResolvedValue(1);
  mocks.photographed.mockResolvedValue(1);
});

it('tells the holders when the week’s card is chosen, and when last night’s was photographed', async () => {
  mocks.runNight.mockResolvedValue({
    night: '2026-10-22',
    last: { nightDate: '2026-10-21', cardId: 'saturn', captureId: 'cap-1', lostAt: null },
    decided: { nightDate: '2026-10-22', cardId: 'saturn', decisionBasis: 'SATURN: the votes' },
    fresh: true,
  });
  const res = await get();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, night: '2026-10-22', notices: { chosen: 1, photographed: 1 } });
  expect(mocks.chosen).toHaveBeenCalledWith(expect.anything(), { card: { id: 'saturn', designation: 'SATURN', name: 'saturn' }, week: '2026-10-19', night: '2026-10-22' });
  expect(mocks.photographed).toHaveBeenCalledWith(expect.anything(), { card: { id: 'saturn', designation: 'SATURN', name: 'saturn' }, night: '2026-10-21' });
});

it('says nothing on a night already planned, or lost to cloud', async () => {
  mocks.runNight.mockResolvedValue({ night: '2026-10-22', last: { nightDate: '2026-10-21', cardId: 'saturn', captureId: null, lostAt: new Date() }, decided: { cardId: 'saturn', decisionBasis: 'kept' }, fresh: false });
  expect((await get()).status).toBe(200);
  expect(mocks.chosen).not.toHaveBeenCalled();
  expect(mocks.photographed).not.toHaveBeenCalled();
});

it('still answers when a notice fails', async () => {
  mocks.runNight.mockResolvedValue({ night: '2026-10-22', last: null, decided: { cardId: 'saturn', decisionBasis: 'x' }, fresh: true });
  mocks.chosen.mockRejectedValueOnce(new Error('resend down'));
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const res = await get();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, notices: { chosen: 0, photographed: 0 } });
  spy.mockRestore();
});
