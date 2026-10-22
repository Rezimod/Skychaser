// Saturn's rings round the globe: one flat annulus in the equatorial plane
// (z = 0 in the body-fixed frame of planet-frame.ts), in kilometres, drawn
// in the globe's scene after the ground and the air.
//
// The radial structure is a strip texture made here from the ring table
// below — D, C, B, the Cassini Division, A with the Encke and Keeler gaps,
// F — with a deterministic ringlet ripple, so it needs no file and no canvas
// and every player sees the same rings. Its alpha is how opaque the ring is
// at that radius; the ground shader samples the same strip for the rings'
// shadow on the cloud deck.
//
// Lighting is kept simple: the side the sun is on is lit by it, brighter the
// higher the sun stands over the plane; the other side shows only the light
// the thin parts let through. The planet's shadow falls across the rings,
// found per pixel by a ray toward the sun against the sphere. The rings span
// 140 000 km and the globe's far plane is fitted to the horizon, so they are
// pinned to the far plane in the vertex shader and hidden behind the planet
// by a ray-sphere test of their own rather than by the depth buffer.

import * as THREE from 'three';

type RGB = [number, number, number];

/** The rings by radius from Saturn's centre, km: [inner, outer, colour (sRGB 0…1), opacity]. */
export const SATURN_RINGS: readonly [number, number, RGB, number][] = [
  [66_900, 74_490, [0.59, 0.53, 0.47], 0.04],
  [74_490, 91_980, [0.66, 0.57, 0.48], 0.28],
  [91_980, 117_580, [0.91, 0.84, 0.72], 0.92],
  [117_580, 122_170, [0.51, 0.46, 0.39], 0.08],
  [122_170, 133_420, [0.84, 0.77, 0.64], 0.72],
  [133_745, 136_485, [0.82, 0.75, 0.62], 0.62],
  [136_525, 136_775, [0.78, 0.72, 0.6], 0.55],
  [140_180, 140_265, [0.94, 0.89, 0.8], 0.4],
];
export const RING_INNER_KM = 66_900;
export const RING_OUTER_KM = 140_300;

