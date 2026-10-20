// What a player can build, and how each piece is drawn. The sizes and names
// live in build-rules (the server reads them too); this file adds the
// builder for each one, from the same parts kit as Stellar Base, so a
// player's habitat stands next to the base's own and looks like it came off
// the same lander.
//
// A builder draws its module standing at the origin: ground at y = 0, its
// footprint centred, `w` along X and `d` along Z. A footing plate runs a
// little below the ground so a piece on a gentle slope never shows daylight
// under a corner. Swapping a builder for a Blender model later only has to
// honour that frame — placement, colliders and storage never look inside.

import * as THREE from 'three';
import type { Kit } from '@/lib/solar-system/moon-kit';
import { MODULE_SPECS, type ModuleId, type ModuleSpec } from '@/lib/solar-system/build-rules';

export type ModuleBuilder = (kit: Kit, spec: ModuleSpec) => THREE.Group;

export interface CatalogEntry extends ModuleSpec {
  build: ModuleBuilder;
}

const noShadow = <T extends THREE.Object3D>(o: T): T => { o.castShadow = false; return o; };

/** The prepared ground every piece stands on: a sintered plate, its top just proud of the regolith. */
function footing(kit: Kit, g: THREE.Group, w: number, d: number, top = 0.06): void {
  kit.box(g, w, 0.6 + top, d, kit.mat.deck, 0, (top - 0.6) / 2, 0).castShadow = false;
}

const habitat: ModuleBuilder = (kit, { w, d }) => {
  const g = new THREE.Group();
  const m = kit.mat;
  footing(kit, g, w - 0.2, d - 0.2);
  // Four adjustable legs to the plate, and the pressure hull on them.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.cyl(g, 0.11, 0.14, 0.62, m.steel, sx * 2.2, 0.37, sz * 1.25, 10);
    noShadow(kit.cyl(g, 0.24, 0.26, 0.06, m.anodised, sx * 2.2, 0.09, sz * 1.25, 12));
  }
  kit.box(g, 5.0, 0.16, 3.0, m.anodised, 0, 0.72, 0);
  kit.rbox(g, 5.6, 2.5, 3.5, 0.55, m.shellDusty, 0, 2.02, 0);
  // Quilted micrometeoroid blanket over the crown, a radiator on struts above it.
  kit.rbox(g, 5.0, 0.2, 3.0, 0.08, m.blanket, 0, 3.26, 0);
  kit.box(g, 2.4, 0.04, 1.3, m.radiator, -0.9, 3.62, 0);
  for (const sx of [-1.9, 0.1]) for (const sz of [-0.5, 0.5]) kit.cyl(g, 0.025, 0.025, 0.3, m.steel, sx, 3.48, sz, 6);
  kit.cyl(g, 0.03, 0.03, 1.0, m.alu, 2.2, 3.8, -1.2, 6);
  noShadow(kit.box(g, 0.08, 0.08, 0.08, m.red, 2.2, 4.32, -1.2));
  // The hatch at the +X end: a collar, the door, a step with a hazard edge.
  kit.cylX(g, 0.78, 0.2, m.anodised, 2.86, 1.72, 0, 24);
  kit.cylX(g, 0.64, 0.24, m.shell, 2.9, 1.72, 0, 24);
  noShadow(kit.box(g, 0.05, 0.08, 0.5, m.carbon, 3.03, 1.72, 0));
  kit.box(g, 0.9, 0.22, 1.4, m.deck, 3.25, 0.62, 0);
  noShadow(kit.box(g, 0.9, 0.02, 0.18, m.hazard, 3.25, 0.74, 0.62));
  noShadow(kit.box(g, 0.9, 0.02, 0.18, m.hazard, 3.25, 0.74, -0.62));
  noShadow(kit.box(g, 0.04, 0.14, 0.14, m.green, 2.83, 2.66, 0.62));
  // Two ports on the long side, framed; the unit plate beside them.
  for (const x of [-1.5, 0.1]) {
    noShadow(kit.box(g, 0.86, 0.52, 0.04, m.anodised, x, 2.2, 1.745));
    noShadow(kit.box(g, 0.7, 0.38, 0.05, m.glass, x, 2.2, 1.755));
  }
  noShadow(kit.box(g, 1.2, 0.36, 0.02, kit.label(['HAB · STELLAR', 'PRESSURISED'], { w: 256, h: 96 }), 1.6, 1.5, 1.755));
  // Services at the -X end: a panel and a conduit down to the plate.
  kit.rbox(g, 0.2, 1.1, 1.4, 0.04, m.anodised, -2.9, 1.8, 0);
  noShadow(kit.box(g, 0.02, 0.3, 0.5, m.screen, -3.01, 2.0, 0.2));
  kit.tube(g, [[-2.95, 1.25, -0.5], [-3.1, 0.7, -0.6], [-3.1, 0.1, -0.9]], 0.05, m.cable, 12);
  return g;
};

