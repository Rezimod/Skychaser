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

/** The mark's side, and the wordmark's height (its letters stand about half as tall as its box). */
const SIZES: Record<NonNullable<WordmarkProps['size']>, { mark: number; word: number }> = {
  sm: { mark: 22, word: 26 },
  md: { mark: 28, word: 34 },
  lg: { mark: 44, word: 56 },
};
/**
 * The Skychaser lockup from the logo kit (October 2026): the comet with its
 * sunset core beside the name, which is outlined so no font is needed.
 */
export default function Wordmark({ size = 'sm', href, asHeading = false, className = '' }: WordmarkProps) {
  const cls = `sd-wordmark sd-wordmark--${size} ${className}`.trim();
  const { mark, word } = SIZES[size];
  const inner = (
    <>
      <img className="sd-wordmark__mark" src="/brand/logo-mark.svg" alt="" width={mark} height={mark} aria-hidden="true" />
      <img className="sd-wordmark__word" src="/brand/wordmark.svg" alt="Skychaser" width={Math.round((word * 2648) / 400)} height={word} />
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
