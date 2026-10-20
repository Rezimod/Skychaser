// The painted galaxy disks, asked for early and painted in a worker, so
// neither the first zoom out to the galaxy nor the first jump towards
// Andromeda stops the frame for the painting. Once per page per disk; every
// caller gets a clone of its own (texture-cache.ts has the reasoning). Where
// there is no worker canvas the disk is painted on the page, as it always was.

import * as THREE from 'three';
import { ANDROMEDA_MODEL, MILKY_WAY_MODEL, paintSpiralGalaxy } from '@/lib/solar-system/galaxy-paint';
import type { GalaxyPaintRequest } from '@/lib/solar-system/galaxy-paint.worker';

type Galaxy = GalaxyPaintRequest['galaxy'];

const painted = new Map<string, Promise<THREE.Texture>>();

/** Painted upside down already (galaxy-paint.ts), so neither kind is flipped on upload. */
function finish(tex: THREE.Texture): THREE.Texture {
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function paintHere(galaxy: Galaxy, lite: boolean, size: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) paintSpiralGalaxy(ctx, galaxy === 'andromeda' ? ANDROMEDA_MODEL : MILKY_WAY_MODEL, lite, size);
  return finish(new THREE.CanvasTexture(c));
}

function paintInWorker(request: GalaxyPaintRequest): Promise<THREE.Texture> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./galaxy-paint.worker.ts', import.meta.url), { type: 'module' });
    const fallback = () => { worker.terminate(); resolve(paintHere(request.galaxy, request.lite, request.size)); };
    worker.onmessage = (e: MessageEvent<Uint8ClampedArray | null>) => {
      if (!e.data) { fallback(); return; }
      worker.terminate();
      resolve(finish(new THREE.DataTexture(e.data, request.size, request.size, THREE.RGBAFormat, THREE.UnsignedByteType)));
    };
    worker.onerror = fallback;
    worker.postMessage(request);
  });
}

/** The disk for `galaxy`, a clone the caller owns and disposes. */
export function galaxyDiskTexture(galaxy: Galaxy, lite: boolean): Promise<THREE.Texture> {
  const size = lite ? 1024 : 2048;
  const key = `${galaxy}:${size}`;
  let master = painted.get(key);
  if (!master) {
    const offThread = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    master = offThread ? paintInWorker({ galaxy, lite, size }) : Promise.resolve(paintHere(galaxy, lite, size));
    painted.set(key, master);
  }
  return master.then((t) => t.clone());
}