const corridor: ModuleBuilder = (kit, { w, d }) => {
  const g = new THREE.Group();
  const m = kit.mat;
  footing(kit, g, w - 0.4, d - 0.2, 0.04);
  for (const x of [-1.25, 1.25]) {
    kit.box(g, 0.36, 0.5, 1.5, m.steel, x, 0.25, 0);
    kit.box(g, 0.5, 0.08, 1.6, m.anodised, x, 0.52, 0);
  }
  // A pressurised tunnel section, flanged at both ends to mate with a hatch.
  kit.cylX(g, 0.82, w - 0.1, m.shellDusty, 0, 1.4, 0, 24);
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) kit.cylX(g, 0.9, 0.16, m.anodised, x, 1.4, 0, 24);
  for (const x of [-1, 0, 1]) kit.cylX(g, 0.86, 0.08, m.steel, x, 1.4, 0, 24);
  kit.box(g, w - 0.6, 0.08, 0.5, m.blanket, 0, 2.24, 0);
  noShadow(kit.box(g, 0.3, 0.06, 0.04, m.cool, 0.5, 1.4, 0.84));
  noShadow(kit.box(g, 0.9, 0.24, 0.02, kit.label(['PRESS TUNNEL'], { w: 256, h: 64 }), -0.8, 1.4, 0.83));
  return g;
};

const solar: ModuleBuilder = (kit, { w }) => {
  const g = new THREE.Group();
  const m = kit.mat;
  footing(kit, g, 1.6, 1.6, 0.05);
  kit.box(g, 1.3, 0.4, 1.3, m.anodised, 0, 0.25, 0);
  kit.cyl(g, 0.12, 0.15, 2.3, m.alu, 0, 1.55, 0, 12);
  kit.cyl(g, 0.2, 0.2, 0.3, m.carbon, 0, 2.7, 0, 14);
  noShadow(kit.box(g, 0.04, 0.1, 0.1, m.green, 0.67, 0.35, 0));
  // The array leans back from the vertical to the low polar sun.
  const head = new THREE.Group();
  head.position.set(0, 2.85, 0);
  head.rotation.x = -0.35;
  g.add(head);
  const pw = w - 0.4;
  kit.box(head, pw, 1.8, 0.03, m.solar, 0, 0.55, 0.03);
  kit.box(head, pw + 0.04, 1.84, 0.02, m.anodised, 0, 0.55, -0.01);
  noShadow(kit.box(head, pw + 0.06, 0.06, 0.06, m.alu, 0, 1.47, 0));
  kit.box(head, pw + 0.06, 0.08, 0.08, m.alu, 0, -0.37, 0);
  for (const x of [-pw / 2, 0, pw / 2]) noShadow(kit.box(head, 0.05, 1.84, 0.05, m.alu, x, 0.55, 0));
  kit.box(head, 0.4, 0.3, 0.3, m.steel, 0, 0, -0.1);
  kit.tube(g, [[0.15, 2.6, 0.1], [0.4, 1.4, 0.25], [0.6, 0.45, 0.3]], 0.035, m.cable, 10);
  return g;
};

const battery: ModuleBuilder = (kit) => {
  const g = new THREE.Group();
  const m = kit.mat;
  footing(kit, g, 1.9, 1.9, 0.12);
  kit.rbox(g, 1.3, 1.45, 1.2, 0.06, m.shellDusty, 0, 0.86, 0);
  noShadow(kit.box(g, 1.32, 0.12, 1.22, m.hazard, 0, 0.26, 0));
  for (const sx of [-1, 1]) kit.box(g, 0.05, 1.1, 1.0, m.radiator, sx * 0.69, 0.95, 0);
  kit.box(g, 1.0, 0.1, 0.9, m.anodised, 0, 1.63, 0);
  kit.cyl(g, 0.14, 0.14, 0.12, m.carbon, 0.3, 1.74, 0.2, 12);
  noShadow(kit.box(g, 0.44, 0.26, 0.02, m.screen, -0.2, 1.2, 0.61));
  noShadow(kit.box(g, 0.08, 0.08, 0.03, m.green, 0.3, 1.25, 0.61));
  noShadow(kit.box(g, 0.08, 0.08, 0.03, m.amber, 0.45, 1.25, 0.61));
  noShadow(kit.box(g, 0.8, 0.32, 0.02, kit.label(['BATT · 48 kWh', 'HIGH VOLTAGE'], { w: 256, h: 96, bg: '#1f2328', fg: '#e8e6df' }), 0, 0.72, 0.61));
  kit.tube(g, [[-0.66, 0.5, -0.4], [-0.9, 0.2, -0.5], [-0.95, 0.12, -0.9]], 0.04, m.cable, 8);
  return g;
};

