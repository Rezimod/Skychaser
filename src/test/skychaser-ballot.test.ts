import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/components/skychaser/usePrivySafe', () => ({
  usePrivySafe: () => ({ getAccessToken: getToken, login: vi.fn() }),
}));
vi.mock('@/components/skychaser/useSkychaserHolder', () => ({
  useSkychaserHolder: () => ({ ready: true, authenticated: true, address: 'WALLET' }),
}));
const getToken = vi.fn(async () => 'token');
import SkychaserBallot from '@/components/skychaser/SkychaserBallot';

const candidates = [
  { designation: 'SATURN', name: 'Saturn', rarity: 'legendary', when: '41° at 23:15', votes: 6 },
  { designation: 'M31', name: 'Andromeda', rarity: 'rare', when: '60° at 02:10', votes: 2 },
];

function respond(post: () => Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST'
      ? post()
      : new Response(JSON.stringify({ night: '2026-09-20', designation: 'SATURN', cast: 2, weight: 2 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="Vote for ${name}"]`)!;
const count = (name: string) => button(name).closest('li')!.querySelector('.sd-vote__count b')!.textContent;
const status = () => host.querySelector('[role="status"]')!.textContent;
async function mount() {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root.render(createElement(SkychaserBallot, { night: '2026-09-20', candidates })));
}

beforeEach(() => {
  vi.clearAllMocks();
  // The card faces lazy-load their pictures; jsdom has no viewport to watch.
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('moves the vote at once, before the server answers', async () => {
  let answer!: (r: Response) => void;
  respond(() => new Promise((r) => (answer = r)));
  await mount();
  expect(button('Saturn').getAttribute('aria-pressed')).toBe('true');

  await act(async () => {
    button('Andromeda').click();
  });
  expect(button('Andromeda').getAttribute('aria-pressed')).toBe('true');
  expect(count('Saturn')).toBe('4');
  expect(count('Andromeda')).toBe('4');

  await act(async () => answer(new Response(JSON.stringify({ ok: true, weight: 2 }))));
  expect(status()).toBe('Your vote, weight 2, is on Andromeda.');
  expect(count('Andromeda')).toBe('4');
});

it('puts the vote back when it is not recorded', async () => {
  respond(async () => new Response(JSON.stringify({ error: 'Too many requests. Try again in a moment.' }), { status: 429 }));
  await mount();
  await act(async () => {
    button('Andromeda').click();
  });
  expect(button('Saturn').getAttribute('aria-pressed')).toBe('true');
  expect(count('Saturn')).toBe('6');
  expect(count('Andromeda')).toBe('2');
  expect(status()).toBe('Too many requests. Try again in a moment.');
});
