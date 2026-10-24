// Alien encounters for SolarSystemCanvas — an easter egg in the guide, a
// living neighbourhood in Explore Mode. Ships are rocket-scale (a saucer
// spans ~1.5× the Earth launch vehicle, a tiny fraction of any planet).
//
// GUIDE (no target): rare, decorative sightings anchored near Earth —
//   flyby    — a saucer, scout probe, or mothership sweeps past on a curve
//              and warps out in a flash.
//   dogfight — a dart chases a saucer trading bolts.
//   battle   — two darts circle a saucer and a scout; one dart is lost.
//
// EXPLORE (target set): every so often, while the pilot is cruising, an
// encounter turns up, picked from what lives in that part of the system
// (combat-balance.ts): near home, greeters that fly alongside and leave a
// gift, scouts, beacons, traders; in the belt, raider packs and minefields;
// out by the giants, patrols and drone swarms; past Neptune and at other
// stars, carriers and the gunship. Wrecks turn up anywhere and crack open
// for salvage. Fighters fly real manoeuvres — approach on a lead, strafe,
// break, reposition, jink when hit — and telegraph every burst. Only a
// couple fire at once, early fights hit softer, and everything pulls back
// when the ship is nearly done, so a pilot always has a way out.
//
// Everything is pooled: each craft is built once at start-up, bolts, sparks,
// flashes and gifts come from fixed pools, and nothing allocates per frame.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ALIEN_SPECS, GIFTS, HOSTILE_ENCOUNTERS, MAX_ACTIVE, MAX_SHOOTERS, FIRST_FIGHT_SHOOTERS,
  MERCY_HULL, MERCY_RESUME_SHIELD, MINE_ARM, MINE_BLAST, MINE_FUSE,
  damageScale, pickEncounter, rosterFor,
  type AlienKind, type AlienSpec, type AlienZone, type EncounterKind, type GiftKind, type Stance,
} from '@/lib/solar-system/combat-balance';
import { buildBeacon, buildDrone, buildGunship, buildHauler, buildLantern, buildMine, buildRaider, buildWreck } from '@/lib/solar-system/alien-ships';

export type { AlienKind, AlienZone, EncounterKind } from '@/lib/solar-system/combat-balance';

/** What the encounters can read of the ship they meet — the flight
 *  telemetry satisfies it as it is. */
export interface AlienTargetStatus {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  crashed: boolean;
  docked: boolean;
  mode: string;
  jumpPhase: string;
  zone: AlienZone;
}

export interface HostileTarget {
  group: THREE.Group;
  /** Called when an enemy bolt or blast connects with the target. */
  onHit: (damage: number) => void;
  /** A gift reached the ship: hull and shield to restore. */
  onRepair?: (hull: number, shield: number) => void;
  /** The ship's state, read every frame (region, health, drive). */
  status?: AlienTargetStatus;
}

export interface AlienEnemy {
  group: THREE.Group;
  hp: number;
  maxHp: number;
  /** Hit-test radius in scene units. */
  radius: number;
  /** Out to get you — the gunsight's aim help only bends toward these. */
  hostile?: boolean;
  kind?: AlienKind;
}

export interface AlienHandle {
  group: THREE.Group;
  update: (dtSec: number, earthPos: THREE.Vector3 | null) => void;
  dispose: () => void;
  /** Switch between passive sightings (null) and encounters around `target`. */
  setHostile: (target: HostileTarget | null) => void;
  /** Live, targetable craft of the current encounter. Reused array — read only. */
  enemies: AlienEnemy[];
  /** Apply damage; returns true when the craft is destroyed. */
  damage: (enemy: AlienEnemy, amount: number) => boolean;
  /** Pooled impact debris burst at `at`. */
  spawnSparks: (at: THREE.Vector3, speed: number) => void;
  /** Where the sensors see a contact (nearest visible craft), or null. */
  contactPos: THREE.Vector3 | null;
  /** What the contact is doing: something peaceful, or a hostile one. */
  contactState: 'none' | 'scan' | 'hostile';
  /** A passive contact has completed a scan of the target at least once. */
  scanned: boolean;
  /** The latest thing worth telling the pilot (an encounter, a gift…), and
   *  a counter that moves every time a new one is raised. */
  callout: string;
  calloutSeq: number;
  /** The encounter in progress, or '' between them. */
  encounter: EncounterKind | '';
  /** Bring the next encounter forward to now (development captures). */
  nudge: () => void;
  /** Start a particular encounter now (development captures and tests). */
  stage: (kind: EncounterKind) => void;
}

function glowSprite(): THREE.CanvasTexture {
  const s = 96;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(220,255,244,0.95)');
  grad.addColorStop(0.4, 'rgba(140,255,214,0.4)');
  grad.addColorStop(1, 'rgba(80,255,190,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Classic saucer: brushed-metal hull, glass dome, ring of running lights,
 *  a dark underside with a bright drive ring. */
function buildSaucer(s: number, glowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.35, metalness: 0.85 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(s * 0.5, 24, 12), hullMat);
  hull.scale.y = 0.22;
  g.add(hull);
  const under = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.3, s * 0.14, s * 0.08, 24), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.5, metalness: 0.7 }));
  under.position.y = -s * 0.1;
  g.add(under);
  const driveRing = new THREE.Mesh(new THREE.TorusGeometry(s * 0.22, s * 0.012, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 1.3) }));
  driveRing.rotation.x = Math.PI / 2;
  driveRing.position.y = -s * 0.14;
  g.add(driveRing);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x9adfd2, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85,
    emissive: 0x2a7a6a, emissiveIntensity: 0.7,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(s * 0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.y = s * 0.08;
  g.add(dome);
  // Eight running lights, one mesh.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x7dffd0 });
  const lightParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    lightParts.push(new THREE.SphereGeometry(s * 0.03, 6, 6).translate(Math.cos(a) * s * 0.44, 0, Math.sin(a) * s * 0.44));
  }
  const lightGeom = mergeGeometries(lightParts, false)!;
  for (const part of lightParts) part.dispose();
  g.add(new THREE.Mesh(lightGeom, lightMat));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(s * 2.0);
  g.add(halo);
  return g;
}

/** Attack dart: a slim two-tone fuselage, swept fins, a hot engine and a
 *  glow behind it so it reads at range. Forward is +Z. */
function buildDart(s: number, glowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a3f5c, roughness: 0.4, metalness: 0.7 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x9a8fb4, roughness: 0.35, metalness: 0.8 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(s * 0.1, s * 0.7, 6), hullMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(s * 0.05, s * 0.09, s * 0.36), trimMat);
  spine.position.set(0, s * 0.03, -s * 0.12);
  g.add(spine);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(s * 0.34, s * 0.015, s * 0.16), hullMat);
    fin.position.set(side * s * 0.18, 0, -s * 0.18);
    fin.rotation.y = -side * 0.5;
    g.add(fin);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(s * 0.06, s * 0.02, s * 0.08), trimMat);
    tip.position.set(side * s * 0.34, 0, -s * 0.28);
    g.add(tip);
  }
  const engine = new THREE.Mesh(new THREE.SphereGeometry(s * 0.045, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.9, 0.5) }));
  engine.position.z = -s * 0.36;
  g.add(engine);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a5a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  glow.position.z = -s * 0.42;
  glow.scale.setScalar(s * 0.5);
  g.add(glow);
  return g;
}

/** Mothership: long dark hull, rows of lit windows, violet drive glow. */
function buildMothership(s: number): THREE.Group {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4c, roughness: 0.5, metalness: 0.75 });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(s * 0.22, s * 1.7, 6, 14), hullMat);
  hull.rotation.x = Math.PI / 2;
  g.add(hull);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(s * 0.1, s * 0.32, s * 1.1), hullMat);
  g.add(spine);
  // Eighteen lit windows, one mesh.
  const winMat = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
  const winParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      winParts.push(new THREE.BoxGeometry(s * 0.015, s * 0.03, s * 0.06).translate(side * s * 0.225, s * 0.02, (i / 8 - 0.5) * s * 1.5));
    }
  }
  const winGeom = mergeGeometries(winParts, false)!;
  for (const part of winParts) part.dispose();
  g.add(new THREE.Mesh(winGeom, winMat));
  const drive = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.12, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xb08cff, transparent: true, opacity: 0.9 }),
  );
  drive.position.z = -s * 1.06;
  g.add(drive);
  return g;
}

