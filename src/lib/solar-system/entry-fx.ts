// What the air does to the ship on the way in, drawn round it in the
// surface scene, after the real thing (Orion, Starship, the Shuttle seen
// from its own windows): a thin shock layer standing just off the heat
// shield — white where the flow stops dead at the stagnation point, orange
// to rose round the shoulders, and brightest at its edge, where the camera
// looks through the most of a thin sheet — rolling off the rim into a
// tapered wake of ionised gas that streams back, flickers and cools to red;
// filaments of plasma peeling off the shoulder; sparks of ablator shed into
// the wake as short motion streaks; and, once the air is thick and the ship
// slow, the white of vapour: a cone round the hull at the speed of sound,
// and two contrails behind.
//
// Everything is additive or alpha over the scene, depth-tested and never
// depth-written, so the hull hides the part of the layer in front of it and
// only the rim shows round its silhouette, as it does in the footage. The
// strips (filaments, sparks, contrails) are billboarded in the vertex shader
// round their own axis, so they read as lines from any side. All of it is
// scaled by the numbers orbital-descent.ts puts out, and all of it is off
// (and costs one visibility test) when they are zero. The windward glow of
// the hull itself is moon-lander's `setHeat`.
//
// The group is set up in the flow's frame each frame: +Z along the velocity
// (the way the air comes from, seen from the ship), +Y the planet's up.

import * as THREE from 'three';

export interface EntryFxState {
  /** Where the ship is, local metres, and which way it is moving (any length). */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** The planet's radial at the ship. */
  up: THREE.Vector3;
  /** 0…1: plasma, glow, streaks and sparks. */
  heat: number;
  /** 0…1: contrails (thick air, subsonic). */
  vapour: number;
  /** 0…1: the vapour cone at the speed of sound. */
  transonic: number;
  /** The hull as the flow sees it, when known (m): its widest reach off the
   *  flow's axis, its half-widths along the flow frame's side (+X) and up
   *  (+Y), and how far its front stands ahead of `position`. */
  fit?: { radius: number; front: number; side: number; up: number } | null;
}

export interface EntryFx {
  group: THREE.Group;
  update: (dt: number, state: EntryFxState) => void;
  dispose: () => void;
}

/** The colour of the glow: the gas that is burning. */
export interface PlasmaPalette {
  /** The stagnation point at full heat, near white. */
  core: [number, number, number];
  /** The layer round the shoulders. */
  hot: [number, number, number];
  /** The wake as it cools. */
  wake: [number, number, number];
}

/** Air is nitrogen and oxygen: peach-white at the shield, orange, a rose
 *  wake. Mars is carbon dioxide: more amber, a redder tail. */
export const PLASMA: Record<'earth' | 'mars' | 'default', PlasmaPalette> = {
  earth: { core: [1.0, 0.86, 0.74], hot: [1.0, 0.42, 0.17], wake: [0.95, 0.26, 0.3] },
  mars: { core: [1.0, 0.84, 0.6], hot: [1.0, 0.5, 0.14], wake: [0.92, 0.3, 0.1] },
  default: { core: [1.0, 0.85, 0.7], hot: [1.0, 0.45, 0.16], wake: [0.95, 0.3, 0.2] },
};

const NOISE3 = /* glsl */ `
float eh(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
float en(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eh(i), eh(i + vec3(1, 0, 0)), f.x), mix(eh(i + vec3(0, 1, 0)), eh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(eh(i + vec3(0, 0, 1)), eh(i + vec3(1, 0, 1)), f.x), mix(eh(i + vec3(0, 1, 1)), eh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

// ── The shock layer: a cap over the windward side, thin-sheet shading. ──
const CAP_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vW = wp.xyz;
  vL = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const CAP_FRAG = /* glsl */ `
