// The gem leaderboard sheet, three ways: on a host with no accounts it shows
// only the device's gems; signed out it asks the player to sign in; signed
// in it shows the board with the player's own row picked out. In both
// languages, with the real message files.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import ka from '@/messages/ka.json';
import { GameAccountContext, NO_ACCOUNT, type GameAccount } from '@/game/account';
import { LeaderboardPanel } from '@/components/play/LeaderboardPanel';
import { recordGem } from '@/lib/solar-system/gem-progress';
import { gemLayout } from '@/lib/solar-system/gem-layout';
import { resetGemSyncForTests } from '@/lib/solar-system/gem-sync';

vi.mock('@/components/solar-system/CosmicLoader', () => ({ CosmicSky: () => null }));

const signedIn: GameAccount = {
  available: true, ready: true, authenticated: true, userId: 'did:privy:me', name: 'Me', wallet: null,
  getAccessToken: async () => 'tok', login: () => {},
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
const intlErrors: string[] = [];
let container: HTMLDivElement;
function mount(account: GameAccount, locale: 'en' | 'ka' = 'en') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    const children = createElement(GameAccountContext.Provider, { value: account }, createElement(LeaderboardPanel, { onClose: () => {} }));
    root!.render(createElement(NextIntlClientProvider, { locale, messages: locale === 'en' ? en : ka, onError: (e: Error) => { intlErrors.push(e.message); }, children }));
  });
  return { container };
}
/** Let the effects and the fetches settle until `check` holds. */
async function until(check: () => boolean) {
  for (let i = 0; i < 50 && !check(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(check()).toBe(true);
}
const has = (text: string) => container.textContent?.includes(text) ?? false;
const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === text) ?? null;

const BOARD = {
  available: true, players: 3,
  entries: [
    { rank: 1, name: 'Ana', tag: 'aaaaaa', points: 400, gems: 12, me: false },
    { rank: 2, name: null, tag: 'b1c2d3', points: 120, gems: 4, me: true },
    { rank: 3, name: null, tag: 'ffffff', points: 10, gems: 1, me: false },
  ],
  me: { points: 120, gems: 4, rank: 2, players: 3 },
};

beforeEach(() => {
  localStorage.clear();
  resetGemSyncForTests();
  recordGem('mars', gemLayout('mars')[0].id);
});
afterEach(() => {
  // Every word the sheet shows is in both message files.
  expect(intlErrors).toEqual([]);
  intlErrors.length = 0;
  act(() => root?.unmount()); root = null; container?.remove(); vi.unstubAllGlobals(); });

describe('the leaderboard panel', () => {
  it('with no accounts: the device’s gems and every world, and no board or sign-in', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    mount(NO_ACCOUNT);
    await until(() => has(en.play.leaderboard.localOnly));
    expect(button(en.play.leaderboard.signInAction)).toBeNull();
    expect(has(en.solarSystem.flight.worlds.mars.name)).toBe(true);
    expect(has(en.solarSystem.flight.worlds.moon.name)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signed out: the board, and a sign-in prompt', async () => {
    const login = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...BOARD, entries: BOARD.entries.map((e) => ({ ...e, me: false })), me: null }))));
    mount({ ...NO_ACCOUNT, available: true, login });
    await until(() => has('Ana'));
    const btn = button(en.play.leaderboard.signInAction)!;
    act(() => { btn.click(); });
    expect(login).toHaveBeenCalled();
  });

  it('signed in: the player’s row picked out and their rank, after their gems are reported', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('leaderboard')) return new Response(JSON.stringify(BOARD));
      if (init?.method === 'POST') return new Response(JSON.stringify({ accepted: JSON.parse(String(init.body)).gemIds, points: 120, gems: 4, rank: 2, players: 3 }));
      return new Response(JSON.stringify({ worlds: {}, points: 0, gems: 0, rank: null, players: 3 }));
    }));
    mount(signedIn);
    await until(() => has('Ana') && calls.includes('POST /api/games/explore/gems'));
    const mine = container.querySelector('.game-board__row[data-me]');
    expect(mine?.textContent).toContain(en.play.leaderboard.you);
    expect(container.querySelector('.game-board__rank')?.textContent).toContain('#2');
  });

  it('reads in Georgian', async () => {
    vi.stubGlobal('fetch', vi.fn());
    mount(NO_ACCOUNT, 'ka');
    await until(() => has(ka.play.leaderboard.localOnly));
    expect(has(ka.play.leaderboard.title)).toBe(true);
    expect(has(ka.solarSystem.gems.kinds.diamond)).toBe(true);
  });
});
