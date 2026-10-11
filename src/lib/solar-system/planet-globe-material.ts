// The globe's ground shader, and Earth's cloud shell.
//
// One ShaderMaterial for every chunk of a world. Colour comes from the
// equirectangular planet map (4K, 2K on lite), looked up per pixel from the
// direction with the longitude seam's derivatives mended so it leaves no
// line. Close in, where a 4K map is kilometres a pixel, procedural detail
// takes over: an albedo modulation and a bent normal from value noise at two
// scales, each faded out by its own pixel footprint so neither shimmers. Steep
// ground takes a rock tone. The sun lights it with a soft terminator (hard on
// the Moon), Earth adds its night lights, its sea glint and the clouds'
// shadows, and the air (planet-globe-atmosphere.ts) hazes it by distance.
//
// Per chunk, only where it sits relative to the landing site changes; that
// goes in through `onBeforeRender` (see planet-globe.ts), which is what keeps
// the site-relative maths exact in float32 right up to the patch edge.
//
// Output is linear HDR at about the levels the surface scenes use, for ACES
// and the post chain.

import * as THREE from 'three';
import type { GlobeWorld } from '@/lib/solar-system/planet-frame';
import { AERIAL_GLSL, aerialUniforms, type GlobeAir } from '@/lib/solar-system/planet-globe-atmosphere';

const COMMON = /* glsl */ `
#define PI 3.14159265359
vec2 equirectUV(vec3 d) {
  return vec2(atan(d.y, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.z, -1.0, 1.0)) / PI + 0.5);
}
// An equirect lookup whose mip level does not jump at the ±180° seam: the
// gradients are taken from whichever of u and u + ½ is continuous here.
vec4 equirect(sampler2D t, vec3 d, float shift) {
  vec2 uv = equirectUV(d);
  uv.x += shift;
  float alt = fract(uv.x + 0.5) - 0.5;
  vec2 dx = dFdx(uv); vec2 dy = dFdy(uv);
  float ax = dFdx(alt); float ay = dFdy(alt);
  if (abs(ax) + abs(ay) < abs(dx.x) + abs(dy.x)) { dx.x = ax; dy.x = ay; }
  return textureGrad(t, uv, dx, dy);
}
`;

