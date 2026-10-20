// Real models come in as glTF: one loader, one decoded copy per URL, and a
// count of who is using it, so a surface that leaves takes its models' GPU
// memory with it and a surface that stays keeps them. Files are meshopt
// compressed with WebP textures (see assets-src/README.md).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface ModelHandle {
  /** The shared scene; clone it before changing transforms or materials. */
  scene: THREE.Group;
  release: () => void;
}

interface Entry {
  promise: Promise<THREE.Group>;
  users: number;
}

const cache = new Map<string, Entry>();
let loader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

function disposeTree(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
    m.dispose();
  }
}

/** Quantised files carry their scale on the nodes; bake every node's
 *  transform into its geometry so a mesh can be instanced on its own.
 *  Only for models that fit inside the quantised range: positions come in
 *  as normalised integers, so baking a scale larger than 1 back into them
 *  clamps the model to a unit box. Anything bigger than about a metre must
 *  be acquired with `keepNodes` and keep its own node transforms. */
function flatten(scene: THREE.Group): THREE.Group {
  scene.updateMatrixWorld(true);
  const flat = new THREE.Group();
  flat.name = scene.name;
  const meshes: THREE.Mesh[] = [];
  scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const mesh of meshes) {
    mesh.geometry.applyMatrix4(mesh.matrixWorld);
    mesh.geometry.computeBoundingSphere();
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.scale.set(1, 1, 1);
    flat.add(mesh);
  }
  return flat;
}

/** Load (or share) a model. Every `acquire` must be matched by one `release`.
 *  `keepNodes` leaves the node tree as exported: skinned meshes, and named
 *  empties a caller reads positions from, need it. */
export function acquireModel(url: string, keepNodes = false): Promise<ModelHandle> {
  const key = keepNodes ? `${url}#nodes` : url;
  let entry = cache.get(key);
  if (!entry) {
    entry = { users: 0, promise: getLoader().loadAsync(url).then((g) => (keepNodes ? g.scene : flatten(g.scene))) };
    cache.set(key, entry);
  }
  const e = entry;
  e.users += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    e.users -= 1;
    if (e.users > 0) return;
    cache.delete(key);
    e.promise.then(disposeTree, () => undefined);
  };
  return e.promise.then((scene) => ({ scene, release }), (err: unknown) => { release(); throw err; });
}

/** The full-detail mesh of a model (the one not named as a LOD), for an instanced prop. */
export function firstMesh(root: THREE.Object3D): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  root.traverse((o) => { if (!found && (o as THREE.Mesh).isMesh && !/_LOD\d$/.test(o.name)) found = o as THREE.Mesh; });
  return found;
}

// ── Loading one scene while another is still on the screen ──
// The arrival flies for eleven seconds; its files can come down during
// them. A prefetched model is an ordinary user of the cache, so the scene
// that mounts next shares the decoded copy instead of fetching it again.

export interface PrefetchItem {
  url: string;
  /** Must match how the scene itself acquires it, or they miss each other. */
  keepNodes: boolean;
  /** Which line of the arrival's checklist this file is behind. */
  group: string;
}

interface Held {
  group: string;
  release: (() => void) | null;
  failed: boolean;
}
const prefetched = new Map<string, Held>();
/** The prefetch runs one file at a time; this is the tail of that chain. */
let queue: Promise<unknown> = Promise.resolve();

/** Start (or keep) a hold on these models. Safe to call repeatedly.
 *  One at a time, in the order given: decoding a glTF and its textures is
 *  work on the main thread, and five of them at once is a stall in the
 *  middle of whatever is still being drawn. */
export function prefetchModels(items: PrefetchItem[]) {
  for (const item of items) {
    const key = item.keepNodes ? `${item.url}#nodes` : item.url;
    if (prefetched.has(key)) continue;
    const held: Held = { group: item.group, release: null, failed: false };
    prefetched.set(key, held);
    const load = () => acquireModel(item.url, item.keepNodes).then(
      (h) => { if (prefetched.get(key) === held) held.release = h.release; else h.release(); },
      () => { held.failed = true; },
    );
    queue = queue.then(() => (prefetched.get(key) === held ? load() : undefined), load);
  }
}

/** Which checklist groups have every one of their files in hand. A group
 *  whose file could not be loaded counts as done: the scene will draw
 *  without it, and the crew should not wait for something that is not coming. */
export function prefetchDone(): Set<string> {
  const pending = new Set<string>();
  const groups = new Set<string>();
  for (const held of prefetched.values()) {
    groups.add(held.group);
    if (!held.release && !held.failed) pending.add(held.group);
  }
  for (const g of pending) groups.delete(g);
  return groups;
}

/** Let go of the prefetch holds: the scene that wanted them has them now. */
export function dropPrefetch() {
  for (const held of prefetched.values()) held.release?.();
  prefetched.clear();
}
