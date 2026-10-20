'use client';

import { useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RosterEntry } from '@/lib/multiplayer/useExploreRoom';
import { placeKey } from './ExploreRoomPanel';

interface ExploreRoomBadgeProps {
  code: string;
  roster: RosterEntry[];
  onOpen: () => void;
}

const TOAST_MS = 4200;

/** The room, wherever the explorer is — and a line when someone arrives, leaves or lands. */
export function ExploreRoomBadge({ code, roster, onOpen }: ExploreRoomBadgeProps) {
  const t = useTranslations('solarSystem.room');
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const prevRef = useRef<Map<string, RosterEntry> | null>(null);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  useEffect(() => {
    // Presence has not arrived yet; the first roster is the room as found, not news.
    if (!roster.length) return;
    const prev = prevRef.current;
    const now = new Map(roster.map((m) => [m.id, m]));
    prevRef.current = now;
    if (!prev) return;
    const lines: string[] = [];
    for (const m of roster) {
      if (m.self) continue;
      const was = prev.get(m.id);
      if (!was) lines.push(t('toast.joined', { name: m.name }));
      else if (m.scene === 'surface' && (was.scene !== 'surface' || was.world !== m.world)) {
        lines.push(t('toast.landed', { name: m.name, place: t(`places.${placeKey(m.scene, m.world)}`) }));
      } else if (was.scene === 'surface' && m.scene !== 'surface') lines.push(t('toast.launched', { name: m.name }));
    }
    for (const [id, was] of prev) if (!was.self && !now.has(id)) lines.push(t('toast.left', { name: was.name }));
    if (!lines.length) return;
    const added = lines.map((text) => ({ id: nextId.current++, text }));
    setToasts((cur) => [...cur, ...added].slice(-3));
    timers.current.push(window.setTimeout(() => setToasts((cur) => cur.filter((x) => !added.includes(x))), TOAST_MS));
  }, [roster, t]);

  return (
    <div className="room-badge">
      <button type="button" className="room-badge__chip" onClick={onOpen} aria-label={t('badgeAria', { code, n: roster.length })}>
        <Users size={14} aria-hidden />
        <span className="room-badge__code">{code}</span>
        <span className="room-badge__count">{roster.length}</span>
      </button>
      <ul className="room-badge__toasts" aria-live="polite">
        {toasts.map((x) => <li key={x.id} className="room-badge__toast">{x.text}</li>)}
      </ul>
    </div>
  );
}
