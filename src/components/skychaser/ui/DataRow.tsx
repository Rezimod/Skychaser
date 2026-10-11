import type { ReactNode } from 'react';

export type Datum = {
  /** Short, printed in capitals: "RA", "Dec", "Mag", "Edition", "Node". */
  label: string;
  /** Already formatted — "05h 35m 17s", "−05° 23′", "017 / 250", "01". */
  value: ReactNode;
};

type DataRowProps = {
  items: Datum[];
  /** inline wraps label/value pairs across the line; stacked gives one per row with hairlines. */
  layout?: 'inline' | 'stacked';
  className?: string;
};

/**
 * Labelled figures in the mono face, as a description list so a screen reader
 * pairs each label with its value. Used beneath plates and on /card pages.
 */
export default function DataRow({ items, layout = 'inline', className = '' }: DataRowProps) {
  if (items.length === 0) return null;
  return (
    <dl className={`sd-datarow ${layout === 'stacked' ? 'sd-datarow--stacked' : ''} ${className}`.trim()}>
      {items.map((d) => (
        <div key={d.label}>
          <dt>{d.label}</dt>
          <dd>{d.value}</dd>
        </div>
      ))}
    </dl>
  );
}
