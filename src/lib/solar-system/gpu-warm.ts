// Getting a scene's first-use costs out of the way while a loading screen
// still covers it. `compileAsync` builds the scene's own programs, but three
// uploads a texture only when something first draws with it, and the shadow
// pass and the post chain compile theirs on their first frame — measured at
// 0.4–3.4 s on an Intel Iris Plus 640, landing on the first frames the player
// saw. Everything here is synchronous on purpose: it runs under the loader.

import * as THREE from 'three';

/** three reads every program's info logs on its first use, to report shader
 *  errors. Each read waits for the GPU process to finish compiling: on an
 *  Intel Mac (Chrome on Metal) that held the main thread 6 s on one frame of
 *  cruise. The logs are for development; a release build skips them. */
export function skipShaderChecks(renderer: THREE.WebGLRenderer) {
  renderer.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
}

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
  for (const t of uploadable(scene)) renderer.initTexture(t);
}

/** The same, one texture at a time with `slice` awaited between, so a scene
 *  with a hundred megabytes of maps does not hold one frame for a second. */
export async function uploadSceneTexturesSliced(renderer: THREE.WebGLRenderer, scenes: THREE.Object3D[], slice: () => Promise<void>, stop: () => boolean) {
  for (const scene of scenes) {
    for (const t of uploadable(scene)) {
      if (stop()) return;
      renderer.initTexture(t);
      await slice();
    }
  }
}

function uploadable(scene: THREE.Object3D): THREE.Texture[] {
  const out: THREE.Texture[] = [];
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
    out.push(t);
  }
  return out;
}

/** A compile (or any wait) that cannot hold the game up for good: it settles
 *  when the promise does, or after `ms`, whichever comes first, and never
 *  rejects. three's `compileAsync` polls each program until it is ready, and
 *  on a lost context, or with a material freed under it, that never happens. */
export function settleWithin<T>(p: PromiseLike<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(undefined), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, () => { clearTimeout(id); resolve(undefined); });
  });
}

/** The context is gone: tell every pending compile poll that its program is
 *  done, so the promises settle and what they hold can be freed. */
export function releaseCompilePolls(renderer: THREE.WebGLRenderer) {
  const programs = (renderer.info as unknown as { programs?: Array<{ isReady?: () => boolean }> | null }).programs;
  if (!programs) return;
  for (const p of programs) p.isReady = () => true;
}

/** Free everything a scene holds on the GPU: its geometries, materials and
 *  their textures. For a build abandoned half-way, whose own dispose was
 *  never made. */
export function releaseScene(scene: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const m = mesh.material;
    if (!m) return;
    for (const x of Array.isArray(m) ? m : [m]) { texturesOf(x, textures); x.dispose(); }
  });
  for (const t of textures) t.dispose();
}
