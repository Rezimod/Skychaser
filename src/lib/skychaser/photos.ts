/**
 * The real picture on the back of each card: a photograph of the object where
 * one exists (Hubble first), an artist's impression where nothing has been
 * resolved, nothing for the Frontier's fiction. Files in public/cards/photo/.
 */
import PHOTOS from './photos.json';

export type Photo = {
  file: string;
  kind: 'photo' | 'impression';
  credit: string;
  source: string;
  year: string;
  license: string;
  url: string;
  focus?: string;
};

const ALL: Record<string, Photo | { kind: 'none' }> = PHOTOS as Record<string, Photo | { kind: 'none' }>;

export function photoFor(designation: string): Photo | null {
  const p = ALL[designation];
  return p && p.kind !== 'none' ? (p as Photo) : null;
}
