import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeShipFx, type ShipFxFrame } from '@/lib/solar-system/ship-fx';

const H = 1;

function rig() {
  const hull = new THREE.Group();
  hull.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 8), new THREE.MeshStandardMaterial()));
  const engines = [new THREE.Object3D(), new THREE.Object3D()];
  engines[0].position.set(-0.6, 0, -4.4);
  engines[1].position.set(0.6, 0, -4.4);
  for (const e of engines) hull.add(e);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
  camera.position.set(0, 3, -20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const frame: ShipFxFrame = {
    emitters: engines, hull, camera, throttle: 1, boost: false,
    color: new THREE.Color(0x66ccff), hullFrac: 1, visible: true,
  };
  return { hull, frame };
}

const trails = (g: THREE.Group) => g.children.filter((o) => (o as THREE.Mesh).isMesh);
const puffs = (g: THREE.Group) => g.children.find((o) => (o as THREE.Points).isPoints) as THREE.Points;

describe('what the ship leaves behind it', () => {
  it('draws a trail from each engine while it burns, and drops them all when the ship is gone', () => {
    const fx = makeShipFx(H, 8);
    const { hull, frame } = rig();
    for (let i = 0; i < 30; i++) {
      hull.position.z += 0.5;
      hull.updateMatrixWorld(true);
      fx.update(1 / 60, frame);
    }
    const lit = trails(fx.group).filter((m) => m.visible);
    expect(lit.length).toBe(2);
    const alpha = (lit[0] as THREE.Mesh).geometry.getAttribute('aAlpha').array as Float32Array;
    expect(Math.max(...alpha)).toBeGreaterThan(0.3);
    // A trail is laid in space: its far end is behind the ship.
    const pos = (lit[0] as THREE.Mesh).geometry.getAttribute('position').array as Float32Array;
    expect(Math.min(...Array.from(pos).filter((_, i) => i % 3 === 2))).toBeLessThan(hull.position.z - 8);
    fx.update(1 / 60, { ...frame, visible: false });
    expect(trails(fx.group).every((m) => !m.visible)).toBe(true);
    fx.dispose();
  });

  it('keeps the streak short however fast the ship goes', () => {
    const fx = makeShipFx(H, 8);
    const { hull, frame } = rig();
    for (let i = 0; i < 40; i++) {
      hull.position.z += 500;
      hull.updateMatrixWorld(true);
      fx.update(1 / 60, frame);
    }
    const m = trails(fx.group).find((o) => o.visible) as THREE.Mesh;
    const pos = m.geometry.getAttribute('position').array as Float32Array;
    const zs = Array.from(pos).filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(80 * H);
    fx.dispose();
  });

  it('flares the shield where it is hit, and lets it fade', () => {
    const fx = makeShipFx(H, 8);
    const { hull, frame } = rig();
    fx.update(1 / 60, frame);
    expect(fx.shield.parent).toBe(hull);
    expect(fx.shield.visible).toBe(false);
    fx.shieldHit(new THREE.Vector3(10, 0, 0), 0.5);
    fx.update(1 / 60, frame);
    expect(fx.shield.visible).toBe(true);
    const hit = (fx.shield.material as THREE.ShaderMaterial).uniforms.uHit.value as THREE.Vector3;
    expect(hit.x).toBeGreaterThan(0.9);
    for (let i = 0; i < 60; i++) fx.update(1 / 60, frame);
    expect(fx.shield.visible).toBe(false);
    fx.dispose();
  });

  it('smokes only once the hull is badly hurt', () => {
    const fx = makeShipFx(H, 8);
    const { frame } = rig();
    for (let i = 0; i < 30; i++) fx.update(1 / 60, { ...frame, hullFrac: 0.8 });
    expect(puffs(fx.group).visible).toBe(false);
    for (let i = 0; i < 30; i++) fx.update(1 / 60, { ...frame, hullFrac: 0.2 });
    expect(puffs(fx.group).visible).toBe(true);
    fx.clear();
    expect(puffs(fx.group).visible).toBe(false);
    fx.dispose();
  });
});
