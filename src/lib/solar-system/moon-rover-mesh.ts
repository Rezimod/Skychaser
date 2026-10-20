// The rover as the concept sheets draw it (~/Desktop/stellar-explore/refs/rover/):
// an open four-wheel exploration buggy, built in Blender
// (assets-src/blender/rover.py) and loaded as rover.glb. The file arrives
// with a node per moving part — a wishbone arm, a steering upright and a
// wheel at each corner, the instrument mast, the tool arm's two joints —
// and this module hangs them in the hierarchy the drive expects:
//
//   rover ─ Arm_<corner> ─ Steer_<corner> ─ Wheel_<corner>
//
// The skeleton of empty groups is built at once, so moon-rover can drive
// from the first frame; the meshes drop into it when the file lands. The
// brake and ion strips stay code-built, because the dress animates their
// materials and the model's own lamps are baked into one atlas.

import * as THREE from 'three';
import { acquireModel } from '@/game/models';
import type { Kit } from '@/lib/solar-system/moon-kit';
import type { RoverParts } from '@/lib/solar-system/moon-rover';

const ROVER_MODEL = '/explore/models/rover.glb';

/** The model's own numbers (assets-src/blender/rover.py), in game metres:
 *  half-track, half-wheelbase, wheel radius, and the inboard arm pivot. */
export const ROVER = { track: 0.80, base: 1.12, wheelR: 0.44, armX: 0.30, armY: 0.46, panY: 0.60 };

/** The corners in the order the drive reads them: the −X side front and
 *  rear, then the +X side. Forward is +Z. */
export const ROVER_CORNERS: { tag: string; sx: number; sz: number }[] = [
  { tag: 'RF', sx: -1, sz: 1 },
  { tag: 'RR', sx: -1, sz: -1 },
  { tag: 'LF', sx: 1, sz: 1 },
  { tag: 'LR', sx: 1, sz: -1 },
];

export function buildRover(kit: Kit, lite: boolean): { group: THREE.Group; parts: RoverParts; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'rover';
  const brakeLight = new THREE.MeshStandardMaterial({ color: 0x3a0606, emissive: new THREE.Color(0xff2a1a), emissiveIntensity: 0.15, roughness: 0.4 });
  const ionMat = new THREE.MeshStandardMaterial({ color: 0x0b1a22, emissive: new THREE.Color(0x8ff0ff), emissiveIntensity: 0, roughness: 0.35 });
  const parts: RoverParts = {
    spin: [], steer: [], arms: [], wheelXZ: [],
    mast: new THREE.Group(), seat: new THREE.Object3D(),
    headlight: new THREE.Object3D(),
    arm: [new THREE.Group(), new THREE.Group()], brakeLight, ionMat,
  };

  // ── The skeleton: a group per moving part, at the model's own pivots. ──
  const holders = new Map<string, THREE.Object3D>();
  const hold = (name: string, parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    holders.set(name, g);
    return g;
  };
  for (const { tag, sx, sz } of ROVER_CORNERS) {
    const arm = hold(`Arm_${tag}`, group, sx * ROVER.armX, ROVER.armY, sz * ROVER.base);
    const steer = hold(`Steer_${tag}`, arm, sx * (ROVER.track - ROVER.armX), ROVER.wheelR - ROVER.armY, 0);
    const wheel = hold(`Wheel_${tag}`, steer, 0, 0, 0);
    parts.arms.push(arm);
    parts.steer.push(steer);
    parts.spin.push(wheel);
    parts.wheelXZ.push([sx * ROVER.track, sz * ROVER.base]);
  }
  parts.mast.name = 'Mast';
  parts.mast.position.set(-0.46, ROVER.panY + 0.08, -1.06);
  group.add(parts.mast);
  holders.set('Mast', parts.mast);
  const [shoulder, fore] = parts.arm as THREE.Group[];
  shoulder.name = 'ToolArm';
  shoulder.position.set(0.5, ROVER.panY + 0.1, 0.9);
  group.add(shoulder);
  holders.set('ToolArm', shoulder);
  fore.name = 'ToolFore';
  fore.position.set(0, 0.34, 0.02);
  shoulder.add(fore);
  holders.set('ToolFore', fore);
  // Where the driver's eye and the headlight are; the mast head rides the mast.
  parts.seat.position.set(0.33, ROVER.panY + 0.82, -0.1);
  group.add(parts.seat);
  parts.headlight.position.set(0.5, ROVER.panY + 0.24, 1.56);
  group.add(parts.headlight);

  // ── The strips the dress lights: brake at the tail, ion down the flanks. ──
  for (const sd of [-1, 1]) {
    const brake = kit.box(group, 0.2, 0.08, 0.04, brakeLight, sd * 0.5, ROVER.panY + 0.22, -1.38);
    brake.castShadow = false;
    kit.box(group, 0.012, 0.03, 1.5, ionMat, sd * 0.7, ROVER.panY + 0.16, 0.2).castShadow = false;
  }

  // ── The model, dropped into the skeleton. ──
  let release: (() => void) | null = null;
  let disposed = false;
  acquireModel(ROVER_MODEL, true).then((handle) => {
    if (disposed) { handle.release(); return; }
    release = handle.release;
    // Each visit gets its own copy: the surfaces can hold one rover each.
    const scene = handle.scene.clone(true);
    // The file is one root node holding the body and a node per hinge. A mesh
    // with two materials arrives as a group, and that group carries the
    // quantisation transform, so whole children are moved — never the meshes
    // inside them. The root is not matched by name: Blender numbers it when
    // the joined body has taken the asset's name first.
    const root = scene.children.length === 1 && !(scene.children[0] as THREE.Mesh).isMesh ? scene.children[0] : scene;
    for (const child of [...root.children]) {
      const holder = holders.get(child.name);
      if (holder) {
        for (const part of [...child.children]) holder.add(part);
        continue;
      }
      let hasMesh = false;
      child.traverse((o) => { if ((o as THREE.Mesh).isMesh) hasMesh = true; });
      if (hasMesh) group.add(child);
    }
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (lite) mesh.receiveShadow = false;
    });
  }, () => undefined);

  return {
    group,
    parts,
    dispose() {
      disposed = true;
      brakeLight.dispose();
      ionMat.dispose();
      release?.();
    },
  };
}
