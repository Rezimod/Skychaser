'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useSkychaserSession } from './SkychaserAuth';
import { usePrivySafe } from './usePrivySafe';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildTransfer } from '@/lib/skychaser/transfer';
import { simulatedPayments } from '@/lib/skychaser/rehearsal';
import Caption from './ui/Caption';
import DataRow from './ui/DataRow';

export type SkychaserOrder = {
  orderId: string;
  url: string;
  amountSol: number;
  amountFiat: number;
  currency: string;
  expiresAt: string | null;
};

export type Confirmation = {
  confirmed: boolean;
  capsuleId?: string | null;
  edition?: { designation: string; editionNumber: number; editionSize: number };
  error?: string;
};

function minutesLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60_000));
}

/** A deployment that rehearses instead of selling. Set at build, not by the page. */
const REHEARSAL = simulatedPayments();
const DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL || (DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}${DEVNET ? '?cluster=devnet' : ''}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The network fee for one signature, and what a wallet must keep to stay open (rent-exempt minimum). */
const FEE_LAMPORTS = 5_000;
const KEEP_LAMPORTS = 890_880;
/** Confirmations are limited to 10 a minute per account: one every 7 s, for about three minutes. */
const POLL_EVERY_MS = 7_000;
const POLL_TIMES = 26;

const sol = (lamports: bigint | number) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);

type CheckResult = 'confirmed' | 'pending' | 'closed' | 'limited' | 'failed';

/**
 * One Solana Pay order, waiting to be paid: the request as a code and as a
 * link, the quote it stands on, and a check that asks the chain whether the
 * transfer arrived. The quote expires; a payment made after it does is
 * recorded as a refund due rather than dropped.
 *
 * On a rehearsal deployment there is no code and no wallet: the order settles
 * on the button, nothing is charged, and the page says so before it is
 * pressed. The capsule behind it is real, and so is everything after.
 */
