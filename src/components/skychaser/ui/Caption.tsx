import type { ReactNode } from 'react';

type CaptionProps = {
  /** The capture data, already formatted — node, UTC timestamp, instrument, seeing. Joined with a middle dot. */
  parts?: string[];
  /** Free-form caption instead of parts. */
  children?: ReactNode;
  /** Credit for a third-party image, e.g. "NASA/JPL". Printed in-frame, never omitted. */
  source?: string;
  /** 'figcaption' inside a <figure> (the default), 'p' elsewhere. */
  as?: 'figcaption' | 'p';
  className?: string;
};

/**
 * The monospace line beneath an image, the way a survey captions a detection:
 * no adjectives, just the data. The data is the ornament.
 */
export default function Caption({ parts, children, source, as: Tag = 'figcaption', className = '' }: CaptionProps) {
  return (
    <Tag className={`sd-caption ${className}`.trim()}>
      {parts ? parts.join(' · ') : children}
      {source && <span className="sd-caption__source">{` · Image: ${source}`}</span>}
    </Tag>
  );
}
