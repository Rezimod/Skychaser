// Static batching for the procedural Moon scenes. Everything on the surface
// is built out of hundreds of small primitives, which is how it should be
// authored and exactly how it should not be drawn: one draw call (and one
// shadow draw) per bolt. After a builder has run, this folds every mesh that
// does not move relative to its nearest moving ancestor (a "pivot") into one
// mesh per material in that pivot's frame. On world-scale roots the buckets
// are split into grid cells so frustum culling keeps working, and pieces too
// small to matter lose their shadow.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface MergeOptions {
  /** Objects that move on their own. Everything static under one is merged
   *  into its frame; the root always counts as one. */
  isPivot?: (o: THREE.Object3D) => boolean;
  /** Split buckets into cells this many metres wide (world-scale roots). */
  cell?: number;
  /** Merged pieces with a bounding radius under this cast no shadow, m. */
  minCaster?: number;
}

export interface MergeResult {
  geometries: THREE.BufferGeometry[];
  before: number;
  after: number;
}

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();
const centre = new THREE.Vector3();

/** Leave this object — and everything under it — exactly as built. */
export function keep<T extends THREE.Object3D>(o: T): T {
  o.userData.keep = true;
  return o;
}
/** This object moves: merge what is under it into its own frame. */
export function pivot<T extends THREE.Object3D>(o: T): T {
  o.userData.pivot = true;
  return o;
}

const mergeable = (o: THREE.Object3D): o is THREE.Mesh =>
  (o as THREE.Mesh).isMesh === true
  && !(o as THREE.InstancedMesh).isInstancedMesh
  && !(o as THREE.SkinnedMesh).isSkinnedMesh
  && !Array.isArray((o as THREE.Mesh).material)
  && o.visible
  && !o.userData.keep
  && !o.userData.pivot;

/** A mesh can be folded away only if nothing under it has to survive it. */
function allMergeable(o: THREE.Object3D): boolean {
  for (const c of o.children) if (!mergeable(c) || !allMergeable(c)) return false;
  return true;
}

function prepare(src: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.getAttribute('position').clone());
  const n = src.getAttribute('normal');
  if (n) g.setAttribute('normal', n.clone());
  const count = g.getAttribute('position').count;
  const uv = src.getAttribute('uv');
  g.setAttribute('uv', uv ? uv.clone() : new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  // A real model's extra channels survive the merge; a bucket drops any
  // channel its parts do not all share (see mergeStatic).
  for (const name of ['color', 'uv1', 'tangent']) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, a.clone());
  }
  if (src.index) g.setIndex(src.index.clone());
  else {
    const idx = new (count > 65535 ? Uint32Array : Uint16Array)(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!n) g.computeVertexNormals();
  g.applyMatrix4(m);
  // A mirroring transform turns every triangle inside out.
  if (m.determinant() < 0) {
    const index = g.index!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, a);
    }
  }
  return g;
}

export function mergeStatic(root: THREE.Object3D, opts: MergeOptions = {}): MergeResult {
  const isPivot = (o: THREE.Object3D) => o === root || !!o.userData.pivot || (opts.isPivot?.(o) ?? false);
  root.updateMatrixWorld(true);
  let before = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) before += 1; });
  const pivots: THREE.Object3D[] = [];
  root.traverse((o) => { if (isPivot(o) && !o.userData.keep) pivots.push(o); });

  const geometries: THREE.BufferGeometry[] = [];
  for (const p of pivots) {
    // Gather what is static relative to this pivot.
    const found: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D) => {
      for (const c of o.children) {
        if (c.userData.keep || (c !== root && isPivot(c))) continue;
        if (mergeable(c)) {
          if (allMergeable(c)) {
            found.push(c);
            c.traverse((d) => { if (d !== c) found.push(d as THREE.Mesh); });
          }
          continue;
        }
        if ((c as THREE.Mesh).isMesh || (c as THREE.Light).isLight || (c as THREE.Camera).isCamera) continue;
        walk(c);
      }
    };
    walk(p);
    if (found.length < 2) continue;

    inv.copy(p.matrixWorld).invert();
    const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }>();
    for (const m of found) {
      rel.multiplyMatrices(inv, m.matrixWorld);
      const g = prepare(m.geometry, rel);
      g.computeBoundingSphere();
      const cast = m.castShadow && g.boundingSphere!.radius >= (opts.minCaster ?? 0);
      let cellKey = '';
      if (opts.cell && p === root) {
        centre.copy(g.boundingSphere!.center).applyMatrix4(p.matrixWorld);
        cellKey = `${Math.floor(centre.x / opts.cell)},${Math.floor(centre.z / opts.cell)}`;
      }
      const material = m.material as THREE.Material;
      const key = `${material.uuid}|${cast}|${m.receiveShadow}|${m.renderOrder}|${cellKey}`;
      let b = buckets.get(key);
      if (!b) { b = { material, cast, receive: m.receiveShadow, parts: [] }; buckets.set(key, b); }
      b.parts.push(g);
    }
    for (const b of buckets.values()) {
      if (b.parts.length > 1) {
        // mergeGeometries needs every part to carry the same attributes.
        const shared = new Set(Object.keys(b.parts[0].attributes));
        for (const part of b.parts) for (const name of shared) if (!part.getAttribute(name)) shared.delete(name);
        for (const part of b.parts) for (const name of Object.keys(part.attributes)) if (!shared.has(name)) part.deleteAttribute(name);
      }
      const merged = b.parts.length === 1 ? b.parts[0] : mergeGeometries(b.parts, false);
      if (!merged) continue;
      if (merged !== b.parts[0]) for (const part of b.parts) part.dispose();
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.name = 'merged';
      p.add(mesh);
      geometries.push(merged);
    }
    for (const m of found) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
  let after = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) after += 1; });
  return { geometries, before, after };
}
