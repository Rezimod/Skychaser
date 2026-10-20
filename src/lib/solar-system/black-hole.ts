// Gargantua — a supermassive black hole after the one in Interstellar, with
// the three worlds the Endurance crew visited and the Endurance itself in
// orbit. The hole is not a sprite: a ray-marched impostor bends every view
// ray around the mass (the Schwarzschild photon equation, integrated per
// pixel), so the far side of the accretion disc arcs over and under the
// shadow, a photon ring hugs its edge, and starlight behind it is smeared
// into an Einstein ring. It writes depth where a ray meets the disc or the
// horizon, so planets and ships pass correctly in front of it and behind it.

import * as THREE from 'three';
import { disposeAtmosphereShell, makeAtmosphereShell } from '@/lib/solar-system/scene-extras';
import { bandedTexture, crateredTexture, sceneRadius } from '@/lib/solar-system/small-bodies';
import { buildEndurance } from '@/lib/solar-system/ship-mesh';
import type { FlightAnchor, FlightBody } from '@/lib/solar-system/player-ship';
import type { StarSystemHandle } from '@/lib/solar-system/star-systems';

const R_EARTH_KM = 6371;
/** Horizon radius in scene units — and the unit the shader works in. */
const RS = 0.4;
/** A hundred million Suns: a horizon about two AU across. */
const RS_KM = 2.95e8;
/** Accretion disc, in horizon radii. */
const DISC_IN = 2.6;
const DISC_OUT = 11;
/** The impostor sphere, in horizon radii: past it light runs straight. */
const BOUND = 16;
const ENDURANCE_H = 0.0025;
const STATION_ORBIT = 0.16;
const STATION_DOWN_SEC = 90;

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform vec3 uCenter;
uniform mat3 uToDisc;
uniform mat3 uFromDisc;
uniform mat4 uViewProj;
uniform float uRs;
uniform float uTime;
uniform float uIn;
uniform float uOut;
uniform float uBound;
varying vec3 vWorld;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}

// Emission (premultiplied) and opacity where a ray crosses the disc plane.
vec4 disc(vec3 p, vec3 dir) {
  float r = length(p.xz);
  float edge = smoothstep(uIn, uIn + 0.5, r) * (1.0 - smoothstep(uOut * 0.5, uOut, r));
  if (edge <= 0.0) return vec4(0.0);
  // Gas shears Keplerian-fast near the hole: the pattern trails with radius.
  float ang = atan(p.z, p.x) - uTime * 1.4 / (r * sqrt(r));
  vec2 ring = vec2(cos(ang), sin(ang));
  float lanes = fbm(vec3(r * 4.5, ring * 2.2));
  float clumps = fbm(vec3(ring * r * 1.6, r * 0.6 + 3.1));
  float density = edge * (0.35 + 0.8 * lanes) * (0.65 + 0.55 * clumps);
  float temp = pow(uIn / r, 1.2);
  vec3 col = mix(vec3(0.5, 0.2, 0.06), vec3(1.0, 0.6, 0.26), smoothstep(0.08, 0.45, temp));
  col = mix(col, vec3(1.0, 0.92, 0.8), smoothstep(0.45, 1.0, temp));
  // A little Doppler beaming: the side turning toward the eye runs brighter.
  vec3 v = normalize(vec3(-p.z, 0.0, p.x)) * sqrt(0.5 / max(r - 1.0, 0.5));
  float beam = mix(1.0, pow(clamp(1.0 + dot(v, -dir), 0.4, 1.8), 2.0), 0.35);
  float redshift = sqrt(clamp(1.0 - 1.0 / r, 0.0, 1.0));
  float intensity = (0.22 + 2.1 * temp * temp) * beam * redshift;
  float alpha = clamp(density * 1.2, 0.0, 1.0);
  return vec4(col * intensity * alpha, alpha);
}

