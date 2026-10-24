// Meshes for the alien craft that meet the player in Explore Mode, beyond
// the original saucer, dart, mothership and probe in aliens.ts. Each kind is
// built once — parts sharing a material are merged into one geometry, so a
// craft is a handful of draw calls — and further copies are clones that
// share the geometry and materials. Forward is +Z; `s` is the saucer unit.
//
// Every material here is a plain MeshStandardMaterial, MeshBasicMaterial or
// glow SpriteMaterial, the same kinds the rest of the flight scene uses, so
// a new craft coming into view never compiles a new shader mid-fight.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge parts into one geometry and free the parts. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Some primitives are indexed and some are not: make them agree.
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const out = mergeGeometries(flat, false)!;
  for (const p of parts) p.dispose();
  for (const p of flat) p.dispose();
  return out;
}

function halo(tex: THREE.Texture, color: THREE.ColorRepresentation, opacity: number, size: number): THREE.Sprite {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sp.scale.setScalar(size);
  return sp;
}

/** Lantern — the greeter. A pale glass bell over a ring of lights that cycle
 *  through colours, trailing soft fronds. The light ring's material is
 *  returned so the encounter can play it. */
export function buildLantern(s: number, tex: THREE.Texture): { group: THREE.Group; lights: THREE.MeshBasicMaterial; glow: THREE.SpriteMaterial } {
  const g = new THREE.Group();
  const bell = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0xd9eefc, roughness: 0.25, metalness: 0.3, emissive: 0x6a7cff, emissiveIntensity: 0.55 }),
  );
  bell.rotation.x = -Math.PI / 2; // dome faces forward
  g.add(bell);
  const fronds: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const f = new THREE.CylinderGeometry(s * 0.012, s * 0.004, s * 0.6, 4);
    f.rotateX(Math.PI / 2);
    f.translate(Math.cos(a) * s * 0.2, Math.sin(a) * s * 0.2, -s * 0.34);
    fronds.push(f);
  }
  const ring = new THREE.TorusGeometry(s * 0.3, s * 0.02, 6, 28);
  fronds.push(ring);
  g.add(new THREE.Mesh(merge(fronds), new THREE.MeshStandardMaterial({ color: 0x8fa3d6, roughness: 0.4, metalness: 0.6 })));
  const lightParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lightParts.push(new THREE.SphereGeometry(s * 0.035, 6, 5).translate(Math.cos(a) * s * 0.33, Math.sin(a) * s * 0.33, 0));
  }
  const lights = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.1, 2.2) });
  g.add(new THREE.Mesh(merge(lightParts), lights));
  const glowSprite = halo(tex, 0xa8b8ff, 0.55, s * 1.8);
  g.add(glowSprite);
  return { group: g, lights, glow: glowSprite.material };
}

/** Hauler — the trader. A long spine carrying a stack of cargo pods, a
 *  bulbous bridge, and a habitat ring that turns. Returns the ring so the
 *  encounter can spin it. */
export function buildHauler(s: number, tex: THREE.Texture): { group: THREE.Group; ring: THREE.Object3D } {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 0.6, metalness: 0.55 });
  const podMat = new THREE.MeshStandardMaterial({ color: 0xc58a3a, roughness: 0.55, metalness: 0.4 });
  const spine: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(s * 0.12, s * 0.12, s * 1.5),
    new THREE.SphereGeometry(s * 0.2, 14, 10).scale(1, 0.8, 1.2).translate(0, 0, s * 0.8),
    new THREE.CylinderGeometry(s * 0.14, s * 0.2, s * 0.24, 10).rotateX(Math.PI / 2).translate(0, 0, -s * 0.82),
  ];
  g.add(new THREE.Mesh(merge(spine), hullMat));
  const pods: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      pods.push(new THREE.BoxGeometry(s * 0.18, s * 0.18, s * 0.26).translate(side * s * 0.17, (i % 2 ? 1 : -1) * s * 0.04, (i - 1.5) * s * 0.3));
    }
  }
  g.add(new THREE.Mesh(merge(pods), podMat));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.42, s * 0.04, 6, 24), hullMat);
  ring.position.z = s * 0.35;
  g.add(ring);
  const lamps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    lamps.push(new THREE.SphereGeometry(s * 0.03, 5, 4).translate(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42, s * 0.35));
  }
  lamps.push(new THREE.BoxGeometry(s * 0.2, s * 0.03, s * 0.05).translate(0, s * 0.1, s * 0.9));
  g.add(new THREE.Mesh(merge(lamps), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.4, 0.5) })));
  const engine = halo(tex, 0xffc070, 0.6, s * 0.7);
  engine.position.z = -s * 0.98;
  g.add(engine);
  return { group: g, ring };
}

