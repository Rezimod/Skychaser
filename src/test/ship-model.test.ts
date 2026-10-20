import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// A stand-in for the fighter's file: the node tree the Blender export
// writes (metres, glTF axes), without a fetch.
const released = vi.fn();
function fakeFighter(): THREE.Group {
  const scene = new THREE.Group();
  const root = new THREE.Object3D();
  root.name = 'ShipFighter';
  scene.add(root);
  const hullMat = new THREE.MeshStandardMaterial({ name: 'ShipFighterHull' });
  const lampMat = new THREE.MeshStandardMaterial({ name: 'ShipFighterLamp' });
  const body = new THREE.Group();
  body.name = 'ShipFighter_Body';
  body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMat), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lampMat));
  const lod1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMat);
  lod1.name = 'ShipFighter_Body_LOD1';
  root.add(body, lod1);
  const hinge = new THREE.Object3D();
  hinge.name = 'Wing_PU';
  hinge.position.set(2, 0.26, 2);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMat);
  wing.name = 'Wing_PU_Mesh';
  const cannon = new THREE.Object3D();
  cannon.name = 'Cannon_PU';
  cannon.position.set(2, 0.14, 4);
  const nav = new THREE.Object3D();
  nav.name = 'Nav_Port';
  hinge.add(wing, cannon, nav);
  const engine = new THREE.Object3D();
  engine.name = 'Engine_P';
  engine.position.set(1.55, 0, -5.2);
  engine.scale.setScalar(0.4);
  const jet = new THREE.Object3D();
  jet.name = 'Rcs_N_PX';
  jet.position.set(0.95, 0.12, 3.4);
  root.add(hinge, engine, jet);
  return scene;
}

vi.mock('@/game/models', () => ({
  acquireModel: () => Promise.resolve({ scene: fakeFighter(), release: released }),
}));

beforeAll(() => {
  const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
});

describe('model ships', () => {
  it('places the flight parts from the model’s empties, at flight scale', async () => {
    const { buildXfoil } = await import('@/lib/solar-system/ship-mesh');
    const H = 1;
    const parts = buildXfoil(H);
    // Nothing yet: the model arrives asynchronously.
    expect(parts.wings).toHaveLength(0);
    await Promise.resolve();
    await Promise.resolve();
    const s = (8 * H) / 12.5;

    expect(parts.wings).toHaveLength(1);
    const w = parts.wings[0];
    expect(w.axis).toBe('z');
    expect(w.side).toBe(1);
    expect(w.open).toBeCloseTo(0.34);
    expect(w.pivot.position.x).toBeCloseTo(2 * s);
    // The gun port rides the wing, so it spreads when the wings open.
    expect(parts.cannonTips).toHaveLength(1);
    expect(parts.cannonTips[0].parent).toBe(w.pivot);
    expect(parts.cannonTips[0].position.z).toBeCloseTo(4 * s);
    expect(parts.navMats).toHaveLength(1);

    expect(parts.glowSprites).toHaveLength(1);
    expect(parts.plumes).toHaveLength(1);
    expect(parts.glowSprites[0].position.z).toBeLessThan(-5.2 * s);
    expect(parts.rcs).toHaveLength(1);
    expect(parts.rcs[0].yaw).toBe(1);

    // The hull wears the ship's own skin so heat can glow through it.
    expect(parts.skinMat.name).toBe('ShipFighterHull');
    const lod = parts.hull.getObjectByProperty('type', 'LOD') as THREE.LOD;
    expect(lod.levels).toHaveLength(2);

    parts.release?.();
    expect(released).toHaveBeenCalledTimes(1);
    expect(parts.hull.getObjectByProperty('type', 'LOD')).toBeUndefined();
    // Code-built parts stay for the ship's own dispose.
    expect(w.pivot.parent).toBe(parts.hull);
  });
});
