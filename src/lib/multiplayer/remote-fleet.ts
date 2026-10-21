// The other explorers in a room, in the orbit scene: their hulls where they
// are flying, their suits when they are out on EVA, and a name tag with the
// range to each.

import * as THREE from 'three';
import type { FlightBody } from '@/lib/solar-system/player-ship';
import { buildShip, buildSuitForFlight, KM_PER_SCENE_UNIT } from '@/lib/solar-system/player-ship';
import type { ShipKind, ShipParts } from '@/lib/solar-system/ship-mesh';
import { makeNameLabel, type NameLabel } from '@/lib/multiplayer/name-label';
import { bracket, RENDER_DELAY_MS, trim, type PoseMsg, type RoomLink } from '@/lib/multiplayer/room-link';

interface Craft {
  kind: ShipKind;
  ship: ShipParts;
  suit: ShipParts | null;
  label: NameLabel;
  labelAt: number;
}

function disposeParts(parts: ShipParts) {
  const geoms = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>(parts.owned);
  parts.group.traverse((o) => {
    if (o instanceof THREE.Mesh) geoms.add(o.geometry);
    else if (o instanceof THREE.Sprite) mats.add(o.material as THREE.SpriteMaterial);
  });
  geoms.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
}

const fmtRange = (km: number) => (km >= 1e6 ? `${(km / 1e6).toFixed(1)}M km` : km >= 1000 ? `${Math.round(km).toLocaleString('en-US')} km` : `${km.toFixed(km < 10 ? 2 : 0)} km`);

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

export interface RemoteFleet {
  group: THREE.Group;
  update: (link: RoomLink, bodies: FlightBody[], camera: THREE.Camera, now: number) => void;
  dispose: () => void;
}

export function makeRemoteFleet(): RemoteFleet {
  const group = new THREE.Group();
  group.name = 'remoteFleet';
  const crafts = new Map<string, Craft>();
  const byId = new Map<string, FlightBody>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();

  /** A flight pose's absolute position in this scene, or null if its body is not here. */
  const resolve = (msg: PoseMsg, rel: number[] | undefined, out: THREE.Vector3) => {
    const body = msg.b ? byId.get(msg.b) : undefined;
    if (msg.s !== 'flight' || !body || !rel) return null;
    return out.set(rel[0], rel[1], rel[2]).add(body.position);
  };

  const drop = (id: string) => {
    const c = crafts.get(id);
    if (!c) return;
    group.remove(c.ship.group, c.label.sprite);
    if (c.suit) group.remove(c.suit.group);
    disposeParts(c.ship);
    if (c.suit) disposeParts(c.suit);
    c.label.dispose();
    crafts.delete(id);
  };

  return {
    group,
    update(link, bodies, camera, now) {
      byId.clear();
      for (const body of bodies) byId.set(body.id, body);
      for (const id of [...crafts.keys()]) if (!link.peers.has(id)) drop(id);
      for (const peer of link.peers.values()) {
        const at = bracket(peer.samples, now - RENDER_DELAY_MS);
        const next = at?.b;
        if (!at || !next || next.s !== 'flight') {
          drop(peer.id);
          continue;
        }
        const kind = next.k ?? 'kestrel';
        let c = crafts.get(peer.id);
        if (c && c.kind !== kind) { drop(peer.id); c = undefined; }
        if (!c) {
          c = { kind, ship: buildShip(kind), suit: null, label: makeNameLabel(0.07), labelAt: 0 };
          group.add(c.ship.group, c.label.sprite);
          crafts.set(peer.id, c);
        }
        const pa = resolve(at.a, at.a.p, a) ?? resolve(next, next.p, a);
        const pb = resolve(next, next.p, b);
        if (!pa || !pb) {
          c.ship.group.visible = false;
          c.label.sprite.visible = false;
          continue;
        }
        c.ship.group.visible = true;
        c.label.sprite.visible = true;
        c.ship.group.position.lerpVectors(pa, pb, at.alpha);
        const qA = at.a.q ?? next.q;
        if (qA && next.q) {
          qa.set(qA[0], qA[1], qA[2], qA[3]).normalize();
          qb.set(next.q[0], next.q[1], next.q[2], next.q[3]).normalize();
          c.ship.group.quaternion.slerpQuaternions(qa, qb, at.alpha);
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
          c.suit.group.position.lerpVectors(ea, eb, at.alpha);
          c.suit.group.quaternion.copy(c.ship.group.quaternion);
        } else if (c.suit) {
          c.suit.group.visible = false;
        }
        const tagged = c.suit?.group.visible ? c.suit.group : c.ship.group;
        c.label.sprite.position.copy(tagged.position);
        if (now - c.labelAt > 400) {
          c.labelAt = now;
          c.label.set(peer.name, fmtRange(camera.position.distanceTo(tagged.position) * KM_PER_SCENE_UNIT));
        }
      }
    },
    dispose() {
      for (const id of [...crafts.keys()]) drop(id);
    },
  };
}