const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// Value noise with its analytic gradient (xyz), value in −1…1 (w).
vec4 noised(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash13(i); float b = hash13(i + vec3(1, 0, 0));
  float c = hash13(i + vec3(0, 1, 0)); float d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)); float f1 = hash13(i + vec3(1, 0, 1));
  float g = hash13(i + vec3(0, 1, 1)); float h = hash13(i + vec3(1, 1, 1));
  float k1 = b - a; float k2 = c - a; float k3 = e - a;
  float k4 = a - b - c + d; float k5 = a - c - e + g; float k6 = a - b - e + f1;
  float k7 = -a + b + c - d + e - f1 - g + h;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 dv = du * vec3(
    k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
    k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
    k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(2.0 * dv, 2.0 * v - 1.0);
}
// Value noise lines up with its lattice; turning each octave's domain by a
// rotation that shares no axis with the last hides the grid.
const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
// Three octaves of it at wavelength lam (m), gradient per metre (in the
// unrotated frame: R is orthonormal, so the gradient goes back by Rᵀ).
vec4 detail2(vec3 p, float lam) {
  vec3 q = p / lam;
  vec4 a = noised(q);
  vec3 q2 = ROT * q * 2.03 + 17.3;
  vec4 b = noised(q2);
  vec3 q3 = ROT * q2 * 2.01 - 5.1;
  vec4 c = noised(q3);
  vec3 gb = transpose(ROT) * b.xyz * 2.03;
  vec3 gc = transpose(ROT) * (transpose(ROT) * c.xyz * 2.01) * 2.03;
  vec3 g = (a.xyz + 0.5 * gb + 0.25 * gc) / lam;
  return vec4(g, (a.w + 0.5 * b.w + 0.25 * c.w) / 1.75);
}
#ifdef CRATERS
// Craters at one scale: at most one per cell of a 3D lattice of \`cell\` m,
// a disc on the ground round its jittered centre (the radial is projected
// out). Returns the ground's slope (dh/dx, unitless, in the frame of p) and
// adds the albedo change to alb: young craters throw bright ejecta, floors
// run a touch dark. The 2×2×2 cells toward the nearest corner hold every
// crater that can reach p (jitter + reach stay under one cell).
vec3 craterField(vec3 p, vec3 up, float cell, float fill, inout float alb) {
  vec3 q = p / cell;
  vec3 i0 = floor(q);
  vec3 o = step(0.5, q - i0) - 1.0;
  vec3 g = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 c = i0 + o + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    float hs = hash13(c + 0.37);
    if (hs > fill) continue;
    vec3 jit = vec3(hash13(c + 11.1), hash13(c + 23.7), hash13(c + 5.3)) - 0.5;
    vec3 d = q - (c + 0.5 + jit * 0.5);
    d -= up * dot(d, up);
    float rad = 0.12 + 0.3 * hash13(c + 41.9);
    float dl = length(d);
    float r = dl / rad;
    if (r > 1.7) continue;
    // A bowl (depth 0.4 radii: a fifth of the diameter, as fresh lunar
    // craters are), a sharp raised rim, and the ejecta apron falling away.
    float dh = r < 1.0 ? 0.8 * r : 0.0;
    float x = r - 1.0;
    dh += 0.07 * exp(-x * x / 0.035) * (-2.0 * x / 0.035);
    g += (d / max(dl, 1e-5)) * dh;
    float young = step(0.72, fract(hs * 13.17));
    alb += young * 0.2 * exp(-(r - 1.1) * (r - 1.1) / 0.18) - 0.05 * (1.0 - smoothstep(0.55, 1.0, r));
  }
  return g;
}
#endif
`;

const VERT = /* glsl */ `
attribute float aHeight;
uniform vec3 uChunkSite;
varying vec3 vNormalW;
varying vec3 vDir;
varying vec3 vSite;
varying vec3 vView;
varying float vHeight;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // The view ray in the globe's orientation, from the camera-relative position
  // (exact) rather than the difference of two 6000 km numbers (not).
  vView = transpose(mat3(viewMatrix)) * mv.xyz;
  vSite = uChunkSite + position;
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
  vNormalW = normal;
  vHeight = aHeight;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uMapOn;
uniform vec3 uFallback;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform vec3 uAmbient;
uniform vec3 uSiteUp;
uniform float uPatchKm;
uniform vec3 uSiteColor;
uniform float uSiteMix;
uniform float uSiteBlendKm;
uniform vec3 uRock;
uniform float uDetail;
uniform float uRoll;
uniform float uMacro;
uniform float uCraterDepth;
uniform vec2 uTerminator;
#ifdef EARTH
uniform sampler2D uNight;
uniform float uNightOn;
uniform sampler2D uClouds;
uniform float uCloudsOn;
uniform float uCloudShift;
uniform float uCloudShadow;
uniform float uCloudKm;
uniform float uRadius;
uniform sampler2D uImg;
uniform vec4 uImgRect;
uniform float uImgOn;
#endif
varying vec3 vNormalW;
varying vec3 vDir;
varying vec3 vSite;
varying vec3 vView;
varying float vHeight;

