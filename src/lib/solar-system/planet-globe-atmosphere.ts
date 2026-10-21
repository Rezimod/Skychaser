// The air round the globe, two ways.
//
// From space it is a shell: a sphere at the top of the atmosphere whose
// back faces are drawn additively where no ground was drawn, each pixel
// marching its ray through Rayleigh and Mie layers lit by the sun (single
// scattering). That is the limb, blue over Earth with the sunset reddening
// at the terminator, thin butterscotch over Mars with a faint blue edge.
// Where the ray meets the ground the shell adds nothing: the ground shader
// does that part itself as aerial perspective, because only it can dim what
// is behind the air as well as add the air's own light.
//
// On the ground the haze is an optical depth along the view ray through two
// exponential layers (the air and a thinner, low haze), in the colour the
// surface scene's own haze uses, so that where the globe meets the surface
// scene at the horizon the two are the same colour. The Moon has none.
//
// Levels are linear HDR, a little over 1 at most, for ACES and the post chain.

import * as THREE from 'three';
import type { GlobeWorld, PlanetBody } from '@/lib/solar-system/planet-frame';
import { MARS } from '@/lib/solar-system/world-profiles';

type RGB = [number, number, number];

export interface GlobeAir {
  /** Two Rayleigh-phase layers (scattering per km at the datum, scale height km).
   *  Layer A may also absorb: Mars's dust eats blue, which is what keeps its
   *  limb butterscotch where a thick, purely scattering haze would go white. */
  layerA: { beta: RGB; h: number; absorb?: RGB };
  layerB: { beta: RGB; h: number };
  /** The Mie layer: per km, scale height km, asymmetry, tint. */
  mie: { beta: number; h: number; g: number; tint: RGB };
  /** How bright the scattered sunlight is in the shell. */
  sunIntensity: number;
  /** Ground aerial perspective: the air (per km, rgb) and the low haze (per km, grey). */
  airBeta: RGB;
  airH: number;
  hazeBeta: number;
  hazeH: number;
  /** The haze colour by day, toward the sun, and the tint it takes at the terminator. */
  hazeColor: RGB;
  hazeSun: RGB;
  twilight: RGB;
  /** The shell's own sky (rays that miss the ground) fades out below
   *  `skyFade[0]` km, where the surface scene's sky dome has taken over,
   *  and is whole above `skyFade[1]`. */
  skyFade: [number, number];
}

export const GLOBE_AIR: Record<GlobeWorld, GlobeAir | null> = {
  moon: null,
  mars: {
    // Dust, not gas: the scattering is warm, from the ground to about 40 km.
    layerA: { beta: [0.03, 0.02, 0.013], h: 11, absorb: [0.003, 0.014, 0.034] },
    // High, thin, blue: what shows as the blue band on the limb in orbital photos.
    layerB: { beta: [0.0006, 0.0014, 0.0034], h: 24 },
    mie: { beta: 0.006, h: 11, g: 0.86, tint: [0.3, 0.55, 1.0] },
    sunIntensity: 7,
    airBeta: [0.012, 0.008, 0.005],
    airH: 11,
    // The surface scene's Koschmieder β (1.3e-3 per m) at the ground, falling
    // off fast, so the column from orbit is the half an optical depth Mars
    // usually shows, while a horizontal look from the surface matches the scene.
    hazeBeta: MARS.atmosphere.hazeBeta * 1000,
    hazeH: 0.25,
    hazeColor: MARS.atmosphere.hazeColor,
    hazeSun: MARS.atmosphere.hazeSun,
    twilight: [0.45, 0.55, 0.8],
    skyFade: [10, 30],
  },
  earth: {
    layerA: { beta: [5.8e-3, 13.5e-3, 33.1e-3], h: 8 },
    layerB: { beta: [0, 0, 0], h: 8 },
    mie: { beta: 0.01, h: 1.2, g: 0.76, tint: [1, 1, 1] },
    sunIntensity: 11,
    // The ground's share of the Rayleigh column, thinned: a haze model
    // with one colour saturates faster than the real spectrum does, and at
    // full strength the day side from orbit reads as fog. Where it counts,
    // at the horizon, the colour is the saturated one either way.
    airBeta: [3.5e-3, 8.1e-3, 19.9e-3],
    airH: 8,
    hazeBeta: 0.13,
    hazeH: 1.2,
    hazeColor: [0.55, 0.68, 0.85],
    hazeSun: [1.0, 0.9, 0.75],
    twilight: [1.0, 0.45, 0.25],
    skyFade: [10, 30],
  },
};

