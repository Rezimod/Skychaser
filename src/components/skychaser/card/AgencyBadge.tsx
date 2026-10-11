/** The agencies named in a picture's credit, as a small mark: NASA, ESA. Plain lettering, never an agency's insignia. */
export function agenciesIn(credit: string) {
  return ['NASA', 'ESA'].filter((a) => new RegExp(`\\b${a}\\b`).test(credit));
}

/** The NASA missions the set itself is about, with the mission name for the mark on the face. */
export const MISSION: Record<string, string> = {
  'APOLLO-11': 'Apollo 11',
  EARTHRISE: 'Apollo 8',
  HUBBLE: 'Hubble',
  JWST: 'Webb',
  'VOYAGER-1': 'Voyager',
  ISS: 'Space Station',
};

export default function AgencyBadge({ agencies, label, className = '' }: { agencies: string[]; label: string; className?: string }) {
  return (
    <span className={`sdc-agency ${className}`}>
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <ellipse cx="10" cy="10" rx="8.6" ry="3.6" transform="rotate(-24 10 10)" />
        <circle cx="10" cy="10" r="2.6" />
        <circle cx="17.2" cy="6.6" r="1.1" />
      </svg>
      <b>{agencies.join(' · ')}</b>
      <i>{label}</i>
    </span>
  );
}
