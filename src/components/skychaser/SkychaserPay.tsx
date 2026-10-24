'use client';

import { useEffect, useRef, useState } from 'react';
import { useSkychaserSession, type FundWallet, type SolanaWallets } from './SkychaserAuth';
import { usePrivySafe } from './usePrivySafe';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { buildTransfer } from '@/lib/skychaser/transfer';
import Caption from './ui/Caption';

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

/** Pay is offered until a minute before the quote lapses, so the wallet has time to sign inside it. */
const PAY_CUTOFF_MS = 60_000;
const payUntil = (expiresAt: string | null) => (expiresAt ? new Date(expiresAt).getTime() - PAY_CUTOFF_MS : null);

function minutesLeft(expiresAt: string | null): number | null {
  const until = payUntil(expiresAt);
  if (until === null) return null;
  return Math.max(0, Math.ceil((until - Date.now()) / 60_000));
}

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
 * One Solana Pay order, waiting to be paid from a connected wallet: the
 * quote it stands on, the wallet it is paid from, and a check that asks the
 * chain whether the transfer arrived. The quote expires; a payment made after it does is
 * recorded as a refund due rather than dropped.
 */
export default function SkychaserPay({
  order,
  onConfirmed,
  compact = false,
  autoPay = false,
  onExpired,
}: {
  order: SkychaserOrder;
  onConfirmed: (c: Confirmation) => void;
  /** Tighter spacing, for the capsule sheet. */
  compact?: boolean;
  /** Asks the wallet to sign as soon as the order is shown: the Buy press was the only one needed. */
  autoPay?: boolean;
  /** When given, an expired quote offers a fresh one instead of a dead button. */
  onExpired?: () => void;
}) {
  const { getAccessToken } = usePrivySafe();
  const session = useSkychaserSession().state;
  const wallets = session?.wallets ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  /** A send that failed in a way that may still have broadcast: no second payment until the chain has been asked. */
  const [unsure, setUnsure] = useState(false);
  const [shortOf, setShortOf] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(minutesLeft(order.expiresAt));
  /** The unsure send's blockhash: until the chain is past it, that transfer can still land. */
  const unsureUntil = useRef<{ connection: Connection; lastValidBlockHeight: number } | null>(null);

  useEffect(() => {
    setLeft(minutesLeft(order.expiresAt));
    const t = setInterval(() => setLeft(minutesLeft(order.expiresAt)), 5_000);
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
    setNote('Sent, but not confirmed yet. Press “Check payment” in a moment.');
  };

  // A wallet the holder connected (Phantom, Solflare…) is the one they mean to pay from; otherwise the account's own wallet.
  const wallet = wallets.find((w) => w.address === chosen) ?? wallets.find((w) => !isEmbedded(w)) ?? wallets.find(isEmbedded);
  const choose = (address: string) => {
    setChosen(address);
    setNote('');
    setShortOf(null);
  };
  const connect = () => session?.privy.connectWallet();

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
      const [{ blockhash, lastValidBlockHeight }, balance] = await Promise.all([connection.getLatestBlockhash('confirmed'), connection.getBalance(sender, 'confirmed')]);
      unsureUntil.current = { connection, lastValidBlockHeight };
      const { tx, lamports } = buildTransfer(order.url, sender, blockhash);
      const need = lamports + BigInt(FEE_LAMPORTS + KEEP_LAMPORTS);
      if (BigInt(balance) < need) {
        setShortOf(sol(need));
        setNote(`This wallet holds ${sol(balance)} SOL. The purchase, its fee and the wallet's reserve need ${sol(need)} SOL.`);
        return;
      }
      const until = payUntil(order.expiresAt);
      if (until !== null && Date.now() >= until) {
        setLeft(0);
        setNote('This price has run out. Get a new one to pay.');
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
        await settleUnsure();
        return;
      }
      setNote(/insufficient|balance/i.test(msg) ? 'This wallet has too little SOL for the transfer and its fee.' : msg || 'The transfer was not sent.');
    } finally {
      setPaying(false);
    }
  };

  // The Buy press already asked to pay: open the wallet once, as soon as there is one to open.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoPay || autoStarted.current || !wallet || left === 0) return;
    autoStarted.current = true;
    void payFromWallet();
    // payFromWallet reads the current wallet; it runs once, when the wallet first appears.
  }, [autoPay, wallet, left]);

  /** True once the unsure send's blockhash has expired: it can no longer land. */
  const unsureSendDead = async () => {
    const u = unsureUntil.current;
    if (!u) return true;
    const height = await u.connection.getBlockHeight('confirmed').catch(() => 0);
    return height > u.lastValidBlockHeight;
  };

  /**
   * After a send that may have gone out: keep asking until it is paid, the
   * order closes, or its blockhash has expired and a last check (after the
   * finality the server waits for) still finds nothing. Only then may Pay be pressed again.
   */
  const settleUnsure = async () => {
    for (let i = 0; i < POLL_TIMES; i++) {
      await wait(POLL_EVERY_MS);
      const r = await check(true);
      if (r === 'confirmed' || r === 'closed') return;
      if (r === 'limited') await wait(60_000);
      if (await unsureSendDead()) {
        await wait(15_000);
        const last = await check(true);
        if (last === 'confirmed' || last === 'closed') return;
        if (last !== 'pending') break;
        setUnsure(false);
        setNote('No transfer went out. You can pay again.');
        return;
      }
    }
    setNote('Not seen on the network yet. If your wallet shows the transfer, press “Check payment” in a minute.');
  };

  /** A check pressed by hand; Pay comes back only once the unsure send can no longer land. */
  const retryAfterUnsure = async () => {
    const r = await check();
    if (r !== 'confirmed' && r !== 'closed' && (await unsureSendDead())) setUnsure(false);
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

  const payLabel = paying ? 'Confirm in your wallet' : sent ? 'Sent' : left === 0 ? 'Quote expired' : `Pay ${order.amountSol.toFixed(4)} SOL`;
  const paidPressed = () => (unsure ? retryAfterUnsure() : check());
  const quote = left === null ? null : left > 0 ? `Quote holds ${left} min` : 'Quote expired';

  return (
    <div className={`sd-pay${compact ? ' sd-pay--compact' : ''}`}>
      <div className="sd-pay__total">
        <span className="sd-label">Total</span>
        <strong>{order.amountSol.toFixed(4)} SOL</strong>
        <span>
          ≈ {order.amountFiat} {order.currency}
          {quote && ` · ${quote}`}
        </span>
      </div>

      {wallet ? (
        <>
          <WalletSelect
            wallets={wallets}
            current={wallet}
            onChoose={choose}
            onConnect={connect}
            disabled={paying || unsure || !!sent}
          />
          {left === 0 && !sent && !unsure && !paying && onExpired ? (
            <button type="button" className="sd-btn sd-btn--primary sd-btn--block" onClick={onExpired}>
              Get a new price
            </button>
          ) : (
            <button
              type="button"
              className={`sd-btn sd-btn--primary sd-btn--block${paying ? ' is-loading' : ''}`}
              onClick={payFromWallet}
              disabled={paying || !!sent || unsure || left === 0}
            >
              {payLabel}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="sd-pay__wallet">
            <div className="sd-pay__wallet-row">
              <span className="sd-pay__wallet-plus" aria-hidden>{WalletGlyph}</span>
              <span className="sd-pay__wallet-name">
                No wallet connected
                <code>Phantom · Solflare · Backpack</code>
              </span>
            </div>
          </div>
          <button type="button" className="sd-btn sd-btn--primary sd-btn--block sd-pay__connect" onClick={connect} disabled={!session}>
            {WalletGlyph}
            Connect wallet
          </button>
        </>
      )}

      {(sent || unsure || note || DEVNET) && (
        <div className="sd-pay__minor">
          {(sent || unsure) && (
            <button type="button" onClick={paidPressed} disabled={checking}>
              {checking ? 'Checking the chain' : 'Check payment'}
            </button>
          )}
          {DEVNET && wallet && (
            <button type="button" onClick={airdrop} disabled={paying}>
              Get 1 test SOL
            </button>
          )}
        </div>
      )}
      {shortOf && wallet && (
        <FundHint
          address={wallet.address}
          need={shortOf}
          fund={session?.fundWallet ?? null}
          onFunded={() => {
            setShortOf(null);
            setNote('When the SOL arrives, press Pay again. It can take a few minutes.');
          }}
        />
      )}
      {(note || sent) && (
        <p className="sd-pay__note" role="status">
          {note}{' '}
          {sent && (
            <a className="sd-link" href={explorer(sent)} target="_blank" rel="noopener noreferrer">
              View transaction
            </a>
          )}
        </p>
      )}
      {!compact && (
        <Caption as="p" parts={[DEVNET ? 'Solana devnet · test SOL' : 'Paid on Solana', `Order ${order.orderId.slice(0, 8)}`]} />
      )}
    </div>
  );
}

/** A wallet: a folded case with its clasp. */
const WalletGlyph = (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H15v2.5" />
    <rect x="3" y="6.5" width="14" height="10" rx="2" />
    <path d="M17 10h-3a1.5 1.5 0 0 0 0 3h3" />
  </svg>
);

const isEmbedded = (w: { standardWallet: { name: string } }) => /privy/i.test(w.standardWallet.name);
const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The wallet this order is paid from, and a menu to switch to another or connect Phantom, Solflare, Backpack… */
function WalletSelect({
  wallets,
  current,
  onChoose,
  onConnect,
  disabled,
}: {
  wallets: SolanaWallets;
  current: SolanaWallets[number];
  onChoose: (address: string) => void;
  onConnect: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const others = wallets.filter((w) => w.address !== current.address);
  return (
    <div className="sd-pay__wallet">
      <div className="sd-pay__wallet-row">
        <WalletIcon wallet={current} />
        <span className="sd-pay__wallet-name">
          {walletName(current)}
          <code>{short(current.address)}</code>
        </span>
        <button type="button" className="sd-pay__change" onClick={() => setOpen(!open)} disabled={disabled} aria-expanded={open}>
          {open ? 'Close' : 'Change'}
        </button>
      </div>
      {open && !disabled && (
        <div className="sd-pay__wallet-list" role="group" aria-label="Pay from">
          {others.map((w) => (
            <button
              key={w.address}
              type="button"
              onClick={() => {
                onChoose(w.address);
                setOpen(false);
              }}
            >
              <WalletIcon wallet={w} />
              <span>{walletName(w)}</span>
              <code>{short(w.address)}</code>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onConnect();
            }}
          >
            <span className="sd-pay__wallet-plus" aria-hidden>+</span>
            <span>Connect another wallet</span>
          </button>
        </div>
      )}
    </div>
  );
}

const walletName = (w: SolanaWallets[number]) => (isEmbedded(w) ? 'Skychaser wallet' : w.standardWallet.name);

function WalletIcon({ wallet }: { wallet: SolanaWallets[number] }) {
  return wallet.standardWallet.icon && !isEmbedded(wallet) ? (
    <img src={wallet.standardWallet.icon} alt="" width={28} height={28} />
  ) : (
    <span className="sd-pay__wallet-plus" aria-hidden>{walletName(wallet).charAt(0)}</span>
  );
}

/** The wallet is short: Privy's funding flow where the dashboard allows it, and the address to send to either way. */
function FundHint({ address, need, fund, onFunded }: { address: string; need: string; fund: FundWallet | null; onFunded: () => void }) {
  const [copied, setCopied] = useState(false);
  const [opening, setOpening] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const open = async () => {
    if (!fund) return;
    setOpening(true);
    try {
      await fund({ address, amountSol: Number(need) });
      onFunded();
    } catch {
      /* closed, or funding is not enabled for this app */
    } finally {
      setOpening(false);
    }
  };
  return (
    <div className="sd-pay__fund">
      {fund && (
        <button type="button" className={`sd-btn sd-btn--block${opening ? ' is-loading' : ''}`} onClick={open} disabled={opening}>
          {opening ? 'Opening' : `Add ${need} SOL with a card`}
        </button>
      )}
      <p className="sd-data">
        {fund ? 'Or send' : 'Send'} at least {need} SOL to this wallet from an exchange or another wallet, then press Pay again — or connect a wallet that holds SOL above:
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
