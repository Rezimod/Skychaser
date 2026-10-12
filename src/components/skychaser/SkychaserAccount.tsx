'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';

const DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
/** Circle's USDC mint on the cluster the app runs on. */
const USDC_MINT = DEVNET ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL || (DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');

/** A hue from the holder's address, so every holder has their own colour. */
function hueOf(address: string | null | undefined): number {
  let h = 0;
  for (const c of address ?? '') h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** The holder's mark: a plain disc, two tones of the holder's own colour. */
const HolderOrb = ({ address }: { address: string | null | undefined }) => {
  const h = hueOf(address);
  return (
    <svg className="sd-orb" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="sdo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${h} 72% 70%)`} />
          <stop offset="1" stopColor={`hsl(${(h + 48) % 360} 62% 38%)`} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill="url(#sdo-fill)" />
    </svg>
  );
};

/** Two cards, one over the other. */
const CardsGlyph = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <rect x="5" y="2" width="8.5" height="11.5" rx="1.6" />
    <path d="M3.2 5.2v8.2A1.6 1.6 0 0 0 4.8 15h6.4" />
  </svg>
);

/**
 * The account corner: how many cards the holder has, and the holder's mark,
 * which opens the profile: cards, wallet and its USDC balance.
 */
export default function SkychaserAccount() {
  const router = useRouter();
  const { login, logout } = usePrivy();
  const { authenticated, ready, address } = useSkychaserHolder();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cards, setCards] = useState<number | null>(null);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!address) return;
    let live = true;
    fetch(`/api/skychaser/holder?wallet=${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setCards(d.cards))
      .catch(() => {});
    fetch(RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner', params: [address, { mint: USDC_MINT }, { encoding: 'jsonParsed' }] }),
    })
      .then((r) => r.json())
      .then((d) => {
        const accounts: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] | undefined = d?.result?.value;
        if (live && Array.isArray(accounts)) setUsdc(accounts.reduce((sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [menuOpen]);

  if (!ready) return <span className="sd-chip sd-chip--cta" aria-hidden="true" style={{ visibility: 'hidden' }}>Log in</span>;

  if (!authenticated) {
    return (
      <>
        <button type="button" className="sd-chip sd-chip--cta" onClick={() => login()}>
          Log in
        </button>
      </>
    );
  }

  const short = address ? `${address.slice(0, 4)}…${address.slice(-4)}` : '—';
  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  const signOut = async () => {
    setMenuOpen(false);
    try {
      await logout();
    } catch {}
    router.push('/');
  };

  return (
    <div ref={wrapRef} className="sd-account">
      <div className="sd-acct">
        <Link href="/collection" className="sd-acct__seg sd-acct__cards" aria-label={cards === null ? 'Your Collection' : `Your Collection, ${cards} cards`}>
          {CardsGlyph}
          {cards !== null && (
            <span className="sd-acct__in">
              <strong>{cards}</strong>
              <span>{cards === 1 ? 'card' : 'cards'}</span>
            </span>
          )}
        </Link>
      </div>
      <button
        ref={triggerRef}
        type="button"
        className="sd-avatar"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="sd-account-menu"
        aria-label="Account"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <HolderOrb address={address} />
      </button>

      {menuOpen && (
        <div id="sd-account-menu" role="menu" className="sd-menu">
          <div className="sd-menu__head">
            <span className="sd-label">Cards held</span>
            <span className="sd-menu__big">
              {cards !== null && (
                <>
                  {cards} <small>cards</small>
                </>
              )}
            </span>
          </div>
          <p className="sd-menu__note">Every card you own is a numbered edition, yours alone.</p>
          <div className="sd-menu__id">
            <span className="sd-label">Wallet</span>
            <code className="sd-menu__short">{short}</code>
          </div>
          {usdc !== null && (
            <div className="sd-menu__id sd-menu__bal">
              <span className="sd-label">Balance</span>
              <span className="sd-menu__usdc">
                <i className={usdc ? 'is-funded' : ''} aria-hidden="true" />
                {usdc.toFixed(2)} <small>USDC</small>
              </span>
            </div>
          )}
          {address && (
            <div className="sd-menu__topup">
              {topUp ? (
                <>
                  <div className="sd-menu__qr">
                    <QRCodeSVG value={`solana:${address}`} size={148} bgColor="#ffffff" fgColor="#0b0810" level="M" />
                  </div>
                  <p className="sd-menu__addr">{address}</p>
                  <p className="sd-menu__note">Send SOL on Solana{DEVNET ? ' devnet' : ''} to this address from an exchange or another wallet.</p>
                  <div className="sd-menu__pair">
                    <button type="button" className="sd-menu__btn" onClick={copy}>
                      {copied ? 'Copied' : 'Copy address'}
                    </button>
                    <button type="button" className="sd-menu__btn sd-menu__btn--quiet" onClick={() => setTopUp(false)}>
                      Done
                    </button>
                  </div>
                </>
              ) : (
                <div className="sd-menu__pair">
                  <button type="button" className="sd-menu__btn" onClick={() => setTopUp(true)}>
                    Top up
                  </button>
                  <button type="button" className="sd-menu__btn sd-menu__btn--quiet" onClick={copy}>
                    {copied ? 'Copied' : 'Copy address'}
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="sd-menu__rule" />
          <Link role="menuitem" href="/collection" onClick={() => setMenuOpen(false)}>
            Your Collection <span aria-hidden="true">{short}</span>
          </Link>
          <Link role="menuitem" href="/vote" onClick={() => setMenuOpen(false)}>
            This week’s vote <span aria-hidden="true">→</span>
          </Link>
          <button role="menuitem" type="button" onClick={signOut}>
            Log out <span aria-hidden="true">⎋</span>
          </button>
          {address && (
            <a role="menuitem" className="sd-menu__chain" href={`https://solscan.io/account/${address}${DEVNET ? '?cluster=devnet' : ''}`} target="_blank" rel="noreferrer">
              View on-chain record <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
