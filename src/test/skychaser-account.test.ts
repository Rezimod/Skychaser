import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/components/skychaser/usePrivySafe', () => ({ usePrivySafe: () => ({ login: () => {}, logout: async () => {}, getAccessToken: async () => 'token' }) }));
vi.mock('@/components/skychaser/useSkychaserHolder', () => ({
  useSkychaserHolder: () => ({ ready: true, authenticated: true, address: 'So1anaWa11etAddre55xxxxxxxxxxxxxxxxxxxxxxx' }),
}));
import SkychaserAccount from '@/components/skychaser/SkychaserAccount';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

it('keeps balances out of the header and shows USDC in the profile, behind the holder’s mark', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (String(url).startsWith('/api/skychaser/holder') ? { cards: 24 } : String(url).startsWith('/api/skychaser/booking/mine') ? { balance: 36, bookings: [], editions: [] } : { result: { value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: 12.5 } } } } } }] } }),
  })));
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(SkychaserAccount)));
  await act(async () => {});
  expect(host.querySelector('.sd-acct')?.textContent).toContain('24');
  expect(host.querySelector('.sd-acct')?.textContent).not.toMatch(/SOL|USDC/);
  expect(host.querySelector('.sd-avatar .sd-orb')).not.toBeNull();
  await act(async () => (host.querySelector('.sd-avatar') as HTMLButtonElement).click());
  expect(host.querySelector('.sd-menu__usdc')?.textContent).toContain('36');
  expect(host.querySelectorAll('.sd-menu__usdc')[1]?.textContent).toContain('12.50');
  expect(host.querySelectorAll('.sd-menu__usdc')[1]?.textContent).toContain('USDC');
  await act(async () => root.unmount());
  host.remove();
});
