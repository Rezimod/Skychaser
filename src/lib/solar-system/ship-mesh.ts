// The player's spacecraft. The three flyable hulls are real models built in
// Blender (assets-src/blender/ship_*.py) and loaded as glTF; everything the
// flight model animates — engine cores and plumes, reaction-control jets,
// position lights, the strobe, gun ports, the fighter's wing pivots — stays
// code-built here and is placed from the model's named empties. The
// Endurance (and the suit) are still built from primitives. Forward is +Z,
// up +Y, so the pilot's left (port) is +X.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import { acquireModel, type ModelHandle } from '@/game/models';

export type ShipKind = 'kestrel' | 'xfoil' | 'cruiser' | 'endurance';

/** A reaction-control jet: a sprite on the hull whose brightness answers
 *  the control inputs it opposes. Weights are signed: a jet with yaw +1
 *  fires when the pilot commands a right turn. */
export interface RcsJet {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  yaw: number;
  pitch: number;
  roll: number;
  /** Fires under reverse thrust — the forward-facing braking nozzles. */
  brake: number;
}

export interface WingPivot {
  pivot: THREE.Group;
  /** +1 port (+X), -1 starboard. */
  side: number;
  /** Sweep (rad) when spread for combat, and when folded for speed. */
  open: number;
  closed: number;
  /** Which axis the wing swings on: 'y' sweeps it back, 'z' fans it into an X. */
  axis: 'y' | 'z';
}

export interface ShipParts {
  group: THREE.Group;
  /** Visual child — banks into turns while `group` carries the physics frame. */
  hull: THREE.Group;
  wings: WingPivot[];
  cannonTips: THREE.Object3D[];
  skinMat: THREE.MeshStandardMaterial;
  /** Engine cores — emissive rises with throttle. */
  engineMat: THREE.MeshStandardMaterial;
  /** Nozzle bells — they glow dull red as heat soaks in. */
  bellMat: THREE.MeshStandardMaterial;
  glowMats: THREE.SpriteMaterial[];
  glowSprites: THREE.Sprite[];
  plumes: THREE.Mesh[];
  plumeMat: THREE.MeshBasicMaterial | null;
  /** One long narrow cone inside each plume, scaled with it. */
  plumeCores: THREE.Mesh[];
  /** The bright core inside each plume — HDR, so the bloom pass lights it
   *  into the blue-white streak the reference ships trail. Scaled with the
   *  plumes; its opacity is the flight model's to set. */
  plumeCoreMat: THREE.MeshBasicMaterial | null;
  plasmaMat: THREE.SpriteMaterial;
  plasma: THREE.Sprite;
  /** The entry: ribbons of plasma streaming back from the nose along the
   *  hull, lengthened and lit by heat. Empty on hulls that never enter. */
  streaks: THREE.Mesh[];
  streakMat: THREE.MeshBasicMaterial | null;
  strobeMat: THREE.MeshBasicMaterial;
  /** Position lights — base colour in `userData.base`. */
  navMats: THREE.MeshBasicMaterial[];
  rcs: RcsJet[];
  /** Materials shared across meshes — disposed once, by hand. */
  owned: THREE.Material[];
  /** Hull length, for the camera and collision maths. */
  length: number;
  /** Turned about the flight axis every frame — the Endurance's gravity ring. */
  spinner: THREE.Group | null;
  /** Model ships: hand the loaded hull back. Called before the ship's meshes
   *  are disposed, so the shared model geometry is left to its cache. */
  release?: () => void;
}

interface Palette {
  graphite: THREE.MeshStandardMaterial;
  titanium: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  engineMat: THREE.MeshStandardMaterial;
  bellMat: THREE.MeshStandardMaterial;
  plumeMat: THREE.MeshBasicMaterial;
  plumeCoreMat: THREE.MeshBasicMaterial;
  owned: THREE.Material[];
}

