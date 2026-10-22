'use client';

import { useTranslations } from 'next-intl';
import { GamePanel } from './GamePanel';

interface LeaderboardPanelProps {
  onClose: () => void;
}

/** The gem leaderboard (stub: the full panel lands shortly). */
export function LeaderboardPanel({ onClose }: LeaderboardPanelProps) {
  const t = useTranslations('play');
  return <GamePanel title={t('back')} onClose={onClose}>{null}</GamePanel>;
}