/** Raider — a pirate fighter. A black wedge with forward-swept blades, red
 *  slashes and twin hot engines. */
export function buildRaider(s: number, tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const body: THREE.BufferGeometry[] = [
    new THREE.ConeGeometry(s * 0.13, s * 0.75, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.5, 1),
  ];
  for (const side of [-1, 1]) {
    const blade = new THREE.BoxGeometry(s * 0.42, s * 0.018, s * 0.12);
    blade.rotateY(side * 0.55);
    blade.translate(side * s * 0.2, 0, s * 0.02);
    body.push(blade);
    body.push(new THREE.CylinderGeometry(s * 0.05, s * 0.06, s * 0.26, 6).rotateX(Math.PI / 2).translate(side * s * 0.1, 0, -s * 0.24));
  }
  g.add(new THREE.Mesh(merge(body), new THREE.MeshStandardMaterial({ color: 0x24202a, roughness: 0.45, metalness: 0.8 })));
  const trim: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const slash = new THREE.BoxGeometry(s * 0.3, s * 0.024, s * 0.03);
    slash.rotateY(side * 0.55);
    slash.translate(side * s * 0.22, s * 0.012, s * 0.07);
    trim.push(slash);
    trim.push(new THREE.SphereGeometry(s * 0.045, 7, 6).translate(side * s * 0.1, 0, -s * 0.38));
  }
  trim.push(new THREE.BoxGeometry(s * 0.05, s * 0.03, s * 0.16).translate(0, s * 0.05, s * 0.12));
  g.add(new THREE.Mesh(merge(trim), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.35, 0.3) })));
  const glow = halo(tex, 0xff5a4a, 0.65, s * 0.6);
  glow.position.z = -s * 0.44;
  g.add(glow);
  return g;
}

/** Drone — a swarm unit: a small spiked core with a single red eye. */
export function buildDrone(s: number, tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [new THREE.OctahedronGeometry(s * 0.12, 0)];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  for (const [x, y, z] of dirs) {
    const spike = new THREE.ConeGeometry(s * 0.025, s * 0.16, 4);
    // Cone points +Y; turn it to point along the direction.
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x, y, z)));
    spike.translate(x * s * 0.15, y * s * 0.15, z * s * 0.15);
    parts.push(spike);
  }
  g.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0x5a4c66, roughness: 0.35, metalness: 0.85, emissive: 0x401040, emissiveIntensity: 0.8 })));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(s * 0.045, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.8, 0.4, 1.2) }));
  eye.position.z = s * 0.1;
  g.add(eye);
  g.add(halo(tex, 0xff60c0, 0.5, s * 0.5));
  return g;
}

/** Gunship — the boss. A hammerhead: a long armoured hull, a wide prow
 *  bar with four turret domes, a lit hangar slot and three engines. */
export function buildGunship(s: number, tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const hull: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(s * 0.34, s * 0.22, s * 1.6),
    new THREE.BoxGeometry(s * 1.3, s * 0.14, s * 0.34).translate(0, 0, s * 0.72),
    new THREE.BoxGeometry(s * 0.6, s * 0.3, s * 0.5).translate(0, s * 0.08, -s * 0.4),
  ];
  for (let i = 0; i < 3; i++) {
    hull.push(new THREE.CylinderGeometry(s * 0.08, s * 0.1, s * 0.22, 8).rotateX(Math.PI / 2).translate((i - 1) * s * 0.18, 0, -s * 0.86));
  }
  g.add(new THREE.Mesh(merge(hull), new THREE.MeshStandardMaterial({ color: 0x3b3d46, roughness: 0.55, metalness: 0.8 })));
  const turrets: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * s * 0.36;
    turrets.push(new THREE.SphereGeometry(s * 0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, s * 0.07, s * 0.72));
    turrets.push(new THREE.CylinderGeometry(s * 0.012, s * 0.012, s * 0.2, 5).rotateX(Math.PI / 2).translate(x, s * 0.11, s * 0.84));
  }
  g.add(new THREE.Mesh(merge(turrets), new THREE.MeshStandardMaterial({ color: 0x7d2a2a, roughness: 0.4, metalness: 0.7 })));
  const lit: THREE.BufferGeometry[] = [new THREE.BoxGeometry(s * 0.2, s * 0.05, s * 0.3).translate(0, -s * 0.12, s * 0.1)];
  for (let i = 0; i < 3; i++) lit.push(new THREE.SphereGeometry(s * 0.07, 8, 6).translate((i - 1) * s * 0.18, 0, -s * 0.98));
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) lit.push(new THREE.BoxGeometry(s * 0.01, s * 0.03, s * 0.06).translate(side * s * 0.172, s * 0.03, (i / 5 - 0.5) * s * 1.1));
  }
  g.add(new THREE.Mesh(merge(lit), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 0.35) })));
  const glow = halo(tex, 0xff7040, 0.7, s * 1.4);
  glow.position.z = -s * 1.05;
  g.add(glow);
  return g;
}

