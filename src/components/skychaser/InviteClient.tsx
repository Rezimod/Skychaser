'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import ShareCard from './ShareCard';
import { usePrivySafe } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';
import type { InviteStats } from '@/lib/skychaser/referral';

const pad = (n: number) => String(n).padStart(3, '0');

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; stats: InviteStats & { url: string } } | { kind: 'error'; message: string };

/**
 * A holder's invitations: the link, who came by it, what it brought. A
 * visitor who is not signed in sees the door instead — closed, when the beta
 * is, with the way through it.
 */
export default function InviteClient({ gated }: { gated: boolean }) {
  const { ready, authenticated, address } = useSkychaserHolder();
  const { login, getAccessToken } = usePrivySafe();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authenticated || !address) {
      setState({ kind: 'idle' });
      return;
    }
    let live = true;
    setState({ kind: 'loading' });
    (async () => {
      const token = await getAccessToken();
      const res = await fetch(`/api/skychaser/invite?wallet=${address}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = (await res.json().catch(() => ({}))) as (InviteStats & { url: string }) | { error?: string };
      if (!live) return;
      if (!res.ok || !('code' in data)) setState({ kind: 'error', message: ('error' in data && data.error) || 'The invitation cannot be read at the moment.' });
      // A 403 at the door is the closed beta, not a fault: the message says what is needed.
      else setState({ kind: 'ready', stats: data });
    })().catch(() => live && setState({ kind: 'error', message: 'The invitation cannot be read at the moment.' }));
    return () => {
      live = false;
    };
  }, [authenticated, address, getAccessToken]);

  if (!ready || !authenticated) {
    return (
      <div className="sd-gate">
        <p className="sd-eyebrow">{gated ? 'Closed beta' : 'Invitations'}</p>
        <p className="sd-lede">
          {gated
            ? 'Skychaser opens through an invitation link. If you hold one, open it on this device.'
            : 'Every holder has an invitation link. When someone it brings opens their first capsule, one card is the holder’s.'}
        </p>
        <p className="sd-gate__or">{gated ? 'Already a holder' : 'Your link'}</p>
        <div className="sd-pay__actions">
          <button type="button" className="sd-btn sd-btn--primary" onClick={() => login()}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  if (state.kind === 'loading' || state.kind === 'idle') return <p className="sd-note">Reading your invitation.</p>;
  if (state.kind === 'error') return <p className="sd-note">{state.message}</p>;

  const { stats } = state;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stats.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="sd-invite">
      <div className="sd-invite__link">
        <p className="sd-eyebrow">Your invitation</p>
        <button type="button" className="sd-invite__url" onClick={copy} aria-label={copied ? 'Link copied' : 'Copy your invitation link'}>
          <span>skychaser.io/invite/{stats.code}</span>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        </button>
        <p className="sd-note">
          Whoever opens it is yours: when they open their first capsule, one common edition goes to your Collection, numbered like any other. Up to {stats.cap} cards.
        </p>
        <ShareCard title="An invitation to Skychaser" text="An invitation to Skychaser: the cosmos, issued in numbered editions. Open it on your phone." url={stats.url} />
      </div>

      <dl className="sd-invite__figures">
        <div>
          <dt>Arrived</dt>
          <dd>{stats.arrived}</dd>
        </div>
        <div>
          <dt>Opened a capsule</dt>
          <dd>{stats.converted}</dd>
        </div>
        <div>
          <dt>Cards received</dt>
          <dd>
            {stats.cards.length}
            <small> / {stats.cap}</small>
          </dd>
        </div>
      </dl>

      {stats.cards.length > 0 && (
        <ul className="sd-invite__cards sd-data">
          {stats.cards.map((c) => (
            <li key={`${c.designation}-${c.editionNumber}`}>
              <Link href={`/edition/${c.designation}/${c.editionNumber}`} className="sd-link">
                {c.name}, No. {pad(c.editionNumber)} of {c.editionSize}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