void main() {
  // Inside the patch the surface scene draws its own ground.
  vec3 across = vSite - uSiteUp * dot(vSite, uSiteUp);
  float dSite = length(across);
  if (dSite < uPatchKm) discard;

  vec3 dir = normalize(vDir);
  vec3 N = normalize(vNormalW);
  float dist = length(vView);
  vec3 viewDir = vView / max(dist, 1e-6);

  vec3 albedo = uMapOn > 0.5 ? equirect(uMap, dir, 0.0).rgb : uFallback;
#ifdef EARTH
  if (uImgOn > 0.5) {
    // Sampled everywhere in the chunk (uniform control flow keeps the mip
    // derivatives sound), then kept only inside the tile.
    float lat = degrees(asin(clamp(dir.z, -1.0, 1.0)));
    float lon = degrees(atan(dir.y, dir.x));
    vec2 iuv = vec2((lon - uImgRect.x) / (uImgRect.z - uImgRect.x), (lat - uImgRect.y) / (uImgRect.w - uImgRect.y));
    vec3 img = texture(uImg, clamp(iuv, 0.0, 1.0)).rgb;
    float inside = step(0.0, iuv.x) * step(iuv.x, 1.0) * step(0.0, iuv.y) * step(iuv.y, 1.0);
    albedo = mix(albedo, img, inside);
  }
  // Sea: the heights say where; the colour stays the map's, darkened.
  float water = smoothstep(-2.0, -25.0, vHeight);
#endif

  // Procedural detail at two scales, each gone once its cells are under a pixel or two.
  vec3 p = vSite * 1000.0;
  float foot = length(fwidth(p));
  vec3 bend = vec3(0.0);
  float tone = 0.0;
  if (uDetail > 0.0) {
    // Rolling ground at two scales. Gentle on the airless worlds: steep
    // noise under a low sun is a field of black blotches, and their relief
    // is the craters'.
    float w1 = 1.0 - smoothstep(0.12, 0.45, foot / 60.0);
    float w2 = 1.0 - smoothstep(0.12, 0.45, foot / 700.0);
    // Between the map's pixel (kilometres) and the rolling ground: broad
    // patches of lighter and darker ground, so from a few kilometres up the
    // map's texels do not show as soft squares.
    float w3 = 1.0 - smoothstep(0.12, 0.45, foot / 2600.0);
    if (w3 > 0.0) {
      vec4 d3 = detail2(p * vec3(1.0, 1.3, 0.8), 2600.0);
      tone += d3.w * uMacro * w3;
      bend += d3.xyz * 2600.0 * uRoll * 0.4 * w3;
    }
    if (w2 > 0.0) {
      vec4 d2 = detail2(p, 700.0);
      bend += d2.xyz * 700.0 * uRoll * w2;
      tone += d2.w * 0.12 * w2;
      if (w1 > 0.0) {
        vec4 d1 = detail2(p, 60.0);
        bend += d1.xyz * 60.0 * uRoll * 1.35 * w1;
        tone += d1.w * 0.1 * w1;
      }
    }
#ifdef CRATERS
    // Craters, coarse to fine, each scale in while its cells span more
    // than a few pixels and out (smoothly) once they do not.
    float cell = CRATER_CELL;
    float calb = 0.0;
    for (int o = 0; o < CRATER_OCTAVES; o++) {
      float w = 1.0 - smoothstep(0.05, 0.2, foot / cell);
      if (w <= 0.0) break;
      float a = 0.0;
      // Few big ones, many small: the sizes go as a power law, so the
      // coarse scales are sparse and the fine ones crowd.
      float fill = CRATER_FILL * mix(0.32, 1.0, float(o) / max(1.0, float(CRATER_OCTAVES - 1)));
      bend += craterField(p, dir, cell, fill, a) * w * uCraterDepth;
      calb += a * w;
      cell *= 0.36;
    }
    tone += calb * uCraterDepth;
#endif
    bend *= uDetail;
    tone *= uDetail;
  }
#ifdef EARTH
  bend *= 1.0 - water;
  tone *= 1.0 - water;
#endif
  albedo *= 1.0 + tone;
  vec3 Nd = normalize(N - (bend - N * dot(bend, N)));

  // Steep ground is bare rock: a tone of its own at the map's brightness.
  float slope = 1.0 - dot(N, dir);
  float rock = smoothstep(0.05, 0.22, slope + 0.03 * tone);
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  vec3 rockCol = uRock * (lum / max(dot(uRock, vec3(0.2126, 0.7152, 0.0722)), 1e-3));
  albedo = mix(albedo, rockCol * 1.05, rock * 0.55);

  // Close to the site, the surface scene's ground colour, so its edge does not show.
  float siteW = uSiteMix * (1.0 - smoothstep(uPatchKm, uSiteBlendKm, dSite));
  albedo = mix(albedo, uSiteColor, siteW);

  float mu = dot(dir, uSun);
  float term = smoothstep(uTerminator.x, uTerminator.y, mu);
  float NL = max(dot(Nd, uSun), 0.0);
#ifdef MOON
  // Regolith scatters back toward the sun (Lommel-Seeliger): the full disc
  // is flat-lit rather than a Lambert ball.
  float mu0 = max(dot(Nd, uSun), 0.0);
  float mu1 = max(dot(Nd, -viewDir), 0.0);
  NL = mix(NL, 2.0 * mu0 / max(mu0 + mu1, 1e-3) * 0.5, 0.45);
#endif
  float lightN = NL * term;
#ifdef EARTH
  if (uCloudsOn > 0.5 && uCloudShadow > 0.0) {
    // Where the sun's ray from here crosses the cloud deck.
    vec3 hit = normalize(dir * (uRadius + uCloudKm) + uSun * (uCloudKm / max(mu, 0.12)));
    float c = equirect(uClouds, hit, uCloudShift).r;
    lightN *= 1.0 - uCloudShadow * smoothstep(0.2, 0.9, c);
  }
#endif
  vec3 col = albedo * (uSunColor * lightN + uAmbient * term);

#ifdef EARTH
  col = mix(col, col * 0.55 + vec3(0.002, 0.006, 0.012) * term, water * 0.6);
  vec3 H = normalize(uSun - viewDir);
  float spec = pow(max(dot(dir, H), 0.0), 220.0);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(dir, -viewDir), 0.0), 5.0);
  col += uSunColor * (spec * 6.0 + fres * 0.02) * water * term;
  if (uNightOn > 0.5) {
    float night = smoothstep(0.06, -0.12, mu);
    col += equirect(uNight, dir, 0.0).rgb * night * 0.3 * (1.0 - water);
  }
