// The other explorers in a room, in the orbit scene: their hulls where they
// are flying, their suits when they are out on EVA, a name tag with the
// range to each, their cannon fire, and where each is on the screen for the
// HUD's arrows and list.

import * as THREE from 'three';
import type { FlightBody } from '@/lib/solar-system/player-ship';
import { buildShip, buildSuitForFlight, FLIGHT_UNIT, KM_PER_SCENE_UNIT } from '@/lib/solar-system/player-ship';
import type { ShipKind, ShipParts } from '@/lib/solar-system/ship-mesh';
import { makeNameLabel, type NameLabel } from '@/lib/multiplayer/name-label';
import { bracket, fmtRange, peerAlpha, RENDER_DELAY_MS, trim, type Blip, type PoseMsg, type RoomLink } from '@/lib/multiplayer/room-link';

interface Craft {
  kind: ShipKind;
  ship: ShipParts;
  suit: ShipParts | null;
  label: NameLabel;
  labelAt: number;
}

/**
 * A remote ship or suit, gone. A model hull is handed back to the model cache
 * first: `release` takes the loaded model's meshes out of the group (their
 * geometry and textures are the cache's, shared with every other ship of
 * that kind, the player's own among them) and stops a model still loading
 * from being fitted to this dead ship. What is left in the group is this
 * ship's own: code-built meshes and the materials it lists as owned.
 */
export function disposeParts(parts: ShipParts) {
  parts.release?.();
  const geoms = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>(parts.owned);
  parts.group.traverse((o) => {
    if (o instanceof THREE.Mesh) geoms.add(o.geometry);
    else if (o instanceof THREE.Sprite) mats.add(o.material as THREE.SpriteMaterial);
  });
  geoms.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}