uniform vec3 uFlow;
uniform float uHeat;
uniform float uTime;
uniform vec3 uCore;
uniform vec3 uHot;
uniform float uGain;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
${NOISE3}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  // How square the flow meets the layer here: 1 at the stagnation point,
  // 0 round the shoulder, below that the sheet bending back into the wake.
  float stag = dot(n, uFlow);
  // A thin glowing sheet: seen edge-on the eye looks through far more of
  // it, so it is brightest along its own silhouette and next to nothing
  // seen face-on.
  float sheet = pow(1.0 - abs(dot(n, v)), 2.6);
  // Cells of turbulence boiling back over it.
  float turb = en(vL * 3.1 + vec3(0.0, 0.0, uTime * 5.0)) * 0.6 + en(vL * 7.3 + vec3(uTime * 3.0, 0.0, uTime * 9.0)) * 0.4;
  float flick = 0.72 + 0.5 * turb;
  float front = smoothstep(-0.05, 1.0, stag);
  // The face of the layer is the shield's own glow: seen from ahead it is
  // the brightest thing there is, but from behind the hull is in front of
  // it — and the cap is a little wider than the hull, so from behind only
  // its edge may show: the ring of fire round the silhouette.
  float ahead = smoothstep(-0.35, 0.55, dot(v, uFlow));
  float k = uHeat * (0.08 * ahead + 1.7 * ahead * front * front + 2.8 * sheet * smoothstep(-0.45, 0.3, stag)) * flick;
  // Gone at the open edge, where it becomes the wake.
  k *= smoothstep(-0.62, -0.25, stag);
  vec3 col = mix(uHot, uCore, clamp(front * front * (0.35 + 0.75 * uHeat), 0.0, 1.0));
  gl_FragColor = vec4(col * k * uGain, 1.0);
}`;

// ── The wake: a tapered tube trailing back, streaky and cooling. ──
const WAKE_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vW = wp.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const WAKE_FRAG = /* glsl */ `
uniform float uHeat;
uniform float uTime;
uniform vec3 uHot;
uniform vec3 uWake;
uniform float uGain;
uniform float uNear;
uniform vec3 uShip;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
${NOISE3}
void main() {
  // uv.x round the tube, uv.y 0 at the ship and 1 at the tail.
  float t = vUv.y;
  vec3 v = cameraPosition - vW;
  float dist = length(v);
  float facing = abs(dot(normalize(vN), v / max(dist, 1e-4)));
  // Streaks along the flow: fine round the tube, long along it, running back.
  float a = vUv.x * 6.2831853;
  vec3 q = vec3(cos(a) * 2.6, sin(a) * 2.6, t * 5.0 - uTime * 7.0);
  float s = en(q) * 0.65 + en(q * vec3(2.3, 2.3, 0.6) + 7.1) * 0.35;
  s = smoothstep(0.42, 0.95, s);
  float body = pow(1.0 - t, 2.2) * smoothstep(0.0, 0.05, t);
  // A volume of gas: brightest where the eye looks through the middle of it.
  float vol = 0.3 + 0.7 * pow(facing, 0.7);
  float k = uHeat * body * vol * (0.12 + 1.4 * s);
  // The chase camera rides inside the wake's reach: whatever is nearer the
  // lens than most of the way to the ship goes, so the trail never washes
  // over the glass.
  float ship = length(cameraPosition - uShip);
  k *= smoothstep(max(uNear * 0.35, ship * 0.45), max(uNear, ship * 0.85), dist);
  vec3 col = mix(uHot, uWake, smoothstep(0.0, 0.55, t));
  gl_FragColor = vec4(col * k * uGain, 1.0);
}`;

// ── Strips: filaments, sparks and contrails. A unit quad (x across −½…½,
// y along 0…1); the instance matrix holds the root (translation), the axis
// and length (column 2) and the half-width (length of column 0). ──
const STRIP_VERT = /* glsl */ `
attribute vec4 aSeed;
varying vec2 vUv;
varying vec4 vSeed;
varying vec3 vW;
void main() {
  vUv = uv;
  vSeed = aSeed;
  vec3 root = instanceMatrix[3].xyz;
  vec3 axis = instanceMatrix[2].xyz;
  float width = length(instanceMatrix[0].xyz);
  vec3 pl = root + axis * position.y;
  vec4 wp = modelMatrix * vec4(pl, 1.0);
  vec3 tw = mat3(modelMatrix) * axis;
  vec3 side = cross(tw, cameraPosition - wp.xyz);
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  // Taper toward the tail.
  wp.xyz += side * position.x * width * mix(1.0, 0.25, position.y);
  vW = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const STRIP_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAlpha;
uniform float uTime;
uniform float uNear;
uniform float uScroll;
uniform vec3 uShip;
varying vec2 vUv;
varying vec4 vSeed;
varying vec3 vW;
void main() {
  float along = vUv.y;
  float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float core = smoothstep(0.0, 0.85, across);
  // Knots of brightness running down the strip.
  float run = 0.6 + 0.4 * sin(along * (9.0 + vSeed.y * 7.0) - uTime * uScroll * (1.0 + vSeed.z) + vSeed.x * 6.28);
  float a = pow(1.0 - along, 1.4) * smoothstep(0.0, 0.04, along) * core * run * uAlpha * vSeed.w;
  // Nothing nearer the lens than most of the way to the ship: a strip
  // streaming back past the chase camera would cross the whole glass.
  float ship = length(cameraPosition - uShip);
  a *= smoothstep(max(uNear * 0.35, ship * 0.5), max(uNear, ship * 0.8), length(cameraPosition - vW));
  vec3 col = mix(uColor, uColor2, along);
  gl_FragColor = vec4(col * a, a);
}`;

/** How far round from the stagnation point the layer reaches, rad: past the
 *  shoulders, where it rolls off into the wake. */
const CAP_THETA = 1.95;

/**
 * `size` is the hull's radius, m (moon-lander's `hull`): everything is
 * scaled from it so the kestrel and the cruiser both wear the same fire.
 */
export function makeEntryFx(size: number, lite: boolean, palette: PlasmaPalette = PLASMA.default): EntryFx {
  const group = new THREE.Group();
  group.name = 'entry-fx';
  group.visible = false;
  const geoms: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const c3 = (c: [number, number, number]) => new THREE.Color(c[0], c[1], c[2]);
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

  // ── The shock layer: a cap, pole along +Z, reaching back past the
  // shoulders (110°), flattened along the flow and standing a little off
  // the hull, the way a blunt body's shock hugs it. ──
  const capGeom = new THREE.SphereGeometry(1, lite ? 24 : 40, lite ? 12 : 20, 0, Math.PI * 2, 0, CAP_THETA);
  capGeom.rotateX(Math.PI / 2);
  geoms.push(capGeom);
  const capMat = new THREE.ShaderMaterial({
    name: 'entry-shock', vertexShader: CAP_VERT, fragmentShader: CAP_FRAG,
    uniforms: {
      uFlow: { value: new THREE.Vector3(0, 0, 1) }, uHeat: { value: 0 }, uTime: { value: 0 }, uGain: { value: 2.1 },
      uCore: { value: c3(palette.core) }, uHot: { value: c3(palette.hot) },
    },
    ...additive, side: THREE.DoubleSide,
  });
  mats.push(capMat);
  const cap = new THREE.Mesh(capGeom, capMat);
  cap.renderOrder = 12;
  cap.frustumCulled = false;
  group.add(cap);

  // ── The wake: an open tube from the rim of the layer, narrowing back. ──
  const wakeGeom = new THREE.CylinderGeometry(1, 0.06, 1, lite ? 18 : 28, lite ? 8 : 14, true);
  // Top (radius 1) at z = 0, the tail at z = −1; uv.y 0 at the top.
  wakeGeom.translate(0, -0.5, 0);
  wakeGeom.rotateX(Math.PI / 2);
  {
    const uv = wakeGeom.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  geoms.push(wakeGeom);
  const wakeMat = new THREE.ShaderMaterial({
    name: 'entry-wake', vertexShader: WAKE_VERT, fragmentShader: WAKE_FRAG,
    uniforms: {
      uHeat: { value: 0 }, uTime: { value: 0 }, uGain: { value: 0.85 }, uNear: { value: size * 2.5 }, uShip: { value: new THREE.Vector3() },
      uHot: { value: c3(palette.hot) }, uWake: { value: c3(palette.wake) },
    },
    ...additive, side: THREE.DoubleSide,
  });
  mats.push(wakeMat);
  const wake = new THREE.Mesh(wakeGeom, wakeMat);
  wake.renderOrder = 11;
  wake.frustumCulled = false;
  group.add(wake);

  // ── Strips. ──
  const quad = new THREE.PlaneGeometry(1, 1, 1, lite ? 4 : 8);
  quad.translate(0, 0.5, 0);
  geoms.push(quad);
  /** Where the ship is, shared by every strip material's near fade. */
  const shipAt = new THREE.Vector3();
  const stripMaterial = (name: string, a: [number, number, number], b: [number, number, number], scroll: number, blend: THREE.Blending, near: number) => {
    const m = new THREE.ShaderMaterial({
      name, vertexShader: STRIP_VERT, fragmentShader: STRIP_FRAG,
      uniforms: {
        uColor: { value: c3(a) }, uColor2: { value: c3(b) }, uAlpha: { value: 0 }, uTime: { value: 0 },
        uNear: { value: near }, uScroll: { value: scroll }, uShip: { value: shipAt },
      },
      transparent: true, depthWrite: false, blending: blend, side: THREE.DoubleSide,
    });
    mats.push(m);
    return m;
  };
  const strips = (count: number, mat: THREE.ShaderMaterial, order: number) => {
    const g = quad.clone();
    const seed = new Float32Array(count * 4);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geoms.push(g);
    const mesh = new THREE.InstancedMesh(g, mat, count);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return { mesh, seed: g.getAttribute('aSeed') as THREE.InstancedBufferAttribute };
  };
  const hot2: [number, number, number] = [palette.hot[0] * 1.6, palette.hot[1] * 1.4, palette.hot[2] * 1.3];

  // Filaments peeling off the shoulder and streaming back.
  const FILAMENTS = lite ? 10 : 18;
  const filMat = stripMaterial('entry-filaments', hot2, palette.wake, 26, THREE.AdditiveBlending, size * 2.4);
  filMat.uniforms.uColor.value.multiplyScalar(1.5);
  const fil = strips(FILAMENTS, filMat, 13);
  const filSeed = Array.from({ length: FILAMENTS }, (_, i) => ({
    a: (i / FILAMENTS) * Math.PI * 2 + ((i * 7) % 5) * 0.13,
    r: 0.92 + ((i * 37) % 11) / 60,
    len: 0.55 + ((i * 53) % 13) / 16,
    f: 3 + ((i * 29) % 19) / 3,
  }));
  for (let i = 0; i < FILAMENTS; i++) fil.seed.setXYZW(i, (i * 0.618) % 1, ((i * 37) % 11) / 11, ((i * 13) % 7) / 7, 0.55 + ((i * 17) % 9) / 20);

  // Sparks: bits of the shield shed into the wake, drawn as motion streaks.
  const SPARKS = lite ? 36 : 90;
  const sparkMat = stripMaterial('entry-sparks', [2.2, 1.0, 0.36], [1.4, 0.3, 0.06], 0, THREE.AdditiveBlending, size * 1.6);
  const sp = strips(SPARKS, sparkMat, 14);
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkLife0 = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) sp.seed.setXYZW(i, 0, 0, 0, 0);

  // Contrails: two long white trails, alpha over the scene.
  const trailMat = stripMaterial('entry-contrails', [0.95, 0.97, 1.0], [0.9, 0.92, 0.95], 0, THREE.NormalBlending, size * 3);
  const trails = strips(2, trailMat, 10);
  for (let i = 0; i < 2; i++) trails.seed.setXYZW(i, i * 0.5, 0, 0, 1);

  // The vapour cone at the speed of sound.
  const coneGeom = new THREE.ConeGeometry(1, 1, lite ? 20 : 28, 1, true);
  coneGeom.rotateX(Math.PI / 2);
  coneGeom.translate(0, 0, -0.5);
  geoms.push(coneGeom);
  const coneMat = new THREE.ShaderMaterial({
    name: 'entry-vapour-cone',
    vertexShader: CAP_VERT,
    fragmentShader: /* glsl */ `
      uniform float uK;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vL;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1.0 - abs(dot(normalize(vN), v)), 1.5);
        // Thins toward its open end.
        float fade = smoothstep(-1.0, -0.35, vL.z);
        gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), uK * (0.12 + 0.5 * rim) * fade);
      }`,
    uniforms: { uK: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  mats.push(coneMat);
  const cone = new THREE.Mesh(coneGeom, coneMat);
  cone.scale.set(size * 1.7, size * 1.7, size * 1.6);
  cone.position.z = size * 0.2;
  cone.renderOrder = 10;
  cone.frustumCulled = false;
  group.add(cone);

  let sparkAcc = 0;
  let nextSpark = 0;
  /** A small deterministic noise, so two runs of the same entry look alike. */
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const m = new THREE.Matrix4();
  const flow = new THREE.Vector3();
  const upOrtho = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const root = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const cx = new THREE.Vector3();
  const cy = new THREE.Vector3();
  /** A strip's matrix: root, axis (with its length), half-width. */
  const strip = (mesh: THREE.InstancedMesh, i: number, r: THREE.Vector3, ax: THREE.Vector3, width: number) => {
    // Any two vectors of the right lengths will do for the unused columns.
    cx.set(width, 0, 0);
    cy.set(0, 1, 0);
    m.set(
      cx.x, cy.x, ax.x, r.x,
      cx.y, cy.y, ax.y, r.y,
      cx.z, cy.z, ax.z, r.z,
      0, 0, 0, 1,
    );
    mesh.setMatrixAt(i, m);
  };
  let time = 0;
  let live = 0;

  const update = (dt: number, st: EntryFxState) => {
    time += dt;
    const heat = THREE.MathUtils.clamp(st.heat, 0, 1);
    const vapour = THREE.MathUtils.clamp(st.vapour, 0, 1);
    const trans = THREE.MathUtils.clamp(st.transonic, 0, 1);
    const on = heat > 0.01 || vapour > 0.01 || trans > 0.01 || live > 0;
    group.visible = on;
    if (!on) return;
    // The flow's frame: +Z the way the ship is going, +Y the planet's up
    // (square to it), +X to the side.
    flow.copy(st.velocity);
    if (flow.lengthSq() < 1e-8) flow.set(0, 0, -1);
    flow.normalize();
    upOrtho.copy(st.up).addScaledVector(flow, -st.up.dot(flow));
    if (upOrtho.lengthSq() < 1e-6) upOrtho.set(0, 1, 0).addScaledVector(flow, -flow.y);
    upOrtho.normalize();
    side.crossVectors(upOrtho, flow).normalize();
    basis.makeBasis(side, upOrtho, flow);
    group.position.copy(st.position);
    group.quaternion.setFromRotationMatrix(basis);

    // ── The layer: tighter and brighter as the heating climbs. ──
    const glowing = heat > 0.01;
    cap.visible = glowing;
    wake.visible = glowing;
    const breathe = 1 + 0.025 * Math.sin(time * 31) + 0.015 * Math.sin(time * 47);
    capMat.uniforms.uHeat.value = heat;
    capMat.uniforms.uTime.value = time;
    // uFlow is in the world frame: the shader lights the side facing it.
    (capMat.uniforms.uFlow.value as THREE.Vector3).copy(flow);
    // Fitted to the hull as the flow sees it when the model is in: a hair
    // wider than its widest reach, standing a little off its front.
    const reach = st.fit ? Math.max(size * 0.3, st.fit.radius) : size;
    const front = st.fit ? st.fit.front : size * 0.8;
    const grow = (1.04 + 0.05 * heat) * breathe;
    const rCap = reach * grow;
    // An ellipse round the hull's own outline as the flow sees it: a ring
    // of fire that hugs the silhouette rather than a bubble round it.
    const rx = (st.fit ? Math.max(size * 0.3, st.fit.side) : reach) * grow;
    const ry = (st.fit ? Math.max(size * 0.3, st.fit.up) : reach) * grow;
    const depth = rCap * (0.5 + 0.08 * heat);
    cap.scale.set(rx, ry, depth);
    cap.position.z = front + rCap * 0.08 - depth;
    // ── The wake, from the rim back; longer at the peak. ──
    wakeMat.uniforms.uHeat.value = heat;
    wakeMat.uniforms.uTime.value = time;
    const rimZ = cap.position.z + Math.cos(CAP_THETA) * cap.scale.z;
    const rimR = Math.sin(CAP_THETA) * rCap;
    const rimX = Math.sin(CAP_THETA) * rx;
    const rimY = Math.sin(CAP_THETA) * ry;
    wake.position.z = rimZ;
    wake.scale.set(rimX * 0.85, rimY * 0.85, size * (4 + 8 * heat));
    (wakeMat.uniforms.uShip.value as THREE.Vector3).copy(st.position);
    shipAt.copy(st.position);

    // ── Filaments off the shoulder. ──
    fil.mesh.visible = heat > 0.04;
    filMat.uniforms.uAlpha.value = Math.min(1, heat * 1.3);
    filMat.uniforms.uTime.value = time;
    if (fil.mesh.visible) {
      for (let i = 0; i < FILAMENTS; i++) {
        const sd = filSeed[i];
        const wob = 0.06 * Math.sin(time * sd.f + i * 1.7);
        const a = sd.a + wob;
        root.set(Math.cos(a) * rimX * sd.r, Math.sin(a) * rimY * sd.r, rimZ + rimR * 0.05);
        const len = rimR * (1.8 + 4.5 * heat) * sd.len * (0.85 + 0.15 * Math.sin(time * sd.f * 1.3 + i));
        // Back along the flow and in toward the wake's axis, closing on it
        // about where the strip ends: the layer peeling off the shoulders.
        axis.set(-root.x * 0.85, -root.y * 0.85, -len).normalize().multiplyScalar(len);
        strip(fil.mesh, i, root, axis, size * (0.04 + 0.04 * heat));
      }
      fil.mesh.instanceMatrix.needsUpdate = true;
    }

    // ── Sparks: born on the windward face, blown back past the hull. ──
    sparkAcc += dt * heat * heat * (lite ? 70 : 180);
    while (sparkAcc >= 1) {
      sparkAcc -= 1;
      const i = nextSpark;
      nextSpark = (nextSpark + 1) % SPARKS;
      const a = rnd() * Math.PI * 2; const r = 0.6 + 0.45 * rnd();
      sparkPos[i * 3] = Math.cos(a) * r * rimX;
      sparkPos[i * 3 + 1] = Math.sin(a) * r * rimY;
      sparkPos[i * 3 + 2] = rimZ + size * 0.2 * rnd();
      // Mostly straight back: the air takes them at the speed it passes.
      sparkVel[i * 3] = Math.cos(a) * size * (0.1 + 0.35 * rnd());
      sparkVel[i * 3 + 1] = Math.sin(a) * size * (0.1 + 0.3 * rnd());
      sparkVel[i * 3 + 2] = -size * (10 + 16 * rnd());
      sparkLife[i] = sparkLife0[i] = 0.3 + 0.5 * rnd();
    }
    live = 0;
    for (let i = 0; i < SPARKS; i++) {
      if (sparkLife[i] <= 0) { if (sp.seed.getW(i) !== 0) { sp.seed.setW(i, 0); sp.seed.needsUpdate = true; } continue; }
      live++;
      sparkLife[i] -= dt;
      const k = i * 3;
      sparkPos[k] += sparkVel[k] * dt;
      sparkPos[k + 1] += sparkVel[k + 1] * dt;
      sparkPos[k + 2] += sparkVel[k + 2] * dt;
      root.set(sparkPos[k], sparkPos[k + 1], sparkPos[k + 2]);
      // A streak as long as the spark moves in a thirtieth of a second.
      axis.set(-sparkVel[k], -sparkVel[k + 1], -sparkVel[k + 2]).multiplyScalar(1 / 60);
      strip(sp.mesh, i, root, axis, size * 0.02);
      const fade = THREE.MathUtils.clamp(sparkLife[i] / Math.max(0.05, sparkLife0[i]), 0, 1);
      sp.seed.setW(i, Math.max(0.001, fade));
      sp.seed.needsUpdate = true;
    }
    sp.mesh.visible = live > 0;
    if (live > 0) {
      sparkMat.uniforms.uAlpha.value = 1;
      sp.mesh.instanceMatrix.needsUpdate = true;
    }

    // ── The vapour. ──
    trails.mesh.visible = vapour > 0.01;
    trailMat.uniforms.uAlpha.value = vapour * 0.5;
    if (trails.mesh.visible) {
      for (let i = 0; i < 2; i++) {
        root.set((i === 0 ? -1 : 1) * size * 0.9, -size * 0.1, -size * 0.6);
        axis.set(0, 0, -size * 38 * (0.6 + 0.4 * vapour));
        strip(trails.mesh, i, root, axis, size * 0.16);
      }
      trails.mesh.instanceMatrix.needsUpdate = true;
    }
    cone.visible = trans > 0.01;
    coneMat.uniforms.uK.value = trans * (0.75 + 0.25 * Math.sin(time * 13));
  };

  return {
    group,
    update,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const mt of mats) mt.dispose();
      for (const o of [fil.mesh, sp.mesh, trails.mesh]) o.dispose();
    },
  };
}
