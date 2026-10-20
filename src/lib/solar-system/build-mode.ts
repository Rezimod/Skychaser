// Build mode on a surface: the pieces players have put up, drawn one
// instanced batch per module and material, the colliders that make them
// solid, and — while the crew is building — a ghost of the chosen module on
// the ground in front of them, green where it may go and red where it may
// not. The scene owns none of the network: placing or removing a piece
// changes it here at once and calls `onPlace` / `onRemove`; whoever listens
// (build-sync) saves it and tells us if it has to come back out.

import * as THREE from 'three';
import type { Kit } from '@/lib/solar-system/moon-kit';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import { mergeStatic } from '@/lib/solar-system/moon-batch';
import { CATALOG, catalogEntry } from '@/lib/solar-system/build-catalog';
import {
  BUILD_SITES, CAPS, checkPlacement, moduleSpec, rectDistance, rectHitsCircle, rectOf, snap, yawOfQuarter,
  type BuildScope, type BuildWorld, type ModuleId, type Rect,
} from '@/lib/solar-system/build-rules';

export interface BuildPiece {
  id: string;
  scope: BuildScope;
  module: ModuleId;
  x: number;
  z: number;
  yaw: number;
  mine: boolean;
}

export type BuildProblem = '' | 'site' | 'overlap' | 'blocked' | 'slope' | 'cap' | 'signIn';

export interface BuildTelemetry {
  active: boolean;
  /** Looking is allowed; building is not (signed out while the store is answering). */
  locked: boolean;
  module: ModuleId;
  scope: BuildScope;
  valid: boolean;
  problem: BuildProblem;
  /** The piece under the cursor, if any: its id, module and whether it is ours. */
  hover: string;
  hoverModule: ModuleId | '';
  hoverMine: boolean;
  /** Our pieces in each scope, and everybody's in the colony. */
  mine: Record<BuildScope, number>;
  colonyTotal: number;
  /** From the crew to the colony's edge, m (0 inside), and its bearing, degrees clockwise from north. */
  colonyDistance: number;
  colonyBearing: number;
}

export interface BuildHandle {
  telemetry: BuildTelemetry;
  setActive: (on: boolean) => void;
  toggle: () => void;
  select: (id: ModuleId) => void;
  /** The next module in the catalogue (or the previous, dir -1). */
  cycle: (dir?: number) => void;
  rotate: () => void;
  setScope: (s: BuildScope) => void;
  setLocked: (on: boolean) => void;
  /** Put the ghost down, if it may go there. Returns the new (local) piece. */
  place: () => BuildPiece | null;
  /** Take down the piece under the cursor, if it is ours. */
  remove: () => BuildPiece | null;
  /** The server's pieces: every piece it knows is replaced by these; local ones still in flight stay. */
  syncServer: (pieces: BuildPiece[]) => void;
  /** A local piece was saved: it has a real id now. */
  resolve: (localId: string, saved: BuildPiece) => void;
  /** A local piece was refused: take it back out. */
  drop: (id: string) => void;
  /** A removal was refused: put it back. */
  restore: (p: BuildPiece) => void;
  pieces: () => readonly BuildPiece[];
  onPlace: ((p: BuildPiece) => void) | null;
  onRemove: ((p: BuildPiece) => void) | null;
  /** Once a frame: where the ghost is, from the crew and the camera. */
  update: (crewX: number, crewZ: number, camera: THREE.Camera) => void;
  dispose: () => void;
}

export interface BuildOptions {
  world: BuildWorld;
  kit: Kit;
  scene: THREE.Scene;
  heightAt: (x: number, z: number) => number;
  /** What already stands there (the base): a ghost over any of these is blocked. */
  blockers: readonly Collider[];
  /** Lists the pieces' colliders are added to (walk, rover, camera). */
  colliderSets: Collider[][];
  /** Where the crew cannot be built on top of (the rover, the lander). */
  movers?: () => readonly { x: number; z: number; r: number }[];
}

