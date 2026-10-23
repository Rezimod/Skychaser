'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrivySafe } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';
import WelcomePanel from './WelcomePanel';
import type { WelcomeEdition } from '@/lib/skychaser/welcome';

const KEY = 'stellar_hello';
/** How long a hello stands before a page says it again. */
const HELLO_TTL_MS = 6 * 60 * 60_000;

const saidRecently = (address: string) => {
  try {
    return Date.now() - Number(localStorage.getItem(`${KEY}:${address}`) ?? 0) < HELLO_TTL_MS;
  } catch {
    return false;
  }
};

const remember = (address: string) => {
  try {
    localStorage.setItem(`${KEY}:${address}`, String(Date.now()));
  } catch {}
};

/**
 * Says hello once a holder is signed in: the server brings the account's row
 * up to date and gives the first card if it has not been. A fresh card is
 * shown; one given earlier is not mentioned again.
 */
export default function SkychaserHello() {
  const { authenticated, address } = useSkychaserHolder();
  const { getAccessToken } = usePrivySafe();
  const [welcome, setWelcome] = useState<{ edition: WelcomeEdition; wallet: string } | null>(null);
  const inFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated || !address || saidRecently(address) || inFlight.current === address) return;
    inFlight.current = address;
    let live = true;
    (async () => {
      const token = await getAccessToken();
      if (!token) return;
      const res = await fetch('/api/skychaser/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!res.ok) return;
      remember(address);
      const data = (await res.json()) as { welcome?: { edition: WelcomeEdition | null; fresh: boolean } };
      if (live && data.welcome?.fresh && data.welcome.edition) setWelcome({ edition: data.welcome.edition, wallet: address });
    })()
      .catch(() => {})
      .finally(() => {
        if (inFlight.current === address) inFlight.current = null;
      });
    return () => {
      live = false;
    };
  }, [authenticated, address, getAccessToken]);

  if (!welcome) return null;
  return <WelcomePanel edition={welcome.edition} wallet={welcome.wallet} onClose={() => setWelcome(null)} />;
}
