// Meteoroids. Every minute or so one comes in fast and low from a random
// bearing, hits open ground well away from the cosmonaut and the base, and
// leaves a crater that stays. Flash, ejecta, a ground thump through the
// boots (you cannot hear it — there is no air — so the sound is felt more
// than heard), and the HUD names the distance.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import type { DustHandle } from '@/lib/solar-system/moon-fx';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { LightPool } from '@/lib/solar-system/moon-lights';

export interface MeteorEvent {
  x: number;
  z: number;
  distance: number;
}

export interface MeteorHandle {
  group: THREE.Group;
  /** Camera shake amplitude this frame, 0..1. */
  shake: number;
  nudge: () => void;
  /** Bring the next one down on this spot, now. */
  strike: (x: number, z: number) => void;
  update: (dt: number, playerX: number, playerZ: number) => MeteorEvent | null;
  dispose: () => void;
}

interface Params {
  heightAt: (x: number, z: number) => number;
  stampCrater: (x: number, z: number, r: number, depth: number) => void;
  dust: DustHandle;
  colliders: Collider[];
  walkRadius: number;
  /** First impact after this many seconds, then every `every` ± spread. */
  first: number;
  every: number;
  lights?: LightPool;
}

const SPEED = 160;
const SAFE_FROM_PLAYER = 26;
const SAFE_FROM_BASE = 14;