/** How far the ground may fall across a footprint before the piece is refused, m. */
const MAX_STEP = 1.3;
/** Nearest and farthest the ghost is put from the crew, beyond the module's own half-size, m. */
const NEAR = 3;
const FAR = 14;
const GHOST_OK = new THREE.Color(0x5eead4);
const GHOST_BAD = new THREE.Color(0xff3b2e);
const IDENTITY = new THREE.Matrix4();

interface Part { geometry: THREE.BufferGeometry; material: THREE.Material; cast: boolean }
interface Bank { parts: Part[]; meshes: THREE.InstancedMesh[]; capacity: number }

export function makeBuildMode(o: BuildOptions): BuildHandle {
  const { world, kit, scene, heightAt } = o;
  const site = BUILD_SITES[world];
  const root = new THREE.Group();
  root.name = 'player-builds';
  scene.add(root);
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];

  // ── One template per module, built and folded once; pieces are instances of it. ──
  const templates = new Map<ModuleId, Part[]>();
  const template = (id: ModuleId): Part[] => {
    const hit = templates.get(id);
    if (hit) return hit;
    const entry = catalogEntry(id);
    const g = entry.build(kit, entry);
    const merged = mergeStatic(g, { minCaster: 0.25 });
    geometries.push(...merged.geometries);
    g.updateMatrixWorld(true);
    const parts: Part[] = [];
    g.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      // Anything the merge left alone is baked into the template's frame here.
      let geom = m.geometry;
      if (!m.matrixWorld.equals(IDENTITY)) { geom = geom.clone().applyMatrix4(m.matrixWorld); geometries.push(geom); }
      parts.push({ geometry: geom, material: m.material, cast: m.castShadow });
    });
    templates.set(id, parts);
    return parts;
  };

  const banks = new Map<ModuleId, Bank>();
  const bankFor = (id: ModuleId, need: number): Bank => {
    let b = banks.get(id);
    if (b && b.capacity >= need) return b;
    const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, need))));
    if (b) for (const m of b.meshes) { root.remove(m); m.dispose(); }
    const parts = template(id);
    b = {
      parts, capacity,
      meshes: parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, capacity);
        im.castShadow = p.cast;
        im.receiveShadow = true;
        im.count = 0;
        root.add(im);
        return im;
      }),
    };
    banks.set(id, b);
    return b;
  };

  // ── The pieces, their footprints and their colliders. ──
  let pieces: BuildPiece[] = [];
  const removing = new Set<string>();
  let myColliders: Collider[] = [];
  let seq = 0;
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const upAxis = new THREE.Vector3(0, 1, 0);

  /** The ground a footprint stands on: low enough that no corner floats, and how much it falls across. */
  const groundOf = (r: Rect): { y: number; step: number } => {
    const hs = [
      heightAt(r.minX, r.minZ), heightAt(r.maxX, r.minZ), heightAt(r.minX, r.maxZ), heightAt(r.maxX, r.maxZ),
      heightAt((r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2),
    ];
    const lo = Math.min(...hs); const hi = Math.max(...hs);
    return { y: lo + Math.min(0.35, (hi - lo) * 0.4), step: hi - lo };
  };

  /** A footprint as circles along its long side: what the crew and the rover bump into. */
  const collidersOf = (p: BuildPiece): Collider[] => {
    if (p.module === 'pad') return [];
    const spec = moduleSpec(p.module)!;
    const r = rectOf(spec, p.x, p.z, p.yaw);
    const w = r.maxX - r.minX; const d = r.maxZ - r.minZ;
    const along = w >= d; const long = Math.max(w, d); const short = Math.min(w, d);
    const n = Math.max(1, Math.round(long / short));
    const out: Collider[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      out.push({ x: p.x + (along ? t * long : 0), z: p.z + (along ? 0 : t * long), r: (short / 2) * 1.05 });
    }
    return out;
  };

  const rebuild = () => {
    const by = new Map<ModuleId, BuildPiece[]>();
    for (const p of pieces) { const l = by.get(p.module) ?? []; l.push(p); by.set(p.module, l); }
    for (const [id, b] of banks) if (!by.has(id)) for (const m of b.meshes) m.count = 0;
    for (const [id, list] of by) {
      const b = bankFor(id, list.length);
      list.forEach((p, i) => {
        const spec = moduleSpec(p.module)!;
        const { y } = groundOf(rectOf(spec, p.x, p.z, p.yaw));
        quat.setFromAxisAngle(upAxis, p.yaw);
        mat4.compose(pos.set(p.x, y, p.z), quat, one);
        for (const m of b.meshes) m.setMatrixAt(i, mat4);
      });
      for (const m of b.meshes) {
        m.count = list.length;
        m.instanceMatrix.needsUpdate = true;
        m.computeBoundingSphere();
      }
    }
    for (const set of o.colliderSets) {
      for (const c of myColliders) { const k = set.indexOf(c); if (k >= 0) set.splice(k, 1); }
    }
    myColliders = pieces.flatMap(collidersOf);
    for (const set of o.colliderSets) set.push(...myColliders);
    count();
  };

  const telemetry: BuildTelemetry = {
    active: false, locked: false, module: 'habitat', scope: 'private', valid: false, problem: '', hover: '', hoverModule: '', hoverMine: false,
    mine: { private: 0, colony: 0 }, colonyTotal: 0, colonyDistance: 0, colonyBearing: 0,
  };
  const count = () => {
    telemetry.mine.private = pieces.filter((p) => p.mine && p.scope === 'private').length;
    telemetry.mine.colony = pieces.filter((p) => p.mine && p.scope === 'colony').length;
    telemetry.colonyTotal = pieces.filter((p) => p.scope === 'colony').length;
  };

  // ── The colony's marker: a mast with a plate and a lamp at its west edge, always there. ──
  {
    const g = new THREE.Group();
    const m = kit.mat;
    const x = site.colony.x - site.colony.r - 1.5; const z = site.colony.z;
    g.position.set(x, heightAt(x, z), z);
    kit.cyl(g, 0.5, 0.6, 0.3, m.deck, 0, 0.15, 0, 16);
    kit.cyl(g, 0.07, 0.08, 4.2, m.alu, 0, 2.3, 0, 10);
    kit.box(g, 0.05, 0.9, 1.6, kit.label(['STELLAR COLONY', world === 'moon' ? 'LUNAR SITE 1' : 'MARS SITE 1', 'BUILD HERE →'], { w: 384, h: 216 }), 0.1, 2.9, 0).castShadow = false;
    kit.box(g, 0.14, 0.14, 0.14, m.amber, 0, 4.5, 0).castShadow = false;
    root.add(g);
    const merged = mergeStatic(g);
    geometries.push(...merged.geometries);
    const post = { x, z, r: 0.6 };
    for (const set of o.colliderSets) set.push(post);
  }

  // ── The colony's boundary on the ground, while building there. ──
  const ringMat = new THREE.LineBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, depthWrite: false });
  owned.push(ringMat);
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    const x = site.colony.x + Math.cos(a) * site.colony.r; const z = site.colony.z + Math.sin(a) * site.colony.r;
    ringPts.push(new THREE.Vector3(x, heightAt(x, z) + 0.08, z));
  }
  const ringGeom = new THREE.BufferGeometry().setFromPoints(ringPts);
  geometries.push(ringGeom);
  const ring = new THREE.Line(ringGeom, ringMat);
  ring.visible = false;
  ring.frustumCulled = false;
  scene.add(ring);

  // ── The ghost: the chosen module's shape in one see-through colour. ──
  const ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.38, depthWrite: false });
  owned.push(ghostMat);
  const ghost = new THREE.Group();
  ghost.visible = false;
  ghost.renderOrder = 5;
  scene.add(ghost);
  let ghostOf: ModuleId | null = null;
  const dressGhost = (id: ModuleId) => {
    if (ghostOf === id) return;
    ghostOf = id;
    ghost.clear();
    for (const p of template(id)) {
      const m = new THREE.Mesh(p.geometry, ghostMat);
      m.renderOrder = 5;
      ghost.add(m);
    }
  };
  // The outline of the piece a removal would take down.
  const hoverMat = new THREE.LineBasicMaterial({ color: 0xffb347, depthTest: false, transparent: true });
  owned.push(hoverMat);
  const hoverGeom = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
  geometries.push(hoverGeom);
  const hoverBox = new THREE.LineSegments(hoverGeom, hoverMat);
  hoverBox.visible = false;
  hoverBox.renderOrder = 6;
  scene.add(hoverBox);

  let quarter = 0;
  const target = { x: 0, z: 0, yaw: 0, y: 0, cursorX: 0, cursorZ: 0 };
  const ray = new THREE.Vector3();
  const from = new THREE.Vector3();

  /** Where the camera's line of sight meets the ground, or null past 60 m. */
  const groundHit = (camera: THREE.Camera): { x: number; z: number } | null => {
    camera.getWorldPosition(from);
    camera.getWorldDirection(ray);
    if (ray.y > -0.02) return null;
    for (let s = 0.5; s < 60; s += 0.5) {
      const x = from.x + ray.x * s; const y = from.y + ray.y * s; const z = from.z + ray.z * s;
      if (y <= heightAt(x, z)) return { x, z };
    }
    return null;
  };

  const handle: BuildHandle = {
    telemetry,
    onPlace: null,
    onRemove: null,
    setActive(on) {
      telemetry.active = on;
      ghost.visible = on;
      if (!on) { hoverBox.visible = false; ring.visible = false; }
    },
    toggle() { handle.setActive(!telemetry.active); },
    select(id) { telemetry.module = id; },
    cycle(dir = 1) {
      const i = CATALOG.findIndex((c) => c.id === telemetry.module);
      telemetry.module = CATALOG[(i + dir + CATALOG.length) % CATALOG.length].id;
    },
    rotate() { quarter = (quarter + 1) % 4; },
    setScope(s) { telemetry.scope = s; },
    setLocked(on) { telemetry.locked = on; },
    place() {
      if (!telemetry.active || !telemetry.valid) return null;
      const p: BuildPiece = { id: `local-${++seq}`, scope: telemetry.scope, module: telemetry.module, x: target.x, z: target.z, yaw: target.yaw, mine: true };
      pieces = [...pieces, p];
      rebuild();
      handle.onPlace?.(p);
      return p;
    },
    remove() {
      if (!telemetry.active || telemetry.locked || !telemetry.hover || !telemetry.hoverMine) return null;
      const p = pieces.find((q) => q.id === telemetry.hover);
      if (!p) return null;
      pieces = pieces.filter((q) => q !== p);
      if (!p.id.startsWith('local-')) removing.add(p.id);
      rebuild();
      handle.onRemove?.(p);
      return p;
    },
    syncServer(list) {
      const local = pieces.filter((p) => p.id.startsWith('local-'));
      pieces = [...list.filter((p) => !removing.has(p.id)), ...local];
      rebuild();
    },
    resolve(localId, saved) {
      pieces = pieces.map((p) => (p.id === localId ? saved : p));
      rebuild();
    },
    drop(id) {
      removing.delete(id);
      pieces = pieces.filter((p) => p.id !== id);
      rebuild();
    },
    restore(p) {
      removing.delete(p.id);
      if (!pieces.some((q) => q.id === p.id)) pieces = [...pieces, p];
      rebuild();
    },
    pieces: () => pieces,
    update(crewX, crewZ, camera) {
      const c = site.colony;
      telemetry.colonyDistance = Math.max(0, Math.hypot(c.x - crewX, c.z - crewZ) - c.r);
      telemetry.colonyBearing = ((Math.atan2(c.x - crewX, crewZ - c.z) * 180) / Math.PI + 360) % 360;
      if (!telemetry.active) return;
      ring.visible = telemetry.scope === 'colony';
      const spec = moduleSpec(telemetry.module)!;
      dressGhost(telemetry.module);
      const yaw = yawOfQuarter(quarter);
      // The cursor: where the view meets the ground, kept a sensible reach
      // in front of the crew so the piece never lands on their boots.
      const half = Math.max(spec.w, spec.d) / 2;
      const hit = groundHit(camera);
      camera.getWorldDirection(ray);
      let dx = hit ? hit.x - crewX : ray.x; let dz = hit ? hit.z - crewZ : ray.z;
      let len = Math.hypot(dx, dz);
      if (len < 1e-3) { dx = ray.x; dz = ray.z; len = Math.hypot(dx, dz) || 1; }
      const want = hit ? Math.hypot(hit.x - crewX, hit.z - crewZ) : half + NEAR + 4;
      const reach = Math.min(FAR + half, Math.max(half + NEAR, want));
      target.cursorX = crewX + (dx / len) * reach;
      target.cursorZ = crewZ + (dz / len) * reach;
      const s = snap(spec, target.cursorX, target.cursorZ, yaw);
      target.x = s.x; target.z = s.z; target.yaw = yaw;
      const rect = rectOf(spec, s.x, s.z, yaw);
      const g = groundOf(rect);
      target.y = g.y;

      // Why it may not go here, first reason wins.
      const others = pieces.filter((p) => p.scope === telemetry.scope && (telemetry.scope === 'colony' || p.mine));
      const rule = checkPlacement(world, telemetry.scope, { module: spec.id, x: s.x, z: s.z, yaw }, others);
      let problem: BuildProblem = rule === 'site' || rule === 'coords' || rule === 'module' ? 'site' : rule === 'overlap' ? 'overlap' : '';
      if (!problem) {
        const crewBlocks = spec.id !== 'pad' && rectDistance(rect, crewX, crewZ) < 0.7;
        const moverBlocks = o.movers?.().some((m) => rectHitsCircle(rect, m)) ?? false;
        if (crewBlocks || moverBlocks || o.blockers.some((b) => rectHitsCircle(rect, { x: b.x, z: b.z, r: b.r + 0.3 }))) problem = 'blocked';
      }
      if (!problem && g.step > MAX_STEP) problem = 'slope';
      if (!problem && telemetry.locked) problem = 'signIn';
      if (!problem && telemetry.mine[telemetry.scope] >= CAPS[telemetry.scope]) problem = 'cap';
      if (!problem && telemetry.scope === 'colony' && telemetry.colonyTotal >= CAPS.colonyTotal) problem = 'cap';
      telemetry.problem = problem;
      telemetry.valid = problem === '';
      ghost.position.set(s.x, g.y + 0.02, s.z);
      ghost.rotation.y = yaw;
      ghostMat.color.copy(telemetry.valid ? GHOST_OK : GHOST_BAD);

      // The piece under the cursor, for a removal.
      let hover: BuildPiece | null = null;
      for (const p of pieces) {
        const r = rectOf(moduleSpec(p.module)!, p.x, p.z, p.yaw);
        if (target.cursorX >= r.minX && target.cursorX <= r.maxX && target.cursorZ >= r.minZ && target.cursorZ <= r.maxZ) { hover = p; break; }
      }
      telemetry.hover = hover?.id ?? '';
      telemetry.hoverModule = hover?.module ?? '';
      telemetry.hoverMine = !!hover?.mine;
      hoverBox.visible = !!hover;
      // Over a standing piece the outline says which; the ghost would only hide it.
      ghost.visible = !hover;
      if (hover) {
        const hs = moduleSpec(hover.module)!;
        const r = rectOf(hs, hover.x, hover.z, hover.yaw);
        const hy = groundOf(r).y;
        hoverBox.position.set(hover.x, hy + hs.h / 2, hover.z);
        hoverBox.scale.set(r.maxX - r.minX + 0.1, hs.h + 0.1, r.maxZ - r.minZ + 0.1);
        hoverMat.color.set(hover.mine ? 0xffb347 : 0x8a8f98);
      }
    },
    dispose() {
      for (const b of banks.values()) for (const m of b.meshes) m.dispose();
      scene.remove(root, ghost, ring, hoverBox);
      for (const g of geometries) g.dispose();
      for (const m of owned) m.dispose();
    },
  };
  return handle;
}
