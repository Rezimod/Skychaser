// The EVA suit: the rig's joints at their pivots, and the Blender-built
// cosmonaut skinned to them (assets-src/blender/cosmonaut.py). The model is
// made in this rig's rest pose with bones named after these joints, so the
// body binds straight to the joint objects and moon-suit-pose drives it as
// it drove the old code-built suit. The helmet and the gold visor ride the
// neck and the visor hinge; on a world with air the pilot's own head does.
//
// Joints are bones at their pivots: rotation.x negative swings a limb
// forward, positive folds a knee back; arm abduction is rotation.z = side * k.

import * as THREE from 'three';
import { acquireModel } from '@/game/models';
import { currentQuality } from '@/game/quality';
import { buildSuitGear, type SuitGear } from '@/lib/solar-system/suit-gear';

export const HIP_H = 0.98;
export const THIGH = 0.46;
export const SHIN = 0.42;
/** Helmet centre above the neck ring. */
export const HELMET_C = 0.2;

const MODEL_URL = '/explore/models/cosmonaut.glb';

export interface SuitRig {
  group: THREE.Group;
  /** Carries the bob and the crouch. */
  body: THREE.Bone;
  /** At the hips: lean and the whole-body roll live here. */
  pelvis: THREE.Bone;
  /** The upper body above the waist bearing: counter-rotates against the hips. */
  chest: THREE.Bone;
  pack: THREE.Bone;
  neck: THREE.Bone;
  /** The helmet and its visor, or the bare head: hidden for the helmet view. */
  helmet: THREE.Group;
  /** The gold visor, hinged at the brow: rotation.x < 0 lifts it. */
  visor: THREE.Bone;
  sides: number[];
  shoulders: THREE.Bone[];
  elbows: THREE.Bone[];
  hands: THREE.Bone[];
  hips: THREE.Bone[];
  knees: THREE.Bone[];
  ankles: THREE.Bone[];
  /** The code-built hardware on the joints: the jet module, the console, the lamps (suit-gear). */
  gear: SuitGear;
  /** The body's LOD, once the model is on the rig: its level says whether the fittings are worth drawing. */
  lod: THREE.LOD | null;
  /** Settles once the model is on the rig, or could not be loaded. */
  ready: Promise<void>;
  /** The helmet lamps and the displays, bright with the headlamp on. */
  setLamps: (on: boolean) => void;
  dispose: () => void;
}

