'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { accentFor, accentInkFor } from './card/CardFront';
import ObjectPhoto from './ObjectPhoto';
import { usePrivySafe as usePrivy } from './usePrivySafe';
import { useSkychaserHolder } from './useSkychaserHolder';

export type BallotCandidate = { designation: string; name: string; rarity: string; when: string; votes: number; type?: string };

type Mine = { designation: string | null; weight: number };

/**
 * The week's ballot. A holder's vote shows at once — their row selected, the
 * counts and bars moved by their weight — and is put back if the vote is not
 * recorded. Casting again for another card moves the vote.
 */
export default function SkychaserBallot({ week, candidates }: { week: string; candidates: BallotCandidate[] }) {
  const { getAccessToken, login } = usePrivy();
  const { authenticated, ready, address } = useSkychaserHolder();
  const [tally, setTally] = useState<Record<string, number>>(() => Object.fromEntries(candidates.map((c) => [c.designation, c.votes])));
  const [mine, setMine] = useState<Mine | null>(null);
  const [power, setPower] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const signedIn = ready && authenticated;
  // Privy may hand a new function each render; the holder's vote is read once per sign-in.
  const token = useRef(getAccessToken);
  const voted = useRef(false);
  useEffect(() => {
    token.current = getAccessToken;
  });

  useEffect(() => {
    if (!signedIn) {
      setMine(null);
      setPower(null);
      return;
    }
    let live = true;
    (async () => {
      try {
        const bearer = await token.current();
        const res = await fetch(`/api/skychaser/votes${address ? `?wallet=${encodeURIComponent(address)}` : ''}`, {
          headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
        });
        if (!res.ok || !live) return;
        const data = (await res.json()) as { week: string; designation: string | null; cast: number; weight: number };
        if (!live || voted.current) return;
        setPower(data.weight);
        if (data.week === week && data.designation) setMine({ designation: data.designation, weight: data.cast });
      } catch {}
    })();
    return () => {
      live = false;
    };
  }, [signedIn, address, week]);

  const moved = (base: Record<string, number>, from: Mine | null, to: string, weight: number) => {
    const next = { ...base };
    if (from?.designation && from.designation in next) next[from.designation] = Math.max(0, next[from.designation] - from.weight);
    next[to] = (next[to] ?? 0) + weight;
    return next;
  };

  const vote = async (c: BallotCandidate) => {
    if (!signedIn) {
      login();
      return;
    }
    if (!address) {
      setNote('This account has no Solana wallet yet.');
      return;
    }
    if (pending || mine?.designation === c.designation) return;

    voted.current = true;
    const before = { tally, mine };
    if (power) {
      setTally(moved(tally, mine, c.designation, power));
      setMine({ designation: c.designation, weight: power });
    }
    setPending(c.designation);
    setNote('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/skychaser/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ walletAddress: address, designation: c.designation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'The vote was not recorded.');
      setTally(moved(before.tally, before.mine, c.designation, data.weight));
      setMine({ designation: c.designation, weight: data.weight });
      setPower(data.weight);
      setNote(`Your vote, weight ${data.weight}, is on ${c.name}.`);
    } catch (err) {
      setTally(before.tally);
      setMine(before.mine);
      setNote(err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'The vote was not recorded. Try again in a moment.');
    } finally {
      setPending(null);
    }
  };

  const cast = candidates.reduce((sum, c) => sum + (tally[c.designation] ?? 0), 0);
  const lead = Math.max(0, ...candidates.map((c) => tally[c.designation] ?? 0));

  return (
    <>
      {signedIn && !!power && (
        <p className="sd-ballot__power">
          Your vote counts <b>×{power}</b>
        </p>
      )}
      <ol className="sd-ballot sd-votes">
        {candidates.map((c) => {
          const votes = tally[c.designation] ?? 0;
          const share = cast ? votes / cast : 0;
          const chosen = mine?.designation === c.designation || pending === c.designation;
          const leading = lead > 0 && votes === lead;
          return (
            <li
              key={c.designation}
              className="sd-vote"
              data-rarity={c.rarity}
              data-mine={chosen || undefined}
              data-lead={leading || undefined}
              aria-busy={pending === c.designation || undefined}
              style={{ '--tile-glow': accentFor(c.designation), '--btn': accentFor(c.designation), '--btn-ink': accentInkFor(c.designation) } as CSSProperties}
            >
              <Link href={`/card/${c.designation}`} className="sd-vote__photo" aria-label={`${c.name}, card page`}>
                <ObjectPhoto designation={c.designation} />
                {leading && <span className="sd-vote__lead">Leading</span>}
              </Link>
              <div className="sd-vote__body">
                <div className="sd-vote__head">
                  <h3 className="sd-vote__name">{c.name}</h3>
                  <span className="sd-rtag" data-rarity={c.rarity}>{c.rarity}</span>
                </div>
                <p className="sd-vote__when">
                  {c.type ? `${c.type} · ` : ''}highest {c.when}
                </p>
                <div className="sd-vote__meta">
                  <span className="sd-vote__count">
                    <b>{votes}</b> {votes === 1 ? 'vote' : 'votes'}
                  </span>
                  <span className="sd-vote__share">{cast ? `${Math.round(share * 100)}%` : '—'}</span>
                </div>
                <span className="sd-vote__bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${share})` }} />
                </span>
                <button
                  type="button"
                  className={`sd-btn sd-vote__btn${chosen ? ' sd-btn--primary' : ''}`}
                  onClick={() => vote(c)}
                  aria-disabled={(Boolean(pending) && !chosen) || undefined}
                  aria-pressed={signedIn ? chosen : undefined}
                  aria-label={signedIn ? `Vote for ${c.name}` : `Log in to vote for ${c.name}`}
                >
                  {chosen ? 'Your vote' : 'Vote'}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="sd-data sd-ballot__note" role="status" aria-live="polite">
        {note}
      </p>
    </>
  );
}
