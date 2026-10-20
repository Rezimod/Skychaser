// The things the five Moon missions are made of: a survey stake out on the
// ridge, the severed array cable, the coupling and the feed horn on the lab
// bench, the sample out in the crater — and the panels, breakers and mounts
// that are already part of the base and only needed a key to press.
//
// Everything here registers as a Phase-6 interactable and says what happened
// on the bus; the mission engine listens and counts. The world changes live
// here too, not in the mission data: the breaker really does put the base's
// lights back on, the coupling really does swing the array back onto the sun,
// the feed really does bring the dish round to Earth.

import * as THREE from 'three';
import type { Anchor, AnchorId } from '@/lib/solar-system/moon-base-zones';
import type { BaseState } from '@/lib/solar-system/moon-base';
import type { Carry, InteractionBus, Interactable } from '@/lib/solar-system/moon-interactions';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import { keep, mergeStatic } from '@/lib/solar-system/moon-batch';
import { observable, type SkyTarget } from '@/lib/solar-system/moon-sky-targets';

/** The rise east of the pad the crew walks out to for the Earth shot. */
export const RIDGE = { x: 34, z: -58 };
/** The unwalked crater the expedition drives to. */
export const CRATER = { x: -96, z: 78 };
/** How near the shot has to be pointed at Earth, radians. */
const FRAMING = 0.44;

export interface MissionPropsWorld {
  heightAt: (x: number, z: number) => number;
  anchors: Record<AnchorId, Anchor>;
  /** Where the lander came down. */
  lander: () => { x: number; z: number };
  /** The scene direction to Earth, for the framing check. */
  earthDir: THREE.Vector3;
  state: Readonly<BaseState>;
  setState: (s: Partial<BaseState>) => void;
  arrayFault: { yaw: number };
  dishFault: { yaw: number; pitch: number };
  setStatus: (which: 'power' | 'comms' | 'isru' | 'charger', state: 'ok' | 'warn' | 'fault') => void;
  carry: Carry;
  bus: InteractionBus;
  /** Now, so the telescope looks at what is really up there. */
  now?: () => Date;
}

export interface MissionPropsTelemetry {
  /** What the platform settled on, and how high it stood. */
  observed: string;
  observedAlt: number;
  /** Seconds the result stays up on the glass. */
  observedHold: number;
  /** The scanner's strength on the way to the sample, 0…1, or −1. */
  signal: number;
  /** Something is in the crew's hands. */
  carrying: string;
}

export interface MissionPropsHandle {
  group: THREE.Group;
  interactables: Interactable[];
  colliders: Collider[];
  telemetry: MissionPropsTelemetry;
  update: (dt: number, ctx: { x: number; z: number; yaw: number }) => void;
  dispose: () => void;
}

const HOLD = { cable: 1.0, couple: 2.0, breaker: 1.2, align: 2.4, feed: 2.0, dish: 2.2, scan: 1.8, shot: 1.4 };

