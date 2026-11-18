// What the guns look like: the flash at the muzzle, the light where a shot
// lands, the hull that flickers when it is hit, the missiles and their smoke,
// the plasma ball, and the explosion — a fireball, a white core, a ring of
// shock thrown out flat to the camera and a spray of hot debris.
//
// Everything is pooled and built once: a busy fight reuses the same few
// sprites and two point clouds, nothing is allocated per frame, and the
// oldest effect gives way when a pool is full. No real lights — additive
// sprites in HDR colours, so the bloom pass does the glow. `lite` (the
// performance preset, or a phone) halves the pools and leaves out the
// shockwave ring and the hull flicker.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

export interface WeaponFxOptions {
  /** Size of one hull — the effects are scaled off it. */
  unit: number;
  lite: boolean;
}

export interface WeaponFxStats {
  sprites: number;
  explosions: number;
  missiles: number;
  plasma: number;
  smoke: number;
  debris: number;
}

export interface WeaponFx {
  group: THREE.Group;
  /** A shot leaving the gun at `at`, pointing `dir`. */
  muzzle: (at: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, size?: number) => void;
  /** A short flash of light where a shot lands. */
  impact: (at: THREE.Vector3, color: THREE.Color, size: number) => void;
  /** The struck hull lights up for a moment, following it as it moves. */
  flicker: (target: THREE.Object3D, size: number) => void;
  /** An explosion of `size` (about the radius of what blew up). */
  explode: (at: THREE.Vector3, size: number) => void;
  /** A missile drawn in `slot` (pos/dir copied), or hidden with null. */
  setMissile: (slot: number, pos: THREE.Vector3 | null, dir?: THREE.Vector3) => void;
  /** A plasma ball in `slot`, `size` across, or hidden with null. */
  setPlasma: (slot: number, pos: THREE.Vector3 | null, size?: number) => void;
  /** The plasma gathering at the nose while it charges (0 hides it). */
  setCharge: (pos: THREE.Vector3, k: number) => void;
  update: (dt: number) => void;
  clear: () => void;
  /** Live counts and pool sizes, for the tests. */
  stats: () => WeaponFxStats;
  readonly caps: WeaponFxStats;
  dispose: () => void;
}

export const MISSILE_SLOTS = 6;
export const PLASMA_SLOTS = 3;

