// The chase camera in a place built of walls rather than of round footprints:
// the Backrooms. It must never end up on the far side of one, and it must
// still stand off the crew when there is room to.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeCameraRig, type ChaseTuning } from '@/lib/solar-system/moon-camera';

const flat = () => 0;
const none = () => [];
const tune = (blocked: ChaseTuning['blocked']): ChaseTuning =>
  ({ follow: 2.4, lead: 0.22, leadMax: 0.5, fovKick: 3, horizontal: 10, vertical: 5, blocked });

/** A corridor three metres wide running along z, walls at |x| = 1.5. */
const corridor = (x: number, y: number) => Math.abs(x) > 1.5 - 0.24 || y < 0.35 || y > 2.45;

function ride(blocked: ChaseTuning['blocked'], yaw: number, seconds = 3) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1000);
  const rig = makeCameraRig(camera, flat, none, 60);
  rig.yaw = yaw;
  rig.pitch = 0.3;
  rig.snap();
  const position = new THREE.Vector3(0, 0, 0);
  const velocity = new THREE.Vector3(0, 0, 0);
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    rig.chase(dt, { position, velocity, yaw: 0, height: 1.34, distance: 2.2, speedFrac: 0 }, tune(blocked));
    rig.update(dt);
  }
  return { camera, position };
}

describe('the chase camera against walls', () => {
  it('never sits on the far side of a wall, whichever way it is pointed', () => {
    // Every bearing round the compass, including straight at a side wall.
    for (let i = 0; i < 16; i++) {
      const { camera } = ride(corridor, (i / 16) * Math.PI * 2);
      expect(corridor(camera.position.x, camera.position.y)).toBe(false);
    }
  });

  it('stands off when there is room, and tucks in when there is not', () => {
    const open = ride(() => false, Math.PI);
    const tight = ride(corridor, Math.PI / 2);
    const back = (r: { camera: THREE.PerspectiveCamera; position: THREE.Vector3 }) =>
      Math.hypot(r.camera.position.x - r.position.x, r.camera.position.z - r.position.z);
    expect(back(open)).toBeGreaterThan(1.6);
    expect(back(tight)).toBeLessThan(back(open));
  });

  it('leaves the ground and the round colliders alone when a wall test is given', () => {
    // A collider right where the camera wants to be is not consulted: the
    // wall test is the whole answer, and it says this spot is fine.
    const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1000);
    const rig = makeCameraRig(camera, flat, () => [{ x: 0, z: -2.2, r: 3 }], 60);
    rig.yaw = Math.PI;
    rig.snap();
    const position = new THREE.Vector3(0, 0, 0);
    const velocity = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 180; i++) {
      rig.chase(1 / 60, { position, velocity, yaw: 0, height: 1.34, distance: 2.2, speedFrac: 0 }, tune(() => false));
      rig.update(1 / 60);
    }
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeGreaterThan(1.6);
  });
});
