// A ringed giant hanging in the sky. The planet is a sphere with a banded
// procedural face — latitude bands from the profile's palette, bent by
// turbulence, a storm oval, limb darkening — lit by the world's own star,
// with the rings' shadow falling across it. The rings are a disc of
// procedural density (gaps and ringlets) with the planet's shadow cast
// through them, lit on the sunward face and glowing faintly through from
// behind. Both are washed toward the colour of the air by the profile's
// `air`, since they sit beyond kilometres of it.
//
// On Proxima b it stands in for Proxima c. The real Proxima c, if it is
// there, is a Neptune-mass world 1.5 au out: from the surface of b it would
// be a point of light, not a disc. This one is dramatised for the view.

import * as THREE from 'three';
import type { WorldGiant } from '@/lib/solar-system/world-profiles';

/** How far out the giant sits, m: under the moons (1500) so it never cuts through them, inside the far plane. */
const GIANT_AT = 1440;
const MAX_BANDS = 8;

const PlanetShader = {
  vertexShader: /* glsl */`
    varying vec3 vL; varying vec3 vNw; varying vec3 vWp;
    void main() {
      vL = position;
      vNw = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWp = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uSunW; uniform vec3 uSunL; uniform vec3 uBands[${MAX_BANDS}]; uniform int uBandCount;
    uniform float uRingInner; uniform float uRingOuter; uniform vec3 uAir; uniform float uAirMix; uniform float uSeed;
    varying vec3 vL; varying vec3 vNw; varying vec3 vWp;
    float ghash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
    float gnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(ghash(i), ghash(i + vec2(1.0, 0.0)), f.x), mix(ghash(i + vec2(0.0, 1.0)), ghash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float gfbm(vec2 p) { float s = 0.0; float a = 0.5; for (int o = 0; o < 4; o++) { s += gnoise(p) * a; p = p * 2.1 + 5.3; a *= 0.5; } return s; }
    float ringDensity(float r) {
      float t = (r - uRingInner) / (uRingOuter - uRingInner);
      if (t < 0.0 || t > 1.0) return 0.0;
      float d = 0.6 + 0.4 * sin(t * 47.0 + uSeed) * sin(t * 13.0 + 1.0);
      d *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.9, 1.0, t));
      d *= 1.0 - 0.9 * smoothstep(0.40, 0.43, t) * (1.0 - smoothstep(0.49, 0.52, t));
      d *= 1.0 - 0.5 * smoothstep(0.70, 0.71, t) * (1.0 - smoothstep(0.73, 0.74, t));
      return clamp(d, 0.0, 1.0);
    }
    void main() {
      vec3 n = normalize(vL);
      float lat = n.y;
      float lon = atan(n.z, n.x);
      // Bands: a palette index down the latitude, bent by turbulence that
      // is stronger along the band edges, with fine stripes inside each.
      float turb = (gfbm(vec2(lon * 1.6 + lat * 3.0, lat * 9.0)) - 0.5) * 0.10;
      float t = clamp(lat * 0.5 + 0.5 + turb, 0.0, 0.999);
      float fi = t * float(uBandCount - 1);
      int i0 = int(floor(fi)); float ff = smoothstep(0.35, 0.65, fract(fi));
      vec3 col = vec3(0.5);
      for (int k = 0; k < ${MAX_BANDS}; k++) { if (k == i0) col = mix(uBands[k], uBands[min(k + 1, uBandCount - 1)], ff); }
      col *= 0.92 + 0.08 * sin(lat * 60.0 + turb * 30.0);
      col *= 0.9 + 0.2 * gfbm(vec2(lon * 3.0 + lat * 10.0, lat * 24.0));
      // A storm: an oval in the southern bands.
      vec2 so = vec2((lon - 1.2) * 0.9, (lat + 0.32) * 5.0);
      float storm = 1.0 - smoothstep(0.35, 0.55, length(so));
      col = mix(col, uBands[1] * 1.15, storm * 0.8);
      // Lit by the star, terminator softened by the deep air; limb darkening.
      vec3 V = normalize(cameraPosition - vWp);
      float nv = max(dot(normalize(vNw), V), 0.0);
      float lit = smoothstep(-0.12, 0.45, dot(normalize(vNw), uSunW));
      float limb = pow(nv, 0.4);
      // The rings' shadow: from here toward the star, where does the ring plane get crossed?
      float shadow = 1.0;
      if (abs(uSunL.y) > 1e-3) {
        float tt = -vL.y / uSunL.y;
        if (tt > 0.0) { vec3 hit = vL + uSunL * tt; shadow = 1.0 - 0.85 * ringDensity(length(hit.xz)); }
      }
      vec3 c = col * (0.04 + lit * shadow * limb * 1.15);
      c = mix(c, uAir, uAirMix);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

const RingShader = {
  vertexShader: /* glsl */`
    varying vec3 vL; varying vec3 vWp;
    void main() {
      vL = position;
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWp = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uSunW; uniform vec3 uSunL; uniform vec3 uAxisW; uniform vec3 uColor; uniform float uRingInner; uniform float uRingOuter;
    uniform vec3 uAir; uniform float uAirMix; uniform float uSeed;
    varying vec3 vL; varying vec3 vWp;
    float rhash(float p) { return fract(sin(p * 12.9898 + uSeed) * 43758.5453); }
    float rnoise(float p) { float i = floor(p); float f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(rhash(i), rhash(i + 1.0), f); }
    float ringDensity(float r) {
      float t = (r - uRingInner) / (uRingOuter - uRingInner);
      if (t < 0.0 || t > 1.0) return 0.0;
      float d = 0.6 + 0.4 * sin(t * 47.0 + uSeed) * sin(t * 13.0 + 1.0);
      d *= smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.9, 1.0, t));
      d *= 1.0 - 0.9 * smoothstep(0.40, 0.43, t) * (1.0 - smoothstep(0.49, 0.52, t));
      d *= 1.0 - 0.5 * smoothstep(0.70, 0.71, t) * (1.0 - smoothstep(0.73, 0.74, t));
      d *= 0.75 + 0.25 * rnoise(t * 90.0) + 0.15 * rnoise(t * 400.0);
      return clamp(d, 0.0, 1.0);
    }
    void main() {
      // The ring plane is the planet's equator: local xz, in planet radii.
      float r = length(vL.xz);
      float d = ringDensity(r);
      if (d < 0.01) discard;
      // The planet's shadow: does the way to the star pass through the sphere?
      vec3 p = vec3(vL.x, 0.0, vL.z);
      float b = dot(p, uSunL);
      float c = dot(p, p) - 1.0;
      float disc = b * b - c;
      float shadow = (b < 0.0) ? 1.0 - smoothstep(-0.02, 0.04, disc) : 1.0;
      // Lit on the face toward the star; the far face glows through, thinner.
      vec3 V = normalize(cameraPosition - vWp);
      float sunSide = dot(uAxisW, uSunW); float viewSide = dot(uAxisW, V);
      float same = sunSide * viewSide > 0.0 ? 1.0 : 0.45;
      float lit = (0.25 + 0.75 * abs(sunSide)) * same;
      // Ice grains scatter forward: brighter when the star is beyond the ring.
      float fwd = pow(max(dot(-V, uSunW), 0.0), 6.0) * 0.6;
      vec3 col = uColor * (lit + fwd) * shadow * (0.6 + 0.4 * d);
      col = mix(col, uAir, uAirMix);
      // A shadowed ring is dark, not thin: the alpha is the density alone.
      gl_FragColor = vec4(col, d * 0.92);
    }`,
};

export interface Giant {
  group: THREE.Group;
  dispose: () => void;
}

export function makeGiant(g: WorldGiant, sunDir: THREE.Vector3, airColor: [number, number, number], lite: boolean): Giant {
  const group = new THREE.Group();
  group.name = 'giant';
  // Radius from the apparent size: half the angle, at the shell distance.
  const R = GIANT_AT * Math.tan((g.angularDeg / 2) * Math.PI / 180);
  const bands = Array.from({ length: MAX_BANDS }, (_, i) => new THREE.Color(...g.bands[Math.min(i, g.bands.length - 1)]));
  const sunW = sunDir.clone().normalize();
  const sunL = new THREE.Vector3();
  const axisW = new THREE.Vector3();
  const air = new THREE.Color(...airColor);
  const shared = {
    uSunW: { value: sunW }, uSunL: { value: sunL }, uRingInner: { value: g.ringInner }, uRingOuter: { value: g.ringOuter },
    uAir: { value: air }, uAirMix: { value: g.air }, uSeed: { value: 3.7 },
  };
  const planetMat = new THREE.ShaderMaterial({
    ...PlanetShader,
    uniforms: { ...shared, uBands: { value: bands }, uBandCount: { value: Math.min(MAX_BANDS, g.bands.length) } },
  });
  const planetGeom = new THREE.SphereGeometry(1, lite ? 48 : 96, lite ? 32 : 64);
  const planet = new THREE.Mesh(planetGeom, planetMat);
  planet.scale.setScalar(R);
  planet.position.copy(g.dir).normalize().multiplyScalar(GIANT_AT);
  // Tilt the pole toward the viewer and roll it, so the rings open into an ellipse.
  planet.quaternion.setFromEuler(new THREE.Euler(g.tilt, 0, g.roll, 'XYZ'));
  planet.renderOrder = -7;
  planet.frustumCulled = false;
  group.add(planet);

  const ringMat = new THREE.ShaderMaterial({
    ...RingShader,
    uniforms: { ...shared, uAxisW: { value: axisW }, uColor: { value: new THREE.Color(...g.ringColor) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const ringGeom = new THREE.RingGeometry(g.ringInner, g.ringOuter, lite ? 96 : 192, 1);
  // RingGeometry lies in xy; the rings live in the planet's equator, its xz.
  ringGeom.rotateX(-Math.PI / 2);
  const rings = new THREE.Mesh(ringGeom, ringMat);
  rings.renderOrder = -6;
  rings.frustumCulled = false;
  planet.add(rings);

  // The star in the planet's own frame, for the two shadows; its axis in the world's, for the rings' lit face.
  planet.updateMatrixWorld(true);
  const inv = planet.quaternion.clone().invert();
  sunL.copy(sunW).applyQuaternion(inv).normalize();
  axisW.set(0, 1, 0).applyQuaternion(planet.quaternion).normalize();

  return {
    group,
    dispose() {
      planetGeom.dispose(); ringGeom.dispose();
      planetMat.dispose(); ringMat.dispose();
    },
  };
}
