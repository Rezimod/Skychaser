import type { ObservationStatus } from '@/lib/skychaser/observability';

type ObservationStatusMarkProps = {
  status: ObservationStatus;
  className?: string;
};

const LABEL: Record<ObservationStatus, { short: string; long: string }> = {
  dedicated: { short: 'Dedicated', long: 'a dedicated Live Telescope target, after first light' },
  eligible: { short: 'Eligible', long: 'eligible for the Live Telescope, after first light' },
  not_available: { short: 'Not observable', long: 'not observable from the Live Telescope' },
};

/** Circles: filled, open, open and struck through. Never a diamond — that family belongs to rarity. */
function Glyph({ status }: { status: ObservationStatus }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="6" r="4.5" fill={status === 'dedicated' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1" />
      {status === 'not_available' && <path d="M2.8 9.2 L9.2 2.8" stroke="currentColor" strokeWidth="1" />}
    </svg>
  );
}

/**
 * Whether Live Telescope V1 can photograph what a card shows. A quiet chip — teal only
 * when the node has committed to the target, dashed when the object is out of
 * its reach — so it never competes with the rarity chip beside it. Scarcity
 * and observability are unrelated: Europa is epic and not observable.
 */
export default function ObservationStatusMark({ status, className = '' }: ObservationStatusMarkProps) {
  const { short, long } = LABEL[status];
  return (
    <span className={`sd-status sd-status--${status} ${className}`.trim()} title={`Observation: ${long}`}>
      <Glyph status={status} />
      <span className="sr-only">Observation status: </span>
      <span>{short}</span>
    </span>
  );
}