#endif

#ifdef AIR
  col = aerial(col, dist, vHeight / 1000.0, viewDir, dir, uSun);
#endif
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface GroundLook {
  /** Albedo before the map arrives, linear. */
  fallback: [number, number, number];
  /** Rock tone for the steep ground, linear. */
  rock: [number, number, number];
  /** Sun colour × intensity / π, as three's Lambert would apply it. */
  sun: [number, number, number];
  /** Skylight, linear (0 on the Moon). */
  ambient: [number, number, number];
  /** The terminator's softness in cos(sun elevation). */
  terminator: [number, number];
}

const sunOf = (hex: number, intensity: number): [number, number, number] => {
  const c = new THREE.Color(hex);
  return [c.r * intensity / Math.PI, c.g * intensity / Math.PI, c.b * intensity / Math.PI];
};

/** Sun colours and intensities as the surface scenes light them (moon-surface, world-profiles). */
export const GROUND_LOOK: Record<GlobeWorld, GroundLook> = {
  moon: { fallback: [0.12, 0.115, 0.11], rock: [0.2, 0.195, 0.19], sun: sunOf(0xfff8ee, 3.6), ambient: [0.002, 0.0022, 0.0026], terminator: [-0.02, 0.012] },
  mars: { fallback: [0.3, 0.14, 0.07], rock: [0.2, 0.12, 0.08], sun: sunOf(0xfff1dc, 2.9), ambient: [0.05, 0.034, 0.022], terminator: [-0.09, 0.08] },
  earth: { fallback: [0.05, 0.08, 0.12], rock: [0.2, 0.18, 0.16], sun: sunOf(0xfff4e6, 3), ambient: [0.03, 0.04, 0.055], terminator: [-0.1, 0.1] },
};

/** The globe's close-in craters (shader only; the geometry carries its own
 *  at its grid's resolution): the coarsest cell, m, how many scales down
 *  from it (each 0.36 of the last), how many cells hold one, how deep they
 *  read (Mars's are worn), and how steep the rolling noise under them is. */
export const CRATERS: Partial<Record<GlobeWorld, { cell: number; octaves: number; fill: number; depth: number; roll: number }>> = {
  moon: { cell: 2600, octaves: 6, fill: 0.62, depth: 1, roll: 0.045 },
  mars: { cell: 3200, octaves: 5, fill: 0.4, depth: 0.5, roll: 0.07 },
};