void main() {
  vec3 ro = uToDisc * (cameraPosition - uCenter) / uRs;
  vec3 rd = normalize(uToDisc * (vWorld - cameraPosition));
  float c = dot(ro, ro) - uBound * uBound;
  if (c > 0.0) {
    float b = dot(ro, rd);
    float h = b * b - c;
    if (h < 0.0) discard;
    float t = -b - sqrt(h);
    if (t < 0.0) discard;
    ro += rd * t;
  }
  vec3 pos = ro;
  vec3 vel = rd;
  vec3 L = cross(pos, vel);
  float h2 = dot(L, L);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  bool hit = false;
  vec3 hitPos = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(pos, pos);
    if (r2 < 1.0) {
      if (!hit) { hit = true; hitPos = pos; }
      alpha = 1.0;
      break;
    }
    float r = sqrt(r2);
    float dt = max(0.02, 0.07 * (r - 0.9));
    vec3 prev = pos;
    // Photon path around a Schwarzschild mass, horizon radius 1.
    vel += -1.5 * h2 * pos / (r2 * r2 * r) * dt;
    pos += vel * dt;
    if (prev.y * pos.y < 0.0) {
      vec3 p = mix(prev, pos, prev.y / (prev.y - pos.y));
      vec4 d = disc(p, normalize(vel));
      if (d.a > 0.01) {
        col += d.rgb * (1.0 - alpha);
        if (!hit && d.a > 0.3) { hit = true; hitPos = p; }
        alpha += d.a * (1.0 - alpha);
        if (alpha > 0.98) break;
      }
    }
    if (r2 > uBound * uBound * 1.02 && dot(pos, vel) > 0.0) break;
  }
  if (alpha < 1.0) {
    // Starlight that skimmed the hole: only where the bend is strong, so
    // straight-through sky is left to the real starfield behind.
    vec3 sd = normalize(vel);
    float bend = smoothstep(0.03, 0.5, 1.0 - dot(sd, rd));
    float s = hash(floor(sd * 380.0));
    col += (1.0 - alpha) * bend * vec3(1.0, 0.95, 0.88) * step(0.992, s) * (s - 0.992) * 160.0;
  }
  float depth = 1.0;
  if (hit) {
    vec4 clip = uViewProj * vec4(uFromDisc * (hitPos * uRs) + uCenter, 1.0);
    depth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  }
  gl_FragDepth = depth;
  gl_FragColor = vec4(col, alpha);
}`;

interface Orbiter {
  mesh: THREE.Mesh;
  body: FlightBody;
  orbit: number;
  rate: number;
  angle: number;
}

export function makeGargantua(lite: boolean): StarSystemHandle {
  const group = new THREE.Group();
  group.name = 'gargantua';
  const center = new THREE.Vector3(52, 16, 58);
  group.position.copy(center);
  // The disc plane, tipped so an arriving ship sees it just off edge-on.
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.6, 0.18));
  const frame = new THREE.Group();
  frame.quaternion.copy(tilt);
  group.add(frame);

  const geoms: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const shells: THREE.Mesh[] = [];
  const bodies: FlightBody[] = [];
  const tmp = new THREE.Vector3();

  const viewProj = new THREE.Matrix4();
  const holeMat = new THREE.ShaderMaterial({
    uniforms: {
      uCenter: { value: center },
      uToDisc: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(tilt.clone().invert())) },
      uFromDisc: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(tilt)) },
      uViewProj: { value: viewProj },
      uRs: { value: RS },
      uTime: { value: 0 },
      uIn: { value: DISC_IN },
      uOut: { value: DISC_OUT },
      uBound: { value: BOUND },
    },
    defines: { STEPS: lite ? 80 : 150 },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  owned.push(holeMat);
  const holeGeom = new THREE.SphereGeometry(RS * BOUND, 48, 24);
  geoms.push(holeGeom);
  const hole = new THREE.Mesh(holeGeom, holeMat);
  // Drawn first among the see-through layers, straight after every opaque world.
  hole.renderOrder = -1;
  hole.onBeforeRender = (_r, _s, camera) => {
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  };
  group.add(hole);
  bodies.push({ id: 'gargantua', kind: 'blackhole', position: center.clone(), radius: RS, radiusKm: RS_KM, surfaceG: 30, atmosphere: 3.2 });

  // The disc lights its worlds: warm, and strong enough to read at their distance.
  const discLight = new THREE.PointLight(0xffc48a, 20, 40, 1.1);
  group.add(discLight);

  const segs = lite ? 40 : 64;
  const orbiters: Orbiter[] = [];
  const addWorld = (
    id: string, radiusKm: number, surfaceG: number, atmosphere: number,
    material: THREE.MeshStandardMaterial, glow: number, orbit: number, rate: number, angle: number,
  ) => {
    const r = sceneRadius(radiusKm);
    const geom = new THREE.SphereGeometry(r, segs, segs);
    geoms.push(geom);
    const mesh = new THREE.Mesh(geom, material);
    frame.add(mesh);
    const shell = makeAtmosphereShell(r, glow, 1.06, 1.1, 2.4);
    mesh.add(shell);
    shells.push(shell);
    owned.push(material);
    const body: FlightBody = { id, kind: 'planet', position: new THREE.Vector3(), radius: r, radiusKm, surfaceG, atmosphere };
    bodies.push(body);
    orbiters.push({ mesh, body, orbit, rate, angle });
  };

  // Miller's planet: a shallow ocean world so close to the hole that its
  // tides stand up as mountains of water.
  const texMiller = bandedTexture(211, [[58, 86, 104], [74, 104, 122], [96, 124, 138], [50, 76, 94]]);
  // Mann's planet: frozen clouds over an ice crust.
  const texMann = crateredTexture(223, [214, 220, 228], 28);
  // Edmunds' planet: dry, rust-coloured, a thin breathable air.
  const texEdmunds = crateredTexture(239, [176, 128, 90], 50);
  textures.push(texMiller, texMann, texEdmunds);
  // The orbits turn, but slowly: a world's speed along its track is kept
  // under a third of the cruise ceiling, so a ship that has dropped to
  // cruise in its well can still run it down and hold station.
  addWorld('millersPlanet', 1.1 * R_EARTH_KM, 12.7, 1.15,
    new THREE.MeshStandardMaterial({ map: texMiller, roughness: 0.35, metalness: 0.1 }), 0x9ec3d6, 5.6, 0.0002, 2.2);
  addWorld('mannsPlanet', 0.9 * R_EARTH_KM, 8, 1.1,
    new THREE.MeshStandardMaterial({ map: texMann, bumpMap: texMann, bumpScale: 0.002, roughness: 0.85, metalness: 0.02 }), 0xdfe8f0, 8.4, 0.00013, 4.1);
  addWorld('edmundsPlanet', 1.05 * R_EARTH_KM, 9.2, 1.2,
    new THREE.MeshStandardMaterial({ map: texEdmunds, bumpMap: texEdmunds, bumpScale: 0.003, roughness: 0.95, metalness: 0.02 }), 0xe8b27a, 11.8, 0.00009, 0.9);

  // The Endurance, holding a high orbit over Miller's planet, ring turning.
  const endurance = buildEndurance(ENDURANCE_H);
  const lamps: THREE.Object3D[] = [];
  endurance.group.traverse((o) => { if (o instanceof THREE.Light) lamps.push(o); });
  for (const lamp of lamps) lamp.removeFromParent();
  if (endurance.plumeMat) endurance.plumeMat.opacity = 0;
  for (const m of endurance.glowMats) m.opacity = 0.2;
  frame.add(endurance.group);
  const station: FlightBody = {
    id: 'endurance', kind: 'station', position: new THREE.Vector3(),
    radius: 4.6 * ENDURANCE_H, radiusKm: 0.064, surfaceG: 0, atmosphere: 1,
  };
  bodies.push(station);
  let stationDown = 0;

  // Drop out thirty horizon radii off the hole, a few degrees above the
  // disc, nose on the shadow — the view the film made famous.
  const el = 0.16;
  const az = -0.5;
  const arrival: FlightAnchor = {
    position: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
      .multiplyScalar(30 * RS).applyQuaternion(tilt).add(center),
    lookAt: center.clone(),
    yaw: 0,
  };

  let clock = 0;
  return {
    group,
    center,
    bodies,
    arrival,
    update(dtSec) {
      clock += dtSec;
      holeMat.uniforms.uTime.value = clock;
      group.updateMatrixWorld(true);
      for (const o of orbiters) {
        o.angle += dtSec * o.rate;
        o.mesh.position.set(Math.cos(o.angle) * o.orbit, 0, Math.sin(o.angle) * o.orbit);
        o.mesh.rotation.y += dtSec * 0.05;
        o.mesh.visible = !o.body.destroyed;
        frame.localToWorld(o.body.position.copy(o.mesh.position));
      }
      // A rammed or shot-down Endurance is gone for a while, then back on station.
      if (station.destroyed) {
        stationDown += dtSec;
        if (stationDown > STATION_DOWN_SEC) {
          station.destroyed = false;
          station.hp = undefined;
          stationDown = 0;
        }
      }
      endurance.group.visible = !station.destroyed;
      // The station idles round Miller's planet slowly enough to be docked with.
      const m = orbiters[0].mesh.position;
      const a = clock * 0.004;
      endurance.group.position.set(m.x + Math.cos(a) * STATION_ORBIT, m.y + Math.sin(a) * STATION_ORBIT * 0.25, m.z + Math.sin(a) * STATION_ORBIT);
      frame.localToWorld(station.position.copy(endurance.group.position));
      frame.localToWorld(tmp.set(
        m.x + Math.cos(a + 0.05) * STATION_ORBIT, m.y + Math.sin(a + 0.05) * STATION_ORBIT * 0.25, m.z + Math.sin(a + 0.05) * STATION_ORBIT,
      ));
      endurance.group.lookAt(tmp);
      if (endurance.spinner) endurance.spinner.rotation.z += dtSec * 0.5;
      endurance.strobeMat.color.setScalar(clock % 1.4 < 0.07 ? 2.4 : 0.05);
    },
    dispose() {
      discLight.dispose();
      for (const s of shells) disposeAtmosphereShell(s);
      for (const g of geoms) g.dispose();
      for (const m of owned) m.dispose();
      for (const t of textures) t.dispose();
      const shipGeoms = new Set<THREE.BufferGeometry>();
      endurance.group.traverse((o) => { if (o instanceof THREE.Mesh) shipGeoms.add(o.geometry); });
      for (const g of shipGeoms) g.dispose();
      for (const m of endurance.owned) m.dispose();
      for (const m of endurance.glowMats) m.dispose();
      for (const j of endurance.rcs) j.mat.dispose();
      endurance.plasmaMat.dispose();
    },
  };
}