/** The ground's aerial perspective, GLSL. Needs the uniforms below. */
export const AERIAL_GLSL = /* glsl */ `
uniform vec3 uAirBeta;
uniform float uAirH;
uniform float uHazeBeta;
uniform float uHazeH;
uniform vec3 uHazeColor;
uniform vec3 uHazeSun;
uniform vec3 uTwilight;
uniform float uCamAlt;
uniform float uCamAgl;

// Mean density of an exponential layer along a straight path from height a
// to height b (both over the scale height), times the path length.
float layerDepth(float hc, float hp, float L, float H) {
  float a = hc / H; float b = hp / H;
  float d = b - a;
  float ea = exp(-a); float eb = exp(-b);
  return L * (abs(d) > 1e-3 ? (ea - eb) / d : ea);
}

vec3 aerial(vec3 col, float L, float hp, vec3 viewDir, vec3 up, vec3 sun) {
  // The air by height over the datum; the low haze by height over the
  // ground, which it hugs (measured from the datum, a basin kilometres deep
  // would fill with exp(depth / 250 m) of it).
  float hc = max(uCamAlt, -9.0);
  vec3 tau = uAirBeta * layerDepth(hc, max(hp, -9.0), L, uAirH) + uHazeBeta * layerDepth(max(uCamAgl, 0.0), 0.0, L, uHazeH);
  // From high up the column is looked down through, not along: the low
  // haze's light is mostly scattered forward and away from an eye above it,
  // so it veils far less than a horizontal look from the ground suggests.
  // On the ground (and so where the globe meets the surface scene) nothing
  // changes; from orbit the map's own contrast comes through.
  float above = smoothstep(2.0, 25.0, uCamAgl);
  tau *= mix(1.0, 0.72, above);
  vec3 T = exp(-tau);
  float mu = dot(up, sun);
  float day = smoothstep(-0.14, 0.22, mu);
  float glow = pow(max(dot(viewDir, sun), 0.0), 8.0);
  vec3 tint = mix(uTwilight, vec3(1.0), smoothstep(0.0, 0.3, mu));
  vec3 inscatter = mix(uHazeColor, uHazeSun, glow) * tint * day * mix(1.0, 0.6, above);
  return col * T + inscatter * (1.0 - T);
}
`;

export function aerialUniforms(air: GlobeAir): Record<string, THREE.IUniform> {
  return {
    uAirBeta: { value: new THREE.Vector3(...air.airBeta) },
    uAirH: { value: air.airH },
    uHazeBeta: { value: air.hazeBeta },
    uHazeH: { value: air.hazeH },
    uHazeColor: { value: new THREE.Vector3(...air.hazeColor) },
    uHazeSun: { value: new THREE.Vector3(...air.hazeSun) },
    uTwilight: { value: new THREE.Vector3(...air.twilight) },
    uCamAlt: { value: 0 },
    uCamAgl: { value: 0 },
  };
}