/** A small integer hash, 0…1. */
function hash1(i: number): number {
  let h = Math.imul(i ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The strip's texels, RGBA bytes, inner edge first: the ring table with a
 *  ringlet ripple in the bright rings, the same on every run. */
export function ringStrip(width = 1024): Uint8Array {
  const data = new Uint8Array(width * 4);
  for (let x = 0; x < width; x++) {
    const r = RING_INNER_KM + ((x + 0.5) / width) * (RING_OUTER_KM - RING_INNER_KM);
    let c: RGB = [0, 0, 0]; let a = 0;
    for (const [lo, hi, col, op] of SATURN_RINGS) {
      if (r >= lo && r < hi) {
        const t = (r - lo) / (hi - lo);
        const shade = 0.92 + 0.08 * Math.sin(t * Math.PI);
        c = [col[0] * shade, col[1] * shade, col[2] * shade];
        a = op;
        break;
      }
    }
    if (a > 0.02) {
      // Ringlets: a few hundred narrow bands of brighter and fainter ring.
      const ripple = 0.88 + 0.12 * Math.sin(x * 0.9) * Math.sin(x * 0.23 + 1.7) + (hash1(x) - 0.5) * 0.1;
      c = [c[0] * ripple, c[1] * ripple, c[2] * ripple];
      a = Math.min(1, a * (0.92 + (hash1(x + 7919) - 0.5) * 0.16));
    }
    data[x * 4] = Math.round(Math.min(1, c[0]) * 255);
    data[x * 4 + 1] = Math.round(Math.min(1, c[1]) * 255);
    data[x * 4 + 2] = Math.round(Math.min(1, c[2]) * 255);
    data[x * 4 + 3] = Math.round(a * 255);
  }
  return data;
}

export function makeRingTexture(width = 1024): THREE.DataTexture {
  const tex = new THREE.DataTexture(ringStrip(width), width, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const RING_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  // On the far plane: the rings reach past it, and what hides them is the
  // planet, tested in the fragment shader, not the depth buffer.
  gl_Position.z = gl_Position.w * 0.999999;
}
`;

const RING_FRAG = /* glsl */ `
uniform sampler2D uRings;
uniform vec2 uSpan;
uniform float uPlanet;
uniform vec3 uSun;
uniform vec3 uSunColor;
uniform float uFade;
varying vec3 vWorld;
void main() {
  vec3 P = vWorld;
  float r = length(P.xy);
  float u = (r - uSpan.x) / (uSpan.y - uSpan.x);
  if (u <= 0.0 || u >= 1.0) discard;
  vec4 ring = texture(uRings, vec2(u, 0.5));
  if (ring.a < 0.004) discard;
  // Behind the planet from here: the eye's ray meets the sphere first.
  vec3 ro = cameraPosition;
  vec3 rd = P - ro;
  float tP = length(rd);
  rd /= tP;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - uPlanet * uPlanet;
  float h = b * b - c;
  if (h > 0.0) {
    float t0 = -b - sqrt(h);
    if (t0 > 0.0 && t0 < tP) discard;
  }
  // In the planet's shadow: the ray toward the sun meets the sphere. A soft
  // edge of a few hundred kilometres, the penumbra and the air together.
  float bs = dot(P, uSun);
  float shadow = 1.0;
  if (bs < 0.0) {
    float d = sqrt(max(0.0, dot(P, P) - bs * bs));
    shadow = smoothstep(uPlanet * 0.985, uPlanet * 1.01, d);
  }
  // Lit from the side the sun is on; from the other, only what the thin parts let through.
  float sunUp = uSun.z;
  float eyeUp = ro.z - P.z;
  float litSide = step(0.0, sunUp * eyeUp);
  float elev = abs(sunUp);
  float front = 0.3 + 0.7 * sqrt(elev);
  // The unlit face: sunlight scattered through the thin rings (the C ring
  // and the Cassini Division glow, the B ring stays dark), and a little of
  // the planet's own light.
  float back = 0.6 * (1.0 - ring.a) + 0.12;
  float light = mix(back, front, litSide) * shadow;
  vec3 col = ring.rgb * uSunColor * light;
  gl_FragColor = vec4(col, ring.a * uFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface GlobeRings {
  mesh: THREE.Mesh;
  texture: THREE.DataTexture;
  innerKm: number;
  outerKm: number;
  /** Toward the sun, globe frame (unit). */
  setSun: (dir: THREE.Vector3) => void;
  /** Camera altitude, km: inside the air the sky behind the rings is bright, and they wash out a little. */
  setAltitude: (km: number) => void;
  dispose: () => void;
}

/** The rings of a planet of radius `radiusKm`, lit by `sun` (as GROUND_LOOK gives it). */
export function makeGlobeRings(radiusKm: number, sun: RGB, lite: boolean): GlobeRings {
  const texture = makeRingTexture(lite ? 512 : 1024);
  const geom = new THREE.RingGeometry(RING_INNER_KM, RING_OUTER_KM, lite ? 160 : 320, 1);
  const mat = new THREE.ShaderMaterial({
    name: 'globe-rings',
    uniforms: {
      uRings: { value: texture },
      uSpan: { value: new THREE.Vector2(RING_INNER_KM, RING_OUTER_KM) },
      uPlanet: { value: radiusKm },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uSunColor: { value: new THREE.Vector3(...sun) },
      uFade: { value: 1 },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'globe-rings';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return {
    mesh, texture, innerKm: RING_INNER_KM, outerKm: RING_OUTER_KM,
    setSun: (d) => { (mat.uniforms.uSun.value as THREE.Vector3).copy(d).normalize(); },
    setAltitude: (km) => { mat.uniforms.uFade.value = 0.7 + 0.3 * THREE.MathUtils.smoothstep(km, 5, 120); },
    dispose: () => { geom.dispose(); mat.dispose(); texture.dispose(); },
  };
}