function palette(accentHex: number, driveHex: number): Palette {
  const graphite = new THREE.MeshStandardMaterial({ color: 0x3a414b, roughness: 0.55, metalness: 0.5 });
  const titanium = new THREE.MeshStandardMaterial({ color: 0x7d8692, roughness: 0.42, metalness: 0.72 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x9099a3, roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0f1216, roughness: 0.72, metalness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({
    color: accentHex, roughness: 0.5, metalness: 0.2,
    emissive: new THREE.Color(accentHex), emissiveIntensity: 0.35,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x07111c, roughness: 0.08, metalness: 0.9,
    emissive: new THREE.Color(0x0b2a3c), emissiveIntensity: 0.55,
  });
  const { engineMat, bellMat, plumeMat, plumeCoreMat } = driveMats(driveHex);
  return {
    graphite, titanium, panel, dark, accent, glass, engineMat, bellMat, plumeMat, plumeCoreMat,
    owned: [graphite, titanium, panel, dark, accent, glass, engineMat, bellMat, plumeMat, plumeCoreMat],
  };
}

/** Engine core, nozzle bell and plume, tinted by the drive colour. The
 *  plume is two cones: a wide soft haze in the drive's own colour, and a
 *  long narrow core pushed past white so the bloom pass turns it into the
 *  blue-white streak a ship under power trails. */
function driveMats(driveHex: number) {
  const drive = new THREE.Color(driveHex);
  const engineMat = new THREE.MeshStandardMaterial({
    color: 0xeaf7ff, emissive: drive, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0,
  });
  const bellMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d44, roughness: 0.5, metalness: 0.75, emissive: new THREE.Color(0x000000), emissiveIntensity: 1,
  });
  const plumeMat = new THREE.MeshBasicMaterial({
    color: drive.clone().multiplyScalar(1.5), transparent: true, opacity: 0.5,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const plumeCoreMat = new THREE.MeshBasicMaterial({
    color: plumeCoreColor(drive), transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return { engineMat, bellMat, plumeMat, plumeCoreMat };
}

/** The core's colour: the drive hue pulled most of the way to white and
 *  over 1, so it reads as incandescent rather than tinted. */
export function plumeCoreColor(drive: THREE.Color): THREE.Color {
  return drive.clone().lerp(new THREE.Color(0.95, 0.98, 1.0), 0.72).multiplyScalar(2.6);
}

/** Hollow cone for an exhaust plume: wide end at the nozzle, tip trailing. */
function plumeCone(radius: number, length: number): THREE.ConeGeometry {
  const geom = new THREE.ConeGeometry(radius, length, 14, 1, true);
  geom.translate(0, length / 2, 0);
  return geom;
}

/** The entry's plasma: a ring of thin ribbons round the nose, streaming aft
 *  along the hull. `noseZ` is where they start, `r` the hull's radius there
 *  and `length` how far back they reach at full heat; the flight model
 *  scales them with the heat it reads. Additive, HDR orange, so they bloom. */
export function plasmaStreaks(into: THREE.Object3D, noseZ: number, r: number, length: number): { streaks: THREE.Mesh[]; streakMat: THREE.MeshBasicMaterial } {
  const streakMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.9, 0.62, 0.22), transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const streaks: THREE.Mesh[] = [];
  const geom = plumeCone(r * 0.16, length);
  const N = 9;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.4;
    const m = new THREE.Mesh(geom, streakMat);
    // Around the nose, each ribbon leaning a little out from the hull so
    // the sheaf opens behind the ship the way a shock layer spreads.
    m.position.set(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.7, noseZ);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = a;
    m.rotation.y = 0.07 + (i % 3) * 0.03;
    m.visible = false;
    into.add(m);
    streaks.push(m);
  }
  return { streaks, streakMat };
}

interface Builder {
  hull: THREE.Group;
  pal: Palette;
  H: number;
  glowTex: THREE.Texture;
  glowMats: THREE.SpriteMaterial[];
  glowSprites: THREE.Sprite[];
  plumes: THREE.Mesh[];
  plumeCores: THREE.Mesh[];
  rcs: RcsJet[];
  navMats: THREE.MeshBasicMaterial[];
  owned: THREE.Material[];
}

function mesh(b: Builder, geom: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = b.hull): THREE.Mesh {
  const m = new THREE.Mesh(geom, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** An engine: shroud ring, bell, hot core, plume and glow, facing aft. */
function engine(b: Builder, x: number, y: number, z: number, r: number, plumeLen: number, parent: THREE.Object3D = b.hull) {
  const H = b.H;
  const shroud = mesh(b, new THREE.CylinderGeometry(r * 1.15, r * 1.05, 0.5 * H, 16, 1, true), b.pal.dark, x, y, z + 0.2 * H, parent);
  shroud.rotation.x = Math.PI / 2;
  const bell = mesh(b, new THREE.CylinderGeometry(r * 0.72, r, 0.46 * H, 16, 1, true), b.pal.bellMat, x, y, z - 0.1 * H, parent);
  bell.rotation.x = Math.PI / 2;
  const core = mesh(b, new THREE.CylinderGeometry(r * 0.6, r * 0.5, 0.12 * H, 16), b.pal.engineMat, x, y, z + 0.05 * H, parent);
  core.rotation.x = Math.PI / 2;
  const plume = mesh(b, plumeCone(r * 0.78, plumeLen), b.pal.plumeMat, x, y, z - 0.3 * H, parent);
  plume.rotation.x = -Math.PI / 2;
  b.plumes.push(plume);
  const plumeCore = mesh(b, plumeCone(r * 0.42, plumeLen * 1.35), b.pal.plumeCoreMat, x, y, z - 0.3 * H, parent);
  plumeCore.rotation.x = -Math.PI / 2;
  b.plumeCores.push(plumeCore);
  const mat = new THREE.SpriteMaterial({
    map: b.glowTex, color: b.pal.plumeMat.color, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z - 0.4 * H);
  sprite.scale.setScalar(r * 5);
  parent.add(sprite);
  b.glowMats.push(mat);
  b.glowSprites.push(sprite);
}

/** A reaction-control pod: a small block with a nozzle and its puff. */
function rcsPod(
  b: Builder, x: number, y: number, z: number, nozzle: THREE.Vector3,
  k: { yaw?: number; pitch?: number; roll?: number; brake?: number },
) {
  const H = b.H;
  const pod = mesh(b, new THREE.BoxGeometry(0.16 * H, 0.16 * H, 0.22 * H), b.pal.dark, x, y, z);
  pod.lookAt(pod.position.clone().add(nozzle));
  const mat = new THREE.SpriteMaterial({
    map: b.glowTex, color: 0xdff4ff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, y, z).addScaledVector(nozzle, 0.2 * H);
  sprite.scale.setScalar(0.55 * H);
  b.hull.add(sprite);
  b.rcs.push({ sprite, mat, yaw: k.yaw ?? 0, pitch: k.pitch ?? 0, roll: k.roll ?? 0, brake: k.brake ?? 0 });
}

function navLight(b: Builder, x: number, y: number, z: number, hex: number, r: number, parent: THREE.Object3D = b.hull) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6) });
  m.userData.base = hex;
  b.owned.push(m);
  b.navMats.push(m);
  mesh(b, new THREE.SphereGeometry(r, 8, 8), m, x, y, z, parent);
}

function builder(H: number, pal: Palette): Builder {
  const group = new THREE.Group();
  group.name = 'playerShip';
  const hull = new THREE.Group();
  group.add(hull);
  return {
    hull, pal, H, glowTex: softSpriteTexture(),
    glowMats: [], glowSprites: [], plumes: [], plumeCores: [], rcs: [], navMats: [], owned: [...pal.owned],
  };
}

/** Every static mesh under `root` that shares a material is baked into one
 *  mesh — a hull of a hundred primitives becomes a dozen draw calls. Sprites,
 *  lights, empties and groups (the wing pivots) are left alone. */
function bakeStatic(root: THREE.Object3D) {
  const byMat = new Map<THREE.Material, { geoms: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    child.updateMatrix();
    const g = child.geometry.clone().applyMatrix4(child.matrix);
    let entry = byMat.get(child.material);
    if (!entry) {
      entry = { geoms: [], meshes: [] };
      byMat.set(child.material, entry);
    }
    entry.geoms.push(g);
    entry.meshes.push(child);
  }
  byMat.forEach((entry, mat) => {
    if (entry.meshes.length < 2) {
      for (const g of entry.geoms) g.dispose();
      return;
    }
    const merged = mergeGeometries(entry.geoms, false);
    for (const g of entry.geoms) g.dispose();
    if (!merged) return;
    for (const m of entry.meshes) {
      root.remove(m);
      m.geometry.dispose();
    }
    root.add(new THREE.Mesh(merged, mat));
  });
}

function finish(
  b: Builder, wings: WingPivot[], cannonTips: THREE.Object3D[], strobeMat: THREE.MeshBasicMaterial,
  length: number, plasmaZ: number, spinner: THREE.Group | null = null,
): ShipParts {
  const H = b.H;
  bakeStatic(b.hull);
  for (const w of wings) bakeStatic(w.pivot);
  if (spinner) bakeStatic(spinner);
  b.owned.push(strobeMat);
  const plasmaMat = new THREE.SpriteMaterial({
    map: b.glowTex, color: 0xff8a3a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const plasma = new THREE.Sprite(plasmaMat);
  plasma.position.set(0, 0, plasmaZ);
  plasma.scale.setScalar(4 * H);
  b.hull.add(plasma);
  const { streaks, streakMat } = plasmaStreaks(b.hull, plasmaZ - 0.3 * H, 0.9 * H, length * 1.1);
  b.owned.push(streakMat);
  return {
    group: b.hull.parent as THREE.Group,
    hull: b.hull,
    wings,
    cannonTips,
    skinMat: b.pal.titanium,
    engineMat: b.pal.engineMat,
    bellMat: b.pal.bellMat,
    glowMats: b.glowMats,
    glowSprites: b.glowSprites,
    plumes: b.plumes,
    plumeMat: b.pal.plumeMat,
    plumeCores: b.plumeCores,
    plumeCoreMat: b.pal.plumeCoreMat,
    plasmaMat,
    plasma,
    streaks,
    streakMat,
    strobeMat,
    navMats: b.navMats,
    rcs: b.rcs,
    owned: b.owned,
    length,
    spinner,
  };
}

/** The standard eight-pod RCS fit: four on the nose ring, four aft, plus
 *  two forward-facing braking nozzles. Yaw right fires the port nose pod
 *  and the starboard tail pod; pitch and roll pair up the same way. */
function standardRcs(b: Builder, noseZ: number, tailZ: number, r: number) {
  const H = b.H;
  const px = new THREE.Vector3(1, 0, 0);
  const nx = new THREE.Vector3(-1, 0, 0);
  const py = new THREE.Vector3(0, 1, 0);
  const ny = new THREE.Vector3(0, -1, 0);
  // Nose ring. Port pod pushes the nose to starboard → right turn.
  rcsPod(b, r, 0, noseZ, px, { yaw: 1, roll: 0 });
  rcsPod(b, -r, 0, noseZ, nx, { yaw: -1 });
  rcsPod(b, 0, r, noseZ, py, { pitch: -1 });
  rcsPod(b, 0, -r, noseZ, ny, { pitch: 1 });
  // Tail ring — opposite sense, and the roll couple.
  rcsPod(b, r, 0, tailZ, px, { yaw: -1, roll: 0.6 });
  rcsPod(b, -r, 0, tailZ, nx, { yaw: 1, roll: -0.6 });
  rcsPod(b, 0, r, tailZ, py, { pitch: 1 });
  rcsPod(b, 0, -r, tailZ, ny, { pitch: -1 });
  // Braking nozzles on the nose cheeks, facing forward.
  const fz = new THREE.Vector3(0, 0, 1);
  rcsPod(b, 0.7 * r, -0.5 * r, noseZ + 0.6 * H, fz, { brake: 1 });
  rcsPod(b, -0.7 * r, -0.5 * r, noseZ + 0.6 * H, fz, { brake: 1 });
}

/** A model ship: which file, how big it flies, its drive colour and the
 *  wing nodes the flight model swings. */
interface ModelSpec {
  url: string;
  /** Hull length in the file (metres) and in flight (H). */
  metres: number;
  length: number;
  drive: number;
  /** Multiplies the baked colour: a clean white hull reads brighter under the game's sun than in the bake. */
  tint?: number;
  wings?: Record<string, Omit<WingPivot, 'pivot'>>;
}

/** The reaction-control jets a model may carry, by empty name, and the
 *  inputs that fire them — the same couples as `standardRcs`. N and T are
 *  the nose and tail rings (PX = the pod on +X, pointing +X), B the braking
 *  pair facing forward. */
const RCS_JETS: Record<string, { yaw?: number; pitch?: number; roll?: number; brake?: number }> = {
  Rcs_N_PX: { yaw: 1 },
  Rcs_N_NX: { yaw: -1 },
  Rcs_N_PY: { pitch: -1 },
  Rcs_N_NY: { pitch: 1 },
  Rcs_T_PX: { yaw: -1, roll: 0.6 },
  Rcs_T_NX: { yaw: 1, roll: -0.6 },
  Rcs_T_PY: { pitch: 1 },
  Rcs_T_NY: { pitch: -1 },
  Rcs_B_P: { brake: 1 },
  Rcs_B_S: { brake: 1 },
};

/** Past these distances (world units, in H) the hull swaps to its lighter LODs. */
const LOD_NEAR = 70;
const LOD_FAR = 180;

/**
 * Builds the flight parts at once and fills them in when the model arrives:
 * until then the ship flies without a visible hull, and if the file cannot
 * load (offline, or a test without fetch) it simply stays that way.
 */
function buildModelShip(H: number, spec: ModelSpec): ShipParts {
  const group = new THREE.Group();
  group.name = 'playerShip';
  const hull = new THREE.Group();
  group.add(hull);
  const { engineMat, bellMat, plumeMat, plumeCoreMat } = driveMats(spec.drive);
  // The inside of the nozzle is what the chase camera sees.
  bellMat.side = THREE.BackSide;
  // Takes the hull's own textures once they load; the heat glow drives its emissive.
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const glowTex = softSpriteTexture();
  const plasmaMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff8a3a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const plasma = new THREE.Sprite(plasmaMat);
  plasma.position.set(0, 0, (spec.length / 2) * H);
  plasma.scale.setScalar(4 * H);
  hull.add(plasma);
  // The ribbons start a little back from the nose and reach past the tail.
  const { streaks, streakMat } = plasmaStreaks(hull, (spec.length / 2 - 0.6) * H, (spec.length / 8) * H, spec.length * 1.2 * H);
  // Until the model names its gun ports, the guns fire from the nose.
  const noseGun = new THREE.Object3D();
  noseGun.position.set(0, 0, (spec.length / 2) * H);
  hull.add(noseGun);

  let handle: ModelHandle | null = null;
  let released = false;
  const loaded: THREE.Object3D[] = [];
  const parts: ShipParts = {
    group, hull, wings: [], cannonTips: [noseGun], skinMat, engineMat, bellMat,
    glowMats: [], glowSprites: [], plumes: [], plumeMat, plumeCores: [], plumeCoreMat, plasmaMat, plasma, streaks, streakMat, strobeMat,
    navMats: [], rcs: [], owned: [skinMat, engineMat, bellMat, plumeMat, plumeCoreMat, streakMat, strobeMat],
    length: spec.length * H, spinner: null,
    release() {
      released = true;
      for (const o of loaded) o.removeFromParent();
      loaded.length = 0;
      handle?.release();
      handle = null;
    },
  };
  acquireModel(spec.url, true).then((h) => {
    if (released) {
      h.release();
      return;
    }
    handle = h;
    fitModel(parts, h.scene, spec, H, glowTex, loaded);
  }, () => {
    // No hull to show; the flight model does not need one.
  });
  return parts;
}

function fitModel(parts: ShipParts, source: THREE.Group, spec: ModelSpec, H: number, glowTex: THREE.Texture, loaded: THREE.Object3D[]) {
  const s = (spec.length * H) / spec.metres;
  const model = source.clone(true);
  model.updateMatrixWorld(true);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  // Materials: the hull takes our skin (so heat can glow through it), the
  // lamps a brighter copy of their own so windows and canopies bloom.
  let lampMat: THREE.MeshStandardMaterial | null = null;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (m.name.endsWith('Lamp')) {
      if (!lampMat) {
        lampMat = m.clone();
        lampMat.emissiveIntensity = 2.2;
        parts.owned.push(lampMat);
      }
      mesh.material = lampMat;
    } else if (m !== parts.skinMat) {
      if (parts.skinMat.name !== m.name) {
        parts.skinMat.copy(m);
        parts.skinMat.color.multiplyScalar(spec.tint ?? 1);
        parts.skinMat.needsUpdate = true;
      }
      mesh.material = parts.skinMat;
    }
  });

  // The body and its lighter copies, swapped by distance.
  const hullModel = new THREE.Group();
  hullModel.scale.setScalar(s);
  // Levels are attached while the LOD still sits at the model's own frame
  // (attach keeps world transforms, so it must not see the flight scale yet).
  const lod = new THREE.LOD();
  const levels: [THREE.Object3D | undefined, number][] = [];
  model.traverse((o) => {
    const lv = /_Body(?:_LOD(\d))?$/.exec(o.name);
    if (lv) levels.push([o, lv[1] ? (lv[1] === '1' ? LOD_NEAR : LOD_FAR) * H : 0]);
  });
  levels.sort((a, b) => a[1] - b[1]);
  for (const [o, d] of levels) {
    if (!o) continue;
    lod.attach(o);
    lod.addLevel(o, d);
  }
  hullModel.add(lod);
  parts.hull.add(hullModel);
  loaded.push(hullModel);

  // Wings: a pivot at each hinge in hull space; the wing's mesh rides in it
  // at model scale, its gun ports and lights at flight scale. Only the model's
  // own meshes go in `loaded`: what is code-built stays for the ship's dispose.
  const containers = new Map<THREE.Object3D, THREE.Object3D>();
  for (const [name, w] of Object.entries(spec.wings ?? {})) {
    const hinge = model.getObjectByName(name);
    if (!hinge) continue;
    const pivot = new THREE.Group();
    hinge.getWorldPosition(pivot.position).multiplyScalar(s);
    const inner = new THREE.Group();
    inner.scale.setScalar(s);
    pivot.add(inner);
    for (const child of [...hinge.children]) if ((child as THREE.Mesh).isMesh || child.children.length) inner.add(child);
    parts.hull.add(pivot);
    loaded.push(inner);
    parts.wings.push({ pivot, ...w });
    containers.set(hinge, pivot);
  }

  // Everything the flight model drives, at the empties. The real gun ports
  // replace the stand-in on the nose (in place: the flight model holds the array).
  const noseGun = parts.cannonTips[0];
  parts.cannonTips.length = 0;
  noseGun?.removeFromParent();
  const empties: THREE.Object3D[] = [];
  model.traverse((o) => { if (!(o as THREE.Mesh).isMesh && /^(Engine|Cannon|Rcs|Nav|Strobe|Plasma)/.test(o.name)) empties.push(o); });
  for (const e of empties) {
    const pivot = e.parent ? containers.get(e.parent) : undefined;
    const into = pivot ?? parts.hull;
    const at = pivot ? e.position.clone().multiplyScalar(s) : e.getWorldPosition(pos).clone().multiplyScalar(s);
    e.getWorldScale(scl);
    const add = (o: THREE.Object3D) => into.add(o);
    if (e.name.startsWith('Engine_')) modelEngine(parts, add, at, scl.x * s, H, glowTex);
    else if (e.name.startsWith('Cannon_')) {
      const tip = new THREE.Object3D();
      tip.position.copy(at);
      add(tip);
      parts.cannonTips.push(tip);
    } else if (e.name in RCS_JETS) {
      const k = RCS_JETS[e.name];
      const mat = new THREE.SpriteMaterial({
        map: glowTex, color: 0xdff4ff, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.copy(at);
      sprite.scale.setScalar(0.55 * H);
      sprite.visible = false;
      add(sprite);
      parts.rcs.push({ sprite, mat, yaw: k.yaw ?? 0, pitch: k.pitch ?? 0, roll: k.roll ?? 0, brake: k.brake ?? 0 });
    } else if (e.name === 'Nav_Port' || e.name === 'Nav_Stbd') {
      const hex = e.name === 'Nav_Port' ? 0xff3b30 : 0x30ff6a;
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(1.6) });
      m.userData.base = hex;
      parts.owned.push(m);
      parts.navMats.push(m);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.07 * H, 8, 8), m);
      light.position.copy(at);
      add(light);
    } else if (e.name === 'Strobe') {
      const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.07 * H, 8, 8), parts.strobeMat);
      strobe.position.copy(at);
      add(strobe);
    } else if (e.name === 'Plasma') parts.plasma.position.copy(at);
  }
}