/** `bareHead`: on a world with air — no pack, no helmet, the pilot's own head. */
export function buildSuit(lite: boolean, bareHead = false): SuitRig {
  const group = new THREE.Group();
  group.name = 'cosmonaut';
  // Every joint's rest position in the rig's frame: rest rotations are all
  // zero, so a bone's inverse bind matrix is a translation back from it.
  const rest = new Map<string, THREE.Vector3>();
  const joint = (parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    rest.set(name, new THREE.Vector3(x, y, z).add(rest.get(parent.name) ?? new THREE.Vector3()));
    return b;
  };
  const body = joint(group, 'body');
  const pelvis = joint(body, 'pelvis', 0, HIP_H, 0);
  const chest = joint(pelvis, 'chest', 0, 0.13, 0);
  const pack = joint(chest, 'pack', 0, 0.32, -0.34);
  const neck = joint(chest, 'neck', 0, 0.58, 0.01);
  const helmet = new THREE.Group();
  neck.add(helmet);
  const visor = joint(neck, 'visor', 0, HELMET_C, 0);
  helmet.add(visor);
  const sides = [-1, 1];
  const shoulders: THREE.Bone[] = []; const elbows: THREE.Bone[] = []; const hands: THREE.Bone[] = [];
  const hips: THREE.Bone[] = []; const knees: THREE.Bone[] = []; const ankles: THREE.Bone[] = [];
  sides.forEach((side, i) => {
    const sh = joint(chest, `shoulder${i}`, side * 0.34, 0.4, 0);
    const el = joint(sh, `elbow${i}`, 0, -0.34, 0);
    hands.push(joint(el, `hand${i}`, 0, -0.32, 0));
    shoulders.push(sh); elbows.push(el);
    const hip = joint(pelvis, `hip${i}`, side * 0.125, 0, 0);
    const kn = joint(hip, `knee${i}`, 0, -THIGH, 0);
    ankles.push(joint(kn, `ankle${i}`, 0, -SHIN, 0));
    hips.push(hip); knees.push(kn);
  });
  // No pack where there is air: its vertices fold into the pivot.
  if (bareHead) pack.scale.setScalar(1e-4);
  const joints = new Map<string, THREE.Bone>();
  group.traverse((o) => { if ((o as THREE.Bone).isBone) joints.set(o.name, o as THREE.Bone); });
  // The hardware goes on before the model: it needs only the joints, and a
  // remote crew merges the rig as soon as it is built.
  const gear = buildSuitGear({ pack, chest, helmet }, bareHead);

  const owned: { dispose: () => void }[] = [];
  let suitMat: THREE.MeshStandardMaterial | null = null;
  let lamps = false;
  let releaseModel: (() => void) | null = null;
  let disposed = false;

  const attach = (model: THREE.Group) => {
    // The optimiser quantises positions and carries the scale and offset on
    // the nodes (on a skin, in its inverse bind matrices): bake them into a
    // copy of each geometry so it sits in the rig's rest-pose space.
    model.updateMatrixWorld(true);
    const restGeometry = (from: THREE.Mesh) => {
      const g = from.geometry.clone();
      // Normalised integers would clamp everything past a metre: go to floats first.
      for (const name of ['position', 'normal']) {
        const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
        if (!a) continue;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
        g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
      }
      if ((from as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = from as THREE.SkinnedMesh;
        const bone = sk.skeleton.bones[0];
        // Where three's skinning puts a vertex in the file's own rest pose.
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(sk.matrixWorld, sk.bindMatrixInverse)
          .multiply(bone.matrixWorld).multiply(sk.skeleton.boneInverses[0]).multiply(sk.bindMatrix));
      } else {
        g.applyMatrix4(from.matrixWorld);
      }
      owned.push(g);
      return g;
    };
    const find = (name: string) => model.getObjectByName(name) as THREE.Mesh | undefined;
    const src = find('Body') as THREE.SkinnedMesh | undefined;
    if (!src?.isSkinnedMesh) throw new Error('cosmonaut.glb: no skinned Body');
    const mat = (src.material as THREE.MeshStandardMaterial).clone();
    // The packed map carries occlusion in R beside roughness and metalness.
    mat.aoMap = mat.roughnessMap;
    suitMat = mat;
    mat.emissiveIntensity = lamps ? 1.6 : 0.5;
    owned.push(mat);
    const skinned = (from: THREE.SkinnedMesh) => {
      const bones = from.skeleton.bones.map((b) => joints.get(b.name));
      if (bones.some((b) => !b)) throw new Error('cosmonaut.glb: a bone the rig does not have');
      const inverses = from.skeleton.bones.map((b) => new THREE.Matrix4().makeTranslation(rest.get(b.name)!.clone().negate()));
      const skeleton = new THREE.Skeleton(bones as THREE.Bone[], inverses);
      owned.push(skeleton);
      const m = new THREE.SkinnedMesh(restGeometry(from), mat);
      m.bind(skeleton, new THREE.Matrix4());
      m.castShadow = true;
      m.receiveShadow = true;
      // The pose moves the body well outside its rest-pose bounds.
      m.frustumCulled = false;
      return m;
    };
    const lod = new THREE.LOD();
    lod.addLevel(skinned(src), 0);
    const far = find('Body_LOD1') as THREE.SkinnedMesh | undefined;
    // The crew are the one thing always in frame, so their switch is the
    // shortest fraction of the preset's LOD reference: 12 m on a phone,
    // 25 m on this Mac, 37 m where there is room for it.
    if (far?.isSkinnedMesh) lod.addLevel(skinned(far), currentQuality().lodDistance * (lite ? 0.5 : 0.62));
    group.add(lod);
    rig.lod = lod;
    // Rigid pieces are exported in rest-pose space: hang each on its joint.
    const rigid = (name: string, parent: THREE.Object3D, at: string, material: THREE.Material) => {
      const from = find(name);
      if (!from) return;
      const m = new THREE.Mesh(restGeometry(from), material);
      m.position.copy(rest.get(at)!).negate();
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
    };
    if (bareHead) {
      rigid('Head', helmet, 'neck', mat);
    } else {
      rigid('Helmet', helmet, 'neck', mat);
      const gold = (find('Visor')?.material as THREE.MeshStandardMaterial | undefined)?.clone();
      if (gold) {
        gold.envMapIntensity = 1.8;
        owned.push(gold);
        rigid('Visor', visor, 'visor', gold);
        // The fittings reflect what the visor does.
        gear.setEnvMap(gold.envMap, gold.envMapIntensity);
      }
    }
  };

  const ready = acquireModel(MODEL_URL, true).then(({ scene, release }) => {
    if (disposed) { release(); return; }
    releaseModel = release;
    attach(scene);
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== 'test') console.warn('cosmonaut model', err);
  });

  const rig: SuitRig = {
    group, body, pelvis, chest, pack, neck, helmet, visor, sides, shoulders, elbows, hands, hips, knees, ankles, gear, lod: null, ready,
    setLamps(on) {
      lamps = on;
      if (suitMat) suitMat.emissiveIntensity = on ? 1.6 : 0.5;
      gear.setLamps(on);
    },
    dispose() {
      disposed = true;
      gear.dispose();
      for (const o of owned) o.dispose();
      releaseModel?.();
    },
  };
  return rig;
}
