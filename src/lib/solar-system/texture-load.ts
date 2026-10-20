// Loading a planet map without stalling the frame.
//
// The NASA maps are two to four megapixels each. `TextureLoader` hands the
// file to an <img>, and the browser decodes it on the main thread at the
// moment three first uploads it: measured at the better part of a second on an
// Intel Iris Plus 640, which is where the arrival's worst frames came from
// (phase 9). `createImageBitmap` does the decode on a worker thread, so all
// that is left on the main thread is the upload itself.
//
// An ImageBitmap ignores `Texture.flipY`, so the flip has to be asked for when
// the bitmap is made; and it holds memory of its own, so it is closed when the
// texture goes rather than waiting to be collected.

import * as THREE from 'three';

export interface PlanetTextureLoader {
  load: (url: string, onLoad: (tex: THREE.Texture) => void, onError?: () => void) => void;
}

/** Safari before 17 mis-handles `imageOrientation`; three's own loader skips it for the same reason. */
function bitmapsUsable(): boolean {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return false;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (!/^((?!chrome|android).)*safari/i.test(ua)) return true;
  const version = ua.match(/Version\/(\d+)/);
  return !!version && Number(version[1]) >= 17;
}

export function makePlanetTextureLoader(): PlanetTextureLoader {
  if (!bitmapsUsable()) {
    const fallback = new THREE.TextureLoader();
    fallback.setCrossOrigin('anonymous');
    return { load: (url, onLoad, onError) => fallback.load(url, onLoad, undefined, onError && (() => onError())) };
  }
  const loader = new THREE.ImageBitmapLoader();
  loader.setCrossOrigin('anonymous');
  loader.setOptions({ imageOrientation: 'flipY' });
  return {
    load: (url, onLoad, onError) => loader.load(url, (bitmap) => {
      const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
      tex.needsUpdate = true;
      onLoad(tex);
    }, undefined, onError && (() => onError())),
  };
}

/** Let the texture and, if it holds one, its bitmap go. */
export function disposePlanetTexture(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  const image = tex.image as ImageBitmap | undefined;
  tex.dispose();
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
}