/** A hot core on the nozzle's back wall, the bell that soaks heat round it,
 *  the plume and the glow, all facing aft. `r` is the core radius. */
function modelEngine(parts: ShipParts, add: (o: THREE.Object3D) => THREE.Object3D, at: THREE.Vector3, r: number, H: number, glowTex: THREE.Texture) {
  const core = new THREE.Mesh(new THREE.CircleGeometry(r, 24), parts.engineMat);
  core.position.set(at.x, at.y, at.z - 0.02 * r);
  core.rotation.y = Math.PI;
  add(core);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.16, r * 0.98, 0.9 * r, 24, 1, true), parts.bellMat);
  bell.rotation.x = -Math.PI / 2;
  bell.position.set(at.x, at.y, at.z - 0.45 * r);
  add(bell);
  if (parts.plumeMat) {
    // The soft haze, wide and short, and inside it the long bright core.
    const plume = new THREE.Mesh(plumeCone(r * 0.85, r * 8), parts.plumeMat);
    plume.rotation.x = -Math.PI / 2;
    plume.position.set(at.x, at.y, at.z - 1.2 * r);
    add(plume);
    parts.plumes.push(plume);
    if (parts.plumeCoreMat) {
      const core = new THREE.Mesh(plumeCone(r * 0.42, r * 13), parts.plumeCoreMat);
      core.rotation.x = -Math.PI / 2;
      core.position.set(at.x, at.y, at.z - 1.1 * r);
      add(core);
      parts.plumeCores.push(core);
    }
  }
  const mat = new THREE.SpriteMaterial({
    map: glowTex, color: parts.plumeMat?.color ?? 0xffffff, transparent: true, opacity: 0.7,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(at.x, at.y, at.z - 1.6 * r);
  sprite.scale.setScalar(1.3 * H);
  add(sprite);
  parts.glowMats.push(mat);
  parts.glowSprites.push(sprite);
}

/** The STELLAR exploration craft (ShipKind `kestrel`): the survey ship. */
export function buildKestrel(H: number): ShipParts {
  return buildModelShip(H, { url: '/explore/models/ship-stellar.glb', metres: 18.4, length: 8, drive: 0xff9448 });
}

/** The Magpie (ShipKind `xfoil`): four forward-swept wings that lie stacked
 *  flat for speed and fan into a shallow X to fight. */
export function buildXfoil(H: number): ShipParts {
  const wing = (side: number, layer: number) => ({ side, open: layer * side * 0.34, closed: layer * side * 0.04, axis: 'z' as const });
  return buildModelShip(H, {
    url: '/explore/models/ship-fighter.glb', metres: 12.5, length: 8, drive: 0x8ad8ff,
    wings: { Wing_PU: wing(1, 1), Wing_PD: wing(1, -1), Wing_SU: wing(-1, 1), Wing_SD: wing(-1, -1) },
  });
}

/** The Meridian (ShipKind `cruiser`): a long-range lifting-body cruiser. */
export function buildCruiser(H: number): ShipParts {
  return buildModelShip(H, { url: '/explore/models/ship-cruiser.glb', metres: 29.5, length: 10, drive: 0x5eead4, tint: 0.7 });
}

/**
 * Endurance — after the ship in Interstellar: twelve modules on a ring that
 * spins for gravity, joined by short pressurised links and four spokes to a
 * long central hub with gold foil wraps and a docking collar forward. The
 * drives sit on the aft faces of four ring modules. Forward is +Z; the ring
 * lies in the XY plane and turns about the flight axis.
 */
export function buildEndurance(H: number): ShipParts {
  const pal = palette(0xc9a44c, 0x9fd4ff);
  const b = builder(H, pal);
  const RING = 4.1 * H;
  const MODULES = 12;

  // ── Hub: the axis of the ship, foil-wrapped, a window band and the collar. ──
  const hub = mesh(b, new THREE.CylinderGeometry(0.5 * H, 0.5 * H, 2.8 * H, 16), pal.panel, 0, 0, 0);
  hub.rotation.x = Math.PI / 2;
  const foilGeom = new THREE.CylinderGeometry(0.53 * H, 0.53 * H, 0.35 * H, 16);
  for (const z of [-0.9 * H, 0.45 * H]) {
    const foil = mesh(b, foilGeom, pal.accent, 0, 0, z);
    foil.rotation.x = Math.PI / 2;
  }
  const band = mesh(b, new THREE.CylinderGeometry(0.51 * H, 0.51 * H, 0.14 * H, 16), pal.glass, 0, 0, 1.0 * H);
  band.rotation.x = Math.PI / 2;
  mesh(b, new THREE.TorusGeometry(0.62 * H, 0.09 * H, 10, 24), pal.titanium, 0, 0, 1.45 * H);
  const nose = mesh(b, new THREE.CylinderGeometry(0.28 * H, 0.45 * H, 0.4 * H, 16), pal.dark, 0, 0, 1.6 * H);
  nose.rotation.x = Math.PI / 2;
  const aft = mesh(b, new THREE.CylinderGeometry(0.42 * H, 0.3 * H, 0.5 * H, 16), pal.graphite, 0, 0, -1.6 * H);
  aft.rotation.x = Math.PI / 2;

  // ── Two short barrels under the collar. ──
  const cannonTips: THREE.Object3D[] = [];
  const cannonGeom = new THREE.CylinderGeometry(0.05 * H, 0.06 * H, 1.0 * H, 8);
  for (const s of [1, -1]) {
    const barrel = mesh(b, cannonGeom, pal.dark, s * 0.32 * H, -0.46 * H, 1.3 * H);
    barrel.rotation.x = Math.PI / 2;
    const tip = new THREE.Object3D();
    tip.position.set(s * 0.32 * H, -0.46 * H, 1.85 * H);
    b.hull.add(tip);
    cannonTips.push(tip);
  }

  // ── The ring, on its own group so the flight model can spin it. ──
  const spinner = new THREE.Group();
  b.hull.add(spinner);
  const moduleGeom = new THREE.BoxGeometry(1.25 * H, 0.8 * H, 1.1 * H);
  const windowGeom = new THREE.BoxGeometry(0.9 * H, 0.05 * H, 0.42 * H);
  const linkGeom = new THREE.CylinderGeometry(0.13 * H, 0.13 * H, 1.0 * H, 8);
  for (let i = 0; i < MODULES; i++) {
    const a = (i / MODULES) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    // Box x along the tangent, y along the radius.
    const mod = mesh(b, moduleGeom, i % 2 ? pal.panel : pal.titanium, c * RING, s * RING, 0, spinner);
    mod.rotation.z = a - Math.PI / 2;
    const win = mesh(b, windowGeom, pal.dark, c * (RING + 0.42 * H), s * (RING + 0.42 * H), 0, spinner);
    win.rotation.z = a - Math.PI / 2;
    const la = a + Math.PI / MODULES;
    const link = mesh(b, linkGeom, pal.graphite, Math.cos(la) * RING, Math.sin(la) * RING, 0, spinner);
    link.rotation.z = la;
  }
  const inner = 0.5 * H;
  const outer = RING - 0.4 * H;
  const spokeGeom = new THREE.BoxGeometry(0.14 * H, outer - inner, 0.14 * H);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const r = (inner + outer) / 2;
    const spoke = mesh(b, spokeGeom, pal.titanium, Math.cos(a) * r, Math.sin(a) * r, 0, spinner);
    spoke.rotation.z = a - Math.PI / 2;
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 2;
    engine(b, Math.cos(a) * RING, Math.sin(a) * RING, -0.75 * H, 0.26 * H, 2.4 * H, spinner);
  }
  navLight(b, RING + 0.5 * H, 0, 0, 0xff3b30, 0.08 * H, spinner);
  navLight(b, -RING - 0.5 * H, 0, 0, 0x30ff6a, 0.08 * H, spinner);

  standardRcs(b, 1.1 * H, -1.1 * H, 0.55 * H);
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  mesh(b, new THREE.SphereGeometry(0.07 * H, 8, 8), strobeMat, 0, 0.56 * H, -1.3 * H);
  return finish(b, [], cannonTips, strobeMat, 8.4 * H, 1.8 * H, spinner);
}

