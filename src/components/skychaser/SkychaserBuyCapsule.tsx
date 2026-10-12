'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';
import dynamic from 'next/dynamic';
import type { SkychaserOrder } from './SkychaserPay';
import type { Draw } from './SkychaserReveal';
import DataRow from './ui/DataRow';
import { receiptHolds, type Receipt } from '@/lib/skychaser/receipt';

function freshNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kept in this browser, so the receipt outlives the tab. Losing it loses nothing on record. */
function keepReceipt(capsuleId: string, r: Receipt) {
  try {
    localStorage.setItem(`skychaser:receipt:${capsuleId}`, JSON.stringify({ ...r, at: new Date().toISOString() }));
  } catch {
    // Private mode or storage off: the receipt is still shown on the page.
  }
}

const SkychaserPay = dynamic(() => import('./SkychaserPay'), { ssr: false });
const SkychaserReveal = dynamic(() => import('./SkychaserReveal'), { ssr: false });

/** A deployment that rehearses instead of selling. Set at build, not by the page. */
const STEPS = ['Buy', 'Pay', 'Open'] as const;

/**
 * Buying and opening one capsule, as one run: reserve, pay, and the capsule
 * cracks open by itself the moment the payment is confirmed.
 *
 * The nonce is drawn here, in the buyer's own browser, and sent with the
 * commitment they can see published. Nobody can choose the outcome: the
 * secret was committed to before the sale, the nonce after it, and the draws
 * are mixed with the hash of the block the payment lands in, which no one
 * knows until it exists. The receipt — the purchase message and its hash —
 * stays one press away.
 */
export default function SkychaserBuyCapsule({
  capsuleId,
  sequence,
  commitment,
  priceUsd,
  cardsPerCapsule,
  onClose,
}: {
  capsuleId: string;
  sequence: number;
  commitment: string;
  priceUsd: number;
  cardsPerCapsule: number;
  /** Passed on to the reveal: where closing it goes, instead of leaving the cards in the page. */
  onClose?: () => void;
}) {
  const { getAccessToken, login } = usePrivy();
  const { authenticated, ready, address } = useSkychaserHolder();
  const [order, setOrder] = useState<SkychaserOrder | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [paid, setPaid] = useState(false);
  const [cards, setCards] = useState<Draw | null>(null);
  const [launchNow, setLaunchNow] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  /** The set could not fill the capsule: it is withdrawn and refunded, so there is nothing to retry. */
  const [withdrawn, setWithdrawn] = useState(false);

  const post = async (path: string, body: unknown) => {
    const token = await getAccessToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  };

  const open = async () => {
    setBusy('Opening your capsule');
    setError('');
    try {
      const { res, data } = await post('/api/skychaser/capsules/open', { capsuleId });
      if (!res.ok) {
        if (data.refundDue) setWithdrawn(true);
        setError(data.error ?? 'The capsule could not be opened.');
        return;
      }
      setCards({
        sequence: data.sequence as number,
        secret: String(data.secret ?? ''),
        nonce: String(data.nonce ?? ''),
        cards: data.cards as Draw['cards'],
      });
    } catch {
      setError('The capsule could not be opened. Try again in a moment.');
    } finally {
      setBusy('');
    }
  };

  // Buy & detonate is one press: once it is paid the star goes at once, with no second button.
  const confirmed = () => {
    setPaid(true);
    setLaunchNow(true);
    void open();
  };

  const reserve = async () => {
    if (!address) {
      setError('This account has no Solana wallet yet.');
      return;
    }
    setBusy('Reserving');
    setError('');
    try {
      const nonce = freshNonce();
      const { res, data } = await post('/api/skychaser/capsules/buy', { walletAddress: address, capsuleId, commitment, nonce });
      if (!res.ok) {
        setError(data.error ?? 'The capsule could not be reserved.');
        return;
      }
      const got: Receipt = { nonce, purchaseHash: String(data.purchaseHash ?? ''), purchaseMessage: String(data.purchaseMessage ?? '') };
      if (!(await receiptHolds(got, capsuleId, commitment))) {
        setError('The receipt for this capsule does not match the nonce drawn here. Do not pay; the capsule will go back on sale.');
        return;
      }
      setReceipt(got);
      keepReceipt(capsuleId, got);
      setOrder(data as SkychaserOrder);
    } catch {
      setError('The capsule could not be reserved. Try again in a moment.');
    } finally {
      setBusy('');
    }
  };

  if (cards) {
    return (
      <div className="sd-buyflow">
        <SkychaserReveal draw={cards} onClose={onClose} autoLaunch={launchNow} />
        {!onClose && (
          <p className="sd-pay__actions">
            <Link href={`/capsule/${capsuleId}`} className="sd-btn">
              Public record
            </Link>
          </p>
        )}
      </div>
    );
  }

  const step = paid ? 2 : order ? 1 : 0;

  return (
    <div className="sd-buyflow">
      <ol className="sd-steps" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'is-done' : i === step ? 'is-now' : undefined} aria-current={i === step ? 'step' : undefined}>
            <span className="sd-steps__dot">
              {i < step ? (
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            {s}
          </li>
        ))}
      </ol>

      {withdrawn ? null : paid ? (
        <button
          type="button"
          className={`sd-btn sd-btn--primary sd-btn--block${busy ? ' is-loading' : ''}`}
          onClick={() => {
            setLaunchNow(true);
            void open();
          }}
          disabled={!!busy}
        >
          {busy ? <Working label={busy} /> : 'Detonate the star'}
        </button>
      ) : order ? (
        <SkychaserPay order={order} onConfirmed={confirmed} compact />
      ) : ready && authenticated ? (
        <button type="button" className={`sd-btn sd-btn--primary sd-btn--block${busy ? ' is-loading' : ''}`} onClick={reserve} disabled={!!busy}>
          {busy ? <Working label={busy} /> : `Buy & detonate — $${priceUsd}`}
        </button>
      ) : (
        <button type="button" className="sd-btn sd-btn--primary sd-btn--block" onClick={() => login()}>
          Log in to buy — ${priceUsd}
        </button>
      )}

      {!order && !paid && (
        <p className="sd-buyflow__note">
          {cardsPerCapsule === 1 ? 'One card' : `${cardsPerCapsule} cards`} · ready to ignite the moment it is paid
        </p>
      )}
      {error && (
        <p className="sd-buyflow__error" role="alert">
          {error}
        </p>
      )}

      {receipt && (
        <details className="sd-receipt">
          <summary>Receipt — keep it</summary>
          <DataRow
            layout="stacked"
            items={[
              { label: 'Capsule', value: String(sequence) },
              { label: 'Commitment', value: commitment },
              { label: 'Your nonce', value: receipt.nonce },
              { label: 'Purchase hash', value: receipt.purchaseHash },
            ]}
          />
          <p className="sd-note">
            This capsule is yours. Its{' '}
            <Link href={`/capsule/${capsuleId}`} className="sd-link">
              public record
            </Link>{' '}
            is the way back to it if this page is closed.
          </p>
        </details>
      )}
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <>
      <span className="sd-spin" aria-hidden="true" />
      {label}
    </>
  );
}