/** The body a position is closest to the surface of. */
function nearestBody(pos: THREE.Vector3, bodies: FlightBody[]): FlightBody | null {
  let best: FlightBody | null = null;
  let bestD = Infinity;
  for (const b of bodies) {
    if (b.destroyed) continue;
    const d = pos.distanceTo(b.position) - b.radius;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

const offset = (pos: THREE.Vector3, from: THREE.Vector3) => [trim(pos.x - from.x), trim(pos.y - from.y), trim(pos.z - from.z)];

/** Where this explorer's ship (and suit, on EVA) is, for the room. */
export function writeFlightPose(self: PoseMsg, ship: THREE.Object3D, eva: THREE.Object3D | null, kind: ShipKind, bodies: FlightBody[]) {
  self.s = 'flight';
  self.w = undefined;
  self.y = undefined;
  self.v = undefined;
  const anchor = nearestBody(ship.position, bodies);
  if (!anchor) {
    self.b = undefined;
    self.p = undefined;
    return;
  }
  const q = ship.quaternion;
  self.b = anchor.id;
  self.p = offset(ship.position, anchor.position);
  self.q = [trim(q.x), trim(q.y), trim(q.z), trim(q.w)];
  self.k = kind;
  self.e = eva ? offset(eva.position, anchor.position) : undefined;
}

/** A bolt this ship just fired, queued for the room: body-relative like a pose. */
export function queueShot(link: RoomLink, from: THREE.Vector3, velocity: THREE.Vector3, bodies: FlightBody[]) {
  if (!link.code) return;
  const anchor = nearestBody(from, bodies);
  if (!anchor) return;
  link.shotsOut.push({ id: link.self.id, b: anchor.id, p: offset(from, anchor.position), v: [trim(velocity.x), trim(velocity.y), trim(velocity.z)] });
  if (link.shotsOut.length > 4) link.shotsOut.shift();
}

export interface RemoteFleet {
  group: THREE.Group;
  update: (link: RoomLink, bodies: FlightBody[], camera: THREE.Camera, now: number) => void;
  dispose: () => void;
}

/** Another ship's bolts: the player's own shape, in the room's teal so they read as someone else's. */
const BOLT_H = 0.044 * FLIGHT_UNIT;
const BOLT_LIFE_S = 0.8;
const BOLT_POOL = 24;
/** A late packet is carried on for this long before the ship holds still. */
const EXTRAPOLATE_MS = 250;

interface RemoteBolt {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
}

export function makeRemoteFleet(): RemoteFleet {
  const group = new THREE.Group();
  group.name = 'remoteFleet';
  const crafts = new Map<string, Craft>();
  const byId = new Map<string, FlightBody>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const v = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const blips = new Map<string, Blip>();
  let lastNow = 0;

  const boltGeom = new THREE.CylinderGeometry(0.18 * BOLT_H, 0.18 * BOLT_H, 6 * BOLT_H, 6);
  boltGeom.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 2.4), toneMapped: false });
  const bolts: RemoteBolt[] = [];
  for (let i = 0; i < BOLT_POOL; i++) {
    const mesh = new THREE.Mesh(boltGeom, boltMat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    bolts.push({ mesh, velocity: new THREE.Vector3(), life: -1 });
  }

  /** A flight pose's absolute position in this scene, or null if its body is not here. */
  const resolve = (msg: PoseMsg, rel: number[] | undefined, out: THREE.Vector3) => {
    const body = msg.b ? byId.get(msg.b) : undefined;
    if (msg.s !== 'flight' || !body || !rel) return null;
    return out.set(rel[0], rel[1], rel[2]).add(body.position);
  };

  const drop = (id: string) => {
    blips.delete(id);
    const c = crafts.get(id);
    if (!c) return;
    group.remove(c.ship.group, c.label.sprite);
    if (c.suit) group.remove(c.suit.group);
    disposeParts(c.ship);
    if (c.suit) disposeParts(c.suit);
    c.label.dispose();
    crafts.delete(id);
  };

  const hide = (c: Craft) => {
    c.ship.group.visible = false;
    c.label.setOpacity(0);
    if (c.suit) c.suit.group.visible = false;
  };

  /** Where a point is on the screen (-1..1, y up), and whether it is on it.
   *  Off the screen (or behind) it is pushed out to the edge, in its direction. */
  const toScreen = (pos: THREE.Vector3, camera: THREE.Camera, blip: Blip) => {
    v.copy(pos).applyMatrix4(camera.matrixWorldInverse);
    const behind = v.z > 0;
    v.applyMatrix4(camera.projectionMatrix);
    let x = v.x;
    let y = v.y;
    if (behind) { x = -x; y = -y; }
    blip.onScreen = !behind && Math.abs(x) <= 1 && Math.abs(y) <= 1;
    if (!blip.onScreen) {
      const m = Math.max(Math.abs(x), Math.abs(y), 1e-6);
      x /= m;
      y /= m;
    }
    blip.x = x;
    blip.y = y;
  };

  const updateBolts = (link: RoomLink, now: number, dt: number) => {
    for (const bolt of bolts) {
      if (bolt.life < 0) continue;
      bolt.life += dt;
      if (bolt.life > BOLT_LIFE_S) {
        bolt.life = -1;
        bolt.mesh.visible = false;
        continue;
      }
      bolt.mesh.position.addScaledVector(bolt.velocity, dt);
    }
    // A bolt goes off when the ship that fired it is drawn firing: the same
    // delay. It starts as far along as it would be by now.
    const due = now - RENDER_DELAY_MS;
    const queue = link.shotsIn;
    let used = 0;
    for (; used < queue.length; used++) {
      const { at, msg } = queue[used];
      if (at > due) break;
      const age = (due - at) / 1000;
      if (age >= BOLT_LIFE_S) continue; // long gone
      const body = byId.get(msg.b);
      const free = bolts.find((x) => x.life < 0);
      if (!body || !free) continue;
      free.velocity.set(msg.v[0], msg.v[1], msg.v[2]);
      free.mesh.position.set(msg.p[0], msg.p[1], msg.p[2]).add(body.position).addScaledVector(free.velocity, age);
      const speed = free.velocity.length();
      if (speed > 0) free.mesh.quaternion.setFromUnitVectors(zAxis, a.copy(free.velocity).divideScalar(speed));
      free.life = age;
      free.mesh.visible = true;
    }
    if (used) queue.splice(0, used);
  };

  return {
    group,
    update(link, bodies, camera, now) {
      const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0;
      lastNow = now;
      camera.updateMatrixWorld();
      byId.clear();
      for (const body of bodies) byId.set(body.id, body);
      for (const id of [...crafts.keys()]) if (!link.peers.has(id)) drop(id);
      for (const id of [...blips.keys()]) if (!link.peers.has(id)) blips.delete(id);
      for (const peer of link.peers.values()) {
        const alpha = peerAlpha(peer, now);
        const at = bracket(peer.samples, now - RENDER_DELAY_MS, EXTRAPOLATE_MS);
        const next = at?.b;
        if (!at || !next || next.s !== 'flight') {
          drop(peer.id);
          continue;
        }
        const kind = next.k ?? 'kestrel';
        let c = crafts.get(peer.id);
        if (c && c.kind !== kind) { drop(peer.id); c = undefined; }
        if (!c) {
          c = { kind, ship: buildShip(kind), suit: null, label: makeNameLabel(0.09), labelAt: 0 };
          group.add(c.ship.group, c.label.sprite);
          crafts.set(peer.id, c);
        }
        const pa = resolve(at.a, at.a.p, a) ?? resolve(next, next.p, a);
        const pb = resolve(next, next.p, b);
        // Not heard from in a while: faded out, not frozen in place.
        if (!pa || !pb || alpha <= 0) {
          hide(c);
          blips.delete(peer.id);
          continue;
        }
        c.ship.group.visible = true;
        c.label.setOpacity(alpha);
        c.ship.group.position.lerpVectors(pa, pb, at.alpha);
        c.ship.group.scale.setScalar(Math.max(0.001, alpha));
        const turn = Math.min(1, at.alpha);
        const qA = at.a.q ?? next.q;
        if (qA && next.q) {
          qa.set(qA[0], qA[1], qA[2], qA[3]).normalize();
          qb.set(next.q[0], next.q[1], next.q[2], next.q[3]).normalize();
          c.ship.group.quaternion.slerpQuaternions(qa, qb, turn);
        }
        // The suit, when the pilot is outside — the ship stays parked.
        const ea = resolve(at.a, at.a.e, a) ?? resolve(next, next.e, a);
        const eb = resolve(next, next.e, b);
        if (ea && eb) {
          if (!c.suit) {
            c.suit = buildSuitForFlight();
            group.add(c.suit.group);
          }
          c.suit.group.visible = true;
          c.suit.group.position.lerpVectors(ea, eb, turn);
          c.suit.group.quaternion.copy(c.ship.group.quaternion);
        } else if (c.suit) {
          c.suit.group.visible = false;
        }
        const tagged = c.suit?.group.visible ? c.suit.group : c.ship.group;
        c.label.sprite.position.copy(tagged.position);
        const km = camera.position.distanceTo(tagged.position) * KM_PER_SCENE_UNIT;
        if (now - c.labelAt > 400) {
          c.labelAt = now;
          c.label.set(peer.name || '…', fmtRange(km));
        }
        let blip = blips.get(peer.id);
        if (!blip) blips.set(peer.id, (blip = { id: peer.id, name: '', km: 0, x: 0, y: 0, onScreen: false, alpha: 1 }));
        blip.name = peer.name;
        blip.km = km;
        blip.alpha = alpha;
        toScreen(tagged.position, camera, blip);
      }
      updateBolts(link, now, dt);
      link.view.at = now;
      link.view.pilots = [...blips.values()].sort((x, y) => x.km - y.km);
    },
    dispose() {
      for (const id of [...crafts.keys()]) drop(id);
      for (const bolt of bolts) group.remove(bolt.mesh);
      boltGeom.dispose();
      boltMat.dispose();
    },
  };
}
