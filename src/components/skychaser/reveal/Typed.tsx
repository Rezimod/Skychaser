import type { CSSProperties } from 'react';

/**
 * Text that prints itself a character at a time, in CSS alone: a clip that
 * steps open once per character from `at`. Under reduced motion, or once the
 * reveal is done, it is simply there.
 */
export default function Typed({ text, at, style }: { text: string; at: string; style?: CSSProperties }) {
  return (
    <span className="sd-typed" style={{ '--sd-n': text.length, '--sd-type-at': at, ...style } as CSSProperties}>
      {text}
    </span>
  );
}
