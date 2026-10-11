import Link from 'next/link';

type WordmarkProps = {
  /** sm for the top bar, md for a panel, lg for a hero. */
  size?: 'sm' | 'md' | 'lg';
  /** When set, the mark is a link (the top bar passes '/'). */
  href?: string;
  /** Render as the page's h1 — only on a page whose title is the name itself. */
  asHeading?: boolean;
  className?: string;
};

const MARK_PX: Record<NonNullable<WordmarkProps['size']>, number> = { sm: 22, md: 28, lg: 44 };

/**
 * The Skychaser lockup: the comet mark beside the name, set in the display
 * face. Same mark as the legacy app, because the card product is the same
 * observatory seen from the collector's side.
 */
export default function Wordmark({ size = 'sm', href, asHeading = false, className = '' }: WordmarkProps) {
  const cls = `sd-wordmark sd-wordmark--${size} ${className}`.trim();
  const px = MARK_PX[size];
  const inner = (
    <>
      <img src="/brand/logo-mark.svg" alt="" width={px} height={px} aria-hidden="true" />
      <span>Skychaser</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls} aria-label="Skychaser, home">
        {inner}
      </Link>
    );
  }
  return asHeading ? <h1 className={cls}>{inner}</h1> : <span className={cls}>{inner}</span>;
}
