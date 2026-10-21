import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// A stand-in for cosmonaut.glb: one skinned vertex on the right forearm and
// one rigid helmet vertex, both in rest-pose space as the Blender export is.
vi.mock('@/game/models', () => ({
  acquireModel: async () => {
    const scene = new THREE.Group();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0.34, 1.0, 0.05], 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0], 4));
    const bone = new THREE.Bone();
    bone.name = 'elbow1';
    const body = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
    body.name = 'Body';
    body.bind(new THREE.Skeleton([bone]));
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.89, 0.2], 3));
    const helmet = new THREE.Mesh(hg, new THREE.MeshStandardMaterial());
    helmet.name = 'Helmet';
    scene.add(body, helmet);
    return { scene, release: () => undefined };
  },
}));

describe('the hardware on the rig', () => {
  it('builds the jet module, console, lamps and ring on their joints, merged and within budget', async () => {
    const { buildSuitGear } = await import('@/lib/solar-system/suit-gear');
    const pack = new THREE.Bone(); const chest = new THREE.Bone(); const helmet = new THREE.Group();
    const gear = buildSuitGear({ pack, chest, helmet });
    expect(gear.nozzles).toHaveLength(2);
    expect(gear.nozzles.every((n) => n.parent?.parent === pack)).toBe(true);
    // Both nozzles hang under the pack pivot, one each side.
    expect(gear.nozzles.map((n) => Math.sign(n.position.x)).sort()).toEqual([-1, 1]);
    expect(gear.nozzles.every((n) => n.position.y < -0.4)).toBe(true);
    expect(chest.children.some((o) => o.name === 'chest-gear')).toBe(true);
    expect(helmet.children.some((o) => o.name === 'helmet-ring')).toBe(true);
    // Merged: a handful of meshes a joint, not one a bolt.
    const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n += 1; }); return n; };
    expect(meshes(pack)).toBeLessThan(14);
    expect(meshes(chest)).toBeLessThan(12);
    expect(gear.triangles).toBeGreaterThan(500);
    expect(gear.triangles).toBeLessThan(6000);
    // The far LOD drops the fittings and keeps the big shapes.
    const fittings = [pack, chest, helmet].flatMap((j) => { const f: THREE.Object3D[] = []; j.traverse((o) => { if (o.name.endsWith('-fittings')) f.push(o); }); return f; });
    expect(fittings.length).toBe(3);
    gear.setDetail(false);
    expect(fittings.every((f) => !f.visible)).toBe(true);
    gear.setDetail(true);
    expect(fittings.every((f) => f.visible)).toBe(true);
    // The flame is drawn at no size until the throttle comes up, then scales with it.
    const flames = gear.nozzles.map((n) => n.children.find((o) => o.children.length > 0)!);
    expect(flames.every((f) => f.scale.y < 0.01)).toBe(true);
    gear.setThrottle(1, 0.5);
    expect(flames.every((f) => f.scale.y > 0.7)).toBe(true);
    gear.setThrottle(0, 1);
    expect(flames.every((f) => f.scale.y < 0.01)).toBe(true);
    gear.dispose();
    expect(pack.children).toHaveLength(0);
  });

  it('leaves the pack and the ring off a bare-headed pilot', async () => {
    const { buildSuitGear } = await import('@/lib/solar-system/suit-gear');
    const pack = new THREE.Bone(); const chest = new THREE.Bone(); const helmet = new THREE.Group();
    const gear = buildSuitGear({ pack, chest, helmet }, true);
    expect(gear.nozzles).toHaveLength(0);
    expect(pack.children).toHaveLength(0);
    expect(helmet.children).toHaveLength(0);
    expect(chest.children.length).toBeGreaterThan(0);
    gear.dispose();
  });
});

describe('the cosmonaut model on the rig', () => {
  it('moves a skinned vertex with its joint and the helmet with the neck', async () => {
    const { buildSuit } = await import('@/lib/solar-system/moon-suit-mesh');
    const rig = buildSuit(false);
    await rig.ready;
    rig.group.position.set(5, 2, -3);
    rig.group.rotation.y = 0.7;
    rig.elbows[1].rotation.x = -0.9;
    rig.shoulders[1].rotation.z = 0.3;
    rig.neck.rotation.set(-0.2, 0.5, 0);
    rig.group.updateMatrixWorld(true);

    let skinned: THREE.SkinnedMesh | undefined;
    let helmet: THREE.Mesh | undefined;
    rig.group.traverse((o) => {
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
      else if ((o as THREE.Mesh).isMesh && o.parent === rig.helmet) helmet = o as THREE.Mesh;
    });
    skinned!.skeleton.update();
    const got = skinned!.getVertexPosition(0, new THREE.Vector3()).applyMatrix4(skinned!.matrixWorld);
    // Rest elbow pivot: chest 1.11 + shoulder 0.4 − 0.34 = 1.17, at x 0.34.
    const want = rig.elbows[1].localToWorld(new THREE.Vector3(0, 1.0 - 1.17, 0.05));
    expect(got.distanceTo(want)).toBeLessThan(1e-5);

    const h = new THREE.Vector3(0, 1.89, 0.2).applyMatrix4(helmet!.matrixWorld);
    const hw = rig.neck.localToWorld(new THREE.Vector3(0, 1.89 - 1.69, 0.2 - 0.01));
    expect(h.distanceTo(hw)).toBeLessThan(1e-5);
    rig.dispose();
  });
});