const pad: ModuleBuilder = (kit, { w, d }) => {
  const g = new THREE.Group();
  const m = kit.mat;
  // A sintered-regolith pad: a hard, dust-free square for a lander's plume.
  kit.box(g, w - 0.1, 0.8, d - 0.1, m.deck, 0, -0.25, 0).castShadow = false;
  const e = w / 2 - 0.2;
  for (const s of [-1, 1]) {
    noShadow(kit.box(g, w - 0.1, 0.02, 0.26, m.hazard, 0, 0.16, s * e));
    noShadow(kit.box(g, 0.26, 0.02, d - 0.62, m.hazard, s * e, 0.16, 0));
  }
  noShadow(kit.cyl(g, 2.3, 2.3, 0.02, m.shell, 0, 0.16, 0, 40));
  noShadow(kit.cyl(g, 2.0, 2.0, 0.024, m.deck, 0, 0.162, 0, 40));
  noShadow(kit.box(g, 0.3, 0.026, 2.0, m.shell, -0.55, 0.165, 0));
  noShadow(kit.box(g, 0.3, 0.026, 2.0, m.shell, 0.55, 0.165, 0));
  noShadow(kit.box(g, 0.8, 0.026, 0.3, m.shell, 0, 0.165, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.cyl(g, 0.1, 0.12, 0.14, m.steel, sx * (e + 0.05), 0.2, sz * (e + 0.05), 10);
    noShadow(kit.cyl(g, 0.06, 0.06, 0.06, m.amber, sx * (e + 0.05), 0.3, sz * (e + 0.05), 10));
  }
  return g;
};

const rocketStand: ModuleBuilder = (kit, { h }) => {
  const g = new THREE.Group();
  const m = kit.mat;
  footing(kit, g, 3.9, 3.9, 0.2);
  noShadow(kit.box(g, 3.9, 0.02, 0.2, m.hazard, 0, 0.21, 1.85));
  noShadow(kit.box(g, 3.9, 0.02, 0.2, m.hazard, 0, 0.21, -1.85));
  // The service tower on the -X side: four columns, braced, three decks.
  const tx = -1.1; const half = 0.6; const top = h - 0.6;
  for (const cx of [-half, half]) for (const cz of [-half, half]) kit.box(g, 0.16, top, 0.16, m.steel, tx + cx, 0.2 + top / 2, cz);
  for (let y = 0.2; y < top - 0.5; y += 1.4) {
    for (const s of [-half, half]) {
      kit.strut(g, tx - half, y, s, tx + half, y + 1.4, s, 0.035, m.steel);
      kit.strut(g, tx + s, y, -half, tx + s, y + 1.4, half, 0.035, m.steel);
    }
  }
  for (const y of [3.0, 5.8, top]) kit.box(g, 1.5, 0.08, 1.5, m.deck, tx, y + 0.2, 0);
  // The swing arm to the vehicle, a hold-down ring for it, and the umbilical.
  kit.box(g, 1.6, 0.24, 0.3, m.orange, 0.1, 6.3, 0);
  kit.box(g, 0.2, 0.5, 0.5, m.anodised, 0.9, 6.3, 0);
  kit.cyl(g, 0.95, 1.05, 0.45, m.anodised, 0.8, 0.42, 0, 28);
  kit.cyl(g, 0.6, 0.6, 0.47, m.carbon, 0.8, 0.43, 0, 28);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    kit.box(g, 0.24, 0.5, 0.24, m.steel, 0.8 + Math.cos(a) * 0.95, 0.85, Math.sin(a) * 0.95);
  }
  kit.tube(g, [[tx + half, 6.1, 0.2], [0.2, 5.4, 0.5], [0.7, 6.1, 0.3]], 0.05, m.cable, 12);
  noShadow(kit.box(g, 0.1, 0.1, 0.1, m.red, tx, h - 0.2, 0));
  noShadow(kit.box(g, 0.04, 0.12, 0.12, m.amber, tx + half + 0.1, 3.5, 0));
  noShadow(kit.box(g, 1.1, 0.34, 0.02, kit.label(['ASSEMBLY STAND', 'LAUNCH MOUNT 01'], { w: 256, h: 96 }), tx, 1.6, half + 0.09));
  return g;
};

const BUILDERS: Record<ModuleId, ModuleBuilder> = { habitat, corridor, solar, battery, pad, rocketStand };

export const CATALOG: readonly CatalogEntry[] = MODULE_SPECS.map((s) => ({ ...s, build: BUILDERS[s.id] }));
export const catalogEntry = (id: ModuleId): CatalogEntry => CATALOG.find((c) => c.id === id)!;
