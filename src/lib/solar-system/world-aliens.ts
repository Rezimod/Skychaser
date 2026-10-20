// The people of Proxima b. Tall, light-boned, digitigrade — built for
// 1.1 g and a dim red day — with skin that carries light the way ours
// carries blood: bands of colour roll down them as they talk, and a
// greeting is a wave of every colour at once. There are six of them, and
// they have never seen a suit before.
//
// They are curious and unafraid. One notices the crew, the others look
// up; they walk over and stop a polite few metres off, bow with the arms
// wide and the crest lit, and say something. Stand still and they gather.
// Walk and they follow, chattering to each other. Greet them back and, in
// time, one of them leads you to the stone.

import * as THREE from 'three';
import { mergeStatic, pivot } from '@/lib/solar-system/moon-batch';
import type { Collider } from '@/lib/solar-system/moon-cosmonaut';
import type { Interactable } from '@/lib/solar-system/moon-interactions';
import type { LightPool } from '@/lib/solar-system/moon-lights';

export type AlienState = 'wander' | 'wait' | 'notice' | 'approach' | 'greet' | 'follow' | 'lead' | 'home';

export interface AlienTelemetry {
  /** Metres to the nearest villager, or −1. */
  nearest: number;
  /** What was last said — a key under `dialog` — and how long it stays up. */
  phrase: string;
  phraseHold: number;
  /** Who said it, 0…5. */
  speaker: number;
  /** Greetings exchanged, and whether the stone has been reached together. */
  greetings: number;
  atStone: boolean;
  states: AlienState[];
}

export interface AlienOptions {
  heightAt: (x: number, z: number) => number;
  colliders: Collider[];
  village: { x: number; z: number; r: number; stone: { x: number; z: number } };
  lite: boolean;
  onEvent: (kind: 'notice' | 'speak' | 'greet' | 'stone') => void;
}

export interface AliensHandle {
  group: THREE.Group;
  telemetry: AlienTelemetry;
  interactables: Interactable[];
  /** A villager's spot, for the camera's colliders. */
  colliders: Collider[];
  update: (dt: number, t: number, crewX: number, crewZ: number, lights: LightPool) => void;
  dispose: () => void;
}

export const NOTICE_RANGE = 36;
export const POLITE_DISTANCE = 3.4;
export const FOLLOW_MIN = 4.2;
export const FOLLOW_MAX = 7.5;
export const LOSE_RANGE = 48;
export const GREETINGS_TO_LEAD = 3;
const WALK = 1.7;
const PHRASES = ['hello', 'peace', 'welcome', 'suit', 'star', 'light', 'water', 'friend', 'stone', 'gift'] as const;
const SKINS = [0x3ee6d8, 0xff5ad6, 0xffb340, 0xa2ff5a, 0x9a6cff, 0x5ac8ff];