const SHELL_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SHELL_FRAG = /* glsl */ `
uniform float uR;
uniform float uGround;
uniform float uTop;
uniform vec3 uSun;
uniform vec3 uBetaA; uniform float uHA; uniform vec3 uAbsA;
uniform vec3 uBetaB; uniform float uHB;
uniform float uBetaM; uniform float uHM; uniform float uG; uniform vec3 uMieTint;
uniform float uSunI;
uniform float uSkyWeight;
varying vec3 vWorld;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1e9, -1e9);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - cameraPosition);
  vec2 t = raySphere(ro, rd, uTop);
  if (t.y <= 0.0) discard;
  // Only drawn where no ground was (the depth test sees to that): the ray
  // runs to the top of the air, or to the lowest ground there can be, so
  // lowlands under the reference sphere show air at the limb, not a black gap.
  vec2 g = raySphere(ro, rd, uGround);
  float t0 = max(t.x, 0.0);
  float t1 = g.x > 0.0 && g.x < 1e8 ? min(t.y, g.x) : t.y;
  if (t1 <= t0) discard;
  float ds = (t1 - t0) / float(VIEW_STEPS);
  vec3 sumA = vec3(0.0); vec3 sumB = vec3(0.0); float sumM = 0.0;
  float odA = 0.0; float odB = 0.0; float odM = 0.0;
  for (int i = 0; i < VIEW_STEPS; i++) {
    vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
    float r = length(p);
    float h = r - uR;
    float dA = exp(-h / uHA) * ds; float dB = exp(-h / uHB) * ds; float dM = exp(-h / uHM) * ds;
    odA += dA; odB += dB; odM += dM;
    // The sun's way out from here: none through the planet (a soft edge,
    // so the terminator's shadow in the air is not a line).
    vec3 up = p / r;
    float mu = dot(up, uSun);
    float tca = -dot(p, uSun);
    float dca = length(p + uSun * tca);
    float lit = tca > 0.0 ? smoothstep(uR - 4.0, uR + 12.0, dca) : 1.0;
    if (lit <= 0.0) continue;
    vec2 ts = raySphere(p, uSun, uTop);
    float ls = max(ts.y, 0.0) / float(LIGHT_STEPS);
    float lA = 0.0; float lB = 0.0; float lM = 0.0;
    for (int j = 0; j < LIGHT_STEPS; j++) {
      vec3 q = p + uSun * ((float(j) + 0.5) * ls);
      float hq = max(length(q) - uR, 0.0);
      lA += exp(-hq / uHA) * ls; lB += exp(-hq / uHB) * ls; lM += exp(-hq / uHM) * ls;
    }
    vec3 tau = (uBetaA + uAbsA) * (odA + lA) + uBetaB * (odB + lB) + vec3(uBetaM * 1.1) * (odM + lM);
    vec3 att = exp(-tau) * lit;
    sumA += att * dA; sumB += att * dB; sumM += dot(att, vec3(0.3333)) * dM;
  }
  float c = dot(rd, uSun);
  float phR = 0.0596831 * (1.0 + c * c);
  float g2 = uG * uG;
  float phM = 0.1193662 * (1.0 - g2) * (1.0 + c * c) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * uG * c, 1e-4), 1.5));
  vec3 col = uSunI * (sumA * uBetaA * phR + sumB * uBetaB * phR + sumM * uBetaM * phM * uMieTint);
  gl_FragColor = vec4(col * uSkyWeight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface AtmosphereShell {
  mesh: THREE.Mesh;
  /** Sun direction, globe frame (unit). */
  setSun: (dir: THREE.Vector3) => void;
  /** Camera altitude above the reference sphere, km: fades the shell's sky. */
  setAltitude: (km: number) => void;
  /** An extra multiplier on the shell (the integration may fade it out). */
  setWeight: (w: number) => void;
  weight: () => number;
  dispose: () => void;
}

export function makeAtmosphereShell(body: PlanetBody, air: GlobeAir, lite: boolean, lowestGroundM = 0): AtmosphereShell {
  const top = body.radiusKm + body.atmosphereKm;
  // Inscribed facets would shave the faint outer edge of the limb; the
  // sphere is drawn a hair large and the shader intersects the true one.
  const geom = new THREE.SphereGeometry(top * 1.003, lite ? 96 : 160, lite ? 48 : 80);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uR: { value: body.radiusKm },
      uGround: { value: body.radiusKm + Math.min(0, lowestGroundM) / 1000 },
      uTop: { value: top },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uBetaA: { value: new THREE.Vector3(...air.layerA.beta) }, uHA: { value: air.layerA.h },
      uAbsA: { value: new THREE.Vector3(...(air.layerA.absorb ?? [0, 0, 0])) },
      uBetaB: { value: new THREE.Vector3(...air.layerB.beta) }, uHB: { value: air.layerB.h },
      uBetaM: { value: air.mie.beta }, uHM: { value: air.mie.h }, uG: { value: air.mie.g },
      uMieTint: { value: new THREE.Vector3(...air.mie.tint) },
      uSunI: { value: air.sunIntensity },
      uSkyWeight: { value: 1 },
    },
    defines: { VIEW_STEPS: lite ? 8 : 14, LIGHT_STEPS: lite ? 3 : 5 },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'globe-atmosphere';
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  let alt = 1e9; let extra = 1;
  const apply = () => {
    const [lo, hi] = air.skyFade;
    const t = Math.max(0, Math.min(1, (alt - lo) / (hi - lo)));
    mat.uniforms.uSkyWeight.value = t * t * (3 - 2 * t) * extra;
    mesh.visible = mat.uniforms.uSkyWeight.value > 1e-3;
  };
  return {
    mesh,
    setSun: (d) => { (mat.uniforms.uSun.value as THREE.Vector3).copy(d).normalize(); },
    setAltitude: (km) => { alt = km; apply(); },
    setWeight: (w) => { extra = Math.max(0, w); apply(); },
    weight: () => mat.uniforms.uSkyWeight.value as number,
    dispose: () => { geom.dispose(); mat.dispose(); },
  };
}
