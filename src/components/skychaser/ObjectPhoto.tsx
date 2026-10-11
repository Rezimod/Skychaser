import { photoFor } from '@/lib/skychaser/photos';
import ObjectArt from './ObjectArt';

/** The real photograph of an object, credited; the card's drawing where none exists. */
export default function ObjectPhoto({ designation, className = '' }: { designation: string; className?: string }) {
  const photo = photoFor(designation);
  if (!photo) return <ObjectArt designation={designation} className={className} />;
  return (
    <span className={`sd-photo ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.file} alt="" loading="lazy" decoding="async" style={photo.focus ? { objectPosition: photo.focus } : undefined} />
      <span className="sd-photo__credit">{photo.kind === 'impression' ? 'Artist’s impression' : photo.source}</span>
    </span>
  );
}
