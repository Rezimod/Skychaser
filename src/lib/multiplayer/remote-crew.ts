// The other explorers in a room, on a surface: the same suit the player
// wears, walked by a simple stride from the speed they send rather than a
// second locomotion rig, with a name tag over the helmet.

import * as THREE from 'three';
import { buildSuit, type SuitRig } from '@/lib/solar-system/moon-suit-mesh';
import { mergeStatic } from '@/lib/solar-system/moon-batch';
import { makeNameLabel, type NameLabel } from '@/lib/multiplayer/name-label';
import { bracket, lerpAngle, RENDER_DELAY_MS, trim, type PoseMsg, type RoomLink } from '@/lib/multiplayer/room-link';

/**
 * Where this explorer stands, for the room. `visible` false while inside the
 * lander, a vehicle or underground. The pose message has no field for the
 * jetpack, so a lit pack rides on the speed's sign: a speed of −(v + 1) is
 * a crew moving at v with the flame on (the +1 keeps a standing hover from
 * reading as a plain zero). Both ends of that are in this file.
 */
export function writeSurfacePose(self: PoseMsg, world: string, visible: boolean, pos: THREE.Vector3, yaw: number, speed: number, jetting = false) {
  self.s = 'surface';
  self.w = world;
  self.b = undefined;
  self.q = undefined;
  self.k = undefined;
  self.e = undefined;
  self.p = visible ? [trim(pos.x), trim(pos.y), trim(pos.z)] : undefined;
  self.y = visible ? trim(yaw) : undefined;
  self.v = visible ? trim(jetting ? -(speed + 1) : speed) : undefined;
}

/** The speed and the jet back out of a pose's `v`. */
export function readSurfaceSpeed(v: number | undefined): { speed: number; jetting: boolean } {
  const raw = v ?? 0;
  return raw < 0 ? { speed: Math.max(0, -raw - 1), jetting: true } : { speed: raw, jetting: false };
}

interface Walker {
  rig: SuitRig;
  geometries: THREE.BufferGeometry[];
  label: NameLabel;
  phase: number;
  swing: number;
  /** The flame's eased throttle, and the lean into it. */
  jet: number;
  clock: number;
}

export interface RemoteCrew {
  update: (dt: number, link: RoomLink, now: number) => void;
  dispose: () => void;
}

export function makeRemoteCrew(scene: THREE.Scene, world: string, lite: boolean, bareHead: boolean): RemoteCrew {
  const walkers = new Map<string, Walker>();

  const drop = (id: string) => {
    const w = walkers.get(id);
    if (!w) return;
    scene.remove(w.rig.group);
    w.rig.dispose();
    w.geometries.forEach((g) => g.dispose());
    w.label.dispose();
    walkers.delete(id);
  };

  const pose = (w: Walker, dt: number, speed: number, jetting: boolean) => {
    const { rig } = w;
    w.clock += dt;
    // The stride lengthens with speed; the legs swing wider until a lope.
    // Under the jet the legs trail and the arms go out, the same shape the
    // player's own poser makes, without a locomotion behind it.
    w.swing += (Math.min(1, speed / 1.4) * (jetting ? 0 : 1) - w.swing) * (1 - Math.exp(-dt * 6));
    w.jet += ((jetting ? 1 : 0) - w.jet) * (1 - Math.exp(-dt * (jetting ? 6 : 4)));
    w.phase += dt * (speed / Math.max(0.6, 0.55 + speed * 0.18)) * Math.PI;
    const amp = w.swing * 0.42;
    const j = w.jet;
    for (let i = 0; i < 2; i++) {
      const s = Math.sin(w.phase + i * Math.PI);
      const hip = -s * amp * (1 - j) + (0.32 + i * 0.12) * j;
      const knee = (0.08 + Math.max(0, Math.sin(w.phase + i * Math.PI + Math.PI / 2)) * amp * 1.4) * (1 - j) + (0.75 - i * 0.15) * j;
      rig.hips[i].rotation.x = hip;
      rig.knees[i].rotation.x = knee;
      rig.ankles[i].rotation.x = -(hip + knee) * 0.8;
    }
    for (let i = 0; i < 2; i++) {
      rig.shoulders[i].rotation.x = (-rig.hips[1 - i].rotation.x * 0.6 - 0.08) * (1 - j) - 0.4 * j;
      rig.shoulders[i].rotation.z = rig.sides[i] * (0.2 + 0.5 * j);
      rig.elbows[i].rotation.x = -(0.45 + w.swing * 0.25 + 0.3 * j);
    }
    rig.pelvis.rotation.x = w.swing * 0.05 + 0.24 * j;
    rig.body.position.y = -0.04 - Math.abs(Math.sin(w.phase)) * 0.04 * w.swing;
    rig.gear.setThrottle(j, w.clock);
  };

  return {
    update(dt, link, now) {
      for (const id of [...walkers.keys()]) if (!link.peers.has(id)) drop(id);
      for (const peer of link.peers.values()) {
        const at = bracket(peer.samples, now - RENDER_DELAY_MS);
        const next = at?.b;
        if (!at || !next || next.s !== 'surface' || next.w !== world || !next.p) {
          drop(peer.id);
          continue;
        }
        let w = walkers.get(peer.id);
        if (!w) {
          const rig = buildSuit(lite, bareHead);
          const merged = mergeStatic(rig.group, { isPivot: (o) => (o as THREE.Group).isGroup === true, minCaster: 0.05 });
          const label = makeNameLabel(0.065);
          label.sprite.position.y = 2.1;
          rig.group.add(label.sprite);
          scene.add(rig.group);
          w = { rig, geometries: merged.geometries, label, phase: 0, swing: 0, jet: 0, clock: 0 };
          walkers.set(peer.id, w);
        }
        const from = at.a.s === 'surface' && at.a.w === world && at.a.p ? at.a : next;
        const k = from === next ? 0 : at.alpha;
        const g = w.rig.group;
        g.position.set(
          from.p![0] + (next.p[0] - from.p![0]) * k,
          from.p![1] + (next.p[1] - from.p![1]) * k,
          from.p![2] + (next.p[2] - from.p![2]) * k,
        );
        g.rotation.y = lerpAngle(from.y ?? 0, next.y ?? 0, k);
        const v = readSurfaceSpeed(next.v);
        pose(w, dt, v.speed, v.jetting);
        w.label.set(peer.name, '');
      }
    },
    dispose() {
      for (const id of [...walkers.keys()]) drop(id);
    },
  };
}