export default function SkychaserPay({
  order,
  onConfirmed,
  compact = false,
}: {
  order: SkychaserOrder;
  onConfirmed: (c: Confirmation) => void;
  /** One screen: the pay button first, the code and the rest beside it, small. */
  compact?: boolean;
}) {
  const { getAccessToken } = usePrivySafe();
  const wallets = useSkychaserSession().state?.wallets ?? [];
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  /** A send that failed in a way that may still have broadcast: no second payment until the chain has been asked. */
  const [unsure, setUnsure] = useState(false);
  const [shortOf, setShortOf] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(minutesLeft(order.expiresAt));

  useEffect(() => {
    setLeft(minutesLeft(order.expiresAt));
    const t = setInterval(() => setLeft(minutesLeft(order.expiresAt)), 30_000);
    return () => clearInterval(t);
  }, [order.expiresAt]);

  /**
   * Asks the server whether the transfer arrived. Quiet while polling, except
   * for what ends the wait: the order closed (late, refunded, sold out).
   */
  const check = async (quiet = false): Promise<CheckResult> => {
    setChecking(true);
    if (!quiet) setNote('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/skychaser/orders/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ orderId: order.orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as Confirmation & { status?: string };
      if (data.confirmed) {
        setUnsure(false);
        onConfirmed(data);
        return 'confirmed';
      }
      if (res.status === 429) {
        if (!quiet) setNote('Checked too often. Try again in a minute.');
        return 'limited';
      }
      if (res.status === 409) {
        setUnsure(false);
        setNote(data.error ?? 'This order is closed.');
        return 'closed';
      }
      if (!quiet) setNote(data.error ?? 'No transfer has arrived yet.');
      return 'pending';
    } catch {
      if (!quiet) setNote('The check could not be made. Try again in a moment.');
      return 'failed';
    } finally {
      setChecking(false);
    }
  };

  /** Waits for the server to see the transfer, within the confirmation limit; stops when the order closes. */
  const awaitConfirmation = async () => {
    for (let i = 0; i < POLL_TIMES; i++) {
      await wait(POLL_EVERY_MS);
      const r = await check(true);
      if (r === 'confirmed' || r === 'closed') return;
      if (r === 'limited') await wait(60_000);
    }
    setNote('Sent, but not confirmed yet. Press “I have paid” in a moment.');
  };

  const wallet = wallets[0];

  /** The same transfer the code asks for, signed by the holder's own wallet and sent from here. */
  const payFromWallet = async () => {
    if (!wallet) {
      setNote('No wallet is connected to this account yet.');
      return;
    }
    setPaying(true);
    setNote('');
    setShortOf(null);
    let signing = false;
    try {
      const sender = new PublicKey(wallet.address);
      const connection = new Connection(RPC, 'confirmed');
      const [{ blockhash }, balance] = await Promise.all([connection.getLatestBlockhash('confirmed'), connection.getBalance(sender, 'confirmed')]);
      const { tx, lamports } = buildTransfer(order.url, sender, blockhash);
      const need = lamports + BigInt(FEE_LAMPORTS + KEEP_LAMPORTS);
      if (BigInt(balance) < need) {
        setShortOf(sol(need));
        setNote(`This wallet holds ${sol(balance)} SOL. The capsule, its fee and the wallet's reserve need ${sol(need)} SOL.`);
        return;
      }
      signing = true;
      const { signature } = await wallet.signAndSendTransaction({
        transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        chain: DEVNET ? 'solana:devnet' : 'solana:mainnet',
      });
      setSent(bs58.encode(signature));
      setNote('Sent. Waiting for the network to confirm it — this takes about half a minute.');
      await awaitConfirmation();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (signing && !/reject|denied|cancel/i.test(msg)) {
        // The wallet may have broadcast before it failed: never offer a second payment until the chain says.
        setUnsure(true);
        setNote('The wallet did not say whether the transfer went out. Checking before you try again.');
        await wait(POLL_EVERY_MS);
        const r = await check(true);
        if (r === 'pending' || r === 'failed' || r === 'limited') {
          setNote('Not seen on the network yet. If your wallet shows the transfer, press “I have paid” in a minute; otherwise try again.');
        }
        return;
      }
      setNote(/insufficient|balance/i.test(msg) ? 'This wallet has too little SOL for the transfer and its fee.' : msg || 'The transfer was not sent.');
    } finally {
      setPaying(false);
    }
  };

  /** Lets a payment be tried again once a check has found nothing. */
  const retryAfterUnsure = async () => {
    const r = await check();
    if (r !== 'confirmed' && r !== 'closed') setUnsure(false);
  };

  /** Devnet only: 1 test SOL from the network's faucet, which has no value. */
  const airdrop = async () => {
    if (!wallet) return;
    setPaying(true);
    setNote('');
    try {
      const connection = new Connection(RPC, 'confirmed');
      const sig = await connection.requestAirdrop(new PublicKey(wallet.address), LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
      setNote('1 test SOL arrived.');
    } catch {
      setNote('The devnet faucet refused, as it often does. Use faucet.solana.com with the address below.');
    } finally {
      setPaying(false);
    }
  };

  const payLabel = paying ? 'Sending' : sent ? 'Sent' : left === 0 ? 'Quote expired' : `Pay ${order.amountSol.toFixed(4)} SOL`;
  const paidPressed = () => (unsure ? retryAfterUnsure() : check());

  if (compact) {
    const quote = left === null ? null : left > 0 ? `quote ${left} min` : 'quote expired';
    return (
      <div className="sd-pay sd-pay--compact">
        {!REHEARSAL && (
          <div className="sd-pay__code">
            <QRCodeSVG value={order.url} size={104} bgColor="#ffffff" fgColor="#1d0b05" level="M" />
          </div>
        )}
        <div className="sd-pay__side">
          <p className="sd-pay__sum">
            <strong>{REHEARSAL ? 'Not charged' : `${order.amountSol.toFixed(4)} SOL`}</strong>
            <span>
              {order.amountFiat} {order.currency}
              {quote && ` · ${quote}`}
            </span>
          </p>
          {REHEARSAL ? (
            <button type="button" className={`sd-btn sd-btn--primary sd-btn--block${checking ? ' is-loading' : ''}`} onClick={() => check()} disabled={checking}>
              {checking ? 'Settling' : 'Settle & open'}
            </button>
          ) : (
            <button
              type="button"
              className={`sd-btn sd-btn--primary sd-btn--block${paying ? ' is-loading' : ''}`}
              onClick={payFromWallet}
              disabled={paying || !wallet || !!sent || unsure || left === 0}
            >
              {payLabel}
            </button>
          )}
          {!REHEARSAL && (
            <div className="sd-pay__minor">
              {!sent && left !== 0 && <a href={order.url}>Other wallet</a>}
              <button type="button" onClick={paidPressed} disabled={checking}>
                {checking ? 'Checking' : 'I have paid'}
              </button>
              {DEVNET && (
                <button type="button" onClick={airdrop} disabled={paying || !wallet}>
                  Get test SOL
                </button>
              )}
            </div>
          )}
        </div>
        {shortOf && wallet && <FundHint address={wallet.address} need={shortOf} />}
        {(note || sent) && (
          <p className="sd-pay__note">
            {note}{' '}
            {sent && (
              <a className="sd-link" href={explorer(sent)} target="_blank" rel="noopener noreferrer">
                View transaction
              </a>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="sd-pay">
      {REHEARSAL ? (
        <div className="sd-pay__rehearsal">
          <p className="sd-label">Rehearsal</p>
          <p className="sd-blurb">
            Nothing is charged. This capsule, its sealed outcome and the editions it draws are real — only the
            payment is stood in for, and the log records that it was.
          </p>
        </div>
      ) : (
        <div className="sd-pay__code">
          <QRCodeSVG value={order.url} size={168} bgColor="#ffffff" fgColor="#1d0b05" level="M" />
        </div>
      )}
      <div className="sd-pay__side">
        <DataRow
          layout="stacked"
          items={[
            { label: 'Price', value: `${order.amountFiat} ${order.currency}` },
            { label: 'Amount', value: REHEARSAL ? 'Not charged' : `${order.amountSol.toFixed(4)} SOL` },
            { label: 'Quote', value: left === null ? 'Open' : left > 0 ? `${left} min left` : 'Expired' },
          ]}
        />
        <div className="sd-pay__actions">
          {REHEARSAL ? (
            <button type="button" className={`sd-btn sd-btn--primary${checking ? ' is-loading' : ''}`} onClick={() => check()} disabled={checking}>
              {checking ? 'Settling' : 'Settle without paying'}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={`sd-btn sd-btn--primary${paying ? ' is-loading' : ''}`}
                onClick={payFromWallet}
                disabled={paying || !wallet || !!sent || unsure || left === 0}
              >
                {payLabel}
              </button>
              {!sent && left !== 0 && (
                <a className="sd-btn" href={order.url}>
                  Other wallet
                </a>
              )}
              <button type="button" className={`sd-btn${checking ? ' is-loading' : ''}`} onClick={paidPressed} disabled={checking}>
                {checking ? 'Checking the chain' : 'I have paid'}
              </button>
              {DEVNET && (
                <button type="button" className="sd-btn" onClick={airdrop} disabled={paying || !wallet}>
                  Get 1 test SOL
                </button>
              )}
            </>
          )}
        </div>
        {shortOf && wallet && <FundHint address={wallet.address} need={shortOf} />}
        {note && <p className="sd-data">{note}</p>}
        {sent && (
          <a className="sd-link sd-data" href={explorer(sent)} target="_blank" rel="noopener noreferrer">
            Transaction {sent.slice(0, 10)}… on the explorer
          </a>
        )}
        {DEVNET && wallet && <p className="sd-data">Wallet {wallet.address}</p>}
        <Caption as="p" parts={[REHEARSAL ? 'No payment taken' : DEVNET ? 'Solana devnet · test SOL' : 'Solana Pay', `Order ${order.orderId.slice(0, 8)}`]} />
      </div>
    </div>
  );
}

/** Where to send SOL when the wallet holds too little: its address, copyable, on any cluster. */
function FundHint({ address, need }: { address: string; need: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="sd-pay__fund">
      <p className="sd-data">
        Send at least {need} SOL to this wallet from an exchange or another wallet, then press Pay again:
      </p>
      <p className="sd-data">
        <code>{address}</code>{' '}
        <button type="button" className="sd-link" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </p>
    </div>
  );
}