/** Mine — a spiked ball. The blinking light's material is per mine, so the
 *  caller adds it to each copy. */
export function buildMine(s: number): THREE.Group {
  const g = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(s * 0.14, 0)];
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const pos = ico.getAttribute('position') as THREE.BufferAttribute;
  const seen = new Set<string>();
  const v = new THREE.Vector3();
  const upY = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const spike = new THREE.ConeGeometry(s * 0.025, s * 0.12, 4);
    spike.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(upY, v));
    spike.translate(v.x * s * 0.17, v.y * s * 0.17, v.z * s * 0.17);
    parts.push(spike);
  }
  ico.dispose();
  g.add(new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0x4a4f44, roughness: 0.6, metalness: 0.7 })));
  return g;
}

/** Wreck — a derelict: a broken hull in two pieces with torn plating and a
 *  cold, half-dead light. */
export function buildWreck(s: number, tex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c5850, roughness: 0.85, metalness: 0.5 });
  const fore: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(s * 0.2, s * 0.24, s * 0.8, 9, 1, true).rotateX(Math.PI / 2).translate(0, 0, s * 0.35),
    new THREE.ConeGeometry(s * 0.2, s * 0.3, 9).rotateX(Math.PI / 2).translate(0, 0, s * 0.9),
    new THREE.BoxGeometry(s * 0.7, s * 0.03, s * 0.2).rotateZ(0.3).translate(s * 0.2, s * 0.05, s * 0.3),
  ];
  const aft: THREE.BufferGeometry[] = [
    new THREE.CylinderGeometry(s * 0.24, s * 0.22, s * 0.6, 9, 1, true).rotateX(Math.PI / 2),
    new THREE.CylinderGeometry(s * 0.12, s * 0.18, s * 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, -s * 0.38),
    new THREE.BoxGeometry(s * 0.04, s * 0.5, s * 0.16).rotateX(0.5).translate(0, s * 0.22, -s * 0.1),
  ];
  const foreMesh = new THREE.Mesh(merge(fore), mat);
  foreMesh.position.set(s * 0.08, s * 0.05, s * 0.12);
  foreMesh.rotation.set(0.25, 0.35, 0.1);
  g.add(foreMesh);
  const aftMesh = new THREE.Mesh(merge(aft), mat);
  aftMesh.position.set(-s * 0.06, -s * 0.04, -s * 0.5);
  aftMesh.rotation.set(-0.2, -0.3, 0.4);
  g.add(aftMesh);
  const debris: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    debris.push(new THREE.BoxGeometry(s * 0.08, s * 0.02, s * 0.06).rotateY(a).rotateX(a * 0.7)
      .translate(Math.cos(a) * s * 0.45, Math.sin(a * 1.3) * s * 0.25, Math.sin(a) * s * 0.4));
  }
  g.add(new THREE.Mesh(merge(debris), mat));
  const light = halo(tex, 0x9ac8ff, 0.35, s * 0.5);
  light.position.set(0, 0, s * 0.2);
  g.add(light);
  return g;
}

/** Beacon — an alien buoy: a tall spire threaded through three rings, a
 *  light at its tip. Returns the rings (to turn) and the tip's glow. */
export function buildBeacon(s: number, tex: THREE.Texture): { group: THREE.Group; rings: THREE.Object3D[]; tip: THREE.SpriteMaterial } {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xa6b4b0, roughness: 0.3, metalness: 0.9, emissive: 0x1a4a40, emissiveIntensity: 0.6 });
  const spire = [
    new THREE.CylinderGeometry(s * 0.02, s * 0.06, s * 1.4, 6),
    new THREE.OctahedronGeometry(s * 0.1, 0).translate(0, -s * 0.72, 0),
  ];
  g.add(new THREE.Mesh(merge(spire), metal));
  const rings: THREE.Object3D[] = [];
  const ringGeo = new THREE.TorusGeometry(s * 0.3, s * 0.015, 5, 28);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.9, 1.5) });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.position.y = (i - 1) * s * 0.32;
    r.scale.setScalar(1 - Math.abs(i - 1) * 0.25);
    rings.push(r);
    g.add(r);
  }
  const tip = halo(tex, 0x7dffd0, 0.9, s * 0.9);
  tip.position.y = s * 0.75;
  g.add(tip);
  return { group: g, rings, tip: tip.material };
}
