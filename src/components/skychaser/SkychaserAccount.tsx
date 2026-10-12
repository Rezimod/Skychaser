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

/** Ember, gold, ice, blue, violet, rose: the worlds a holder's address can draw. */
const HUES = [16, 36, 192, 218, 266, 336];

/** A hue from the holder's address, so every holder carries their own world. */
function hueOf(address: string | null | undefined): number {
  let h = 0;
  for (const c of address ?? '') h = (h * 31 + c.charCodeAt(0)) % 997;
  return HUES[h % HUES.length];
}

/**
 * The holder's mark: an obsidian disc in a gold rim, with the holder's own
 * world in it, lit from the upper left, a thin orbit, and the brand's red star.
 */
const HolderOrb = ({ address }: { address: string | null | undefined }) => {
  const h = hueOf(address);
  return (
    <svg className="sd-orb" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="sdo-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7e2a8" /><stop offset=".45" stopColor="#b98a3e" /><stop offset=".7" stopColor="#5c3f17" /><stop offset="1" stopColor="#e9c77a" />
        </linearGradient>
        <radialGradient id="sdo-disc" cx=".5" cy=".4" r=".7"><stop offset="0" stopColor="#15131c" /><stop offset="1" stopColor="#050407" /></radialGradient>
        <radialGradient id="sdo-world" cx=".34" cy=".3" r=".85">
          <stop offset="0" stopColor={`hsl(${h} 70% 84%)`} />
          <stop offset=".38" stopColor={`hsl(${h} 52% 54%)`} />
          <stop offset=".78" stopColor={`hsl(${(h + 330) % 360} 50% 22%)`} />
          <stop offset="1" stopColor="#07060a" />
        </radialGradient>
        <radialGradient id="sdo-glow" cx=".5" cy=".5" r=".5"><stop offset=".55" stopColor={`hsl(${h} 60% 58%)`} stopOpacity=".28" /><stop offset="1" stopColor={`hsl(${h} 60% 58%)`} stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#sdo-rim)" />
      <circle cx="32" cy="32" r="30.4" fill="url(#sdo-disc)" />
      <circle cx="12" cy="20" r=".6" fill="#fff" opacity=".7" /><circle cx="50" cy="48" r=".5" fill="#fff" opacity=".5" /><circle cx="17" cy="47" r=".45" fill="#fff" opacity=".45" />
      <circle cx="32" cy="33" r="21" fill="url(#sdo-glow)" />
      <g transform="rotate(-20 32 33)">
        <ellipse cx="32" cy="33" rx="24" ry="6.4" fill="none" stroke="#e9c77a" strokeOpacity=".4" strokeWidth="1" />
      </g>
      <circle cx="32" cy="33" r="15" fill="url(#sdo-world)" />
      <g transform="rotate(-20 32 33)">
        <path d="M 8 33 A 24 6.4 0 0 0 56 33" fill="none" stroke="#f1d58f" strokeOpacity=".9" strokeWidth="1.2" />
      </g>
      <path transform="translate(48 14) scale(3.6)" d="M0 -1C0.09 -0.27 0.27 -0.09 1 0C0.27 0.09 0.09 0.27 0 1C-0.09 0.27 -0.27 0.09 -1 0C-0.27 -0.09 -0.09 -0.27 0 -1Z" fill="#E04A2F" />
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
