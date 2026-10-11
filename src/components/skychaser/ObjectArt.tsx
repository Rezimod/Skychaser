/** A card's drawing alone, without the frame: its sky and its object. */
export default function ObjectArt({ designation, className = '' }: { designation: string; className?: string }) {
  const art = `/cards/plate/${designation}`;
  return (
    <span className={`sd-art ${className}`.trim()} aria-hidden="true">
      <img src={`${art}/sky.svg`} alt="" loading="lazy" decoding="async" />
      <img src={`${art}/object.svg`} alt="" loading="lazy" decoding="async" />
    </span>
  );
}
