'use client';

import { useEffect, useState } from 'react';
import { eventLabel } from '@/lib/skychaser/almanac';

type Props = {
  startUtc: string;
  endUtc: string;
  /** Add "In 26 days" after the date. */
  countdown?: boolean;
  /** Day and month only, for a tile. */
  short?: boolean;
};

const parts = (short: boolean): Intl.DateTimeFormatOptions => (short ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });

/** " · In 26 days"; nothing once sealed, since the price slot says so. */
function suffix(startUtc: string, endUtc: string, countdown: boolean) {
  if (!countdown) return '';
  const label = eventLabel(startUtc, endUtc);
  return label === 'Sealed' ? '' : ` · ${label}`;
}

/**
 * An Almanac card's date, in the viewer's own time. The server prints it in
 * UTC; once the page is in the browser, the local date and countdown take over.
 */
export default function AlmanacDate({ startUtc, endUtc, countdown = false, short = false }: Props) {
  const [text, setText] = useState(() => {
    const utc = new Intl.DateTimeFormat('en-GB', { ...parts(short), timeZone: 'UTC' }).format(new Date(startUtc));
    return utc + suffix(startUtc, endUtc, countdown);
  });

  useEffect(() => {
    const local = new Intl.DateTimeFormat(undefined, parts(short)).format(new Date(startUtc));
    setText(local + suffix(startUtc, endUtc, countdown));
  }, [startUtc, endUtc, countdown, short]);

  return (
    <time dateTime={startUtc} suppressHydrationWarning>
      {text}
    </time>
  );
}
