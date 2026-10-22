'use client';

import { useEffect, useState } from 'react';
import { Gem, Trophy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameAccount } from '@/game/account';
import { GEM_INFO, GEM_KINDS } from '@/lib/solar-system/gem-layout';
import { gemSummary, onGemsChange, type GemSummary } from '@/lib/solar-system/gem-progress';
import type { BoardEntry, GemLeaderboard } from '@/lib/games/explore-gems-store';
import { GamePanel } from './GamePanel';
import { useGemSync } from './useGemSync';

interface LeaderboardPanelProps {
  onClose: () => void;
}

const LIMIT = 50;
const rgb = (c: readonly [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(' ')})`;

/**
 * Who has found the most gems: the platform's board (top 50, the player's
 * own row picked out, their rank under it when they are further down), the
 * player's own gems and how far they are through each world. Signed out on
 * a host with accounts, a sign-in prompt in place of the rank; on a host
 * with none (`available` false), only what is on this device.
 */
export function LeaderboardPanel({ onClose }: LeaderboardPanelProps) {
  const t = useTranslations('play.leaderboard');
  const tg = useTranslations('solarSystem.gems');
  const tw = useTranslations('solarSystem.flight.worlds');
  const { available, ready, authenticated, getAccessToken, login } = useGameAccount();
  const standing = useGemSync();
  const [mine, setMine] = useState<GemSummary | null>(null);
  const [board, setBoard] = useState<GemLeaderboard | null>(null);
  const [loading, setLoading] = useState(available);

  // The device's own gems, read after mount and again on every pickup or sync.
  useEffect(() => {
    const read = () => setMine(gemSummary());
    read();
    return onGemsChange(read);
  }, []);

  // The board: again whenever the sync reports a new standing.
  useEffect(() => {
    if (!available || !ready) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let token: string | null = null;
      if (authenticated) { try { token = await getAccessToken(); } catch { token = null; } }
      try {
        const res = await fetch(`/api/games/explore/gems/leaderboard?limit=${LIMIT}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        const body = res.ok ? await res.json() as GemLeaderboard : null;
        if (!cancelled) setBoard(body ?? { available: false, players: 0, entries: [], me: null });
      } catch {
        if (!cancelled) setBoard({ available: false, players: 0, entries: [], me: null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [available, ready, authenticated, getAccessToken, standing]);

  const name = (e: BoardEntry) => (e.me ? t('you') : e.name ?? t('anon', { tag: e.tag }));
  const me = board?.me ?? standing;
  const meListed = board?.entries.some((e) => e.me) ?? false;

  return (
    <GamePanel title={t('title')} onClose={onClose}>
      {/* The player's own haul. */}
      {mine && (
        <section className="game-board__mine" aria-label={t('yours')}>
          <span className="game-board__mine-icon" aria-hidden><Gem size={22} /></span>
          <div className="game-board__mine-text">
            <small>{t('yours')}</small>
            <b>{tg('points', { n: mine.points })}</b>
            <span>{t('count', { n: mine.collected, total: mine.total })}</span>
          </div>
          {available && authenticated && me?.rank ? (
            <span className="game-board__rank" aria-label={t('rank', { n: me.rank, total: me.players })}>
              <Trophy size={14} aria-hidden />#{me.rank}
            </span>
          ) : null}
        </section>
      )}

      {/* The board, on a host with accounts. */}
      {available && (
        <section className="game-board" aria-label={t('board')}>
          <div className="game-missions__head">
            <span>{t('board')}</span>
            {board?.available && board.players > 0 && <b>{t('players', { n: board.players })}</b>}
          </div>
          {loading && !board && <p className="game-missions__empty">{t('loading')}</p>}
          {board && !board.available && <p className="game-missions__empty">{t('unavailable')}</p>}
          {board?.available && board.entries.length === 0 && <p className="game-missions__empty">{t('empty')}</p>}
          {board?.available && board.entries.length > 0 && (
            <ol className="game-board__list">
              {board.entries.map((e, i) => (
                <li key={`${e.tag}-${i}`} className="game-board__row" data-me={e.me || undefined} data-top={e.rank <= 3 ? e.rank : undefined}>
                  <span className="game-board__pos">{e.rank}</span>
                  <span className="game-board__name">{name(e)}</span>
                  <small className="game-board__gems">{t('gems', { n: e.gems })}</small>
                  <b className="game-board__pts">{e.points}</b>
                </li>
              ))}
              {authenticated && me?.rank && !meListed ? (
                <li className="game-board__row game-board__row--me" data-me>
                  <span className="game-board__pos">{me.rank}</span>
                  <span className="game-board__name">{t('you')}</span>
                  <small className="game-board__gems">{t('gems', { n: me.gems })}</small>
                  <b className="game-board__pts">{me.points}</b>
                </li>
              ) : null}
            </ol>
          )}
          {ready && !authenticated && (
            <p className="game-missions__signin">
              {t('signIn')}
              <button type="button" className="game-missions__signin-btn" onClick={login}>{t('signInAction')}</button>
            </p>
          )}
          {ready && authenticated && board?.available && !me?.rank && <p className="game-missions__empty">{t('unranked')}</p>}
        </section>
      )}
      {!available && <p className="game-missions__empty">{t('localOnly')}</p>}

      {/* World by world. */}
      {mine && (
        <section aria-label={t('worlds')}>
          <div className="game-missions__head"><span>{t('worlds')}</span></div>
          <dl className="game-missions game-board__worlds">
            {mine.worlds.map((w) => (
              <div key={w.world} className="game-board__world" data-done={w.collected >= w.total || undefined}>
                <dt>{tw(`${w.world}.name`)}</dt>
                <dd>
                  <span>{t('count', { n: w.collected, total: w.total })}</span>
                  <span className="game-missions__track"><i style={{ width: `${(w.collected / Math.max(1, w.total)) * 100}%` }} /></span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* What each kind is worth. */}
      <section aria-label={t('values')}>
        <div className="game-missions__head"><span>{t('values')}</span></div>
        <ul className="game-board__kinds">
          {GEM_KINDS.map((k) => (
            <li key={k}>
              <i style={{ background: rgb(GEM_INFO[k].color) }} aria-hidden />
              <span>{tg(`kinds.${k}`)}</span>
              <b>{GEM_INFO[k].points}</b>
            </li>
          ))}
        </ul>
        <p className="game-missions__empty game-board__hint">{tg('hint')}</p>
      </section>
    </GamePanel>
  );
}
