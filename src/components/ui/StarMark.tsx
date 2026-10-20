// Four-point sparkle used as the Stars currency mark — SVG replacement for the
// ✦ glyph. Inherits color via currentColor; sizes in px like a font glyph.
export default function StarMark({
  size = 12,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      <path d="M6 0l1.35 3.35a2 2 0 0 0 1.3 1.3L12 6l-3.35 1.35a2 2 0 0 0-1.3 1.3L6 12l-1.35-3.35a2 2 0 0 0-1.3-1.3L0 6l3.35-1.35a2 2 0 0 0 1.3-1.3z" />
    </svg>
  );
}
