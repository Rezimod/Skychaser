// The four-wheel rover: what the wishbones do with ground the body's own
// lean cannot reach, and which corners steer.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeRoverDress, type DressState } from '@/lib/solar-system/moon-rover-dress';
import type { RoverParts } from '@/lib/solar-system/moon-rover';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import type { PrintsHandle } from '@/lib/solar-system/moon-prints';

const dust: DustHandle = { points: new THREE.Points(), burst: vi.fn(), setCap: vi.fn(), update: vi.fn(), dispose: vi.fn() };
const prints = { track: vi.fn(), stamp: vi.fn() } as unknown as PrintsHandle;
const terrain = { heightAt: () => 0 };

/** The corner order the drive and the model share: −X front and rear, then +X. */
function parts(): RoverParts {
  const obj = () => new THREE.Object3D();
  return {
    spin: [obj(), obj(), obj(), obj()],
    steer: [obj(), obj(), obj(), obj()],
    arms: [obj(), obj(), obj(), obj()],
    wheelXZ: [[-0.8, 1.12], [-0.8, -1.12], [0.8, 1.12], [0.8, -1.12]],
    mast: obj(),
    seat: obj(),
    headlight: obj(),
    arm: [obj(), obj()],
    brakeLight: new THREE.MeshStandardMaterial(),
    ionMat: new THREE.MeshStandardMaterial(),
  };
}

function state(heights: number[], over: Partial<DressState> = {}): DressState {
  return {
    x: 0, z: 0, yaw: 0, speed: 0, slip: 0, spin: 0, driving: false, steer: 0,
    pivot: false, braking: false, airborne: false, heights: Float32Array.from(heights),
    pitch: 0, gearIon: false, ionOwned: false, vx: 0, vz: 0, ...over,
  };
}

/** Run the dress long enough for its eased values to settle. */
function settle(p: RoverParts, s: DressState, seconds = 2) {
  const dress = makeRoverDress(p, terrain, dust, prints);
  for (let t = 0; t < seconds * 60; t++) dress(1 / 60, s);
}

describe('rover suspension', () => {
  it('leaves the wishbones level on flat ground', () => {
    const p = parts();
    settle(p, state([0, 0, 0, 0]));
    for (const arm of p.arms) expect(Math.abs(arm.rotation.z)).toBeLessThan(1e-3);
  });

  it('leaves them level on a plane the body itself can lean to', () => {
    // A pure side slope: every corner lies on one plane, so nothing is left over.
    const p = parts();
    settle(p, state([0, 0, 0.3, 0.3]));
    for (const arm of p.arms) expect(Math.abs(arm.rotation.z)).toBeLessThan(1e-3);
  });

  it('takes up a twist one corner at a time', () => {
    // One wheel on a rock: the plane through four points cannot follow it.
    const p = parts();
    settle(p, state([0.2, 0, 0, 0]));
    const tilts = p.arms.map((a) => a.rotation.z);
    expect(Math.abs(tilts[0])).toBeGreaterThan(0.05);
    // The −X corners move one way, the +X corners the other, and the twist
    // is shared evenly between the two diagonals.
    expect(Math.sign(tilts[0])).toBe(-Math.sign(tilts[1]));
    expect(Math.abs(tilts[0])).toBeCloseTo(Math.abs(tilts[3]), 3);
  });

  it('hangs the wheels level in the air', () => {
    const p = parts();
    settle(p, state([0.2, 0, 0, 0], { airborne: true }));
    for (const arm of p.arms) expect(Math.abs(arm.rotation.z)).toBeLessThan(1e-3);
  });

  it('steers the front corners against the rear ones', () => {
    const p = parts();
    settle(p, state([0, 0, 0, 0], { driving: true, steer: 1 }));
    expect(p.steer[0].rotation.y).toBeCloseTo(p.steer[2].rotation.y, 6);
    expect(p.steer[1].rotation.y).toBeCloseTo(-p.steer[0].rotation.y, 6);
    expect(Math.abs(p.steer[0].rotation.y)).toBeGreaterThan(0.3);
  });
});