export function makeMeteors(p: Params): MeteorHandle {
  const group = new THREE.Group();
  group.name = 'meteors';
  const glowTex = softSpriteTexture();
  const headMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cf, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const head = new THREE.Sprite(headMat);
  head.scale.setScalar(2.4);
  group.add(head);
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const trailGeom = new THREE.CylinderGeometry(0.08, 0.5, 26, 8, 1, true);
  trailGeom.translate(0, 13, 0);
  const trail = new THREE.Mesh(trailGeom, trailMat);
  group.add(trail);
  const flashMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff6e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  group.add(flash);
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9 }));
  rock.visible = false;
  group.add(rock);
  // Ejecta blocks: thrown out on impact, bounce once, then stay as new rocks.
  const EJECTA = 64;
  const ejGeom = new THREE.IcosahedronGeometry(1, 1);
  const ejMat = new THREE.MeshStandardMaterial({ color: 0x9b9893, roughness: 0.95 });
  const ejecta = new THREE.InstancedMesh(ejGeom, ejMat, EJECTA);
  ejecta.count = 0;
  ejecta.castShadow = true;
  ejecta.frustumCulled = false;
  group.add(ejecta);
  const ejPos = new Float32Array(EJECTA * 3);
  const ejVel = new Float32Array(EJECTA * 3);
  const ejSize = new Float32Array(EJECTA);
  const ejLive = new Uint8Array(EJECTA);
  const ejSpin = new Float32Array(EJECTA);
  let ejHead = 0;
  const ejM = new THREE.Matrix4(); const ejQ = new THREE.Quaternion(); const ejS = new THREE.Vector3(); const ejP = new THREE.Vector3(); const ejE = new THREE.Euler();
  const throwEjecta = (x: number, y: number, z: number, count: number) => {
    for (let n = 0; n < count; n++) {
      const i = ejHead; ejHead = (ejHead + 1) % EJECTA;
      const a = Math.random() * Math.PI * 2; const el = 0.55 + Math.random() * 0.8;
      const sp = 4 + Math.random() * 9;
      ejPos[i * 3] = x; ejPos[i * 3 + 1] = y + 0.3; ejPos[i * 3 + 2] = z;
      ejVel[i * 3] = Math.cos(a) * Math.cos(el) * sp; ejVel[i * 3 + 1] = Math.sin(el) * sp; ejVel[i * 3 + 2] = Math.sin(a) * Math.cos(el) * sp;
      ejSize[i] = 0.12 + Math.random() * 0.3;
      ejLive[i] = 2;
      ejSpin[i] = Math.random() * Math.PI * 2;
      ejecta.count = Math.min(EJECTA, ejecta.count + 1);
    }
  };
  const updateEjecta = (dt: number) => {
    let any = false;
    for (let i = 0; i < ejecta.count; i++) {
      if (ejLive[i] === 0) continue;
      any = true;
      ejVel[i * 3 + 1] -= 1.62 * dt;
      ejPos[i * 3] += ejVel[i * 3] * dt; ejPos[i * 3 + 1] += ejVel[i * 3 + 1] * dt; ejPos[i * 3 + 2] += ejVel[i * 3 + 2] * dt;
      ejSpin[i] += dt * 4;
      const g = p.heightAt(ejPos[i * 3], ejPos[i * 3 + 2]) + ejSize[i] * 0.6;
      if (ejPos[i * 3 + 1] <= g && ejVel[i * 3 + 1] < 0) {
        ejPos[i * 3 + 1] = g;
        if (ejLive[i] === 2 && ejVel[i * 3 + 1] < -2) {
          // One bounce, dust where it lands.
          ejVel[i * 3 + 1] *= -0.3; ejVel[i * 3] *= 0.5; ejVel[i * 3 + 2] *= 0.5;
          ejLive[i] = 1;
          p.dust.burst({ x: ejPos[i * 3], y: g, z: ejPos[i * 3 + 2], count: 6, speedMin: 0.5, speedMax: 1.6, cone: 1, size: 0.12 });
        } else {
          ejVel[i * 3] = ejVel[i * 3 + 1] = ejVel[i * 3 + 2] = 0;
          ejLive[i] = 0;
        }
      }
      ejP.set(ejPos[i * 3], ejPos[i * 3 + 1], ejPos[i * 3 + 2]);
      ejQ.setFromEuler(ejE.set(ejSpin[i], ejSpin[i] * 0.7, 0));
      ejS.setScalar(ejSize[i]);
      ejM.compose(ejP, ejQ, ejS);
      ejecta.setMatrixAt(i, ejM);
    }
    if (any) ejecta.instanceMatrix.needsUpdate = true;
  };

  let timer = p.first;
  let flying = false;
  let flightT = 0;
  let flightDur = 0;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let flashT = -1;
  let craterR = 3;

  let forced: { x: number; z: number } | null = null;
  const pickTarget = (px: number, pz: number): boolean => {
    if (forced) {
      const f = forced;
      forced = null;
      if (Math.hypot(f.x - px, f.z - pz) > SAFE_FROM_PLAYER && Math.hypot(f.x, f.z) < p.walkRadius - 8) {
        to.set(f.x, p.heightAt(f.x, f.z), f.z);
        return true;
      }
    }
    for (let tries = 0; tries < 40; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = SAFE_FROM_PLAYER + 6 + Math.random() * 90;
      const x = px + Math.sin(a) * d;
      const z = pz + Math.cos(a) * d;
      if (Math.hypot(x, z) > p.walkRadius - 8) continue;
      let clear = true;
      for (const c of p.colliders) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + SAFE_FROM_BASE) { clear = false; break; }
      }
      if (!clear) continue;
      to.set(x, p.heightAt(x, z), z);
      return true;
    }
    return false;
  };

  const handle: MeteorHandle = {
    group,
    shake: 0,
    nudge() { timer = 0; },
    strike(x, z) { if (!flying) { forced = { x, z }; timer = 0; } },
    update(dt, px, pz) {
      handle.shake *= Math.exp(-dt * 3);
      updateEjecta(dt);
      let event: MeteorEvent | null = null;
      if (flashT >= 0) {
        flashT += dt;
        const k = Math.max(0, 1 - flashT / 0.55);
        flashMat.opacity = k * k;
        flash.scale.setScalar(6 + (1 - k) * 22);
        p.lights?.request(flash.position.x, flash.position.y + 0.8, flash.position.z, 0xffd9a0, 900 * k * k, 60, 1.6);
        if (flashT > 0.6) { flashT = -1; flashMat.opacity = 0; }
      }
      if (!flying) {
        timer -= dt;
        if (timer <= 0) {
          if (pickTarget(px, pz)) {
            // Come in from a random bearing, 35–60° above the horizon.
            const a = Math.random() * Math.PI * 2;
            const el = 0.6 + Math.random() * 0.45;
            const range = 420;
            from.set(to.x + Math.sin(a) * Math.cos(el) * range, to.y + Math.sin(el) * range, to.z + Math.cos(a) * Math.cos(el) * range);
            dir.copy(to).sub(from).normalize();
            flightDur = range / SPEED;
            flightT = 0;
            flying = true;
            craterR = 2.2 + Math.random() * 2.2;
            headMat.opacity = 1;
            trailMat.opacity = 0.7;
            rock.visible = true;
            trail.quaternion.setFromUnitVectors(up, dir.clone().negate());
          }
          timer = p.every * (0.7 + Math.random() * 0.6);
        }
      } else {
        flightT += dt;
        const t = Math.min(1, flightT / flightDur);
        pos.copy(from).lerp(to, t);
        head.position.copy(pos);
        trail.position.copy(pos);
        rock.position.copy(pos);
        rock.rotation.x += dt * 9;
        rock.rotation.y += dt * 7;
        p.lights?.request(pos.x, pos.y, pos.z, 0xffd9a0, 60, 60, 1.6);
        if (t >= 1) {
          flying = false;
          headMat.opacity = 0;
          trailMat.opacity = 0;
          rock.visible = false;
          flash.position.set(to.x, to.y + 1.2, to.z);
          flashT = 0;
          const depth = craterR * 0.3;
          p.stampCrater(to.x, to.z, craterR, depth);
          throwEjecta(to.x, to.y, to.z, 10 + Math.round(craterR * 2));
          p.dust.burst({ x: to.x, y: to.y, z: to.z, count: 240, speedMin: 5, speedMax: 19, cone: 0.9, size: 0.34, brightness: 1.15 });
          p.dust.burst({ x: to.x, y: to.y, z: to.z, count: 120, speedMin: 2, speedMax: 6, cone: 1.4, size: 0.5, brightness: 0.9 });
          const distance = Math.hypot(to.x - px, to.z - pz);
          handle.shake = Math.max(0.1, 1 - distance / 130);
          event = { x: to.x, z: to.z, distance };
        }
      }
      return event;
    },
    dispose() {
      headMat.dispose(); trailMat.dispose(); trailGeom.dispose(); flashMat.dispose();
      rock.geometry.dispose(); (rock.material as THREE.Material).dispose();
      ejGeom.dispose(); ejMat.dispose(); ejecta.dispose();
    },
  };
  return handle;
}
