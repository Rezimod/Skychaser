import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

// The whole console renders here; on a busy machine that outruns the default five seconds.
vi.setConfig({ testTimeout: 20_000 });

// The account chip needs a Privy session and the feed a canvas; this test is about what the console says it is.
vi.mock('@/components/skychaser/SkychaserAccount', () => ({ default: () => null }));
vi.mock('@/components/observatory/LiveView', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/node' }));
import ObservatoryConsole from '@/components/skychaser/observatory/ObservatoryConsole';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it('shows the observatory console live', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(ObservatoryConsole, { tonight: null, nodeCloud: null })));
  const text = host.textContent ?? '';
  expect(host.querySelector('.sdo-pill--live')?.textContent).toContain('Live');
  expect(host.querySelector('.sdo-pill--demo')).toBeNull();
  expect(text).toContain('Live Telescope V1');
  expect(text).not.toContain('Demo');
  expect(host.querySelector('nav a[href="/genesis"]')).not.toBeNull();
  expect(host.querySelector('nav a[href="/collection"]')).not.toBeNull();
  await act(async () => root.unmount());
  host.remove();
});

it('opens Live Telescope V1 and lists the rest as coming soon', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(createElement(ObservatoryConsole, { tonight: null, nodeCloud: null })));
  const open = [...host.querySelectorAll('button.sdo-stn')].map((b) => b.textContent);
  expect(open).toHaveLength(1);
  expect(open[0]).toContain('Live Telescope V1');
  expect(host.querySelectorAll('.sdo-stn.is-next')).toHaveLength(0);
  const soon = host.querySelectorAll('.sdo-stn.is-soon:not(.is-next)');
  expect(soon).toHaveLength(4);
  for (const row of soon) expect(row.textContent).toContain('Coming soon');
  await act(async () => root.unmount());
  host.remove();
});