export function makeMissionProps(world: MissionPropsWorld): MissionPropsHandle {
  const group = new THREE.Group();
  group.name = 'missionProps';
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const shell = new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6, metalness: 0.3 });
  const amber = new THREE.MeshStandardMaterial({ color: 0x2a1604, emissive: new THREE.Color(0xd9821a), emissiveIntensity: 1.4, roughness: 0.4 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95, metalness: 0.02 });
  mats.push(shell, dark, amber, rockMat);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    geoms.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  // The stake on the ridge: where the shot is taken from.
  const ridgeY = world.heightAt(RIDGE.x, RIDGE.z);
  const stake = new THREE.Group();
  stake.position.set(RIDGE.x, ridgeY, RIDGE.z);
  group.add(stake);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6), shell, 0, 0.75, 0, stake);
  mesh(new THREE.BoxGeometry(0.28, 0.18, 0.02), amber, 0, 1.45, 0, stake).castShadow = false;

  // The severed cable at the faulty array, and the coupling that mends it.
  const arr = world.anchors.faultyArray;
  const cable = new THREE.Group();
  cable.position.set(arr.x, world.heightAt(arr.x, arr.z), arr.z);
  group.add(cable);
  mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 14), dark, 0, 0.1, 0.9, cable).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), dark, 0.3, 0.12, 0.35, cable).rotation.z = Math.PI / 2.2;
  const couplingFitted = keep(mesh(new THREE.BoxGeometry(0.22, 0.16, 0.3), shell, 0, 0.2, 0.55, cable));
  couplingFitted.visible = false;

  // On the lab bench: a coupling in its box and the dish's spare feed horn.
  const bench = world.anchors.workbench;
  const benchY = world.heightAt(bench.x, bench.z);
  const couplingBox = keep(mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), shell, bench.x + 0.5, benchY + 1.05, bench.z));
  const feedHorn = keep(mesh(new THREE.ConeGeometry(0.16, 0.42, 10), shell, bench.x - 0.5, benchY + 1.15, bench.z));
  feedHorn.rotation.x = Math.PI;

  // The sample out in the crater: under the dust until the scanner finds it.
  const rock = new THREE.Group();
  rock.position.set(CRATER.x, world.heightAt(CRATER.x, CRATER.z), CRATER.z);
  rock.visible = false;
  group.add(rock);
  mesh(new THREE.DodecahedronGeometry(0.3, 0), rockMat, 0, 0.14, 0, rock).scale.set(1.2, 0.7, 1);
  mesh(new THREE.BoxGeometry(0.14, 0.09, 0.01), amber, 0.5, 0.7, 0, rock).castShadow = false;
  mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5), shell, 0.5, 0.4, 0, rock);

  // The stake and the severed cable never move: one draw call between them.
  keep(rock);
  mergeStatic(group);

  const telemetry: MissionPropsTelemetry = { observed: '', observedAlt: 0, observedHold: 0, signal: -1, carrying: '' };
  const crew = { x: 0, z: 0, yaw: 0 };
  const holds: Record<string, number> = {};
  let sampleFound = false;
  let sampleTaken = false;
  let couplingGone = false;
  let feedGone = false;
  let suitChecked = false;

  const signal = (zone: string, state: string) => world.bus.emit({ type: 'zone:state', zone, state });
  /** A hold that runs on the key and reports its own progress. */
  const hold = (id: string, seconds: number, at: () => { x: number; z: number } | null, label: string, done: () => void, over: Partial<Interactable> = {}): Interactable => {
    holds[id] = 0;
    return {
      id,
      where: () => { const p = at(); return p ? { x: p.x, z: p.z, r: 3 } : null; },
      kind: () => 'hold',
      label: () => label,
      progress: () => holds[id] / seconds,
      use: (dt) => {
        if (holds[id] >= seconds) return;
        holds[id] = Math.min(seconds, holds[id] + dt);
        if (holds[id] >= seconds) done();
      },
      ...over,
    };
  };
  const tap = (id: string, at: () => { x: number; z: number } | null, label: string, use: () => void, over: Partial<Interactable> = {}): Interactable => ({
    id,
    where: () => { const p = at(); return p ? { x: p.x, z: p.z, r: 3 } : null; },
    kind: () => 'tap',
    label: () => label,
    use,
    ...over,
  });
  const anchor = (id: AnchorId) => () => ({ x: world.anchors[id].x, z: world.anchors[id].z });

  /** Is the shot pointed at Earth? The stake is where it is taken from. */
  const framed = () => {
    const fwd = new THREE.Vector3(Math.sin(crew.yaw), 0, Math.cos(crew.yaw));
    const to = world.earthDir.clone().setY(0);
    if (to.lengthSq() < 1e-6) return true;
    return fwd.angleTo(to.normalize()) < FRAMING;
  };

  const interactables: Interactable[] = [
    // The first beat of the expedition. It has to reach as far as the lander's
    // own prompt and outrank it (priority 4), or it can never be asked for:
    // the crew step out four metres from a lander whose radius is five, and
    // "climb aboard and leave" would win every time. Once the suit has been
    // checked it drops out and the way home is the prompt again.
    {
      id: 'suitCheck',
      priority: 5,
      where: () => (suitChecked ? null : { ...world.lander(), r: 5.4 }),
      kind: () => 'tap',
      label: () => 'suitCheck',
      use: () => { suitChecked = true; },
    },
    hold('earthShot', HOLD.shot, () => RIDGE, 'earthShot', () => { signal('camera', 'earthrise'); }, {
      requires: framed,
      priority: 1,
    }),
    hold('deadCable', HOLD.cable, () => ({ x: arr.x, z: arr.z }), 'deadCable', () => { signal('array', 'traced'); }),
    tap('coupling', () => (couplingGone ? null : { x: bench.x, z: bench.z }), 'takeCoupling', () => {
      if (!world.carry.take('coupling')) return;
      couplingGone = true;
      couplingBox.visible = false;
    }),
    hold('fitCoupling', HOLD.couple, () => ({ x: arr.x, z: arr.z }), 'fitCoupling', () => {
      world.carry.drop();
      couplingFitted.visible = true;
      world.arrayFault.yaw = 0;
      world.setStatus('power', 'warn');
    }, { requires: () => world.carry.has('coupling') }),
    hold('breaker', HOLD.breaker, anchor('powerCabinet'), 'breaker', () => {
      world.setState({ power: true });
      world.setStatus('power', 'ok');
      signal('base', 'powered');
    }),
    tap('mountPower', anchor('telescope'), 'mountPower', () => {
      world.setState({ domeOpen: true });
      signal('scope', 'powered');
    }, { requires: () => world.state.power }),
    hold('mountAlign', HOLD.align, anchor('telescope'), 'mountAlign', () => { signal('scope', 'aligned'); }, {
      requires: () => world.state.domeOpen,
    }),
    tap('scopeObserve', anchor('telescope'), 'scopeObserve', () => {
      const up: SkyTarget | undefined = observable(world.now?.() ?? new Date(), 1)[0];
      telemetry.observed = up?.id ?? 'earth';
      telemetry.observedAlt = Math.round(up?.altitude ?? 90);
      telemetry.observedHold = 14;
      signal('scope', 'observed');
    }, { requires: () => world.state.domeOpen }),
    hold('dishInspect', HOLD.cable, anchor('commsControl'), 'dishInspect', () => { signal('dish', 'inspected'); }),
    tap('feed', () => (feedGone ? null : { x: bench.x, z: bench.z }), 'takeFeed', () => {
      if (!world.carry.take('feed')) return;
      feedGone = true;
      feedHorn.visible = false;
    }),
    hold('fitFeed', HOLD.feed, anchor('commsControl'), 'fitFeed', () => {
      world.carry.drop();
      signal('dish', 'fitted');
    }, { requires: () => world.carry.has('feed') }),
    hold('dishAlign', HOLD.dish, anchor('commsControl'), 'dishAlign', () => {
      world.dishFault.yaw = 0;
      world.dishFault.pitch = 0;
      world.setState({ dishAligned: true });
      world.setStatus('comms', 'ok');
      signal('dish', 'linked');
    }, { requires: () => !world.carry.has('feed') && feedGone }),
    tap('roverCharge', anchor('charger'), 'roverCharge', () => {
      world.setState({ charging: true });
      world.setStatus('charger', 'ok');
      signal('rover', 'charged');
    }),
    hold('craterScan', HOLD.scan, () => (sampleFound ? null : CRATER), 'craterScan', () => {
      sampleFound = true;
      rock.visible = true;
      signal('scan', 'sample');
    }, { where: () => (sampleFound ? null : { x: CRATER.x, z: CRATER.z, r: 14 }) }),
    tap('sample', () => (sampleFound && !sampleTaken ? CRATER : null), 'takeSample', () => {
      if (!world.carry.take('sample')) return;
      sampleTaken = true;
      rock.visible = false;
    }),
    tap('storeSample', anchor('sampleStore'), 'storeSample', () => {
      world.carry.drop();
      signal('sample', 'stored');
    }, { requires: () => world.carry.has('sample') }),
  ];

  return {
    group,
    interactables,
    colliders: [],
    telemetry,
    update(dt, ctx) {
      if (telemetry.observedHold > 0) telemetry.observedHold = Math.max(0, telemetry.observedHold - dt);
      crew.x = ctx.x;
      crew.z = ctx.z;
      crew.yaw = ctx.yaw;
      telemetry.carrying = world.carry.item ?? '';
      // The scanner only talks while the crew is out at the crater looking.
      const d = Math.hypot(CRATER.x - ctx.x, CRATER.z - ctx.z);
      telemetry.signal = sampleFound || d > 26 ? -1 : Math.max(0, 1 - d / 26);
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      group.clear();
    },
  };
}