/**
 * The suit: a white hard-upper-torso EVA suit with a gold visor, the life
 * support pack on the back, red mission stripes, a chest display and the
 * SAFER jet pack whose nozzles glow when it fires. Head is +Y, forward +Z.
 * `E` is the suit's own unit.
 */
export function buildCosmonaut(E: number): ShipParts {
  const group = new THREE.Group();
  group.name = 'cosmonaut';
  const hull = new THREE.Group();
  group.add(hull);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.7, metalness: 0.05 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.6, metalness: 0.3 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc8302a, roughness: 0.6, metalness: 0.1 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xd9a62b, roughness: 0.15, metalness: 0.95, emissive: new THREE.Color(0x3a2a08), emissiveIntensity: 0.6 });
  const display = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5eead4).multiplyScalar(1.4) });
  const engineMat = new THREE.MeshStandardMaterial({ color: 0xe0f4ff, emissive: new THREE.Color(0x9ad8ff), emissiveIntensity: 1.5, roughness: 0.3, metalness: 0 });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.75 });
  const owned: THREE.Material[] = [skinMat, grey, red, visor, display, engineMat, bellMat];

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34 * E, 0.5 * E, 6, 12), skinMat);
  hull.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3 * E, 16, 12), skinMat);
  helmet.position.set(0, 0.7 * E, 0);
  hull.add(helmet);
  const vis = new THREE.Mesh(new THREE.SphereGeometry(0.22 * E, 16, 12), visor);
  vis.scale.set(1, 0.85, 0.7);
  vis.position.set(0, 0.7 * E, 0.16 * E);
  hull.add(vis);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * E, 0.24 * E, 0.07 * E, 14), grey);
  ring.position.set(0, 0.46 * E, 0);
  hull.add(ring);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.66 * E, 0.9 * E, 0.36 * E), grey);
  pack.position.set(0, 0.04 * E, -0.46 * E);
  hull.add(pack);
  const packLid = new THREE.Mesh(new THREE.BoxGeometry(0.7 * E, 0.1 * E, 0.4 * E), red);
  packLid.position.set(0, 0.5 * E, -0.46 * E);
  hull.add(packLid);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.28 * E, 0.16 * E, 0.04 * E), display);
  chest.position.set(0, 0.2 * E, 0.35 * E);
  hull.add(chest);
  const limbGeom = new THREE.CapsuleGeometry(0.11 * E, 0.62 * E, 4, 8);
  const legGeom = new THREE.CapsuleGeometry(0.13 * E, 0.78 * E, 4, 8);
  const gloveGeom = new THREE.SphereGeometry(0.13 * E, 10, 8);
  const bootGeom = new THREE.BoxGeometry(0.22 * E, 0.14 * E, 0.34 * E);
  const stripeGeom = new THREE.BoxGeometry(0.24 * E, 0.06 * E, 0.24 * E);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(limbGeom, skinMat);
    arm.position.set(side * 0.52 * E, 0.02 * E, 0.14 * E);
    arm.rotation.z = side * 0.62;
    arm.rotation.x = -0.5;
    hull.add(arm);
    const glove = new THREE.Mesh(gloveGeom, grey);
    glove.position.set(side * 0.78 * E, 0.26 * E, 0.36 * E);
    hull.add(glove);
    const armStripe = new THREE.Mesh(stripeGeom, red);
    armStripe.position.set(side * 0.58 * E, 0.2 * E, 0.1 * E);
    armStripe.rotation.z = side * 0.62;
    hull.add(armStripe);
    const leg = new THREE.Mesh(legGeom, skinMat);
    leg.position.set(side * 0.21 * E, -0.8 * E, 0.02 * E);
    leg.rotation.x = 0.22;
    leg.rotation.z = side * 0.1;
    hull.add(leg);
    const boot = new THREE.Mesh(bootGeom, grey);
    boot.position.set(side * 0.24 * E, -1.24 * E, 0.14 * E);
    hull.add(boot);
    const legStripe = new THREE.Mesh(stripeGeom, red);
    legStripe.position.set(side * 0.21 * E, -0.58 * E, 0.06 * E);
    hull.add(legStripe);
  }
  const nozzleGeom = new THREE.SphereGeometry(0.06 * E, 8, 8);
  const glowTex = softSpriteTexture();
  const glowMats: THREE.SpriteMaterial[] = [];
  const glowSprites: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const n = new THREE.Mesh(nozzleGeom, engineMat);
    n.position.set(side * 0.24 * E, -0.36 * E, -0.6 * E);
    hull.add(n);
    const mat = new THREE.SpriteMaterial({ map: glowTex, color: 0xbfe8ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(side * 0.24 * E, -0.4 * E, -0.72 * E);
    sprite.scale.setScalar(0.5 * E);
    hull.add(sprite);
    glowMats.push(mat);
    glowSprites.push(sprite);
  }
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.05 * E, 8, 8), strobeMat);
  strobe.position.set(0, 0.98 * E, -0.05 * E);
  hull.add(strobe);
  owned.push(strobeMat);
  const plasmaMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a3a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const plasma = new THREE.Sprite(plasmaMat);
  plasma.position.set(0, 0.2 * E, 0.5 * E);
  plasma.scale.setScalar(2.2 * E);
  hull.add(plasma);
  return {
    group, hull, wings: [], cannonTips: [], skinMat, engineMat, bellMat, glowMats, glowSprites,
    plumes: [], plumeMat: null, plumeCores: [], plumeCoreMat: null, plasmaMat, plasma, streaks: [], streakMat: null, strobeMat,
    navMats: [], rcs: [], owned, length: 2.6 * E, spinner: null,
  };
}