/** Scout probe: small glowing orb with a sensor ring. */
function buildProbe(s: number, glowTex: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(s * 0.1, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0x9adfd2, roughness: 0.2, metalness: 0.4, emissive: 0x35c0a0, emissiveIntensity: 1.4 }),
  );
  g.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(s * 0.16, s * 0.008, 6, 32), new THREE.MeshStandardMaterial({ color: 0x5e6a74, roughness: 0.4, metalness: 0.8 }));
  ring.rotation.x = Math.PI / 2 + 0.4;
  g.add(ring);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(s * 0.55);
  g.add(halo);
  return g;
}

interface Bolt {
  mesh: THREE.Mesh;
  /** Guide-mode bolts lerp between two points; hostile bolts fly a velocity. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  vel: THREE.Vector3;
  target: THREE.Group | null;
  t: number;
  life: number;
  damage: number;
}

interface SparkBurst {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  vel: Float32Array;
  origin: THREE.Vector3;
  life: number; // <0 idle
}

interface Gift {
  group: THREE.Group;
  vel: THREE.Vector3;
  life: number; // <0 idle
  kind: GiftKind;
}

type CraftState =
  | 'approach' | 'strafe' | 'break' | 'reposition' | 'evade' | 'hold'
  | 'orbit' | 'dive' | 'alongside' | 'flee' | 'idle' | 'armed';

/** One pooled alien craft. */
interface Craft {
  kind: AlienKind;
  spec: AlienSpec;
  ship: THREE.Group;
  enemy: AlienEnemy;
  vel: THREE.Vector3;
  goal: THREE.Vector3;
  lateral: THREE.Vector3;
  stance: Stance;
  state: CraftState;
  stateT: number;
  /** Seconds until the next shot; a telegraph glow leads it. */
  fireIn: number;
  /** Shots fired so far in the current burst. */
  burst: number;
  /** Holds one of the few firing slots. */
  token: boolean;
  telegraphMat: THREE.SpriteMaterial;
  /** In the current encounter. */
  live: boolean;
  /** -1, or 0..1 through the warp-out. */
  leaving: number;
  age: number;
  /** Per-kind scratch: the gift given, the launch timer, the spark timer. */
  aux: number;
  phase: number;
  /** A mine's blinking light. */
  blink: THREE.SpriteMaterial | null;
}

const UP = new THREE.Vector3(0, 1, 0);

export function makeAlienEncounters(): AlienHandle {
  const group = new THREE.Group();
  group.name = 'alienEncounters';
  group.visible = false;

  // Rocket-scale, and set against the player's hull: a saucer spans a few
  // Kestrel lengths, not a moon.
  const S = 0.0028;
  const glowTex = glowSprite();

  const saucer = buildSaucer(S, glowTex);
  const dartA = buildDart(S * 0.9, glowTex);
  const dartB = buildDart(S * 0.9, glowTex);
  const mothership = buildMothership(S * 1.5);
  const probe = buildProbe(S, glowTex);
  const ships = [saucer, dartA, dartB, mothership, probe];

  // The Explore Mode crowd, built once. Clones share geometry and materials.
  const lantern = buildLantern(S, glowTex);
  const hauler = buildHauler(S * 1.3, glowTex);
  const raiderBase = buildRaider(S, glowTex);
  const droneBase = buildDrone(S, glowTex);
  const mineBase = buildMine(S);
  const gunship = buildGunship(S * 1.6, glowTex);
  const wreck = buildWreck(S * 1.2, glowTex);
  const beacon = buildBeacon(S, glowTex);
  const copies = (base: THREE.Group, n: number) => {
    const out = [base];
    for (let i = 1; i < n; i++) out.push(base.clone());
    return out;
  };
  const raiders = copies(raiderBase, 3);
  const drones = copies(droneBase, 6);
  const mines = copies(mineBase, 5);

  const warpMat = new THREE.SpriteMaterial({
    map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const warpFlash = new THREE.Sprite(warpMat);
  for (const s of ships) {
    s.visible = false;
    group.add(s);
  }
  group.add(warpFlash);

  // Bolts — HDR so the bloom pass catches them; red is reserved for shots
  // at the player, and those are longer so they read as incoming.
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 2.2, 0.6), transparent: true, opacity: 0.95 });
  const boltMatRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.35, 0.25), transparent: true, opacity: 0.95 });
  const boltGeom = new THREE.CylinderGeometry(S * 0.014, S * 0.014, S * 0.45, 5);
  boltGeom.rotateX(Math.PI / 2);
  const boltGeomLong = new THREE.CylinderGeometry(S * 0.018, S * 0.018, S * 0.9, 5);
  boltGeomLong.rotateX(Math.PI / 2);
  const bolts: Bolt[] = [];
  /** A bolt this close to the ship's centre has hit it (the hull spans about S). */
  const HIT_R2 = (S * 0.45) ** 2;
  for (let i = 0; i < 20; i++) {
    const mesh = new THREE.Mesh(boltGeom, boltMat);
    mesh.visible = false;
    group.add(mesh);
    bolts.push({ mesh, from: new THREE.Vector3(), to: new THREE.Vector3(), vel: new THREE.Vector3(), target: null, t: -1, life: 0, damage: 10 });
  }

  const hitMat = new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(0.6, 0.8, 1.0),
    transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const hitFlash = new THREE.Sprite(hitMat);
  hitFlash.scale.setScalar(S * 1.4);
  saucer.add(hitFlash);

  // Scan beam: a thin additive line from the scout to the target.
  const beamGeom = new THREE.BufferGeometry();
  beamGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const beamMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 1.8, 1.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const beam = new THREE.Line(beamGeom, beamMat);
  beam.frustumCulled = false;
  group.add(beam);

  const SPARK_N = 16;
  const sparks: SparkBurst[] = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_N * 3), 3));
    const mat = new THREE.PointsMaterial({
      map: glowTex, color: 0xffc07a, size: S * 0.14, transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    points.visible = false;
    points.frustumCulled = false;
    group.add(points);
    sparks.push({ points, mat, vel: new Float32Array(SPARK_N * 3), origin: new THREE.Vector3(), life: -1 });
  }
  let sparkNext = 0;
  const spawnSparks = (at: THREE.Vector3, speed: number) => {
    // The oldest burst gives way when all are busy.
    let b: SparkBurst | null = null;
    for (const x of sparks) if (x.life < 0) { b = x; break; }
    if (!b) {
      b = sparks[sparkNext];
      sparkNext = (sparkNext + 1) % sparks.length;
    }
    b.origin.copy(at);
    const p = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < SPARK_N; i++) {
      p.setXYZ(i, at.x, at.y, at.z);
      b.vel[i * 3] = (Math.random() - 0.5) * speed;
      b.vel[i * 3 + 1] = (Math.random() - 0.5) * speed;
      b.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
    }
    p.needsUpdate = true;
    b.life = 0;
    b.mat.opacity = 1;
    b.points.visible = true;
    group.visible = true;
  };

  // Explosion flashes: a few, round-robin.
  const booms: { sprite: THREE.Sprite; mat: THREE.SpriteMaterial }[] = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(1.0, 0.62, 0.3),
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    booms.push({ sprite, mat });
  }
  let boomNext = 0;
  const boomAt = (at: THREE.Vector3, size: number) => {
    const b = booms[boomNext];
    boomNext = (boomNext + 1) % booms.length;
    b.sprite.position.copy(at);
    b.sprite.scale.setScalar(size);
    b.mat.opacity = 1;
    b.sprite.visible = true;
  };

  const explode = (ship: THREE.Group, radius = S) => {
    boomAt(ship.position, Math.max(S * 2.4, radius * 4));
    spawnSparks(ship.position, S * 4.5);
    if (radius > S) spawnSparks(ship.position, S * 7);
    ship.visible = false;
  };

  // Repair gifts: a green crystal in a glow, drifting, then drawn to the ship.
  const giftGeom = new THREE.OctahedronGeometry(S * 0.16, 0);
  const giftMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 1.1) });
  const giftGlowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0x8dffb0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const gifts: Gift[] = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(giftGeom, giftMat));
    const glow = new THREE.Sprite(giftGlowMat);
    glow.scale.setScalar(S * 1.1);
    g.add(glow);
    g.visible = false;
    group.add(g);
    gifts.push({ group: g, vel: new THREE.Vector3(), life: -1, kind: 'greeting' });
  }

  // Encounter state.
  type Mode = 'idle' | 'flyby' | 'dogfight' | 'battle' | 'explore';
  let mode: Mode = 'idle';
  let lead: THREE.Group = saucer;
  let clock = 70 + Math.random() * 50;
  let encT = 0;
  let encDur = 15;
  let fireAcc = 0;
  let dartBDown = false;
  const pA = new THREE.Vector3();
  const pB = new THREE.Vector3();
  const pC = new THREE.Vector3();
  const battleCenter = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const posNext = new THREE.Vector3();
  const chase = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tmp3 = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const rand = new THREE.Vector3();
  const targetVel = new THREE.Vector3();
  const targetPrev = new THREE.Vector3();
  const contactPos = new THREE.Vector3();
  const lastKillPos = new THREE.Vector3();
  /** The gift nearest the ship, so the radar can lead the pilot to it. */
  let nearestGift: THREE.Vector3 | null = null;
  const facer = new THREE.Object3D();

  const randDir = (out: THREE.Vector3) =>
    out.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.7, Math.random() - 0.5).normalize();
  const between = (r: readonly [number, number]) => r[0] + Math.random() * (r[1] - r[0]);

  const bezier = (t: number, out: THREE.Vector3) => {
    const inv = 1 - t;
    return out.set(0, 0, 0)
      .addScaledVector(pA, inv * inv)
      .addScaledVector(pB, 2 * inv * t)
      .addScaledVector(pC, t * t);
  };

  interface Track { ship: THREE.Group; r: number; omega: number; phase: number; tilt: THREE.Quaternion }
  const tracks: Track[] = [];
  const makeTrack = (ship: THREE.Group, r: number, omega: number): Track => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.random() - 0.5) * 0.9, Math.random() * Math.PI * 2, 0,
    ));
    return { ship, r, omega, phase: Math.random() * Math.PI * 2, tilt: q };
  };
  const trackPos = (tr: Track, t: number, out: THREE.Vector3) => {
    const a = tr.phase + tr.omega * t;
    out.set(Math.cos(a) * tr.r, 0, Math.sin(a) * tr.r).applyQuaternion(tr.tilt).add(battleCenter);
    return out;
  };

  // ── The crowd ──
  const crafts: Craft[] = [];
  const craftByShip = new Map<THREE.Group, Craft>();
  const pool: Record<AlienKind, Craft[]> = {
    probe: [], saucer: [], dart: [], mothership: [], lantern: [], hauler: [],
    raider: [], drone: [], gunship: [], mine: [], wreck: [], beacon: [],
  };
  const addCraft = (kind: AlienKind, ship: THREE.Group) => {
    const spec = ALIEN_SPECS[kind];
    const telegraphMat = new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(2.6, 0.5, 0.3), transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const telegraph = new THREE.Sprite(telegraphMat);
    telegraph.position.z = S * spec.radius * 0.6;
    telegraph.scale.setScalar(S * (0.4 + spec.radius * 0.4));
    ship.add(telegraph);
    let blink: THREE.SpriteMaterial | null = null;
    if (kind === 'mine') {
      blink = new THREE.SpriteMaterial({
        map: glowTex, color: new THREE.Color(2.6, 0.3, 0.2), transparent: true, opacity: 0.3,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const light = new THREE.Sprite(blink);
      light.scale.setScalar(S * 0.7);
      ship.add(light);
    }
    ship.visible = false;
    if (!ship.parent) group.add(ship);
    const c: Craft = {
      kind, spec, ship,
      enemy: { group: ship, hp: spec.hp, maxHp: spec.hp, radius: S * spec.radius, hostile: spec.stance === 'hostile', kind },
      vel: new THREE.Vector3(), goal: new THREE.Vector3(), lateral: new THREE.Vector3(),
      stance: spec.stance, state: 'idle', stateT: 0, fireIn: 3, burst: 0, token: false,
      telegraphMat, live: false, leaving: -1, age: 0, aux: 0, phase: Math.random() * Math.PI * 2, blink,
    };
    crafts.push(c);
    pool[kind].push(c);
    craftByShip.set(ship, c);
  };
  addCraft('saucer', saucer);
  addCraft('dart', dartA);
  addCraft('dart', dartB);
  addCraft('mothership', mothership);
  addCraft('probe', probe);
  addCraft('lantern', lantern.group);
  addCraft('hauler', hauler.group);
  for (const r of raiders) addCraft('raider', r);
  for (const d of drones) addCraft('drone', d);
  for (const m of mines) addCraft('mine', m);
  addCraft('gunship', gunship);
  addCraft('wreck', wreck);
  addCraft('beacon', beacon.group);

  // ── Explore-mode state ──
  let hostile: HostileTarget | null = null;
  let wave = 0;
  let provoked = false;
  let scanT = 0;
  let encounter: EncounterKind | '' = '';
  let lastEncounter: EncounterKind | '' = '';
  /** Fights this flight, counting the one in progress. */
  let fights = 0;
  let meetings = 0;
  let killsThisEnc = 0;
  let shooters = 0;
  let mercy = false;
  let enemiesDirty = false;
  const live: Craft[] = [];
  const enemies: AlienEnemy[] = [];

  const refreshEnemies = () => {
    enemies.length = 0;
    if (mode !== 'explore') return;
    for (const c of live) {
      if (c.live && c.ship.visible && c.leaving < 0) {
        c.enemy.hostile = c.stance === 'hostile';
        enemies.push(c.enemy);
      }
    }
  };

  const release = (c: Craft) => {
    if (c.token) {
      c.token = false;
      shooters = Math.max(0, shooters - 1);
    }
    c.burst = 0;
    c.telegraphMat.opacity = 0;
  };

  const despawn = (c: Craft) => {
    release(c);
    c.live = false;
    c.ship.visible = false;
    c.ship.scale.setScalar(1);
    c.leaving = -1;
    enemiesDirty = true;
  };

  const startLeave = (c: Craft) => {
    if (c.leaving >= 0 || !c.live) return;
    release(c);
    c.leaving = 0;
    enemiesDirty = true;
  };

  const say = (key: string) => {
    handle.callout = key;
    handle.calloutSeq += 1;
  };

  const begin = (m: Exclude<Mode, 'idle' | 'explore'>, earth: THREE.Vector3 | null) => {
    mode = m;
    encT = 0;
    dartBDown = false;
    const anchor = earth ?? tmp.set(1, 0, 0);

    if (m === 'battle') {
      encDur = 18 + Math.random() * 5;
      randDir(rand);
      battleCenter.copy(anchor).addScaledVector(rand, 0.1 + Math.random() * 0.1);
      tracks.length = 0;
      tracks.push(
        makeTrack(saucer, S * 5, 0.9),
        makeTrack(probe, S * 8, -1.2),
        makeTrack(dartA, S * 11, 1.5),
        makeTrack(dartB, S * 14, -1.1),
      );
      saucer.visible = true;
      probe.visible = true;
      dartA.visible = true;
      dartB.visible = true;
      group.visible = true;
      return;
    }

    if (m === 'flyby') {
      const pick = Math.random();
      lead = pick < 0.4 ? saucer : pick < 0.75 ? probe : mothership;
    } else {
      lead = saucer;
    }
    encDur =
      lead === probe ? 9 + Math.random() * 3 :
      lead === mothership ? 20 + Math.random() * 6 :
      m === 'dogfight' ? 15 + Math.random() * 4 :
      13 + Math.random() * 5;

    randDir(rand);
    pA.copy(anchor).addScaledVector(rand, 0.5 + Math.random() * 0.3);
    pC.copy(anchor).multiplyScalar(2).sub(pA);
    randDir(rand);
    pC.addScaledVector(rand, 0.12);
    randDir(rand);
    pB.copy(anchor).addScaledVector(rand, 0.08 + Math.random() * 0.1);

    for (const s of ships) s.visible = false;
    lead.visible = true;
    if (m === 'dogfight') dartA.visible = true;
    group.visible = true;
  };

  /** A free craft of a kind, ready to place — or null when the pool or the
   *  live cap is spent. */
  const take = (kind: AlienKind): Craft | null => {
    let n = 0;
    for (const c of live) if (c.live) n += 1;
    if (n >= MAX_ACTIVE) return null;
    for (const c of pool[kind]) {
      if (!c.live) {
        c.live = true;
        c.leaving = -1;
        c.age = 0;
        c.aux = 0;
        c.stateT = 0;
        c.burst = 0;
        c.token = false;
        c.stance = c.spec.stance;
        c.enemy.hp = c.enemy.maxHp;
        c.vel.set(0, 0, 0);
        c.ship.scale.setScalar(1);
        c.ship.visible = true;
        c.fireIn = c.spec.cooldown[0] * 0.6 + Math.random() * 1.5;
        c.telegraphMat.opacity = 0;
        live.push(c);
        enemiesDirty = true;
        return c;
      }
    }
    return null;
  };

  const shipFwd = (target: HostileTarget, out: THREE.Vector3) => out.set(0, 0, 1).applyQuaternion(target.group.quaternion);

  /** Start an encounter around the target: who comes, where they appear,
   *  and what the deck says about it. */
  const startEncounter = (kind: EncounterKind, target: HostileTarget) => {
    // Clear whatever was left of the last one.
    for (const c of live) despawn(c);
    live.length = 0;
    mode = 'explore';
    encounter = kind;
    lastEncounter = kind;
    meetings += 1;
    encT = 0;
    scanT = 0;
    killsThisEnc = 0;
    mercy = false;
    const fight = HOSTILE_ENCOUNTERS.has(kind);
    const firstFight = fight && fights === 0;
    if (fight) fights += 1;
    if (kind === 'wave') wave += 1;
    encDur = kind === 'scout' ? 26 : kind === 'greeter' ? 22 : kind === 'trader' ? 32 : kind === 'beacon' ? 45
      : kind === 'wreck' ? 50 : kind === 'mines' ? 60 : kind === 'carrier' || kind === 'gunship' ? 100 : 75;
    const tp = target.group.position;
    shipFwd(target, fwd);
    const roster = rosterFor(kind, wave, firstFight);
    let i = 0;
    for (const k of roster) {
      const c = take(k);
      if (!c) continue;
      const p = c.ship.position;
      switch (k) {
        case 'mine': {
          // A loose field across the ship's path, close enough to fly into.
          right.crossVectors(fwd, UP);
          if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
          right.normalize();
          tmp2.crossVectors(right, fwd).normalize();
          const col = (i % 3) - 1;
          const row = i < 3 ? 0 : 1;
          p.copy(tp).addScaledVector(fwd, 0.07 + row * S * 9)
            .addScaledVector(right, (col + (row ? 0.5 : 0)) * S * 6 + (Math.random() - 0.5) * S * 2)
            .addScaledVector(tmp2, (Math.random() - 0.5) * S * 5);
          c.state = 'idle';
          break;
        }
        case 'wreck':
        case 'beacon': {
          randDir(rand);
          p.copy(tp).addScaledVector(fwd, 0.08).addScaledVector(rand, S * 6);
          c.state = 'idle';
          break;
        }
        case 'lantern': {
          // Comes up from behind and settles in alongside.
          randDir(rand);
          p.copy(tp).addScaledVector(fwd, -0.12).addScaledVector(rand, 0.04);
          c.state = 'approach';
          break;
        }
        default: {
          // Ahead and off to one side, at the edge of the radar.
          randDir(rand);
          tmp.copy(fwd).multiplyScalar(0.7).addScaledVector(rand, 0.8).normalize();
          p.copy(tp).addScaledVector(tmp, 0.24 + Math.random() * 0.06);
          c.state = c.kind === 'drone' ? 'orbit' : c.kind === 'mothership' || c.kind === 'gunship' || c.kind === 'saucer' ? 'hold' : 'approach';
          randDir(c.lateral);
        }
      }
      if (k !== 'mine' && k !== 'wreck' && k !== 'beacon') c.ship.lookAt(tp);
      i += 1;
    }
    refreshEnemies();
    enemiesDirty = false;
    group.visible = true;
    say(kind);
  };

  const endEncounter = () => {
    mode = 'idle';
    const wasFight = encounter !== '' && HOSTILE_ENCOUNTERS.has(encounter);
    encounter = '';
    // A fight earns a breather; a visitor is followed sooner.
    clock = hostile
      ? (provoked ? 8 + Math.random() * 7 : wasFight ? 60 + Math.random() * 45 : 35 + Math.random() * 35)
      : 260 + Math.random() * 280;
    for (const c of crafts) {
      release(c);
      c.live = false;
      c.leaving = -1;
      c.ship.visible = false;
      c.ship.scale.setScalar(1);
    }
    live.length = 0;
    shooters = 0;
    mercy = false;
    warpMat.opacity = 0;
    beamMat.opacity = 0;
    for (const b of bolts) {
      b.t = -1;
      b.mesh.visible = false;
    }
    enemies.length = 0;
    // The last explosion and any gift still out there play on.
    group.visible = fxAlive();
  };

  const fxAlive = () => {
    for (const sp of sparks) if (sp.life >= 0) return true;
    for (const b of booms) if (b.sprite.visible) return true;
    for (const g of gifts) if (g.life >= 0) return true;
    return false;
  };

  const dropGift = (at: THREE.Vector3, kind: GiftKind) => {
    let g: Gift | null = null;
    for (const x of gifts) if (x.life < 0) { g = x; break; }
    if (!g) return;
    g.kind = kind;
    g.life = 0;
    g.group.position.copy(at);
    randDir(g.vel).multiplyScalar(S * 1.5);
    g.group.visible = true;
    group.visible = true;
  };

  const fireBolt = (from: THREE.Group, target: THREE.Group, spread: number) => {
    const b = bolts.find((x) => x.t < 0);
    if (!b) return;
    b.mesh.material = boltMat;
    b.mesh.geometry = boltGeom;
    b.from.copy(from.position);
    b.to.copy(target.position);
    b.vel.set(0, 0, 0);
    if (Math.random() < 0.55) {
      b.to.x += (Math.random() - 0.5) * spread;
      b.to.y += (Math.random() - 0.5) * spread;
      b.target = null;
    } else {
      b.target = target;
    }
    b.t = 0;
    b.mesh.visible = true;
  };

  /** A projectile at the player: aimed at a lead on the target's motion,
   *  with a spread that makes a straight-and-level ship the easy kill. */
  const fireProjectile = (from: THREE.Group, target: HostileTarget, speed: number, spread: number, damage: number) => {
    const b = bolts.find((x) => x.t < 0);
    if (!b) return;
    b.mesh.material = boltMatRed;
    b.mesh.geometry = boltGeomLong;
    b.mesh.position.copy(from.position);
    const d = tmp.copy(target.group.position).sub(from.position).length();
    const leadT = Math.min(1.2, d / speed);
    tmp.copy(target.group.position).addScaledVector(targetVel, leadT * 0.85);
    tmp.x += (Math.random() - 0.5) * spread;
    tmp.y += (Math.random() - 0.5) * spread;
    tmp.z += (Math.random() - 0.5) * spread;
    b.vel.copy(tmp).sub(from.position).normalize().multiplyScalar(speed);
    b.mesh.lookAt(tmp);
    b.target = target.group;
    b.t = 0;
    b.life = 0;
    b.damage = damage;
    b.mesh.visible = true;
  };

  /** Damage at the ship from anything alien: softer in the first fights,
   *  softer still once the crew is in trouble. */
  const hurt = (target: HostileTarget, amount: number) => {
    target.onHit(amount * (mercy ? 0.4 : 1));
  };

  /** Steer a craft toward its goal with a speed cap and finite thrust. */
  const steer = (c: Craft, dt: number, speedK = 1, face = true) => {
    tmp.copy(c.goal).sub(c.ship.position);
    const d = tmp.length();
    if (d > 1e-9) tmp.divideScalar(d).multiplyScalar(c.spec.speed * speedK * Math.min(1, d / (S * 2) + 0.25));
    c.vel.lerp(tmp, Math.min(1, c.spec.accel * dt));
    c.ship.position.addScaledVector(c.vel, dt);
    if (face && c.vel.lengthSq() > 1e-12) {
      tmp2.copy(c.ship.position).add(c.vel);
      if (c.kind === 'saucer') c.ship.rotation.y += dt * 2.0;
      else c.ship.lookAt(tmp2);
    }
    return d;
  };

  /** Turn a craft's nose toward a point, at a limited rate. */
  const turnToward = (c: Craft, at: THREE.Vector3, rate: number, dt: number) => {
    facer.position.copy(c.ship.position);
    facer.lookAt(at);
    c.ship.quaternion.slerp(facer.quaternion, Math.min(1, rate * dt));
  };

  /** Guns: a few firing slots shared by the whole encounter; a craft must
   *  hold one to line up, glow, and fire its burst. */
  const weapons = (c: Craft, target: HostileTarget, dt: number, mayFire: boolean) => {
    const spec = c.spec;
    if (spec.damage <= 0 || spec.burst <= 0) return;
    // The guns recharge whatever the craft is doing, up to the point of
    // lining up; the telegraph and the burst need a firing slot.
    if (!c.token) {
      c.fireIn = Math.max(spec.telegraph, c.fireIn - dt);
      c.telegraphMat.opacity = Math.max(0, c.telegraphMat.opacity - dt * 3);
    }
    if (!mayFire || mercy) {
      if (c.token) release(c);
      return;
    }
    tmp.copy(target.group.position).sub(c.ship.position).normalize();
    tmp2.set(0, 0, 1).applyQuaternion(c.ship.quaternion);
    const onTarget = c.kind === 'saucer' || tmp.dot(tmp2) > (c.kind === 'gunship' || c.kind === 'mothership' ? 0.6 : 0.85);
    if (!onTarget && c.burst === 0) {
      if (c.token) release(c);
      return;
    }
    if (!c.token) {
      if (c.fireIn > spec.telegraph) return;
      const cap = fights <= 1 ? FIRST_FIGHT_SHOOTERS : MAX_SHOOTERS;
      if (shooters >= cap) return;
      c.token = true;
      shooters += 1;
    }
    c.fireIn -= dt;
    if (c.burst === 0 && c.fireIn > 0) {
      // The glow builds through the telegraph: a pilot sees it coming.
      c.telegraphMat.opacity = 0.5 + 0.5 * Math.sin((1 - c.fireIn / Math.max(0.05, spec.telegraph)) * Math.PI * 3);
    }
    if (c.fireIn <= 0) {
      c.telegraphMat.opacity = 1;
      fireProjectile(c.ship, target, spec.boltSpeed, S * spec.spread, spec.damage * damageScale(fights));
      c.burst += 1;
      if (c.burst >= spec.burst) {
        release(c);
        c.fireIn = between(spec.cooldown);
      } else {
        c.fireIn = spec.burstGap;
      }
    }
  };

  /** A fighter's manoeuvre cycle around the target (darts, raiders). */
  const flyFighter = (c: Craft, target: HostileTarget, dt: number, mayFire: boolean) => {
    const tp = target.group.position;
    c.stateT += dt;
    const dist = c.ship.position.distanceTo(tp);
    switch (c.state) {
      case 'approach': {
        c.goal.copy(tp).addScaledVector(targetVel, 0.8);
        steer(c, dt);
        if (dist < S * 9) {
          c.state = 'strafe';
          c.stateT = 0;
          randDir(c.lateral).multiplyScalar(S * 1.5);
        }
        break;
      }
      case 'strafe': {
        // Fly straight through, past the target, guns on it.
        c.goal.copy(tp).add(c.lateral).addScaledVector(c.vel, 1.5);
        steer(c, dt, 1.1);
        tmp.copy(tp).sub(c.ship.position);
        const passed = tmp.dot(c.vel) < 0 || dist < S * 1.5;
        if (passed || c.stateT > 4) {
          c.state = 'break';
          c.stateT = 0;
          randDir(c.lateral);
        }
        break;
      }
      case 'break': {
        // Turn away and open range — no shots while showing the tail.
        c.goal.copy(c.ship.position).addScaledVector(c.lateral, S * 12).addScaledVector(c.vel, 1);
        steer(c, dt, 1.2);
        if (c.stateT > 2.2) {
          c.state = 'reposition';
          c.stateT = 0;
          randDir(c.lateral);
        }
        break;
      }
      case 'reposition': {
        // Pulled back for the crew's sake: wait out at range.
        c.goal.copy(tp).addScaledVector(c.lateral, S * (mercy ? 34 : 22));
        const d = steer(c, dt);
        if (!mercy && (d < S * 4 || c.stateT > 5)) {
          c.state = 'approach';
          c.stateT = 0;
        }
        break;
      }
      case 'evade': {
        c.goal.copy(c.ship.position).addScaledVector(c.lateral, S * 10);
        steer(c, dt, 1.3);
        if (c.stateT > 1.1) {
          c.state = 'break';
          c.stateT = 0;
        }
        break;
      }
      default:
        c.state = 'approach';
    }
    if (mercy && (c.state === 'approach' || c.state === 'strafe')) {
      c.state = 'break';
      c.stateT = 0;
      randDir(c.lateral);
    }
    weapons(c, target, dt, mayFire && (c.state === 'approach' || c.state === 'strafe'));
  };

  /** Drones: circle the ship in a loose shell, then dive through it one
   *  shot at a time. */
  const flyDrone = (c: Craft, target: HostileTarget, dt: number, mayFire: boolean) => {
    const tp = target.group.position;
    c.stateT += dt;
    if (c.state === 'dive' && !mercy) {
      c.goal.copy(tp).addScaledVector(targetVel, 0.5);
      steer(c, dt, 1.15);
      tmp.copy(tp).sub(c.ship.position);
      if (tmp.dot(c.vel) < 0 || c.stateT > 2.6) {
        c.state = 'orbit';
        c.stateT = 0;
        randDir(c.lateral);
      }
    } else {
      if (c.state !== 'orbit') {
        c.state = 'orbit';
        c.stateT = 0;
      }
      const r = S * (mercy ? 26 : 8 + (c.phase % 3));
      const a = c.phase + c.age * 0.9;
      tmp3.crossVectors(c.lateral, UP);
      if (tmp3.lengthSq() < 1e-6) tmp3.set(1, 0, 0);
      tmp3.normalize();
      c.goal.copy(tp).addScaledVector(targetVel, 0.5)
        .addScaledVector(c.lateral, Math.cos(a) * r).addScaledVector(tmp3, Math.sin(a) * r);
      steer(c, dt);
      if (c.stateT > 4 + (c.phase % 3)) {
        c.state = 'dive';
        c.stateT = 0;
      }
    }
    weapons(c, target, dt, mayFire && c.state === 'dive');
  };

  /** Saucer, mothership, gunship: keep a drifting station off the ship and
   *  shoot from there. The big two launch drones. */
  const flyHeavy = (c: Craft, target: HostileTarget, dt: number, mayFire: boolean) => {
    const tp = target.group.position;
    c.stateT += dt;
    if (c.state !== 'hold' || c.stateT > 7) {
      c.state = 'hold';
      c.stateT = 0;
      randDir(c.lateral);
    }
    const range = c.kind === 'gunship' ? 18 : c.kind === 'mothership' ? 15 : 8;
    c.goal.copy(tp).addScaledVector(c.lateral, S * range * (mercy ? 2 : 1)).addScaledVector(targetVel, 0.6);
    if (c.kind === 'saucer') {
      steer(c, dt, 0.8);
    } else {
      steer(c, dt, 0.8, false);
      turnToward(c, tp, 0.9, dt);
      // Launch bay: a drone every so often, while there is room.
      c.aux += dt;
      if (c.aux > (c.kind === 'gunship' ? 10 : 12) && !mercy) {
        c.aux = 0;
        let dronesUp = 0;
        for (const x of live) if (x.live && x.kind === 'drone') dronesUp += 1;
        if (dronesUp < (c.kind === 'gunship' ? 4 : 3)) {
          const d = take('drone');
          if (d) {
            d.ship.position.copy(c.ship.position);
            tmp.set(0, 0, 1).applyQuaternion(c.ship.quaternion);
            d.vel.copy(tmp).multiplyScalar(0.01);
            d.state = 'orbit';
            randDir(d.lateral);
            d.fireIn = 3 + Math.random() * 2;
          }
        }
      }
    }
    weapons(c, target, dt, mayFire);
  };

  /** The scout: closes, holds off the ship's beam, scans, leaves. */
  const flyProbe = (c: Craft, target: HostileTarget, dt: number) => {
    const tp = target.group.position;
    const dist = c.ship.position.distanceTo(tp);
    if (c.state === 'flee') {
      c.goal.copy(c.ship.position).sub(tp).normalize().multiplyScalar(0.2).add(c.ship.position);
      steer(c, dt, 1.4);
      c.stateT += dt;
      if (c.stateT > 1.5) startLeave(c);
      return;
    }
    if (c.state === 'approach') {
      c.goal.copy(tp);
      steer(c, dt, 0.9);
      if (dist < S * 7) {
        c.state = 'hold';
        c.stateT = 0;
        randDir(c.lateral);
      }
      return;
    }
    c.stateT += dt;
    c.goal.copy(tp).addScaledVector(c.lateral, S * 6).addScaledVector(targetVel, 0.3);
    steer(c, dt, 0.9);
    scanBeam(c, tp, dt, c.stateT > 2);
    if (scanT >= 5 && c.stateT > 9.5) startLeave(c);
  };

  /** The beam from a scanning craft; five seconds of it is a full scan. */
  const scanBeam = (c: Craft, tp: THREE.Vector3, dt: number, on: boolean) => {
    if (on && scanT < 5) {
      scanT += dt;
      beamMat.opacity = 0.5 + 0.4 * Math.sin(scanT * 9);
      const bp = beamGeom.getAttribute('position') as THREE.BufferAttribute;
      bp.setXYZ(0, c.ship.position.x, c.ship.position.y, c.ship.position.z);
      bp.setXYZ(1, tp.x, tp.y, tp.z);
      bp.needsUpdate = true;
      if (scanT >= 5) {
        handle.scanned = true;
        beamMat.opacity = 0;
      }
    } else {
      beamMat.opacity = Math.max(0, beamMat.opacity - dt * 4);
    }
  };

  /** The trader: a slow lap around the ship with its scanner on, then on
   *  its way. Shot at, it runs for it. */
  const flyHauler = (c: Craft, target: HostileTarget, dt: number) => {
    const tp = target.group.position;
    c.stateT += dt;
    hauler.ring.rotation.z += dt * 0.6;
    if (c.state === 'flee') {
      c.goal.copy(c.ship.position).sub(tp).normalize().multiplyScalar(0.3).add(c.ship.position);
      steer(c, dt, 1.6);
      if (c.stateT > 3) startLeave(c);
      return;
    }
    if (c.state === 'approach') {
      c.goal.copy(tp);
      steer(c, dt);
      if (c.ship.position.distanceTo(tp) < S * 13) {
        c.state = 'orbit';
        c.stateT = 0;
        randDir(c.lateral);
      }
      return;
    }
    const a = c.phase + c.stateT * 0.35;
    tmp3.crossVectors(c.lateral, UP);
    if (tmp3.lengthSq() < 1e-6) tmp3.set(1, 0, 0);
    tmp3.normalize();
    c.goal.copy(tp).addScaledVector(targetVel, 0.6)
      .addScaledVector(c.lateral, Math.cos(a) * S * 11).addScaledVector(tmp3, Math.sin(a) * S * 11);
    steer(c, dt);
    scanBeam(c, tp, dt, c.stateT > 4 && c.stateT < 12);
    if (c.stateT > 20) startLeave(c);
  };

  /** The greeter: comes alongside, matches the ship, puts on a light show,
   *  leaves a gift, rolls away and warps out. */
  const flyLantern = (c: Craft, target: HostileTarget, dt: number) => {
    const tp = target.group.position;
    c.stateT += dt;
    // The lights walk the spectrum; brighter during the show.
    const show = c.state === 'alongside' && c.stateT > 2.5 && c.stateT < 7;
    lantern.lights.color.setHSL((c.age * (show ? 0.9 : 0.25)) % 1, 0.9, 0.6).multiplyScalar(show ? 2.6 : 1.6);
    lantern.glow.opacity = show ? 0.55 + 0.35 * Math.sin(c.age * 14) : 0.5;
    if (c.state === 'flee') {
      c.goal.copy(c.ship.position).sub(tp).normalize().multiplyScalar(0.3).add(c.ship.position);
      steer(c, dt, 1.6);
      if (c.stateT > 1.2) startLeave(c);
      return;
    }
    shipFwd(target, fwd);
    right.set(1, 0, 0).applyQuaternion(target.group.quaternion);
    if (c.state === 'approach') {
      c.goal.copy(tp).addScaledVector(right, S * 5).addScaledVector(targetVel, 0.5);
      steer(c, dt, 1.5);
      if (c.ship.position.distanceTo(c.goal) < S * 3 || c.stateT > 14) {
        c.state = 'alongside';
        c.stateT = 0;
      }
      return;
    }
    // Alongside: off the right wing, a little ahead, flying the same way.
    c.goal.copy(tp).addScaledVector(right, S * 4.5).addScaledVector(fwd, S * 1.5).addScaledVector(targetVel, 0.25);
    c.goal.y += Math.sin(c.age * 1.7) * S * 0.6;
    steer(c, dt, 1.4, false);
    c.ship.quaternion.slerp(target.group.quaternion, Math.min(1, dt * 2.5));
    // A wave: a slow roll during the show.
    if (show) c.ship.rotateZ(Math.sin(c.stateT * 2.2) * 0.6 * dt * 3);
    if (c.stateT > 6 && c.aux === 0) {
      c.aux = 1;
      tmp.copy(c.ship.position).lerp(tp, 0.4);
      dropGift(tmp, 'greeting');
    }
    if (c.stateT > 10) startLeave(c);
  };

  /** The beacon: turns its rings, pulses, and greets a ship that comes close
   *  with a gift of charge. */
  const tendBeacon = (c: Craft, target: HostileTarget, dt: number) => {
    c.stateT += dt;
    for (let i = 0; i < beacon.rings.length; i++) {
      const r = beacon.rings[i];
      r.rotation.x += dt * (0.5 + i * 0.3);
      r.rotation.y += dt * (0.3 - i * 0.2);
    }
    const near = c.ship.position.distanceTo(target.group.position) < S * 16;
    beacon.tip.opacity = c.aux === 0
      ? 0.55 + 0.35 * Math.sin(c.age * 3)
      : 0.6 + 0.4 * Math.abs(Math.sin(c.age * 12));
    if (near && c.aux === 0) {
      c.aux = 1;
      say('beaconGreets');
      dropGift(c.ship.position, 'beacon');
    }
  };

  /** A derelict: tumbles, and now and then a spark spits from it. */
  const tendWreck = (c: Craft, dt: number) => {
    c.ship.rotation.x += dt * 0.08;
    c.ship.rotation.y += dt * 0.05;
    c.aux += dt;
    if (c.aux > 2.8) {
      c.aux = 0;
      tmp.copy(c.ship.position).addScaledVector(randDir(rand), S * 0.4);
      spawnSparks(tmp, S * 1.2);
    }
  };

  /** A mine: idles with a slow blink; arms when the ship comes close, blinks
   *  fast through its fuse, and blows. */
  const tendMine = (c: Craft, target: HostileTarget, dt: number) => {
    c.ship.rotation.y += dt * 0.4;
    c.ship.rotation.x += dt * 0.25;
    const d = c.ship.position.distanceTo(target.group.position);
    if (c.state !== 'armed') {
      if (c.blink) c.blink.opacity = 0.2 + 0.25 * Math.max(0, Math.sin(c.age * 3 + c.phase));
      if (d < S * MINE_ARM && !mercy) {
        c.state = 'armed';
        c.stateT = 0;
      }
      return;
    }
    c.stateT += dt;
    if (c.blink) c.blink.opacity = Math.sin(c.stateT * (10 + c.stateT * 16)) > 0 ? 1 : 0.15;
    if (c.stateT >= MINE_FUSE || d < S * 0.8) detonate(c, target);
  };

  const detonate = (c: Craft, target: HostileTarget | null) => {
    explode(c.ship, S * 1.4);
    if (target && c.ship.position.distanceTo(target.group.position) < S * MINE_BLAST) {
      hurt(target, c.spec.damage * damageScale(fights));
    }
    despawn(c);
  };

  /** A craft is shot down: debris, and whatever it was carrying. */
  const destroy = (c: Craft) => {
    lastKillPos.copy(c.ship.position);
    if (c.kind === 'mine') {
      detonate(c, hostile);
      return;
    }
    explode(c.ship, c.enemy.radius);
    if (c.kind === 'wreck') {
      dropGift(lastKillPos, 'wreck');
      dropGift(lastKillPos, 'wreck');
    } else if (c.kind === 'hauler') {
      dropGift(lastKillPos, 'cargo');
    } else if (c.kind === 'beacon' && c.aux === 0) {
      dropGift(lastKillPos, 'beacon');
    }
    if (c.stance === 'hostile') killsThisEnc += 1;
    despawn(c);
  };

  /** Gifts drift, then home on the ship once it is near; touching one
   *  restores hull and shields. */
  const updateGifts = (dt: number) => {
    let any = false;
    nearestGift = null;
    let best = Infinity;
    for (const g of gifts) {
      if (g.life < 0) continue;
      any = true;
      g.life += dt;
      const p = g.group.position;
      g.group.rotation.y += dt * 2.4;
      if (hostile && g.life > 0.6) {
        tmp.copy(hostile.group.position).sub(p);
        const d = tmp.length();
        if (d < S * 1.6) {
          const amount = GIFTS[g.kind];
          hostile.onRepair?.(amount.hull, amount.shield);
          say(g.kind === 'greeting' || g.kind === 'beacon' ? 'gift' : 'salvage');
          g.life = -1;
          g.group.visible = false;
          continue;
        }
        if (d < S * 80) {
          tmp.divideScalar(d).multiplyScalar(Math.max(0.03, targetVel.length() * 1.6));
          g.vel.lerp(tmp, Math.min(1, dt * 2.5));
        } else {
          g.vel.multiplyScalar(Math.max(0, 1 - dt));
        }
      } else {
        g.vel.multiplyScalar(Math.max(0, 1 - dt));
      }
      p.addScaledVector(g.vel, dt);
      const fade = g.life > 40 ? Math.max(0.001, 1 - (g.life - 40)) : 1;
      g.group.scale.setScalar(fade * (1 + 0.15 * Math.sin(g.life * 6)));
      if (g.life > 41) {
        g.life = -1;
        g.group.visible = false;
      } else if (hostile) {
        const d = p.distanceToSquared(hostile.group.position);
        if (d < best) {
          best = d;
          nearestGift = p;
        }
      }
    }
    return any;
  };

  const clearGifts = () => {
    for (const g of gifts) {
      g.life = -1;
      g.group.visible = false;
    }
  };

  /** Explore Mode: pick what comes next, from where the ship is. */
  const chooseEncounter = (zone: AlienZone): EncounterKind => {
    if (provoked) {
      provoked = false;
      return 'wave';
    }
    // The very first meeting of a flight is a friendly one.
    if (meetings === 0) return zone === 'home' || Math.random() < 0.5 ? 'greeter' : 'scout';
    let k = pickEncounter(zone, Math.random());
    if (k === lastEncounter) k = pickEncounter(zone, Math.random());
    return k;
  };

  /** Encounters wait for a ship that is cruising, flying and in one piece. */
  const canMeet = (st: AlienTargetStatus | undefined) =>
    !st || (!st.crashed && !st.docked && st.jumpPhase === 'none' && st.mode === 'cruise');

  const updateExplore = (target: HostileTarget, dt: number) => {
    const st = target.status;
    encT += dt;
    // Mercy: with the shields gone and the hull low, everything holds fire
    // and pulls back until the shields have come up again.
    if (st) {
      const sh = st.maxShield > 0 ? st.shield / st.maxShield : 1;
      const hu = st.maxHp > 0 ? st.hp / st.maxHp : 1;
      if (!mercy && sh <= 0 && hu < MERCY_HULL && encounter !== '' && HOSTILE_ENCOUNTERS.has(encounter)) {
        mercy = true;
        say('breakoff');
      } else if (mercy && sh > MERCY_RESUME_SHIELD) {
        mercy = false;
      }
      // A wreck, a jump or a dock ends the meeting: everything warps out.
      if (st.crashed || st.docked || st.jumpPhase !== 'none') {
        for (const c of live) if (c.live) startLeave(c);
      }
    }
    const timeUp = encT > encDur;
    const mayFire = !timeUp && !(st && st.crashed);
    const tp = target.group.position;
    let nearest = Infinity;
    let anyHostile = false;
    let anyLive = 0;
    let anyFar = true;
    for (let i = 0; i < live.length; i++) {
      const c = live[i];
      if (!c.live) continue;
      c.age += dt;
      if (c.leaving >= 0) {
        // Warp-out: shrink into a flash.
        c.leaving = Math.min(1, c.leaving + dt / 0.7);
        c.ship.position.addScaledVector(c.vel, dt);
        const k = c.leaving;
        c.ship.scale.setScalar(Math.max(0.001, 1 - k));
        warpFlash.position.copy(c.ship.position);
        warpFlash.scale.setScalar(S * (1 + k * 6) * (c.enemy.radius > S ? 1.8 : 1));
        warpMat.opacity = Math.sin(k * Math.PI) * 0.9;
        if (k >= 1) {
          warpMat.opacity = 0;
          despawn(c);
        }
        continue;
      }
      if (timeUp && c.kind !== 'mine' && c.kind !== 'wreck' && c.kind !== 'beacon') {
        startLeave(c);
        continue;
      }
      switch (c.kind) {
        case 'dart':
        case 'raider': flyFighter(c, target, dt, mayFire); break;
        case 'drone': flyDrone(c, target, dt, mayFire); break;
        case 'saucer':
        case 'mothership':
        case 'gunship': flyHeavy(c, target, dt, mayFire); break;
        case 'probe': flyProbe(c, target, dt); break;
        case 'hauler': flyHauler(c, target, dt); break;
        case 'lantern': flyLantern(c, target, dt); break;
        case 'beacon': tendBeacon(c, target, dt); break;
        case 'wreck': tendWreck(c, dt); break;
        case 'mine': tendMine(c, target, dt); break;
      }
      if (!c.live) continue;
      anyLive += 1;
      const d = c.ship.position.distanceToSquared(tp);
      if (d < 0.5 * 0.5) anyFar = false;
      if (c.stance === 'hostile') anyHostile = true;
      if (d < nearest) {
        nearest = d;
        contactPos.copy(c.ship.position);
      }
    }
    // Compact the live list in place.
    let w = 0;
    for (let i = 0; i < live.length; i++) if (live[i].live) live[w++] = live[i];
    live.length = w;
    if (enemiesDirty) {
      refreshEnemies();
      enemiesDirty = false;
    }
    handle.contactPos = anyLive ? contactPos : nearestGift ? contactPos.copy(nearestGift) : null;
    handle.contactState = anyLive ? (anyHostile ? 'hostile' : 'scan') : 'none';

    // The fight is won: what is left of them is worth picking up.
    if (encounter !== '' && HOSTILE_ENCOUNTERS.has(encounter) && encounter !== 'mines' && !anyHostile && killsThisEnc > 0 && !(st && st.crashed)) {
      say('clear');
      dropGift(lastKillPos, 'salvage');
      killsThisEnc = 0;
    }
    // Left behind (the drive, or a long cruise away), or the stage is empty.
    if (live.length === 0 || anyFar || (timeUp && encT > encDur + 25)) endEncounter();
  };

  const handle: AlienHandle = {
    group,
    enemies,
    spawnSparks,
    contactPos: null,
    contactState: 'none',
    scanned: false,
    callout: '',
    calloutSeq: 0,
    encounter: '',
    nudge() {
      clock = 0;
    },
    stage(kind) {
      if (!hostile) return;
      startEncounter(kind, hostile);
    },
    setHostile(target) {
      if (target === hostile) return;
      hostile = target;
      wave = 0;
      provoked = false;
      fights = 0;
      meetings = 0;
      lastEncounter = '';
      endEncounter();
      clearGifts();
      for (const sp of sparks) if (sp.life >= 0) group.visible = true;
      // First contact arrives early enough to be found, late enough to be a surprise.
      clock = target ? 25 + Math.random() * 20 : 260 + Math.random() * 280;
      if (target) targetPrev.copy(target.group.position);
    },
    damage(enemy, amount) {
      if (!enemy.group.visible || enemy.hp <= 0) return false;
      const c = craftByShip.get(enemy.group);
      if (!c || !c.live || c.leaving >= 0) return false;
      // Firing on something peaceful has consequences.
      if (c.stance !== 'hostile' && c.kind !== 'wreck' && c.kind !== 'beacon') {
        if (c.kind === 'probe' || c.kind === 'hauler') provoked = true;
        if (c.state !== 'flee') {
          if (c.kind === 'lantern') say('spooked');
          c.state = 'flee';
          c.stateT = 0;
          beamMat.opacity = 0;
        }
      }
      enemy.hp -= amount;
      if (enemy.group === saucer) hitMat.opacity = 0.9;
      if ((c.kind === 'dart' || c.kind === 'raider') && c.state !== 'evade' && Math.random() < 0.6) {
        c.state = 'evade';
        c.stateT = 0;
        randDir(c.lateral);
      }
      // A mine shot at blows where it is.
      if (enemy.hp > 0) return false;
      destroy(c);
      refreshEnemies();
      enemiesDirty = false;
      return true;
    },
    update(dtSec: number, earthPos: THREE.Vector3 | null) {
      let sparksAlive = false;
      for (const sp of sparks) {
        if (sp.life < 0) continue;
        sparksAlive = true;
        sp.life += dtSec;
        const p = sp.points.geometry.getAttribute('position') as THREE.BufferAttribute;
        for (let i = 0; i < SPARK_N; i++) {
          p.setXYZ(
            i,
            p.getX(i) + sp.vel[i * 3] * dtSec,
            p.getY(i) + sp.vel[i * 3 + 1] * dtSec,
            p.getZ(i) + sp.vel[i * 3 + 2] * dtSec,
          );
        }
        p.needsUpdate = true;
        sp.mat.opacity = Math.max(0, 1 - sp.life / 0.7);
        if (sp.life > 0.7) {
          sp.life = -1;
          sp.points.visible = false;
        }
      }
      let boomAlive = false;
      for (const b of booms) {
        if (!b.sprite.visible) continue;
        b.mat.opacity = Math.max(0, b.mat.opacity - dtSec * 2.2);
        if (b.mat.opacity <= 0) b.sprite.visible = false;
        else boomAlive = true;
      }
      if (hostile && dtSec > 0) {
        targetVel.copy(hostile.group.position).sub(targetPrev).divideScalar(dtSec);
        targetPrev.copy(hostile.group.position);
      }
      const giftsAlive = updateGifts(dtSec);
      hitMat.opacity = Math.max(0, hitMat.opacity - dtSec * 3);
      handle.encounter = encounter;

      if (mode === 'idle') {
        // Nothing about but a gift: the sensors point the way to it.
        handle.contactPos = hostile && nearestGift ? contactPos.copy(nearestGift) : null;
        handle.contactState = 'none';
        if (!sparksAlive && !boomAlive && !giftsAlive) group.visible = false;
        else group.visible = true;
        clock -= dtSec;
        if (clock <= 0) {
          if (hostile) {
            const st = hostile.status;
            if (canMeet(st)) startEncounter(chooseEncounter(st?.zone ?? 'home'), hostile);
            // Not now (a wreck, a jump, the fast drive): look again shortly,
            // and give a crew that just came back from a wreck a moment first.
            else clock = st?.crashed ? 30 : 5;
          } else {
            const r = Math.random();
            begin(r < 0.5 ? 'flyby' : r < 0.75 ? 'dogfight' : 'battle', earthPos);
          }
        }
        return;
      }

      if (mode === 'explore' && hostile) {
        updateExplore(hostile, dtSec);
        if (mode === 'explore') updateBolts(dtSec);
        return;
      }

      encT += dtSec;
      const t = Math.min(1, encT / encDur);

      if (mode === 'battle') {
        for (const tr of tracks) {
          if (tr.ship === dartB && dartBDown) continue;
          trackPos(tr, encT, pos);
          trackPos(tr, encT + 0.05, posNext);
          tr.ship.position.copy(pos);
          if (tr.ship === saucer) saucer.rotation.y += dtSec * 2.0;
          else tr.ship.lookAt(tmp.copy(posNext));
        }
        fireAcc -= dtSec;
        if (fireAcc <= 0 && t < 0.88) {
          fireAcc = 0.35 + Math.random() * 0.35;
          const r = Math.random();
          if (r < 0.4) fireBolt(dartA, saucer, S * 2.5);
          else if (r < 0.65 && !dartBDown) fireBolt(dartB, Math.random() < 0.5 ? saucer : probe, S * 2.5);
          else fireBolt(saucer, dartBDown || Math.random() < 0.5 ? dartA : dartB, S * 3);
        }
        if (!dartBDown && t > 0.72) {
          dartBDown = true;
          explode(dartB);
        }
      } else {
        bezier(t, pos);
        bezier(Math.min(1, t + 0.01), posNext);
        lead.position.copy(pos);
        if (lead === saucer) lead.rotation.y += dtSec * 2.0;
        else lead.lookAt(tmp.copy(posNext));
        if (mode === 'dogfight') {
          chase.copy(pos).sub(posNext).normalize().multiplyScalar(S * 6);
          chase.add(pos);
          chase.x += Math.sin(encT * 3.1) * S * 1.5;
          chase.y += Math.cos(encT * 2.3) * S * 1.5;
          dartA.position.copy(chase);
          tmp.copy(saucer.position);
          dartA.lookAt(tmp);
          fireAcc -= dtSec;
          if (fireAcc <= 0) {
            fireAcc = 0.5 + Math.random() * 0.5;
            fireBolt(dartA, saucer, S * 2.5);
          }
        }
      }

      updateBolts(dtSec);

      // Warp-out flash at the end of the run.
      if (t > 0.94) {
        const k = (t - 0.94) / 0.06;
        const anchorShip = mode === 'battle' ? saucer : lead;
        warpFlash.position.copy(anchorShip.position);
        warpFlash.scale.setScalar(S * (1 + k * 6) * (lead === mothership ? 1.8 : 1));
        warpMat.opacity = Math.sin(k * Math.PI) * 0.9;
        for (const s of ships) {
          if (s.visible) s.scale.setScalar(Math.max(0.001, 1 - k));
        }
      }

      if (t >= 1) endEncounter();
    },
    dispose() {
      // Clones share geometry and materials: gather each once.
      const geoms = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
          geoms.add(o.geometry);
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => mats.add(x));
          else mats.add(m as THREE.Material);
        } else if (o instanceof THREE.Sprite) {
          mats.add(o.material as THREE.SpriteMaterial);
        }
      });
      // The pooled bolts swap between the two sets, so the traverse above
      // only ever finds whichever they are holding: add all four by name.
      mats.add(boltMat);
      mats.add(boltMatRed);
      geoms.add(boltGeom);
      geoms.add(boltGeomLong);
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
      glowTex.dispose();
    },
  };

  // Advance bolts. Guide bolts lerp; projectiles fly and are swept
  // against the target's hull.
  function updateBolts(dtSec: number) {
    const playerGroup = hostile?.group ?? null;
    for (const b of bolts) {
      if (b.t < 0) continue;
      if (b.vel.lengthSq() > 0) {
        b.life += dtSec;
        tmp.copy(b.mesh.position);
        b.mesh.position.addScaledVector(b.vel, dtSec);
        if (playerGroup && b.target === playerGroup) {
          tmp2.copy(playerGroup.position).sub(tmp);
          const segLen2 = b.vel.lengthSq() * dtSec * dtSec;
          const along = segLen2 > 0 ? THREE.MathUtils.clamp(tmp2.dot(b.vel) * dtSec / segLen2, 0, 1) : 0;
          tmp.addScaledVector(b.vel, along * dtSec);
          if (tmp.distanceToSquared(playerGroup.position) < HIT_R2) {
            spawnSparks(playerGroup.position, S * 2.8);
            if (hostile) hurt(hostile, b.damage);
            b.t = -1;
            b.mesh.visible = false;
            continue;
          }
        }
        if (b.life > 2.2) {
          b.t = -1;
          b.mesh.visible = false;
        }
        continue;
      }
      b.t += dtSec * 2.6;
      if (b.t >= 1) {
        if (b.target) {
          spawnSparks(b.target.position, S * 2.8);
          if (b.target === saucer) hitMat.opacity = 0.9;
        }
        b.t = -1;
        b.mesh.visible = false;
        continue;
      }
      b.mesh.position.lerpVectors(b.from, b.to, b.t);
      tmp.copy(b.to);
      b.mesh.lookAt(tmp);
    }
  }

  return handle;
}
