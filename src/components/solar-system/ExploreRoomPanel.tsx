'use client';

import { useState } from 'react';
import { Check, Copy, LogIn, LogOut, Plus, Rocket, Share2, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CODE_LENGTH } from '@/lib/multiplayer/room-link';
import { ROOM_MAX, type useExploreRoom } from '@/lib/multiplayer/useExploreRoom';
import { GamePanel } from '@/components/play/GamePanel';

type Room = ReturnType<typeof useExploreRoom>;

interface RoomBodyProps {
  room: Room;
  onSignIn: () => void;
  /** The host's sign-in has not reported in yet (a session being restored). */
  waiting?: boolean;
  /** In the lobby: the room is joined and the game can start. */
  onLaunch?: () => void;
}

interface ExploreRoomPanelProps {
  room: Room;
  onSignIn: () => void;
  onClose: () => void;
  waiting?: boolean;
}

const PLACES = new Set(['orbit', 'flight', 'surface', 'moon', 'mars', 'proximaB', 'earth', 'mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune', 'backrooms']);
/** Where a roster entry is, as a message key under solarSystem.room.places. */
export const placeKey = (scene: string, world: string) => {
  // Each room's maze is its own world, `backrooms-<seed>`.
  const k = scene === 'surface' && world ? world.replace(/^backrooms-\d+$/, 'backrooms') : scene;
  return PLACES.has(k) ? k : 'orbit';
};

/** The link a friend opens to land in this room: the game's own page with
 *  the code on it, and nothing else from this address bar. Pure, so it is tested. */
export function inviteUrl(code: string, loc: { origin: string; pathname: string }): string {
  return `${loc.origin}${loc.pathname}?room=${encodeURIComponent(code)}`;
}

/** What a room shows, wherever it is shown: sign in, make or find a room,
 *  then the code to share and who is in it. */
export function RoomBody({ room, onSignIn, waiting, onLaunch }: RoomBodyProps) {
  const t = useTranslations('solarSystem.room');
  const tp = useTranslations('play.lobby');
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = room.code ? inviteUrl(room.code, window.location) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard refused: the code is on screen */ }
  };
  const share = async () => {
    try {
      await navigator.share({ title: tp('shareTitle'), text: tp('shareText', { code: room.code ?? '' }), url: link });
    } catch { /* closed, or refused: the code is on screen */ }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    room.clearError();
    setBad(!room.join(typed));
  };

  return (
    <>
      {room.status === 'unconfigured' && <p className="room-panel__note">{t('unconfigured')}</p>}

      {room.status === 'signedOut' && (waiting ? <p className="room-panel__note" aria-live="polite">{tp('checking')}</p> : (
        <>
          <p className="room-panel__note">{t('signInPrompt')}</p>
          <button type="button" className="room-panel__primary" onClick={onSignIn}><LogIn size={18} aria-hidden /> {t('signIn')}</button>
        </>
      ))}

      {room.status === 'idle' && (
        <>
          {room.error === 'full' && <p className="room-panel__error" role="alert">{t('full', { max: ROOM_MAX })}</p>}
          <button type="button" className="room-panel__primary" onClick={room.create}><Plus size={18} aria-hidden /> {t('create')}</button>
          <form className="room-panel__join" onSubmit={submit}>
            <label htmlFor="room-code" className="room-panel__label">{t('joinLabel')}</label>
            <div className="room-panel__row">
              <input id="room-code" className="room-panel__input" value={typed} maxLength={CODE_LENGTH + 2} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                enterKeyHint="go" placeholder={t('codePlaceholder')} aria-invalid={bad} onChange={(e) => { setTyped(e.target.value); setBad(false); }} />
              <button type="submit" className="room-panel__secondary" disabled={!typed.trim()}>{t('join')}</button>
            </div>
            {bad && <p className="room-panel__error" role="alert">{t('badCode', { n: CODE_LENGTH })}</p>}
          </form>
          <h3 className="room-panel__sub">{t('openRooms')}</h3>
          {room.rooms.length === 0 ? <p className="room-panel__note">{t('noRooms')}</p> : (
            <ul className="room-panel__list">
              {room.rooms.map((r) => (
                <li key={r.code} className="room-panel__item">
                  <span className="room-panel__code">{r.code}</span>
                  <span className="room-panel__who">{t('hostedBy', { name: r.host })}</span>
                  <span className="room-panel__count">{r.count}/{ROOM_MAX}</span>
                  <button type="button" className="room-panel__secondary" disabled={r.count >= ROOM_MAX} onClick={() => room.join(r.code)}>{t('join')}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {room.status === 'connecting' && <p className="room-panel__note" aria-live="polite">{t('joining', { code: room.code ?? '' })}</p>}

      {room.status === 'joined' && room.code && (
        <>
          <div className="room-panel__invite">
            <span className="room-panel__label">{t('roomCode')}</span>
            <span className="room-panel__bigcode">{room.code}</span>
            <span className="room-panel__keys">
              {canShare && <button type="button" className="room-panel__secondary" onClick={share}><Share2 size={16} aria-hidden /> {tp('share')}</button>}
              <button type="button" className="room-panel__secondary" onClick={copyInvite}>
                {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {t(copied ? 'copied' : 'copyInvite')}
              </button>
            </span>
          </div>
          {onLaunch && <button type="button" className="room-panel__primary room-panel__launch" onClick={onLaunch} autoFocus><Rocket size={18} aria-hidden /> {tp('launch')}</button>}
          <p className="room-panel__note">{t('howItWorks')}</p>
          <h3 className="room-panel__sub">{t('explorers', { n: room.roster.length, max: ROOM_MAX })}</h3>
          <ul className="room-panel__list">
            {room.roster.map((m) => (
              <li key={m.id} className="room-panel__item">
                <span className="room-panel__name">{m.self ? t('you', { name: m.name }) : m.name}</span>
                <span className="room-panel__where">{t(`places.${placeKey(m.scene, m.world)}`)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="room-panel__leave" onClick={room.leave}><LogOut size={16} aria-hidden /> {t('leave')}</button>
        </>
      )}
    </>
  );
}

/** In the game: the room over the scene — who is in it, the code to share,
 *  or the way back into one. */
export function ExploreRoomPanel({ room, onSignIn, onClose, waiting }: ExploreRoomPanelProps) {
  const t = useTranslations('solarSystem.room');
  return (
    // The deck and the surfaces listen for keys on the window; typing a code must not fly the ship.
    <div className="room-panel" role="dialog" aria-modal="false" aria-labelledby="room-panel-title"
      onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <header className="room-panel__head">
        <h2 id="room-panel-title" className="room-panel__title"><Users size={16} aria-hidden /> {t('title')}</h2>
        <button type="button" className="room-panel__icon" onClick={onClose} aria-label={t('close')}><X size={18} aria-hidden /></button>
      </header>
      <RoomBody room={room} onSignIn={onSignIn} waiting={waiting} />
    </div>
  );
}

/** On the title: Multiplayer's lobby. Sign in, make a room (a short code and
 *  a link to send) or join one by code or from the list, then launch. */
export function MultiplayerLobby({ room, onSignIn, onClose, onLaunch, waiting }: ExploreRoomPanelProps & { onLaunch: () => void }) {
  const tp = useTranslations('play.lobby');
  return (
    <GamePanel title={tp('title')} onClose={onClose}>
      <div className="room-panel room-panel--lobby" onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
        <p className="room-panel__lead">{tp('lead')}</p>
        <RoomBody room={room} onSignIn={onSignIn} waiting={waiting} onLaunch={onLaunch} />
      </div>
    </GamePanel>
  );
}