interface Villager {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  arms: [THREE.Group, THREE.Group];
  fore: [THREE.Group, THREE.Group];
  legs: [THREE.Group, THREE.Group];
  shins: [THREE.Group, THREE.Group];
  /** This villager's slot in the shared skin's uniform arrays. */
  slot: number;
  glow: { value: number };
  ripple: { value: number };
  x: number; z: number; yaw: number;
  state: AlienState;
  timer: number;
  tx: number; tz: number;
  phase: number;
  speed: number;
  home: { x: number; z: number };
  nextChat: number;
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const COUNT = 6;

/** One skin for all six. Each villager's tint, glow, ripple and clock sit in
 *  uniform arrays, and every vertex carries its villager's slot in `uv1.x`
 *  (and whether it is an eye in `uv1.y`), so the six read as six through one
 *  material and one program. */
function makeSkin(): { material: THREE.MeshPhysicalMaterial; glow: { value: number }[]; ripple: { value: number }[]; time: Float32Array } {
  const glowArr = new Float32Array(COUNT).fill(0.6);
  const rippleArr = new Float32Array(COUNT);
  const time = new Float32Array(COUNT);
  const tints = SKINS.map((h) => new THREE.Color(h));
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.42, metalness: 0.02,
    clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.8, sheenColor: new THREE.Color(0x6a5a80),
    emissive: 0xffffff, emissiveIntensity: 1,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTints = { value: tints };
    shader.uniforms.uGlow = { value: glowArr };
    shader.uniforms.uRipple = { value: rippleArr };
    shader.uniforms.uTime = { value: time };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        #ifndef USE_UV1
        attribute vec2 uv1;
        #endif
        varying vec3 vLocal; varying float vWho; varying float vEye;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position; vWho = uv1.x; vEye = uv1.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uTints[${COUNT}]; uniform float uGlow[${COUNT}]; uniform float uRipple[${COUNT}]; uniform float uTime[${COUNT}];
        varying vec3 vLocal; varying float vWho; varying float vEye;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        int who = int(vWho + 0.5);
        vec3 tint = uTints[who];
        // The old skin's 0x2a1f3a and the eyes' 0x08060c, in linear light.
        diffuseColor.rgb = mix(mix(vec3(0.0232, 0.0137, 0.0423), tint, 0.18), vec3(0.0024, 0.0018, 0.0037), vEye);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, vEye);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Bands of the skin's own colour roll down the body; a greeting sends every colour through at once.
        float t = uTime[who];
        float band = 0.5 + 0.5 * sin(vLocal.y * 9.0 - t * 2.2 + vLocal.x * 3.0);
        band = smoothstep(0.55, 0.95, band);
        vec3 rainbow = 0.5 + 0.5 * cos(6.2831 * (vLocal.y * 1.2 - t * 1.5 + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(tint * band * uGlow[who], rainbow * 2.2, uRipple[who]);
        totalEmissiveRadiance = mix(col, tint * 0.15, vEye);`);
  };
  material.customProgramCacheKey = () => 'proxima-villager-skin';
  const view = (arr: Float32Array) => Array.from({ length: COUNT }, (_, i) => ({ get value() { return arr[i]; }, set value(v: number) { arr[i] = v; } }));
  return { material, glow: view(glowArr), ripple: view(rippleArr), time };
}

function buildVillager(i: number, lite: boolean, geoms: THREE.BufferGeometry[], skin: THREE.Material, glow: { value: number }, ripple: { value: number }): Villager {
  const eyeMat = skin;
  const seg = lite ? 8 : 12;
  const mesh = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geoms.push(g);
    // The villager's slot and the eye flag ride along on uv1, which the merge keeps.
    const n = g.attributes.position.count;
    const who = new Float32Array(n * 2);
    for (let k = 0; k < n; k++) { who[k * 2] = i; who[k * 2 + 1] = m === eyeMat && g.userData.eye ? 1 : 0; }
    g.setAttribute('uv1', new THREE.BufferAttribute(who, 2));
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    parent.add(o);
    return o;
  };
  const root = new THREE.Group();
  const body = pivot(new THREE.Group());
  body.position.y = 1.15;
  root.add(body);
  // Torso: a long tapered capsule, narrow at the waist, with a pale ventral line.
  mesh(body, new THREE.CapsuleGeometry(0.19, 0.9, 4, seg), skin, 0, 0.62, 0);
  mesh(body, new THREE.SphereGeometry(0.26, seg, seg * 0.7), skin, 0, 1.08, 0).scale.set(1.35, 0.9, 1);
  mesh(body, new THREE.SphereGeometry(0.16, seg, 6), skin, 0, 0.05, 0).scale.set(1.5, 0.8, 1.1);
  // Neck and the head: a teardrop, eyes wide apart, three fins of crest.
  mesh(body, new THREE.CylinderGeometry(0.06, 0.08, 0.28, 6), skin, 0, 1.3, 0.02);
  const head = pivot(new THREE.Group());
  head.position.set(0, 1.44, 0);
  body.add(head);
  const skull = mesh(head, new THREE.SphereGeometry(0.2, seg, seg), skin, 0, 0.16, 0);
  skull.scale.set(0.85, 1.25, 1.0);
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.06, 8, 6);
    eye.userData.eye = true;
    mesh(head, eye, eyeMat, s * 0.11, 0.2, 0.14).scale.set(1, 1.4, 0.6);
  }
  for (let k = 0; k < 3; k++) {
    const fin = mesh(head, new THREE.ConeGeometry(0.035, 0.28, 4), skin, (k - 1) * 0.06, 0.42 + (1 - Math.abs(k - 1)) * 0.06, -0.06 - Math.abs(k - 1) * 0.04);
    fin.rotation.x = -0.5 - Math.abs(k - 1) * 0.3;
  }
  // Arms: long, three-jointed in spirit; two joints here. Legs: digitigrade, the knee back.
  const arms: THREE.Group[] = []; const fore: THREE.Group[] = []; const legs: THREE.Group[] = []; const shins: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const shoulder = pivot(new THREE.Group());
    shoulder.position.set(s * 0.3, 1.05, 0);
    body.add(shoulder);
    mesh(shoulder, new THREE.CapsuleGeometry(0.05, 0.5, 3, 6), skin, 0, -0.3, 0);
    const elbow = pivot(new THREE.Group());
    elbow.position.set(0, -0.6, 0);
    shoulder.add(elbow);
    mesh(elbow, new THREE.CapsuleGeometry(0.04, 0.5, 3, 6), skin, 0, -0.3, 0);
    for (let f = 0; f < 3; f++) mesh(elbow, new THREE.CapsuleGeometry(0.018, 0.14, 2, 4), skin, (f - 1) * 0.035, -0.66, 0.02 * (1 - Math.abs(f - 1)));
    arms.push(shoulder); fore.push(elbow);
    const hip = pivot(new THREE.Group());
    hip.position.set(s * 0.15, 0.02, 0);
    body.add(hip);
    mesh(hip, new THREE.CapsuleGeometry(0.07, 0.5, 3, 6), skin, 0, -0.3, 0.02);
    const knee = pivot(new THREE.Group());
    knee.position.set(0, -0.62, 0);
    hip.add(knee);
    mesh(knee, new THREE.CapsuleGeometry(0.05, 0.46, 3, 6), skin, 0, -0.28, 0);
    for (let f = 0; f < 3; f++) mesh(knee, new THREE.CapsuleGeometry(0.02, 0.16, 2, 4), skin, (f - 1) * 0.05, -0.54, 0.1).rotation.x = Math.PI / 2;
    legs.push(hip); shins.push(knee);
  }
  geoms.push(...mergeStatic(root, { isPivot: (o) => (o as THREE.Group).isGroup === true, minCaster: 0.03 }).geometries);
  return {
    root, body, head, arms: [arms[0], arms[1]], fore: [fore[0], fore[1]], legs: [legs[0], legs[1]], shins: [shins[0], shins[1]],
    slot: i, glow, ripple, x: 0, z: 0, yaw: 0, state: 'wander', timer: 1 + i, tx: 0, tz: 0, phase: i * 1.3, speed: 0,
    home: { x: 0, z: 0 }, nextChat: 10 + i * 4,
  };
}

export function makeAliens(opts: AlienOptions): AliensHandle {
  const group = new THREE.Group();
  group.name = 'villagers';
  const geoms: THREE.BufferGeometry[] = [];
  const skin = makeSkin();
  const { heightAt, village } = opts;
  const count = COUNT;
  const villagers: Villager[] = [];
  const colliders: Collider[] = [];
  let noticed = false;
  for (let i = 0; i < count; i++) {
    const v = buildVillager(i, opts.lite, geoms, skin.material, skin.glow[i], skin.ripple[i]);
    const a = (i / count) * Math.PI * 2 + 1.1;
    v.home = { x: village.x + Math.cos(a) * 8, z: village.z + Math.sin(a) * 8 };
    v.x = v.tx = v.home.x; v.z = v.tz = v.home.z;
    v.yaw = a + Math.PI;
    group.add(v.root);
    villagers.push(v);
    colliders.push({ x: v.x, z: v.z, r: 0.5 });
  }
  const telemetry: AlienTelemetry = { nearest: -1, phrase: '', phraseHold: 0, speaker: 0, greetings: 0, atStone: false, states: villagers.map((v) => v.state) };
  let phraseIdx = 0;
  let leader: Villager | null = null;
  let met = false;
  const say = (v: Villager, key?: string) => {
    telemetry.phrase = key ?? PHRASES[phraseIdx++ % PHRASES.length];
    telemetry.phraseHold = 5.5;
    telemetry.speaker = villagers.indexOf(v);
    v.ripple.value = 1;
    opts.onEvent('speak');
  };
  const greet = (v: Villager, key?: string) => {
    v.state = 'greet';
    v.timer = 2.6;
    say(v, key);
    opts.onEvent('greet');
  };
  const blocked = (x: number, z: number) => opts.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 0.4);

  const interactables: Interactable[] = villagers.map((v, i) => ({
    id: `villager${i}`, priority: 1,
    where: () => (met && v.state !== 'greet' && v.state !== 'notice' ? { x: v.x, z: v.z, r: POLITE_DISTANCE + 0.8 } : null),
    kind: () => 'tap', label: () => 'greet',
    use: () => {
      telemetry.greetings += 1;
      greet(v, telemetry.greetings === 1 ? 'friend' : telemetry.greetings >= GREETINGS_TO_LEAD && !telemetry.atStone ? 'stone' : undefined);
      // Everyone near answers, a beat apart.
      villagers.forEach((o, k) => { if (o !== v && o.state === 'follow') { o.ripple.value = 1; o.timer = 0.3 + k * 0.15; } });
      if (telemetry.greetings >= GREETINGS_TO_LEAD && !telemetry.atStone && !leader) { leader = v; }
    },
  }));

  const walkTo = (v: Villager, dt: number, x: number, z: number, stopAt: number, speed = WALK): boolean => {
    const dx = x - v.x; const dz = z - v.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    v.yaw += wrap(want - v.yaw) * (1 - Math.exp(-dt * 5));
    if (d <= stopAt) { v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8)); return true; }
    v.speed += (speed - v.speed) * (1 - Math.exp(-dt * 4));
    const nx = v.x + Math.sin(v.yaw) * v.speed * dt; const nz = v.z + Math.cos(v.yaw) * v.speed * dt;
    if (!blocked(nx, nz)) { v.x = nx; v.z = nz; } else { v.yaw += 0.6 * dt * 5; }
    return false;
  };
  const face = (v: Villager, dt: number, x: number, z: number) => {
    v.yaw += wrap(Math.atan2(x - v.x, z - v.z) - v.yaw) * (1 - Math.exp(-dt * 6));
  };

  const pose = (v: Villager, dt: number, t: number) => {
    const moving = v.speed > 0.15;
    v.phase += dt * (2.4 + v.speed * 2.2);
    const swing = moving ? Math.sin(v.phase) * Math.min(1, v.speed / WALK) * 0.55 : 0;
    const greeting = v.state === 'greet';
    const bow = greeting ? Math.sin(Math.min(1, (2.6 - v.timer) / 0.6) * Math.PI) * 0.4 : 0;
    // The body floats a little on the stride and leans into the bow.
    v.body.position.y = 1.15 + (moving ? Math.abs(Math.cos(v.phase)) * 0.05 : Math.sin(t * 1.3 + v.phase) * 0.015);
    v.body.rotation.x = bow * 0.9 + (moving ? 0.06 : 0);
    v.body.rotation.z = Math.sin(t * 0.9 + v.phase) * 0.02;
    v.head.rotation.x = -bow * 0.5 + Math.sin(t * 0.7 + v.phase) * 0.05;
    v.head.rotation.y = Math.sin(t * 0.45 + v.phase * 2) * 0.25;
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1;
      v.legs[s].rotation.x = swing * sign;
      v.shins[s].rotation.x = Math.max(0, -swing * sign) * 1.2 + 0.25;
      // Arms hang and swing against the legs; in a greeting they open wide and lift.
      v.arms[s].rotation.x = -swing * sign * 0.6 + (moving ? 0 : Math.sin(t * 1.1 + s) * 0.04);
      v.arms[s].rotation.z = sign * (0.12 + bow * 2.0);
      v.fore[s].rotation.x = -0.35 - bow * 0.8;
    }
    v.ripple.value = Math.max(0, v.ripple.value - dt * 0.7);
    const wantGlow = v.state === 'notice' ? 1.6 : greeting ? 1.4 : v.state === 'follow' || v.state === 'lead' ? 0.9 : 0.55;
    v.glow.value += (wantGlow - v.glow.value) * (1 - Math.exp(-dt * 3));
    skin.time[v.slot] = t + v.phase;
    v.root.position.set(v.x, heightAt(v.x, v.z), v.z);
    v.root.rotation.y = v.yaw;
  };

  return {
    group, telemetry, interactables, colliders,
    update(dt, t, crewX, crewZ, lights) {
      let nearest = 1e9;
      let bright: Villager | null = null;
      for (const v of villagers) {
        const d = Math.hypot(crewX - v.x, crewZ - v.z);
        nearest = Math.min(nearest, d);
        v.timer -= dt;
        switch (v.state) {
          case 'wander': {
            if (walkTo(v, dt, v.tx, v.tz, 0.6)) { v.state = 'wait'; v.timer = 2 + Math.random() * 4; }
            break;
          }
          case 'wait': {
            v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8));
            if (v.timer <= 0) {
              const a = Math.random() * Math.PI * 2; const r = Math.random() * village.r;
              v.tx = village.x + Math.cos(a) * r; v.tz = village.z + Math.sin(a) * r;
              v.state = 'wander';
            }
            break;
          }
          case 'notice': {
            v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8));
            face(v, dt, crewX, crewZ);
            if (v.timer <= 0) v.state = 'approach';
            break;
          }
          case 'approach': {
            if (d > LOSE_RANGE) { v.state = 'home'; break; }
            if (walkTo(v, dt, crewX, crewZ, POLITE_DISTANCE)) { met = true; greet(v, villagers.indexOf(v) === 0 ? 'hello' : undefined); }
            break;
          }
          case 'greet': {
            v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8));
            face(v, dt, crewX, crewZ);
            if (v.timer <= 0) v.state = leader === v ? 'lead' : 'follow';
            break;
          }
          case 'follow': {
            if (d > LOSE_RANGE) { v.state = 'home'; break; }
            if (leader === v) { v.state = 'lead'; break; }
            if (d > FOLLOW_MAX) walkTo(v, dt, crewX, crewZ, FOLLOW_MIN, d > 14 ? WALK * 1.6 : WALK);
            else { v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8)); face(v, dt, crewX, crewZ); }
            v.nextChat -= dt;
            if (v.nextChat <= 0) { v.nextChat = 18 + Math.random() * 20; if (telemetry.phraseHold <= 0) say(v); }
            break;
          }
          case 'lead': {
            // Walk toward the stone, but only while the crew keeps up.
            const stone = village.stone;
            const toStone = Math.hypot(stone.x - v.x, stone.z - v.z);
            const crewAtStone = Math.hypot(stone.x - crewX, stone.z - crewZ) < 6;
            if (d > 12 && !crewAtStone) { v.speed += (0 - v.speed) * (1 - Math.exp(-dt * 8)); face(v, dt, crewX, crewZ); }
            else walkTo(v, dt, stone.x, stone.z, 3.0, WALK * 0.9);
            if (toStone < 3.4 && crewAtStone && !telemetry.atStone) {
              telemetry.atStone = true;
              greet(v, 'gift');
              opts.onEvent('stone');
              leader = null;
            }
            break;
          }
          case 'home': {
            if (walkTo(v, dt, v.home.x, v.home.z, 1.0)) { v.state = 'wait'; v.timer = 3; }
            break;
          }
        }
        // Anyone at rest who sees a suit for the first time looks up.
        if ((v.state === 'wander' || v.state === 'wait' || v.state === 'home') && d < NOTICE_RANGE && (!met || d < 12)) {
          v.state = 'notice';
          v.timer = met ? 0.4 : 1.2 + Math.random() * 0.8;
          // Six of them look up on different frames: the banner and the bleep go once.
          if (!met && !noticed) { noticed = true; opts.onEvent('notice'); }
        }
        pose(v, dt, t);
        colliders[villagers.indexOf(v)].x = v.x;
        colliders[villagers.indexOf(v)].z = v.z;
        if (!bright || v.ripple.value > bright.ripple.value) bright = v;
      }
      telemetry.nearest = nearest < 1e8 ? nearest : -1;
      telemetry.phraseHold = Math.max(0, telemetry.phraseHold - dt);
      if (telemetry.phraseHold <= 0) telemetry.phrase = '';
      for (let i = 0; i < villagers.length; i++) telemetry.states[i] = villagers[i].state;
      if (bright && bright.ripple.value > 0.05) lights.request(bright.x, heightAt(bright.x, bright.z) + 1.6, bright.z, 0xffffff, 6 * bright.ripple.value, 9, 1.8);
    },
    dispose() {
      for (const g of geoms) g.dispose();
      skin.material.dispose();
    },
  };
}
