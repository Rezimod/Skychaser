// The small Stellar outposts on Mercury, Venus and the four giants: one
// builder, styled per world, out of the same kit as Mars Base and the Moon
// (moon-kit) and folded into a few draw calls (moon-batch).
//
// Every outpost has the same bones, laid out round its landing pad with
// north up the screen as the crew step out: a painted pad with a ring of
// lamps, two habitat modules joined by a short tunnel with the airlock
// facing the pad, a sign in front of them, a comms dish on the west side
// and the power plant on the east. What changes is what each world asks
// of it:
//
// - Mercury: white insulation over the modules, a long sun wall to the
//   east throwing the habitats into shade under a low, fierce Sun, and a
//   solar array turned edge-up to catch it.
// - Venus: thick steel pressure hulls for 92 bar, and the one thing that
//   matters there: a cooler — a heat pump and its radiator stack, driven
//   by a plutonium Stirling generator, pushing heat out into 464 °C air.
// - The giants: no ground, so the outpost is an aerostat. A round deck with
//   a railing rides the cloud tops; three hot-hydrogen envelopes hold it up
//   (the air is mostly hydrogen, so only heat gives a balloon real lift),
//   tethered to its rim; a
//   keel hangs underneath; a fission plant feeds the heaters; beacons blink
//   on the envelopes and the rim.

import * as THREE from 'three';
import { mergeStatic } from '@/lib/solar-system/moon-batch';
import type { Kit } from '@/lib/solar-system/moon-kit';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { PointOfInterest } from '@/lib/solar-system/moon-base';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { LightPool } from '@/lib/solar-system/moon-lights';
import type { LanderTelemetry } from '@/lib/solar-system/moon-lander';
import type { WorldDeck, WorldId, WorldProfile } from '@/lib/solar-system/world-profiles';

export type OutpostWorld = 'mercury' | 'venus' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const OUTPOST_WORLDS: readonly OutpostWorld[] = ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune'];
export function hasOutpost(world: WorldId): world is OutpostWorld {
  return (OUTPOST_WORLDS as readonly string[]).includes(world);
}

/** The descent aims this far south of the profile's `pad` (as it always has on Mars). */
export const PAD_LEAD = 26;
/** Where the ship sets down: the middle of the painted pad. */
export function landingPad(profile: WorldProfile): { x: number; z: number } {
  return { x: profile.pad.x, z: profile.pad.z + PAD_LEAD };
}
/** The painted pad's radius, m. */
export const PAD_PAINT = 13;

/** Below this height over the deck, a ship wide of the pad is flown back over it, m. */
export const DECK_GUIDE_ALT = 80;
/**
 * Over a giant there is nothing to land on but the deck. Low over it, a
 * ship that is wide of the pad by more than a third of the deck's radius is
 * handed to the descent computer (the lander's own assist), which flies it
 * back over the pad and sets it down there. `y` is the ship's height over
 * the deck.
 */
export function holdOverDeck(t: LanderTelemetry, x: number, y: number, z: number, pad: { x: number; z: number }, deck: WorldDeck) {
  if (t.landed || t.assist) return;
  if (y < DECK_GUIDE_ALT && Math.hypot(x - pad.x, z - pad.z) > deck.radius * 0.3) t.assist = true;
}

interface Style {
  sign: [string, string];
  /** What the modules are clad in, and the power plant. */
  hull: 'blanket' | 'steel' | 'shell';
  power: 'solar' | 'stirling' | 'fission';
  extra: 'sunshade' | 'cooler' | 'envelope';
}
const STYLES: Record<OutpostWorld, Style> = {
  mercury: { sign: ['SKYCHASER · MERCURY OUTPOST', 'RACHMANINOFF · DAWN LINE'], hull: 'blanket', power: 'solar', extra: 'sunshade' },
  venus: { sign: ['SKYCHASER · VENUS OUTPOST', 'VENERA 13 PLAIN · 92 BAR'], hull: 'steel', power: 'stirling', extra: 'cooler' },
  jupiter: { sign: ['SKYCHASER · JUPITER OUTPOST', 'FLOATING STATION · 1 BAR'], hull: 'shell', power: 'fission', extra: 'envelope' },
  saturn: { sign: ['SKYCHASER · SATURN OUTPOST', 'FLOATING STATION · 1 BAR'], hull: 'shell', power: 'fission', extra: 'envelope' },
  uranus: { sign: ['SKYCHASER · URANUS OUTPOST', 'FLOATING STATION · 1 BAR'], hull: 'shell', power: 'fission', extra: 'envelope' },
  neptune: { sign: ['SKYCHASER · NEPTUNE OUTPOST', 'FLOATING STATION · 1 BAR'], hull: 'shell', power: 'fission', extra: 'envelope' },
};

