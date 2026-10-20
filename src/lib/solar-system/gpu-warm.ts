// Getting a scene's first-use costs out of the way while a loading screen
// still covers it. `compileAsync` builds the scene's own programs, but three
// uploads a texture only when something first draws with it, and the shadow
// pass and the post chain compile theirs on their first frame — measured at
// 0.4–3.4 s on an Intel Iris Plus 640, landing on the first frames the player
// saw. Everything here is synchronous on purpose: it runs under the loader.

import * as THREE from 'three';

/** Run a compile as the frame will draw: into the post chain's target. three
 *  keys a program on where it draws — the canvas gets tone mapping and sRGB
 *  output in the shader, a target gets neither — so a compile aimed at the
 *  canvas builds variants no frame ever uses, and every program is built a
 *  second time, synchronously, on the first frame. */
export function compileFor<T>(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, compile: () => T): T {
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    return compile();
  } finally {
    renderer.setRenderTarget(previous);
  }
}

/** Every texture a material holds: its maps, and any in its uniforms. */
function texturesOf(material: THREE.Material, into: Set<THREE.Texture>) {
  const bag = material as unknown as Record<string, unknown>;
  for (const key in bag) {
    const v = bag[key];
    if (v && (v as THREE.Texture).isTexture) into.add(v as THREE.Texture);
  }
  const uniforms = (material as THREE.ShaderMaterial).uniforms;
  if (uniforms) {
    for (const key in uniforms) {
      const v = uniforms[key]?.value;
      if (v && (v as THREE.Texture).isTexture) into.add(v as THREE.Texture);
    }
  }
}

/** Upload every texture in the scene now, including those of objects the
 *  camera cannot see yet (they would otherwise stall the frame they enter). */
export function uploadSceneTextures(renderer: THREE.WebGLRenderer, scene: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    if (Array.isArray(m)) for (const x of m) texturesOf(x, textures);
    else texturesOf(m, textures);
  });
  const background = (scene as THREE.Scene).background;
  if (background && (background as THREE.Texture).isTexture) textures.add(background as THREE.Texture);
  for (const t of textures) {
    // A texture with no image yet (a load still in flight) is uploaded when it lands.
    const image = t.image as { width?: number } | undefined;
    if (!(t as THREE.DataTexture).isDataTexture && !(t as THREE.CanvasTexture).isCanvasTexture && !(image && image.width)) continue;
    renderer.initTexture(t);
  }
}
