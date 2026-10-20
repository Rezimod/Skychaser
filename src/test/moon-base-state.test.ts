import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The base draws its labels on canvas; jsdom has none, so hand it a stub.
const gradient = { addColorStop: () => {} };
const ctx = new Proxy({}, {
  get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
    : k === 'createRadialGradient' || k === 'createLinearGradient' ? () => gradient
      : k === 'measureText' ? () => ({ width: 10 }) : () => {}),
});
const getContext = HTMLCanvasElement.prototype.getContext;
beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => ctx) as never; });
afterAll(() => { HTMLCanvasElement.prototype.getContext = getContext; });

const flat = () => 0;

describe('the base state hooks', () => {
  it('browns out the base, not the rover, and comes back', async () => {
    const { makeKit } = await import('@/lib/solar-system/moon-kit');
    const { makeMoonBase } = await import('@/lib/solar-system/moon-base');
    const kit = makeKit(true);
    const base = makeMoonBase(flat, true, kit, new THREE.Vector3(-0.62, 0.3, 0.72).normalize());
    const earth = new THREE.Vector3(0, 0.2, -1).normalize();
    const screens: THREE.MeshStandardMaterial[] = [];
    const rover = new Set<THREE.Object3D>();
    base.rover.traverse((o) => rover.add(o));
    base.group.traverse((o) => {
      if (rover.has(o)) return;
      const mt = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mt?.emissive && mt.emissive.getHex() === 0x5eead4 && !screens.includes(mt)) screens.push(mt);
    });
    const full = Math.max(...screens.map((mt) => mt.emissiveIntensity));
    expect(full).toBeGreaterThan(0.5);
    const roverScreen = kit.mat.screen.emissiveIntensity;

    base.setState({ power: false });
    for (let i = 0; i < 120; i++) base.update(1 / 60, i / 60, earth, 0, 40);
    for (const mt of screens) expect(mt.emissiveIntensity).toBeLessThan(full * 0.05);
    expect(kit.mat.screen.emissiveIntensity).toBe(roverScreen);

    base.setState({ power: true });
    for (let i = 0; i < 300; i++) base.update(1 / 60, 2 + i / 60, earth, 0, 40);
    expect(Math.max(...screens.map((mt) => mt.emissiveIntensity))).toBeGreaterThan(full * 0.9);
    base.dispose();
  });

  it('knocks the dish off Earth and puts it back', async () => {
    const { makeKit } = await import('@/lib/solar-system/moon-kit');
    const { makeMoonBase } = await import('@/lib/solar-system/moon-base');
    const base = makeMoonBase(flat, true, makeKit(true), new THREE.Vector3(-0.62, 0.3, 0.72).normalize());
    base.setState({ dishAligned: false });
    expect(Math.abs(base.zones.dishFault.yaw)).toBeGreaterThan(0.3);
    base.setState({ dishAligned: true });
    expect(base.zones.dishFault.yaw).toBe(0);
    expect(base.zones.dishFault.pitch).toBe(0);
    expect(base.zones.anchors.telescope).toBeDefined();
    base.dispose();
  });
});
