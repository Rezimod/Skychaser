'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';
import type { Confirmation, SkychaserOrder } from './SkychaserPay';
import type { Rarity } from '@/lib/rarity';

// Payment and the reveal carry the wallet SDK and the animation; they load when a card is bought.
const SkychaserPay = dynamic(() => import('./SkychaserPay'), { ssr: false });
const SkychaserReveal = dynamic(() => import('./SkychaserReveal'), { ssr: false });

/**
 * Buying one card on its own. The edition number is allocated when the
 * payment is confirmed, so nothing is held back by an order left unpaid.
 */
export default function SkychaserBuyCard({
  designation,
  name,
  rarity,
  priceUsd,
  available,
  released,
}: {
  designation: string;
  name: string;
  rarity: Rarity;
  priceUsd: number;
  available: boolean;
  /** A draft set sells nothing. First Light is draft until it is released. */
  released: boolean;
}) {
  const { getAccessToken, login } = usePrivy();
  const { authenticated, ready, address } = useSkychaserHolder();
  const [order, setOrder] = useState<SkychaserOrder | null>(null);
  const [done, setDone] = useState<Confirmation | null>(null);
  const [error, setError] = useState('');
  const [placing, setPlacing] = useState(false);

  if (!released) {
    return <p className="sd-note">Direct sale opens when Genesis is released. Until then, every card comes out of a capsule.</p>;
  }

  if (!available) {
    return (
      <p className="sd-note">
        No direct edition of {name} right now: the remaining supply is reserved for capsules, or the card is complete.
      </p>
    );
  }

  // Paid: the card comes down the way a capsule's do, on its own.
  if (done?.edition) {
    return (
      <SkychaserReveal
        draw={{
          cards: [
            {
              drawIndex: 0,
              designation: done.edition.designation,
              name,
              rarity,
              editionNumber: done.edition.editionNumber,
              editionSize: done.edition.editionSize,
            },
          ],
        }}
      />
    );
  }

  const place = async () => {
    if (!address) {
      setError('This account has no Solana wallet yet.');
      return;
    }
    setPlacing(true);
    setError('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/skychaser/cards/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ walletAddress: address, designation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'The order could not be placed.');
        return;
      }
      setOrder(data as SkychaserOrder);
    } catch {
      setError('The order could not be placed. Try again in a moment.');
    } finally {
      setPlacing(false);
    }
  };

  // Paid, but no edition could be spared by then: say so, and that it is refunded.
  if (done && !done.edition) {
    return <p className="sd-data">{done.error ?? 'The payment arrived, but no edition could be allocated. It will be refunded.'}</p>;
  }
  if (order) return <SkychaserPay order={order} onConfirmed={setDone} />;

  return (
    <>
      <div className="sd-pay__actions">
        {ready && authenticated ? (
          <button type="button" className={`sd-btn sd-btn--primary${placing ? ' is-loading' : ''}`} onClick={place} disabled={placing}>
            {placing ? 'Placing' : `Buy direct — $${priceUsd}`}
          </button>
        ) : (
          <button type="button" className="sd-btn sd-btn--primary" onClick={() => login()}>
            Log in to buy
          </button>
        )}
      </div>
      {error && <p className="sd-data">{error}</p>}
      {done?.error && <p className="sd-data">{done.error}</p>}
    </>
  );
}
