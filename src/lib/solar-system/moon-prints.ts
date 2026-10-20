// Boot prints. There is no wind on the Moon: every footfall stays. A ring
// buffer of instanced decals pressed into the regolith wherever the
// cosmonaut steps — and a wider track behind the rover's wheels.

import * as THREE from 'three';

export interface PrintsHandle {
  mesh: THREE.InstancedMesh;
  /** A boot, at (x, z) facing `yaw`; `side` −1 left / +1 right. */
  stamp: (x: number, y: number, z: number, yaw: number, side: number) => void;
  /** A wheel track segment: wider, shallower. */
  track: (x: number, y: number, z: number, yaw: number, width: number) => void;
  /** How many prints stay before the oldest is recycled (the preset's cap, live). */
  setCap: (n: number) => void;
  /** A crater swallowed the ground within r: its prints go with it. */
  clear: (x: number, z: number, r: number) => void;
  dispose: () => void;
}

// One boot drawing for every ring buffer on the surface, gone when the last one goes.
let sharedBoot: THREE.CanvasTexture | null = null;
let bootUsers = 0;
function acquireBoot(): THREE.CanvasTexture {
  bootUsers += 1;
  if (!sharedBoot) sharedBoot = bootTexture();
  return sharedBoot;
}
function releaseBoot() {
  bootUsers -= 1;
  if (bootUsers <= 0 && sharedBoot) { sharedBoot.dispose(); sharedBoot = null; bootUsers = 0; }
}

function bootTexture(): THREE.CanvasTexture {
  const w = 64; const h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  // Sole outline: a rounded lozenge, a touch wider at the toe.
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.32, w * 0.36, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w / 2, h * 0.7, w * 0.33, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tread bars.
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  for (let y = 12; y < h - 10; y += 11) ctx.fillRect(w * 0.22, y, w * 0.56, 5);
  // Soft edge: the regolith slumps at the rim.
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.55);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** `max` decals are allocated and `cap` of them used. */
export function makePrints(max: number, cap = max): PrintsHandle {
  const geom = new THREE.PlaneGeometry(0.19, 0.4);
  geom.rotateX(-Math.PI / 2);
  const tex = acquireBoot();
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, depthWrite: false, roughness: 1, metalness: 0,
    color: 0x111111, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, max);
  mesh.count = 0;
  mesh.receiveShadow = true;
  mesh.name = 'boot-prints';
  // The prints are wherever the crew has been: a sphere that grows to hold them all.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const bounds = new THREE.Box3();
  const m = new THREE.Matrix4(); const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let head = 0;
  let limit = Math.max(1, Math.min(max, cap));
  const put = (x: number, y: number, z: number, yaw: number, sx: number, sz: number) => {
    p.set(x, y + 0.012, z);
    q.setFromAxisAngle(up, yaw);
    s.set(sx, 1, sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(head, m);
    // Only the one decal goes up to the GPU, not the whole buffer.
    mesh.instanceMatrix.addUpdateRange(head * 16, 16);
    mesh.instanceMatrix.needsUpdate = true;
    head = (head + 1) % limit;
    if (mesh.count < limit) mesh.count += 1;
    bounds.expandByPoint(p);
    bounds.getBoundingSphere(mesh.boundingSphere!).radius += Math.max(sx, sz) * 0.5;
  };
  return {
    mesh,
    stamp(x, y, z, yaw, side) {
      const ox = Math.cos(yaw) * side * 0.13; const oz = -Math.sin(yaw) * side * 0.13;
      put(x + ox, y, z + oz, yaw + (Math.random() - 0.5) * 0.15, 1, 1);
    },
    track(x, y, z, yaw, width) {
      put(x, y, z, yaw, width / 0.16, 1.4);
    },
    clear(x, z, r) {
      let hit = false;
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        if ((p.x - x) ** 2 + (p.z - z) ** 2 > r * r) continue;
        mesh.setMatrixAt(i, m.makeScale(0, 0, 0));
        hit = true;
      }
      if (hit) mesh.instanceMatrix.needsUpdate = true;
    },
    setCap(n) {
      limit = Math.max(1, Math.min(max, Math.round(n)));
      if (head >= limit) head = 0;
      if (mesh.count > limit) mesh.count = limit;
    },
    dispose() {
      geom.dispose(); mat.dispose(); releaseBoot(); mesh.dispose();
    },
  };
}
