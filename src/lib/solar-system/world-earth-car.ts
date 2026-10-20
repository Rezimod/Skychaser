// A small city car to get round Tbilisi in: a generic five-door hatchback,
// parked by the pad. It drives like a game car rather than a simulation —
// the stick is the throttle and the wheel, the brake becomes reverse once it
// has stopped, Space is the handbrake, and it drifts when the rear lets go —
// but the ground under it is the real one: it pitches up Sololaki's streets,
// rolls over kerbs on four sprung corners, stops against walls, and will not
// go into the river.

import * as THREE from 'three';
import { mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import { withHaze } from '@/lib/solar-system/world-earth-haze';

export interface CarInput {
  /** −1 brake / reverse … 1 throttle. */
  throttle: number;
  /** −1 left … 1 right. */
  steer: number;
  handbrake: boolean;
}

export interface CarWorld {
  floorAt: (x: number, z: number) => number;
  /** Push a circle out of walls; true when it hit something. */
  pushOut: (pos: THREE.Vector3, radius: number) => boolean;
  isWater: (x: number, z: number) => boolean;
  colliders: () => Collider[];
}

export interface CarHandle {
  group: THREE.Group;
  position: THREE.Vector3;
  /** Heading, rad; +z forward at 0, as the crew. */
  yaw: number;
  /** Signed speed along the heading, m/s. */
  speed: number;
  /** Sideways slide, m/s. */
  slip: number;
  /** A knock this step, 0…1: the camera's jolt. */
  bump: number;
  /** Where the driver's door is, for getting in. */
  door: (out: THREE.Vector3) => THREE.Vector3;
  update: (dt: number, input: CarInput, world: CarWorld, night: number) => void;
  present: (alpha: number) => void;
  dispose: () => void;
}

const WHEELBASE = 2.45;
const TRACK = 1.44;
const RADIUS = 0.31;
const TOP = 34;
const REVERSE_TOP = 7;
const MAX_STEER = 0.62;
const HULL_R = 1.9;

const srgb = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

export function makeCar(x: number, z: number, yaw: number, floorAt: (x: number, z: number) => number, lite: boolean): CarHandle {
  const group = new THREE.Group();
  group.name = 'player-car';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const own = <M extends THREE.Material>(m: M, key: string) => { materials.push(withHaze(m, `car-${key}`)); return m; };
  const paint = own(new THREE.MeshPhysicalMaterial({ color: srgb(0.82, 0.13, 0.12), roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 }), 'paint');
  const glass = own(new THREE.MeshStandardMaterial({ color: srgb(0.05, 0.07, 0.09), roughness: 0.05, metalness: 0.8 }), 'glass');
  const black = own(new THREE.MeshStandardMaterial({ color: srgb(0.06, 0.06, 0.07), roughness: 0.7 }), 'black');
  const chrome = own(new THREE.MeshStandardMaterial({ color: srgb(0.8, 0.8, 0.82), roughness: 0.2, metalness: 1 }), 'chrome');
  const tyre = own(new THREE.MeshStandardMaterial({ color: srgb(0.05, 0.05, 0.05), roughness: 0.95 }), 'tyre');
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(1, 0.95, 0.85), emissiveIntensity: 0.2, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: srgb(0.5, 0.02, 0.02), emissive: new THREE.Color(1, 0.05, 0.03), emissiveIntensity: 0.3, roughness: 0.3 });
  const plate = own(new THREE.MeshStandardMaterial({ color: srgb(0.92, 0.92, 0.9), roughness: 0.6 }), 'plate');
  materials.push(head, tail);
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, px = 0, py = 0, pz = 0) => {
    geometries.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(px, py, pz);
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  const body = pivot(new THREE.Group());
  group.add(body);
  // The side silhouette of a hatchback, nose at +z, extruded across the car.
  const side = new THREE.Shape();
  const pts: [number, number][] = [
    [-1.9, 0.32], [-1.95, 0.62], [-1.88, 0.86], [-1.62, 0.98], [-1.5, 1.36], [-0.25, 1.46], [0.55, 1.4],
    [1.18, 0.98], [1.82, 0.84], [1.96, 0.62], [1.92, 0.34],
  ];
  side.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) side.lineTo(px, py);
  // Along the sill to each wheel arch, and over it.
  side.lineTo(1.62, 0.34);
  side.absarc(1.22, 0.34, 0.4, 0, Math.PI, false);
  side.lineTo(-0.82, 0.34);
  side.absarc(-1.22, 0.34, 0.4, 0, Math.PI, false);
  side.lineTo(-1.9, 0.32);
  const shell = new THREE.ExtrudeGeometry(side, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: lite ? 1 : 3, curveSegments: lite ? 6 : 10 });
  shell.translate(0, 0, -0.81);
  shell.rotateY(-Math.PI / 2);
  add(body, shell, paint);
  // Glass: the windscreen, the rear window and the side glass, set just proud of the shell.
  const pane = (w: number, h: number, px: number, py: number, pz: number, rx: number, ry: number) => {
    const o = add(body, new THREE.PlaneGeometry(w, h), glass, px, py, pz);
    o.rotation.set(rx, ry, 0);
    o.castShadow = false;
    return o;
  };
  pane(1.46, 0.62, 0, 1.2, 0.87, -0.95, 0);
  pane(1.4, 0.44, 0, 1.18, -1.58, 0.3, Math.PI);
  for (const s of [-1, 1]) {
    pane(1.05, 0.36, s * 0.895, 1.2, 0.12, 0, s * Math.PI / 2);
    pane(0.7, 0.34, s * 0.885, 1.2, -1.0, 0, s * Math.PI / 2);
    add(body, new THREE.BoxGeometry(0.1, 0.07, 0.2), black, s * 0.95, 1.02, 0.74);
    add(body, new THREE.BoxGeometry(0.02, 0.02, 3.3), chrome, s * 0.9, 0.62, 0).castShadow = false;
  }
  // Bumpers, lights, grille, plates.
  add(body, new THREE.BoxGeometry(1.7, 0.2, 0.14), black, 0, 0.36, 1.98);
  add(body, new THREE.BoxGeometry(1.7, 0.2, 0.14), black, 0, 0.38, -1.98);
  add(body, new THREE.BoxGeometry(0.9, 0.14, 0.05), black, 0, 0.62, 2.0);
  for (const s of [-1, 1]) {
    add(body, new THREE.BoxGeometry(0.34, 0.12, 0.06), head, s * 0.58, 0.74, 1.98).castShadow = false;
    add(body, new THREE.BoxGeometry(0.28, 0.14, 0.06), tail, s * 0.64, 0.86, -1.99).castShadow = false;
  }
  add(body, new THREE.BoxGeometry(0.52, 0.11, 0.02), plate, 0, 0.42, 2.06).castShadow = false;
  add(body, new THREE.BoxGeometry(0.52, 0.11, 0.02), plate, 0, 0.62, -2.03).castShadow = false;

  // Wheels: each a pivot to spin, the front ones inside a pivot to steer.
  const wheels: { steer: THREE.Object3D; spin: THREE.Object3D; x: number; z: number; front: boolean }[] = [];
  const tyreGeom = new THREE.CylinderGeometry(RADIUS, RADIUS, 0.2, lite ? 12 : 18);
  tyreGeom.rotateZ(Math.PI / 2);
  const rimGeom = new THREE.CylinderGeometry(RADIUS * 0.62, RADIUS * 0.62, 0.21, lite ? 8 : 12);
  rimGeom.rotateZ(Math.PI / 2);
  geometries.push(tyreGeom, rimGeom);
  for (const [wx, wz] of [[-TRACK / 2, WHEELBASE / 2], [TRACK / 2, WHEELBASE / 2], [-TRACK / 2, -WHEELBASE / 2], [TRACK / 2, -WHEELBASE / 2]] as const) {
    const steer = pivot(new THREE.Group());
    steer.position.set(wx, RADIUS, wz - (wz > 0 ? 0.0 : 0.0));
    body.add(steer);
    const spin = pivot(new THREE.Group());
    steer.add(spin);
    const t = new THREE.Mesh(tyreGeom, tyre); t.castShadow = true; spin.add(t);
    const r = new THREE.Mesh(rimGeom, chrome); spin.add(r);
    wheels.push({ steer, spin, x: wx, z: wz, front: wz > 0 });
  }
  const merged = mergeStatic(group, { minCaster: 0.05 });

  const position = new THREE.Vector3(x, floorAt(x, z), z);
  const prev = position.clone();
  let prevYaw = yaw;
  let vLat = 0;
  let yawRate = 0;
  let steerAngle = 0;
  let spinAngle = 0;
  let heave = 0; let heaveVel = 0;
  let pitch = 0; let roll = 0;
  const handle: CarHandle = {
    group, position, yaw, speed: 0, slip: 0, bump: 0,
    door(out) {
      return out.set(position.x + Math.cos(handle.yaw) * 1.6, position.y, position.z - Math.sin(handle.yaw) * 1.6);
    },
    update(dt, input, world, night) {
      prev.copy(position); prevYaw = handle.yaw;
      handle.bump = 0;
      const v = handle.speed;
      // ── Longitudinal: throttle, brake-then-reverse, rolling drag, the hill. ──
      let accel = 0;
      if (input.throttle > 0.05) {
        accel = v < -0.3 ? 12 * input.throttle : 7.5 * input.throttle * (1 - Math.max(0, v) / TOP);
      } else if (input.throttle < -0.05) {
        accel = v > 0.3 ? 12 * input.throttle : 4.5 * input.throttle * (1 - Math.max(0, -v) / REVERSE_TOP);
      } else {
        accel = -Math.sign(v) * Math.min(Math.abs(v) / dt, 1.4 + Math.abs(v) * 0.04);
      }
      if (input.handbrake) accel -= Math.sign(v) * Math.min(Math.abs(v) / dt, 6);
      const fwdX = Math.sin(handle.yaw); const fwdZ = Math.cos(handle.yaw);
      const hAhead = world.floorAt(position.x + fwdX * 1.2, position.z + fwdZ * 1.2);
      const hBehind = world.floorAt(position.x - fwdX * 1.2, position.z - fwdZ * 1.2);
      const grade = (hAhead - hBehind) / 2.4;
      accel -= 9.81 * grade / Math.sqrt(1 + grade * grade);
      handle.speed = THREE.MathUtils.clamp(v + accel * dt, -REVERSE_TOP, TOP);

      // ── Steering: less lock at speed; the rear lets go on the handbrake. ──
      const lock = MAX_STEER / (1 + Math.abs(handle.speed) / 14);
      steerAngle += (input.steer * lock - steerAngle) * (1 - Math.exp(-dt * 8));
      const wantRate = (handle.speed * Math.tan(-steerAngle)) / WHEELBASE;
      const grip = input.handbrake ? 3.2 : 9;
      const rateCap = grip / Math.max(3, Math.abs(handle.speed));
      yawRate += (THREE.MathUtils.clamp(wantRate, -rateCap - (input.handbrake ? 1.4 : 0), rateCap + (input.handbrake ? 1.4 : 0)) - yawRate) * (1 - Math.exp(-dt * (input.handbrake ? 4 : 10)));
      handle.yaw += yawRate * dt;
      // What the tyres could not take out of the turn becomes a slide.
      vLat += (wantRate - yawRate) * handle.speed * dt * (input.handbrake ? 0.6 : 0.25);
      vLat *= Math.exp(-dt * (input.handbrake ? 1.2 : 6));
      handle.slip = vLat;

      // The car's own right, facing +z at zero yaw, is −x.
      const rightX = -Math.cos(handle.yaw); const rightZ = Math.sin(handle.yaw);
      position.x += (Math.sin(handle.yaw) * handle.speed + rightX * vLat) * dt;
      position.z += (Math.cos(handle.yaw) * handle.speed + rightZ * vLat) * dt;

      // ── What it runs into. ──
      if (world.pushOut(position, HULL_R)) {
        handle.bump = Math.min(1, Math.abs(handle.speed) / 12);
        handle.speed *= -0.25;
        vLat *= 0.3;
      }
      for (const c of world.colliders()) {
        const dx = position.x - c.x; const dz = position.z - c.z;
        const d = Math.hypot(dx, dz); const min = c.r + HULL_R;
        if (d < min && d > 1e-3) {
          position.x = c.x + dx / d * min; position.z = c.z + dz / d * min;
          handle.bump = Math.max(handle.bump, Math.min(1, Math.abs(handle.speed) / 12));
          handle.speed *= 0.4;
        }
      }
      if (world.isWater(position.x + fwdX * 2, position.z + fwdZ * 2) || world.isWater(position.x, position.z)) {
        position.x = prev.x; position.z = prev.z;
        handle.speed = 0; vLat = 0;
      }

      // ── Four corners on the ground, a sprung body over them. ──
      const cy = Math.cos(handle.yaw); const sy = Math.sin(handle.yaw);
      const corner = (lx: number, lz: number) => world.floorAt(position.x + lx * cy + lz * sy, position.z - lx * sy + lz * cy);
      const fl = corner(-TRACK / 2, WHEELBASE / 2); const fr = corner(TRACK / 2, WHEELBASE / 2);
      const rl = corner(-TRACK / 2, -WHEELBASE / 2); const rr = corner(TRACK / 2, -WHEELBASE / 2);
      const ground = (fl + fr + rl + rr) / 4;
      const wantPitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, WHEELBASE) - accel * 0.004;
      const wantRoll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, TRACK) + yawRate * handle.speed * 0.004;
      pitch += (wantPitch - pitch) * (1 - Math.exp(-dt * 9));
      roll += (wantRoll - roll) * (1 - Math.exp(-dt * 9));
      const gap = ground - (position.y - heave);
      if (gap > 0.25) handle.bump = Math.max(handle.bump, Math.min(1, gap * 2));
      heaveVel += ((ground - position.y) * 140 - heaveVel * 14) * dt;
      position.y += heaveVel * dt;
      if (position.y < ground - 0.05) { position.y = ground - 0.05; heaveVel = Math.max(0, heaveVel); }
      heave = position.y - ground;

      spinAngle += (handle.speed / RADIUS) * dt;
      for (const w of wheels) {
        w.spin.rotation.x = spinAngle;
        if (w.front) w.steer.rotation.y = -steerAngle;
      }
      head.emissiveIntensity = 0.2 + night * 2.6;
      tail.emissiveIntensity = 0.3 + night * 1.2 + (input.throttle < -0.05 && handle.speed > 0.3 ? 2.5 : 0);
    },
    present(alpha) {
      group.position.lerpVectors(prev, position, alpha);
      group.rotation.set(0, 0, 0);
      group.rotateY(prevYaw + (handle.yaw - prevYaw) * alpha);
      body.rotation.set(-pitch, 0, roll);
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const g of merged.geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
  handle.present(1);
  return handle;
}