/** The envelopes' bearings round the deck, degrees (x = cos, z = sin): the
 *  southern half stays clear, because the descent comes in from the south-west. */
const ENVELOPES = [30, 210, 270];
const ENVELOPE_AT = { r: 30, y: 62, size: [15, 10.5, 15] as const };

export interface Outpost {
  group: THREE.Group;
  colliders: Collider[];
  pois: PointOfInterest[];
  interactables: Interactable[];
  /** The middle of the pad the ship sets down on. */
  pad: { x: number; z: number };
  update: (dt: number, t: number, crewX: number, crewZ: number, lights: LightPool) => void;
  dispose: () => void;
}

/** How close the crew must be for the habitat's window light to be asked for, m. */
const NEAR_WORK = 60;

export function makeOutpost(
  world: OutpostWorld, profile: WorldProfile, kit: Kit, heightAt: (x: number, z: number) => number, lite: boolean, readout: (key: string) => void,
): Outpost {
  const style = STYLES[world];
  const deck = profile.deck ?? null;
  const group = new THREE.Group();
  group.name = `${world}-outpost`;
  const M = kit.mat;
  const colliders: Collider[] = [];
  const pois: PointOfInterest[] = [];
  const interactables: Interactable[] = [];
  const owned: THREE.Material[] = [];
  const pad = landingPad(profile);
  // Everything is laid out from the pad: x east, z south.
  const X = (dx: number) => pad.x + dx;
  const Z = (dz: number) => pad.z + dz;
  const at = (dx: number, dz: number) => heightAt(X(dx), Z(dz));
  const collide = (dx: number, dz: number, r: number) => colliders.push({ x: X(dx), z: Z(dz), r });
  const poi = (id: string, dx: number, dz: number, r: number) => pois.push({ id, x: X(dx), z: Z(dz), r });
  const read = (id: string, key: string, dx: number, dz: number, r = 2.6) => interactables.push({
    id, priority: 0, where: () => ({ x: X(dx), z: Z(dz), r }), kind: () => 'tap', label: () => `read.${key}`, use: () => readout(key),
  });
  const lampWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 });
  const lampRed = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 1.6 });
  owned.push(lampWhite, lampRed);
  const lamp = (x: number, y: number, z: number, red: boolean, r = 0.16) => {
    const m = kit.mesh(group, new THREE.SphereGeometry(r, 8, 6), red ? lampRed : lampWhite, x, y, z);
    m.castShadow = false;
    return m;
  };

  // ── The giants' deck: a round floor at the datum, a railing, a hazard band
  // round the edge, beams and a keel underneath. ──
  if (deck) {
    const R = deck.radius;
    const seg = kit.seg(72);
    const slab = kit.mesh(group, new THREE.CylinderGeometry(R, R * 0.96, 1.1, seg), M.deck, 0, -0.55, 0);
    slab.receiveShadow = true;
    const band = kit.mesh(group, new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.5, seg, 1, true), M.hazard, 0, -0.3, 0);
    band.castShadow = false;
    // Posts every three metres and two rails, just inside the edge.
    const railR = R - 0.6;
    const posts = Math.round((Math.PI * 2 * railR) / 3);
    for (let i = 0; i < posts; i++) {
      const a = (i / posts) * Math.PI * 2;
      kit.cyl(group, 0.05, 0.06, 1.15, M.steel, Math.cos(a) * railR, 0.575, Math.sin(a) * railR, 6).castShadow = false;
    }
    for (const y of [1.12, 0.58]) {
      const rail = kit.mesh(group, new THREE.TorusGeometry(railR, y > 1 ? 0.055 : 0.04, 6, kit.seg(128)), M.alu, 0, y, 0);
      rail.rotation.x = Math.PI / 2;
      rail.castShadow = false;
    }
    // Underneath: radial beams to a ring truss, and the keel with its heat exchangers.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      kit.strut(group, Math.cos(a) * 5, -1.4, Math.sin(a) * 5, Math.cos(a) * (R - 3), -1.3, Math.sin(a) * (R - 3), 0.32, M.steel);
      kit.strut(group, Math.cos(a) * (R * 0.62), -1.35, Math.sin(a) * (R * 0.62), 0, -11, 0, 0.18, M.anodised);
    }
    const truss = kit.mesh(group, new THREE.TorusGeometry(R * 0.62, 0.35, 6, kit.seg(64)), M.steel, 0, -1.4, 0);
    truss.rotation.x = Math.PI / 2;
    const keel = kit.mesh(group, new THREE.ConeGeometry(6, 12, kit.seg(20)), M.anodised, 0, -7.2, 0);
    keel.rotation.x = Math.PI;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fin = kit.box(group, 0.12, 6, 3.2, M.radiator, Math.cos(a) * 3.2, -6.5, Math.sin(a) * 3.2);
      fin.rotation.y = -a;
    }
    lamp(0, -13.4, 0, true, 0.35);
    // Sixteen lamps along the top rail, red ones at the four quarters.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      lamp(Math.cos(a) * railR, 1.28, Math.sin(a) * railR, i % 4 === 0, 0.12);
    }
    for (const deg of [0, 90, 180, 270]) {
      const a = (deg * Math.PI) / 180;
      pois.push({ id: 'railing', x: Math.cos(a) * (R - 3), z: Math.sin(a) * (R - 3), r: 5 });
    }
  }

  // ── The pad: a slab on the ground (on the deck, only the paint), its ring and its cross, and its lamps. ──
  {
    const y = deck ? 0.035 : at(0, 0) + 0.05;
    if (!deck) kit.mesh(group, new THREE.CylinderGeometry(PAD_PAINT, PAD_PAINT + 0.3, 0.12, kit.seg(48)), M.deck, X(0), y - 0.06, Z(0));
    const ring = kit.mesh(group, new THREE.RingGeometry(PAD_PAINT - 1.6, PAD_PAINT - 0.7, kit.seg(64)), M.hazard, X(0), y + 0.012, Z(0));
    ring.rotation.x = -Math.PI / 2;
    ring.castShadow = false;
    for (const yaw of [Math.PI / 4, -Math.PI / 4]) {
      const bar = kit.box(group, 7, 0.02, 0.7, M.amber, X(0), y + 0.012, Z(0));
      bar.rotation.y = yaw;
      bar.castShadow = false;
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const lx = Math.cos(a) * (PAD_PAINT + 0.6); const lz = Math.sin(a) * (PAD_PAINT + 0.6);
      lamp(X(lx), at(lx, lz) + 0.3, Z(lz), i % 2 === 0);
    }
    poi('landingZone', 0, 0, PAD_PAINT + 4);
  }

  // ── Two habitat modules on legs, joined by a tunnel; the airlock faces the pad. ──
  const skin = style.hull === 'blanket' ? M.blanket : style.hull === 'steel' ? M.steel : M.shell;
  const habR = style.hull === 'steel' ? 2.6 : 2.4;
  for (const [i, dx] of [-10, 10].entries()) {
    const dz = -28; const y = at(dx, dz);
    const h = new THREE.Group();
    h.position.set(X(dx), y, Z(dz));
    kit.cylX(h, habR, 9, skin, 0, 2.9, 0, kit.seg(22)).castShadow = true;
    for (const ex of [-4.55, 4.55]) kit.cylX(h, habR + 0.06, 0.28, M.anodised, ex, 2.9, 0, kit.seg(22));
    for (const lx of [-3, 0, 3]) for (const lz of [-1.6, 1.6]) kit.cyl(h, 0.14, 0.18, 1.2, M.steel, lx, 0.6, lz, 6);
    // Windows on the pad side, a lit strip under them.
    for (const wx of [-2.6, -0.9, 0.9, 2.6]) kit.box(h, 0.8, 0.5, 0.12, M.glass, wx, 3.4, habR - 0.02);
    kit.box(h, 1.4, 0.4, 0.1, M.screen, 0, 2.5, habR + 0.01);
    if (style.hull === 'steel') {
      // Venus: stiffening rings round the pressure hull.
      for (const rx of [-2.8, 0, 2.8]) kit.cylX(h, habR + 0.1, 0.22, M.anodised, rx, 2.9, 0, kit.seg(22));
    }
    group.add(h);
    for (const cx of [-3, 0, 3]) collide(dx + cx, dz, habR + 0.3);
    poi(`habitat${i}`, dx, dz, 10);
  }
  {
    const dz = -28; const y = at(0, dz);
    kit.cylX(group, 1.2, 11, M.shell, X(0), y + 2.6, Z(dz), kit.seg(14));
    // The airlock: a short porch toward the pad with its hatch and a panel beside it.
    kit.box(group, 2.2, 2.4, 1.6, M.shell, X(0), y + 2.2, Z(dz + 1.6));
    kit.box(group, 1.0, 1.7, 0.12, M.hazard, X(0), y + 2.0, Z(dz + 2.42));
    kit.box(group, 2.4, 0.12, 2.0, M.deck, X(0), y + 0.9, Z(dz + 3.2));
    kit.box(group, 0.5, 0.6, 0.08, M.screen, X(1.5), y + 1.7, Z(dz + 2.44));
    for (const cx of [-3.5, 0, 3.5]) collide(cx, dz, 1.4);
    collide(0, dz + 1.6, 1.3);
    read('habPanel', 'habitat', 1.5, dz + 3.6);
  }

  // ── The sign, in front of the habitats, facing the pad. ──
  {
    const dz = -18; const y = at(0, dz);
    for (const sx of [-1.2, 1.2]) kit.cyl(group, 0.05, 0.05, 1.8, M.steel, X(sx), y + 0.9, Z(dz), 6);
    kit.mesh(group, new THREE.PlaneGeometry(2.8, 0.85), kit.label(style.sign, { w: 640, h: 192, px: 40 }), X(0), y + 1.75, Z(dz)).castShadow = false;
    kit.box(group, 2.9, 0.95, 0.06, M.anodised, X(0), y + 1.75, Z(dz - 0.05));
    collide(0, dz, 0.4);
    poi('sign', 0, dz, 4);
  }

  // ── The comms dish, west. ──
  {
    const dx = -26; const dz = -10; const y = at(dx, dz);
    kit.cyl(group, 0.6, 0.8, 0.6, M.deck, X(dx), y + 0.3, Z(dz), 10);
    kit.cyl(group, 0.12, 0.14, 4.6, M.alu, X(dx), y + 2.8, Z(dz), 8);
    const dish = kit.mesh(group, new THREE.SphereGeometry(2.0, kit.seg(20), 10, 0, Math.PI * 2, 0, 0.62), M.silver, X(dx), y + 5.4, Z(dz));
    dish.rotation.x = -0.8;
    kit.cyl(group, 0.03, 0.03, 1.4, M.steel, X(dx), y + 6.0, Z(dz - 0.6), 6).rotation.x = -0.8;
    kit.box(group, 0.5, 0.7, 0.3, M.screen, X(dx + 0.9), y + 1.1, Z(dz + 0.4));
    collide(dx, dz, 1.0);
    poi('dish', dx, dz, 7);
    read('comms', 'comms', dx + 1.4, dz + 1.2);
  }

  // ── Power, east. ──
  {
    const dx = 26; const dz = -10; const y = at(dx, dz);
    if (style.power === 'fission') {
      kit.cyl(group, 0.75, 0.85, 2.6, M.steel, X(dx), y + 1.3, Z(dz), kit.seg(14));
      kit.cyl(group, 0.22, 0.22, 2.6, M.alu, X(dx), y + 3.9, Z(dz), 8);
      const brolly = kit.mesh(group, new THREE.ConeGeometry(3.4, 1.3, kit.seg(16), 1, true), M.radiator, X(dx), y + 5.4, Z(dz));
      brolly.rotation.x = Math.PI;
      brolly.castShadow = false;
      kit.mesh(group, new THREE.PlaneGeometry(1.3, 0.36), kit.label(['FISSION · 40 kWe'], { w: 256, h: 64, bg: '#f2c744', fg: '#1a1a1a' }), X(dx), y + 1.7, Z(dz + 0.87)).castShadow = false;
      collide(dx, dz, 1.4);
    } else if (style.power === 'stirling') {
      kit.cyl(group, 0.7, 0.7, 2.0, M.steel, X(dx), y + 1.1, Z(dz), kit.seg(14));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const fin = kit.box(group, 0.08, 1.8, 0.9, M.radiator, X(dx + Math.cos(a) * 1.05), y + 1.1, Z(dz + Math.sin(a) * 1.05));
        fin.rotation.y = -a;
      }
      kit.mesh(group, new THREE.PlaneGeometry(1.3, 0.36), kit.label(['Pu-238 STIRLING'], { w: 256, h: 64, bg: '#f2c744', fg: '#1a1a1a' }), X(dx), y + 2.4, Z(dz + 1.6)).castShadow = false;
      kit.tube(group, [[X(dx), y + 0.5, Z(dz)], [X(dx - 8), y + 0.4, Z(dz - 10)], [X(14), at(14, -28) + 1.0, Z(-28)]], 0.1, M.cable, 12);
      collide(dx, dz, 1.6);
    } else {
      // Mercury: two rows of panels stood nearly on edge, facing a Sun six degrees up in the east.
      const face = Math.atan2(profile.sunDir.x, profile.sunDir.z);
      for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) {
        const px = dx - 1 + r * 3; const pz = dz - 4.5 + k * 3;
        const g = new THREE.Group();
        g.position.set(X(px), at(px, pz), Z(pz));
        g.rotation.y = face;
        kit.cyl(g, 0.06, 0.06, 1.2, M.steel, 0, 0.6, 0, 6);
        const panel = kit.box(g, 2.6, 1.4, 0.06, M.solar, 0, 1.5, 0);
        panel.rotation.x = -0.1;
        group.add(g);
        collide(px, pz, 1.0);
      }
    }
    poi('power', dx, dz, 8);
    read('power', 'power', dx - 2.2, dz + 2.2);
  }

  // ── What the world asks for. ──
  if (style.extra === 'sunshade') {
    // A long white wall between the low Sun and the habitats: they sit in its shadow.
    const face = Math.atan2(profile.sunDir.x, profile.sunDir.z);
    const cx = 19; const cz = -27; const y = at(cx, cz);
    const g = new THREE.Group();
    g.position.set(X(cx), y, Z(cz));
    g.rotation.y = face;
    kit.box(g, 22, 6.5, 0.3, M.blanket, 0, 3.6, 0);
    for (const sx of [-10, -5, 0, 5, 10]) {
      kit.cyl(g, 0.1, 0.12, 7, M.steel, sx, 3.5, -0.3, 6);
      kit.strut(g, sx, 6.5, -0.3, sx, 0, -3.2, 0.06, M.steel);
    }
    group.add(g);
    const along = new THREE.Vector2(Math.cos(face), -Math.sin(face));
    for (let s = -10; s <= 10; s += 2.5) collide(cx + along.x * s, cz + along.y * s, 0.8);
    poi('sunshade', cx, cz, 9);
    read('sunshade', 'sunshade', cx - 2.5, cz + 3.5);
  } else if (style.extra === 'cooler') {
    // The heat pump and its radiator stack, piped to the habitats.
    const cx = -22; const cz = -32; const y = at(cx, cz);
    kit.cyl(group, 1.5, 1.8, 3.2, M.steel, X(cx), y + 1.6, Z(cz), kit.seg(16));
    kit.cyl(group, 0.5, 0.5, 9, M.anodised, X(cx), y + 6.5, Z(cz), 10);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fin = kit.box(group, 0.1, 7, 2.2, M.radiator, X(cx + Math.cos(a) * 1.5), y + 7, Z(cz + Math.sin(a) * 1.5));
      fin.rotation.y = -a;
    }
    kit.tube(group, [[X(cx), y + 1.2, Z(cz)], [X(-17), y + 1.0, Z(-30)], [X(-14), at(-14, -28) + 1.2, Z(-28)]], 0.14, M.cable, 12);
    kit.box(group, 0.5, 0.6, 0.1, M.screen, X(cx + 1.9), y + 1.5, Z(cz + 1.0));
    collide(cx, cz, 2.6);
    poi('cooler', cx, cz, 8);
    read('cooler', 'cooler', cx + 2.6, cz + 2);
  } else if (deck) {
    // The envelopes, with a burner ring under each and two tethers to the rim.
    const [sx, sy, sz] = ENVELOPE_AT.size;
    for (const deg of ENVELOPES) {
      const a = (deg * Math.PI) / 180;
      const ex = Math.cos(a) * ENVELOPE_AT.r; const ez = Math.sin(a) * ENVELOPE_AT.r;
      const env = kit.mesh(group, new THREE.SphereGeometry(1, kit.seg(28), 16), M.blanket, ex, ENVELOPE_AT.y, ez);
      env.scale.set(sx, sy, sz);
      const burner = kit.mesh(group, new THREE.TorusGeometry(3.2, 0.35, 6, kit.seg(20)), M.steel, ex, ENVELOPE_AT.y - sy + 0.3, ez);
      burner.rotation.x = Math.PI / 2;
      lamp(ex, ENVELOPE_AT.y + sy + 0.2, ez, true, 0.45);
      for (const off of [-0.2, 0.2]) {
        const b = a + off;
        const rx = Math.cos(b) * (deck.radius - 0.8); const rz = Math.sin(b) * (deck.radius - 0.8);
        kit.tube(group, [[ex + Math.cos(b) * 2.6, ENVELOPE_AT.y - sy + 0.4, ez + Math.sin(b) * 2.6], [rx, 1.2, rz]], 0.07, M.cable, 2);
        kit.cyl(group, 0.18, 0.25, 1.2, M.hazard, rx, 0.6, rz, 8);
      }
    }
    // The tether post nearest the open deck carries the envelopes' panel.
    const a = (ENVELOPES[0] * Math.PI) / 180;
    const px = Math.cos(a) * (deck.radius - 4); const pz = Math.sin(a) * (deck.radius - 4);
    kit.box(group, 0.6, 1.2, 0.3, M.anodised, px, 0.6, pz);
    kit.box(group, 0.5, 0.5, 0.06, M.screen, px, 1.0, pz - 0.18);
    colliders.push({ x: px, z: pz, r: 0.5 });
    pois.push({ id: 'envelope', x: px, z: pz, r: 7 });
    interactables.push({
      id: 'envelope', priority: 0, where: () => ({ x: px - 1.2, z: pz - 1.2, r: 2.6 }),
      kind: () => 'tap', label: () => 'read.envelope', use: () => readout('envelope'),
    });
  }

  const merged = mergeStatic(group, { cell: 70, minCaster: 0.12 });
  const habitat = { x: X(0), y: at(0, -28) + 3.4, z: Z(-25) };
  let blink = 0;
  return {
    group, colliders, pois, interactables, pad,
    update(dt, _t, crewX, crewZ, lights) {
      blink += dt;
      lampRed.emissiveIntensity = 0.5 + 1.4 * (Math.sin(blink * 2.4) > 0.5 ? 1 : 0);
      // The windows light the porch when the crew is near enough to see it.
      if (Math.hypot(habitat.x - crewX, habitat.z - crewZ) < NEAR_WORK) lights.request(habitat.x, habitat.y, habitat.z, 0xffe2b8, 10, 14, 1.6);
    },
    dispose() {
      for (const g of merged.geometries) g.dispose();
      for (const m of owned) m.dispose();
    },
  };
}