let ringTex: THREE.CanvasTexture | null = null;
/** A thin bright ring with a soft inner edge, for the shockwave. */
function ringTexture(): THREE.CanvasTexture {
  if (ringTex) return ringTex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.62, 'rgba(255,255,255,0.05)');
    grad.addColorStop(0.86, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.93, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

interface Flash {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  life: number; // <0 idle
  dur: number;
  size: number;
  /** Followed while it lives (the hull flicker). */
  follow: THREE.Object3D | null;
}

interface Boom {
  fire: Flash;
  core: Flash;
  ring: Flash | null;
  life: number;
  size: number;
  at: THREE.Vector3;
}

const FIRE_HOT = new THREE.Color(3.2, 1.7, 0.6);
const FIRE_COOL = new THREE.Color(1.2, 0.28, 0.08);
const CORE = new THREE.Color(4, 3.6, 3);
const RING = new THREE.Color(1.6, 1.3, 1.0);
const FLICKER = new THREE.Color(2.4, 2.2, 2.0);
const SMOKE_COL = new THREE.Color(0.32, 0.3, 0.28);
const DEBRIS_COL = new THREE.Color(3, 1.5, 0.5);
const EXPLOSION_SEC = 0.9;
const SMOKE_LIFE = 1.1;
const DEBRIS_LIFE = 1.2;

export function makeWeaponFx(opts: WeaponFxOptions): WeaponFx {
  const u = opts.unit;
  const lite = opts.lite;
  const group = new THREE.Group();
  group.name = 'weaponFx';
  const soft = softSpriteTexture();

  const spriteMat = (color: THREE.Color, map: THREE.Texture = soft) => new THREE.SpriteMaterial({
    map, color: color.clone(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const allFlashes: Flash[] = [];
  const makeFlash = (color: THREE.Color, map?: THREE.Texture): Flash => {
    const mat = spriteMat(color, map);
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    group.add(sprite);
    const f: Flash = { sprite, mat, life: -1, dur: 0.1, size: 1, follow: null };
    allFlashes.push(f);
    return f;
  };
  const pool = (n: number, color: THREE.Color) => Array.from({ length: n }, () => makeFlash(color));

  const muzzles = pool(2, CORE);
  const impacts = pool(lite ? 3 : 6, CORE);
  const flickers = lite ? [] : pool(4, FLICKER);
  const booms: Boom[] = [];
  for (let i = 0; i < (lite ? 2 : 4); i++) {
    booms.push({
      fire: makeFlash(FIRE_HOT),
      core: makeFlash(CORE),
      ring: lite ? null : makeFlash(RING, ringTexture()),
      life: -1,
      size: 1,
      at: new THREE.Vector3(),
    });
  }

  /** A free one from a pool, or the next in turn when every one is busy;
   *  `cursor` holds each pool's turn. No tuple, so nothing is allocated. */
  const cursor = { muzzle: 0, impact: 0, flicker: 0, boom: 0 };
  const take = <T extends { life: number }>(list: T[], key: keyof typeof cursor): T => {
    for (let i = 0; i < list.length; i++) if (list[i].life < 0) return list[i];
    const x = list[cursor[key] % list.length];
    cursor[key] = (cursor[key] + 1) % list.length;
    return x;
  };
  const light = (f: Flash, at: THREE.Vector3, color: THREE.Color, size: number, dur: number) => {
    f.sprite.position.copy(at);
    f.mat.color.copy(color);
    f.size = size;
    f.dur = dur;
    f.life = 0;
    f.follow = null;
    f.sprite.scale.setScalar(size);
    f.mat.opacity = 1;
    f.sprite.visible = true;
  };

  // ── Particles: smoke and debris, one point cloud each. ──
  const SMOKE_N = lite ? 48 : 96;
  const DEBRIS_PER = lite ? 10 : 18;
  const DEBRIS_N = DEBRIS_PER * booms.length;
  const cloud = (n: number, size: number) => {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      map: soft, size, vertexColors: true, transparent: true, depthWrite: false,
      sizeAttenuation: true, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geom, mat);
    points.frustumCulled = false;
    points.visible = false;
    group.add(points);
    return { pos, col, geom, mat, points, vel: new Float32Array(n * 3), age: new Float32Array(n).fill(-1) };
  };
  const smoke = cloud(SMOKE_N, u * 0.9);
  const debris = cloud(DEBRIS_N, u * 0.35);
  let smokeNext = 0;
  let debrisNext = 0;
  const puff = (at: THREE.Vector3) => {
    const i = smokeNext;
    smokeNext = (smokeNext + 1) % SMOKE_N;
    smoke.pos[i * 3] = at.x;
    smoke.pos[i * 3 + 1] = at.y;
    smoke.pos[i * 3 + 2] = at.z;
    smoke.vel[i * 3] = (Math.random() - 0.5) * u * 0.6;
    smoke.vel[i * 3 + 1] = (Math.random() - 0.5) * u * 0.6;
    smoke.vel[i * 3 + 2] = (Math.random() - 0.5) * u * 0.6;
    smoke.age[i] = 0;
    smoke.points.visible = true;
  };

  // ── Missiles: a small dart with a hot flare at its tail. ──
  const missileGeom = new THREE.ConeGeometry(u * 0.09, u * 0.7, 6);
  missileGeom.rotateX(Math.PI / 2); // tip along +Z
  const missileMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.78, 0.85) });
  const missiles: { mesh: THREE.Mesh; on: boolean; smokeT: number }[] = [];
  const flarePos = new Float32Array(MISSILE_SLOTS * 3);
  const flareGeom = new THREE.BufferGeometry();
  flareGeom.setAttribute('position', new THREE.BufferAttribute(flarePos, 3).setUsage(THREE.DynamicDrawUsage));
  const flareMat = new THREE.PointsMaterial({
    map: soft, size: u * 0.9, color: new THREE.Color(3, 1.6, 0.6), transparent: true, depthWrite: false,
    sizeAttenuation: true, blending: THREE.AdditiveBlending,
  });
  const flares = new THREE.Points(flareGeom, flareMat);
  flares.frustumCulled = false;
  flares.visible = false;
  group.add(flares);
  for (let i = 0; i < MISSILE_SLOTS; i++) {
    const mesh = new THREE.Mesh(missileGeom, missileMat);
    mesh.visible = false;
    group.add(mesh);
    missiles.push({ mesh, on: false, smokeT: 0 });
  }

  // ── Plasma: a violet-white ball, and the one gathering at the nose. ──
  const PLASMA = new THREE.Color(1.4, 1.1, 3.4);
  const plasma = Array.from({ length: PLASMA_SLOTS }, () => makeFlash(PLASMA));
  const charge = makeFlash(PLASMA);

  const zAxis = new THREE.Vector3(0, 0, 1);
  const tmp = new THREE.Vector3();
  let clock = 0;

  const fx: WeaponFx = {
    group,
    caps: {
      sprites: allFlashes.length,
      explosions: booms.length,
      missiles: MISSILE_SLOTS,
      plasma: PLASMA_SLOTS,
      smoke: SMOKE_N,
      debris: DEBRIS_N,
    },
    muzzle(at, dir, color, size = 1) {
      const f = take(muzzles, 'muzzle');
      tmp.copy(at).addScaledVector(dir, u * 0.15);
      light(f, tmp, color, u * 0.9 * size, 0.06);
    },
    impact(at, color, size) {
      light(take(impacts, 'impact'), at, color, size, 0.14);
    },
    flicker(target, size) {
      if (!flickers.length) return;
      // Already lit on this hull: light it again rather than stack a second.
      let f: Flash | null = null;
      for (let i = 0; i < flickers.length; i++) if (flickers[i].life >= 0 && flickers[i].follow === target) f = flickers[i];
      if (!f) f = take(flickers, 'flicker');
      light(f, target.position, FLICKER, size, 0.12);
      f.follow = target;
    },
    explode(at, size) {
      const b = take(booms, 'boom');
      b.at.copy(at);
      b.size = size;
      b.life = 0;
      light(b.fire, at, FIRE_HOT, size, EXPLOSION_SEC);
      light(b.core, at, CORE, size * 1.6, 0.18);
      if (b.ring) light(b.ring, at, RING, size, EXPLOSION_SEC * 0.7);
      // Debris: hot chunks thrown out in every direction.
      for (let k = 0; k < DEBRIS_PER; k++) {
        const i = debrisNext;
        debrisNext = (debrisNext + 1) % DEBRIS_N;
        tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        if (tmp.lengthSq() < 1e-6) tmp.set(0, 1, 0);
        tmp.normalize().multiplyScalar(size * (1.2 + Math.random() * 2.2));
        debris.pos[i * 3] = at.x;
        debris.pos[i * 3 + 1] = at.y;
        debris.pos[i * 3 + 2] = at.z;
        debris.vel[i * 3] = tmp.x;
        debris.vel[i * 3 + 1] = tmp.y;
        debris.vel[i * 3 + 2] = tmp.z;
        debris.age[i] = Math.random() * 0.2;
      }
      debris.points.visible = true;
    },
    setMissile(slot, pos, dir) {
      const m = missiles[slot];
      if (!m) return;
      if (!pos) {
        m.on = false;
        m.mesh.visible = false;
        flarePos[slot * 3] = flarePos[slot * 3 + 1] = flarePos[slot * 3 + 2] = 0;
        return;
      }
      if (!m.on) m.smokeT = 0;
      m.on = true;
      m.mesh.visible = true;
      m.mesh.position.copy(pos);
      if (dir) m.mesh.quaternion.setFromUnitVectors(zAxis, dir);
      tmp.set(0, 0, -u * 0.4).applyQuaternion(m.mesh.quaternion).add(pos);
      flarePos[slot * 3] = tmp.x;
      flarePos[slot * 3 + 1] = tmp.y;
      flarePos[slot * 3 + 2] = tmp.z;
    },
    setPlasma(slot, pos, size = u) {
      const f = plasma[slot];
      if (!f) return;
      if (!pos) {
        f.life = -1;
        f.sprite.visible = false;
        return;
      }
      f.sprite.position.copy(pos);
      // Held alive by its owner, not timed out; a slow shimmer on the size.
      f.life = 0;
      f.dur = Infinity;
      f.size = size;
      f.follow = null;
      f.sprite.scale.setScalar(size * (1 + 0.12 * Math.sin(clock * 40 + slot)));
      f.mat.opacity = 1;
      f.sprite.visible = true;
    },
    setCharge(pos, k) {
      if (k <= 0.01) {
        charge.life = -1;
        charge.sprite.visible = false;
        return;
      }
      charge.sprite.position.copy(pos);
      charge.life = 0;
      charge.dur = Infinity;
      charge.follow = null;
      charge.sprite.scale.setScalar(u * (0.4 + 1.6 * k) * (1 + 0.15 * Math.sin(clock * 30)));
      charge.mat.opacity = 0.35 + 0.65 * k;
      charge.sprite.visible = true;
    },
    update(dt) {
      clock += dt;
      // Flashes fade over their life; a followed one keeps to its hull.
      for (const f of allFlashes) {
        if (f.life < 0 || f.dur === Infinity) continue;
        f.life += dt;
        if (f.life >= f.dur) {
          f.life = -1;
          f.follow = null;
          f.sprite.visible = false;
          continue;
        }
        const k = f.life / f.dur;
        if (f.follow) {
          if (!f.follow.visible) { f.life = -1; f.follow = null; f.sprite.visible = false; continue; }
          f.sprite.position.copy(f.follow.position);
        }
        f.mat.opacity = 1 - k;
      }
      for (const b of booms) {
        if (b.life < 0) continue;
        b.life += dt;
        const k = Math.min(1, b.life / EXPLOSION_SEC);
        if (k >= 1) { b.life = -1; continue; }
        // The fireball swells fast, then cools from white-orange to red.
        if (b.fire.life >= 0) {
          b.fire.sprite.scale.setScalar(b.size * (1.2 + 2.6 * (1 - (1 - k) * (1 - k))));
          b.fire.mat.color.copy(FIRE_HOT).lerp(FIRE_COOL, k);
          b.fire.mat.opacity = (1 - k) * (1 - k);
        }
        if (b.ring && b.ring.life >= 0) {
          const r = Math.min(1, b.ring.life / b.ring.dur);
          b.ring.sprite.scale.setScalar(b.size * (1 + 7 * r));
          b.ring.mat.opacity = (1 - r) * 0.9;
        }
      }
      // Missiles: their flares, and smoke let go behind them.
      let anyMissile = false;
      for (let i = 0; i < missiles.length; i++) {
        const m = missiles[i];
        if (!m.on) continue;
        anyMissile = true;
        m.smokeT -= dt;
        if (m.smokeT <= 0) {
          m.smokeT += lite ? 0.05 : 0.025;
          tmp.set(flarePos[i * 3], flarePos[i * 3 + 1], flarePos[i * 3 + 2]);
          puff(tmp);
        }
      }
      flares.visible = anyMissile;
      if (anyMissile) flareGeom.getAttribute('position').needsUpdate = true;
      // Smoke: drifts, grows dim. Debris: flies on, cools from orange to dark.
      if (smoke.points.visible) {
        let live = 0;
        for (let i = 0; i < SMOKE_N; i++) {
          const a = smoke.age[i];
          if (a < 0) continue;
          const age = a + dt;
          const o = i * 3;
          if (age >= SMOKE_LIFE) {
            smoke.age[i] = -1;
            smoke.col[o] = smoke.col[o + 1] = smoke.col[o + 2] = 0;
            continue;
          }
          live += 1;
          smoke.age[i] = age;
          smoke.pos[o] += smoke.vel[o] * dt;
          smoke.pos[o + 1] += smoke.vel[o + 1] * dt;
          smoke.pos[o + 2] += smoke.vel[o + 2] * dt;
          const fade = 1 - age / SMOKE_LIFE;
          // Hot at the nozzle, grey haze after.
          const hot = Math.max(0, 1 - age * 8);
          smoke.col[o] = (SMOKE_COL.r + hot * 1.8) * fade;
          smoke.col[o + 1] = (SMOKE_COL.g + hot * 0.8) * fade;
          smoke.col[o + 2] = (SMOKE_COL.b + hot * 0.2) * fade;
        }
        smoke.geom.getAttribute('position').needsUpdate = true;
        smoke.geom.getAttribute('color').needsUpdate = true;
        if (live === 0) smoke.points.visible = false;
      }
      if (debris.points.visible) {
        let live = 0;
        const drag = Math.exp(-dt * 1.6);
        for (let i = 0; i < DEBRIS_N; i++) {
          const a = debris.age[i];
          if (a < 0) continue;
          const age = a + dt;
          const o = i * 3;
          if (age >= DEBRIS_LIFE) {
            debris.age[i] = -1;
            debris.col[o] = debris.col[o + 1] = debris.col[o + 2] = 0;
            continue;
          }
          live += 1;
          debris.age[i] = age;
          debris.vel[o] *= drag;
          debris.vel[o + 1] *= drag;
          debris.vel[o + 2] *= drag;
          debris.pos[o] += debris.vel[o] * dt;
          debris.pos[o + 1] += debris.vel[o + 1] * dt;
          debris.pos[o + 2] += debris.vel[o + 2] * dt;
          const fade = 1 - age / DEBRIS_LIFE;
          // A flicker as they tumble.
          const glint = 0.7 + 0.3 * Math.sin(age * 40 + i);
          debris.col[o] = DEBRIS_COL.r * fade * glint;
          debris.col[o + 1] = DEBRIS_COL.g * fade * fade * glint;
          debris.col[o + 2] = DEBRIS_COL.b * fade * fade * fade * glint;
        }
        debris.geom.getAttribute('position').needsUpdate = true;
        debris.geom.getAttribute('color').needsUpdate = true;
        if (live === 0) debris.points.visible = false;
      }
    },
    clear() {
      for (const f of allFlashes) {
        f.life = -1;
        f.follow = null;
        f.sprite.visible = false;
      }
      for (const b of booms) b.life = -1;
      for (let i = 0; i < missiles.length; i++) fx.setMissile(i, null);
      smoke.age.fill(-1);
      smoke.col.fill(0);
      debris.age.fill(-1);
      debris.col.fill(0);
      smoke.points.visible = debris.points.visible = flares.visible = false;
    },
    stats() {
      let sprites = 0;
      for (const f of allFlashes) if (f.sprite.visible) sprites += 1;
      let smokeN = 0;
      for (let i = 0; i < SMOKE_N; i++) if (smoke.age[i] >= 0) smokeN += 1;
      let debrisN = 0;
      for (let i = 0; i < DEBRIS_N; i++) if (debris.age[i] >= 0) debrisN += 1;
      return {
        sprites,
        explosions: booms.filter((b) => b.life >= 0).length,
        missiles: missiles.filter((m) => m.on).length,
        plasma: plasma.filter((p) => p.sprite.visible).length,
        smoke: smokeN,
        debris: debrisN,
      };
    },
    dispose() {
      for (const f of allFlashes) f.mat.dispose();
      smoke.geom.dispose();
      smoke.mat.dispose();
      debris.geom.dispose();
      debris.mat.dispose();
      missileGeom.dispose();
      missileMat.dispose();
      flareGeom.dispose();
      flareMat.dispose();
      // The soft sprite and ring textures are shared module-wide: kept.
    },
  };
  return fx;
}
