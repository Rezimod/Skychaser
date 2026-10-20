/* eslint-disable @next/next/no-img-element -- frames are pre-encoded to AVIF/WebP at their display sizes */
import { PORTRAIT_MEDIA, SHOTS, shotPortraitSrc, shotSrc, shotSrcSet, type ShotName } from '../shots';

interface ShotProps {
  name: ShotName;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  /** Override the subject position (CSS object-position x). */
  x?: number;
  /** Has a tall crop (below the HUD) for a phone held upright. */
  portrait?: boolean;
}

/** A captured game frame: AVIF where the browser has it, WebP otherwise. */
export default function Shot({ name, alt, sizes, className, priority, x, portrait }: ShotProps) {
  return (
    <picture className={className}>
      {portrait && <source type="image/avif" media={PORTRAIT_MEDIA} srcSet={shotPortraitSrc(name, 'avif')} />}
      {portrait && <source type="image/webp" media={PORTRAIT_MEDIA} srcSet={shotPortraitSrc(name, 'webp')} />}
      <source type="image/avif" srcSet={shotSrcSet(name, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={shotSrcSet(name, 'webp')} sizes={sizes} />
      <img
        src={shotSrc(name, 1280, 'webp')}
        alt={alt}
        width={1280}
        height={720}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : undefined}
        style={{ objectPosition: `${x ?? SHOTS[name].x}% 50%` }}
      />
    </picture>
  );
}
