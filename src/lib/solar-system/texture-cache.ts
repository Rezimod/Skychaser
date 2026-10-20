// Procedural textures drawn once per page, not once per scene. The orrery is
// torn down whenever a surface takes the screen and rebuilt on the way back,
// and redrawing its corona, galaxy disks and placeholder planets pixel by
// pixel on the CPU was most of the seconds that return took. A clone shares
// the drawn image (three uploads per image, and frees it when the last clone
// goes), so every caller still owns — and disposes — a texture of its own.

import type * as THREE from 'three';

const drawn = new Map<string, THREE.Texture>();

/** `make` runs the first time `key` is asked for; every caller gets a clone. */
export function cachedTexture<T extends THREE.Texture>(key: string, make: () => T): T {
  let master = drawn.get(key) as T | undefined;
  if (!master) {
    master = make();
    drawn.set(key, master);
  }
  return master.clone() as T;
}
