'use client';

import { useState } from 'react';
import { Check, Copy, LogIn, LogOut, Plus, Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CODE_LENGTH } from '@/lib/multiplayer/room-link';
import { ROOM_MAX, type useExploreRoom } from '@/lib/multiplayer/useExploreRoom';

type Room = ReturnType<typeof useExploreRoom>;

interface ExploreRoomPanelProps {
  room: Room;
  onSignIn: () => void;
  onClose: () => void;
}

const PLACES = new Set(['orbit', 'flight', 'surface', 'moon', 'mars', 'proximaB', 'earth', 'backrooms']);
/** Where a roster entry is, as a message key under solarSystem.room.places. */
export const placeKey = (scene: string, world: string) => {
  // Each room's maze is its own world, `backrooms-<seed>`.
  const k = scene === 'surface' && world ? world.replace(/^backrooms-\d+$/, 'backrooms') : scene;
  return PLACES.has(k) ? k : 'orbit';
};

export function ExploreRoomPanel({ room, onSignIn, onClose }: ExploreRoomPanelProps) {
  const t = useTranslations('solarSystem.room');
  const [typed, setTyped] = useState('');
  const [bad, setBad] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard refused: the code is on screen */ }
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    room.clearError();
    setBad(!room.join(typed));
  };

  return (
    // The deck and the surfaces listen for keys on the window; typing a code must not fly the ship.
    <div className="room-panel" role="dialog" aria-modal="false" aria-labelledby="room-panel-title"
      onKeyDown={(e) => e.stopPropagation()} onKeyUp={(e) => e.stopPropagation()}>
      <header className="room-panel__head">
        <h2 id="room-panel-title" className="room-panel__title"><Users size={16} aria-hidden /> {t('title')}</h2>
        <button type="button" className="room-panel__icon" onClick={onClose} aria-label={t('close')}><X size={18} aria-hidden /></button>
      </header>

      {room.status === 'unconfigured' && <p className="room-panel__note">{t('unconfigured')}</p>}

      {room.status === 'signedOut' && (
        <>
          <p className="room-panel__note">{t('signInPrompt')}</p>
          <button type="button" className="room-panel__primary" onClick={onSignIn}><LogIn size={16} aria-hidden /> {t('signIn')}</button>
        </>
      )}

      {room.status === 'idle' && (
        <>
          {room.error === 'full' && <p className="room-panel__error" role="alert">{t('full', { max: ROOM_MAX })}</p>}
          <button type="button" className="room-panel__primary" onClick={room.create}><Plus size={16} aria-hidden /> {t('create')}</button>
          <form className="room-panel__join" onSubmit={submit}>
            <label htmlFor="room-code" className="room-panel__label">{t('joinLabel')}</label>
            <div className="room-panel__row">
              <input id="room-code" className="room-panel__input" value={typed} maxLength={CODE_LENGTH + 2} autoComplete="off" autoCapitalize="characters" spellCheck={false}
                placeholder={t('codePlaceholder')} aria-invalid={bad} onChange={(e) => { setTyped(e.target.value); setBad(false); }} />
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
            <button type="button" className="room-panel__secondary" onClick={copyInvite}>
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {t(copied ? 'copied' : 'copyInvite')}
            </button>
          </div>
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
    </div>
  );
}