export function makeGroundMaterial(world: GlobeWorld, air: GlobeAir | null, radiusKm: number, lite: boolean): THREE.ShaderMaterial {
  const look = GROUND_LOOK[world];
  const uniforms: Record<string, THREE.IUniform> = {
    uMap: { value: null },
    uMapOn: { value: 0 },
    uFallback: { value: new THREE.Vector3(...look.fallback) },
    uSun: { value: new THREE.Vector3(1, 0, 0) },
    uSunColor: { value: new THREE.Vector3(...look.sun) },
    uAmbient: { value: new THREE.Vector3(...look.ambient) },
    uSiteUp: { value: new THREE.Vector3(0, 0, 1) },
    uPatchKm: { value: 0 },
    uSiteColor: { value: new THREE.Vector3() },
    uSiteMix: { value: 0 },
    uSiteBlendKm: { value: 30 },
    uRock: { value: new THREE.Vector3(...look.rock) },
    uDetail: { value: 1 },
    uRoll: { value: CRATERS[world] ? CRATERS[world]!.roll : 0.16 },
    uCraterDepth: { value: CRATERS[world] ? CRATERS[world]!.depth : 0 },
    uMacro: { value: world === 'mars' ? 0.2 : world === 'moon' ? 0.12 : 0.08 },
    uTerminator: { value: new THREE.Vector2(...look.terminator) },
    uChunkSite: { value: new THREE.Vector3() },
  };
  const defines: Record<string, string | number | boolean> = {};
  if (world === 'moon') defines.MOON = 1;
  const cr = CRATERS[world];
  if (cr) {
    defines.CRATERS = 1;
    // Lite starts a scale finer and stops two sooner: the near ground is
    // where the eye is, and every scale is eight cells a pixel.
    defines.CRATER_OCTAVES = lite ? cr.octaves - 2 : cr.octaves;
    defines.CRATER_CELL = (lite ? cr.cell * 0.36 : cr.cell).toFixed(1);
    defines.CRATER_FILL = cr.fill.toFixed(2);
  }
  if (world === 'earth') {
    defines.EARTH = 1;
    Object.assign(uniforms, {
      uNight: { value: null }, uNightOn: { value: 0 },
      uClouds: { value: null }, uCloudsOn: { value: 0 },
      uCloudShift: { value: 0 }, uCloudShadow: { value: lite ? 0 : 0.45 },
      uCloudKm: { value: 8 }, uRadius: { value: radiusKm },
      uImg: { value: null }, uImgRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uImgOn: { value: 0 },
    });
  }
  if (air) {
    defines.AIR = 1;
    Object.assign(uniforms, aerialUniforms(air));
  }
  return new THREE.ShaderMaterial({
    name: `globe-ground-${world}`,
    uniforms,
    defines,
    vertexShader: VERT,
    fragmentShader: COMMON + NOISE + (air ? AERIAL_GLSL : '') + FRAG,
  });
}

const CLOUD_VERT = /* glsl */ `
varying vec3 vDir;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vView = transpose(mat3(viewMatrix)) * mv.xyz;
  vDir = normalize(position);
}
`;

const CLOUD_FRAG = /* glsl */ `
uniform sampler2D uClouds;
uniform float uCloudShift;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uOpacity;
uniform vec3 uTwilight;
varying vec3 vDir;
varying vec3 vView;
void main() {
  vec3 dir = normalize(vDir);
  float c = equirect(uClouds, dir, uCloudShift).r;
  float a = smoothstep(0.12, 0.85, c) * uOpacity;
  if (a < 0.004) discard;
  float mu = dot(dir, uSun);
  float day = smoothstep(-0.12, 0.2, mu);
  vec3 tint = mix(uTwilight, vec3(1.0), smoothstep(0.0, 0.3, mu));
  // Thick cloud is bright on top; wisps let the light through.
  vec3 col = uSunColor * (0.75 + 0.25 * c) * day * tint * 0.9;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeCloudMaterial(sun: [number, number, number], twilight: [number, number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'globe-clouds',
    uniforms: {
      uClouds: { value: null },
      uCloudShift: { value: 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uSunColor: { value: new THREE.Vector3(...sun) },
      uOpacity: { value: 1 },
      uTwilight: { value: new THREE.Vector3(...twilight) },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: COMMON + CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
