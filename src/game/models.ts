// Real models come in as glTF: one loader, one decoded copy per URL, and a
// count of who is using it, so a surface that leaves takes its models' GPU
// memory with it and a surface that stays keeps them. Files are meshopt
// compressed with WebP textures (see assets-src/README.md).

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { currentQuality } from './quality';

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

// ── Phone variants ──
// A phone's tab is killed long before a desktop notices the memory: the
// Moon's full set decodes to ~190 MB of textures. Every file below has a
// copy under /explore/models/lite/ with the same nodes, meshes and
// materials and smaller textures (2048² → 1024² for the habitat and the
// cosmonaut, 1024² → 512² for the vehicles and the crate), about 47 MB for
// the same set. Callers keep naming the full file; `modelUrl` swaps it.

const MODEL_DIR = '/explore/models/';
const LITE_DIR = '/explore/models/lite/';
/** The files that have a lite copy on disk (keep in step with public/explore/models/lite/). */
export const LITE_MODELS = new Set([
  'base-kit.glb', 'cosmonaut.glb', 'crate.glb', 'lander.glb', 'rover.glb',
  'ship-cruiser.glb', 'ship-fighter.glb', 'ship-stellar.glb',
]);

/** The lite/full choice, fixed while any model is held: a quality change in
 *  between a prefetch and the scene's own acquire must not load both copies.
 *  It is made afresh once nothing is held (the next surface). */
let liteChoice: boolean | null = null;

function wantLite(): boolean {
  if (liteChoice !== null) return liteChoice;
  let lite = false;
  try {
    lite = currentQuality().lite
      || (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches);
  } catch { lite = false; }
  liteChoice = lite;
  return lite;
}

/** The file to fetch for `url`: its lite copy on a phone or the `performance` preset, else itself. */
export function modelUrl(url: string): string {
  if (!url.startsWith(MODEL_DIR) || url.startsWith(LITE_DIR)) return url;
  const name = url.slice(MODEL_DIR.length);
  return LITE_MODELS.has(name) && wantLite() ? LITE_DIR + name : url;
}

/** Tests only: forget the lite/full choice. */
export function resetModelVariant() {
  liteChoice = null;
}

/** A request that has not finished by now fails: the scene shows its error instead of loading forever. */
export const MODEL_TIMEOUT_MS = 30_000;

function disposeTree(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  for (const m of materials) {
    for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture);
    m.dispose();
  }
  for (const t of textures) {
    t.dispose();
    // glTF images arrive as ImageBitmaps, which browsers do not reliably collect: close them.
    const img = t.image as unknown;
    if (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) img.close();
  }
}

/** loadAsync with a deadline. A model that turns up after the deadline is disposed, not kept. */
function loadWithTimeout(url: string, keepNodes: boolean): Promise<THREE.Group> {
  return new Promise<THREE.Group>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`${url}: model load timed out after ${MODEL_TIMEOUT_MS / 1000} s`));
    }, MODEL_TIMEOUT_MS);
    getLoader().loadAsync(url).then((g) => {
      if (settled) { disposeTree(g.scene); return; }
      settled = true;
      clearTimeout(timer);
      resolve(keepNodes ? g.scene : flatten(g.scene));
    }, (err: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
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
export function acquireModel(path: string, keepNodes = false): Promise<ModelHandle> {
  // Keyed by the file actually fetched, so the prefetch and the scene share one copy.
  const url = modelUrl(path);
  const key = keepNodes ? `${url}#nodes` : url;
  let entry = cache.get(key);
  if (!entry) {
    entry = { users: 0, promise: loadWithTimeout(url, keepNodes) };
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
    if (cache.size === 0) liteChoice = null;
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
