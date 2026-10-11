'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';

const DEVNET = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
/** Circle's USDC mint on the cluster the app runs on. */
const USDC_MINT = DEVNET ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const RPC = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL || (DEVNET ? 'https://api.devnet.solana.com' : 'https://api.mainnet-beta.solana.com');

/** The holder's helmet, drawn in the round: a white shell lit from above, a gold visor with the Earth in it. */
const Helmet = () => (
  <svg className="sd-helmet" viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <radialGradient id="sdh-sky" cx=".5" cy=".35" r=".75"><stop offset="0" stopColor="#1b2440" /><stop offset="1" stopColor="#05060b" /></radialGradient>
      <radialGradient id="sdh-shell" cx=".36" cy=".26" r=".85"><stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor="#e3e6ec" /><stop offset=".8" stopColor="#9aa2b1" /><stop offset="1" stopColor="#5d6574" /></radialGradient>
      <linearGradient id="sdh-visor" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stopColor="#ffe3a0" /><stop offset=".28" stopColor="#e2a443" /><stop offset=".62" stopColor="#7a4410" /><stop offset="1" stopColor="#1e1006" /></linearGradient>
      <radialGradient id="sdh-earth" cx=".4" cy=".35" r=".7"><stop offset="0" stopColor="#9fd4ff" /><stop offset=".55" stopColor="#2f7fd6" /><stop offset="1" stopColor="#123a7a" /></radialGradient>
      <linearGradient id="sdh-ring" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9ced8" /><stop offset="1" stopColor="#4b525f" /></linearGradient>
      <clipPath id="sdh-vclip"><ellipse cx="32" cy="33" rx="15.5" ry="12.5" /></clipPath>
    </defs>
    <circle cx="32" cy="32" r="32" fill="url(#sdh-sky)" />
    <circle cx="13" cy="14" r=".7" fill="#fff" opacity=".8" /><circle cx="52" cy="11" r=".5" fill="#fff" opacity=".7" /><circle cx="55" cy="44" r=".6" fill="#fff" opacity=".6" />
    <ellipse cx="32" cy="58" rx="20" ry="7" fill="url(#sdh-ring)" />
    <ellipse cx="32" cy="55.5" rx="17" ry="3.2" fill="#2b2f37" />
    <circle cx="32" cy="32" r="22" fill="url(#sdh-shell)" />
    <rect x="12.5" y="24" width="4" height="9" rx="2" fill="#b9c0cc" /><rect x="47.5" y="24" width="4" height="9" rx="2" fill="#8e96a4" />
    <circle cx="20.5" cy="15.5" r="2.2" fill="#fff6d8" /><circle cx="20.5" cy="15.5" r="1.1" fill="#ffd36b" />
    <ellipse cx="32" cy="33" rx="17.2" ry="14.2" fill="#6c7482" />
    <ellipse cx="32" cy="33" rx="15.5" ry="12.5" fill="url(#sdh-visor)" />
    <g clipPath="url(#sdh-vclip)">
      <circle cx="40" cy="44" r="10" fill="url(#sdh-earth)" opacity=".85" />
      <path d="M17 30 C 22 22, 30 20, 38 21" stroke="#fffbe8" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".85" />
      <path d="M19 35 C 22 30, 26 28, 30 27.5" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" opacity=".55" />
      <ellipse cx="32" cy="33" rx="15.5" ry="12.5" fill="none" stroke="#000" strokeOpacity=".45" strokeWidth="3" />
    </g>
    <ellipse cx="25" cy="15" rx="8" ry="3.4" fill="#fff" opacity=".55" transform="rotate(-22 25 15)" />
  </svg>
);

/** Two cards, one over the other. */
const CardsGlyph = (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <rect x="5" y="2" width="8.5" height="11.5" rx="1.6" />
    <path d="M3.2 5.2v8.2A1.6 1.6 0 0 0 4.8 15h6.4" />
  </svg>
);

/**
 * The account corner: how many cards the holder has, and the holder's helmet,
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
        <Helmet />
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
            <button type="button" className="sd-menu__copy" onClick={copy} aria-label="Copy wallet address">
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="sd-menu__addr">{address ?? 'No Solana wallet yet'}</p>
          {usdc !== null && (
            <div className="sd-menu__id sd-menu__bal">
              <span className="sd-label">Balance</span>
              <span className="sd-menu__usdc">
                <i className={usdc ? 'is-funded' : ''} aria-hidden="true" />
                {usdc.toFixed(2)} <small>USDC</small>
              </span>
            </div>
          )}
          <div className="sd-menu__rule" />
          <Link role="menuitem" href="/collection" onClick={() => setMenuOpen(false)}>
            Your Collection <span aria-hidden="true">{short}</span>
          </Link>
          <Link role="menuitem" href="/tonight" onClick={() => setMenuOpen(false)}>
            Tonight’s vote <span aria-hidden="true">→</span>
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
