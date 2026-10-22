// A planet's rings seen from inside the planet. The rings lie in the
// equatorial plane, a few planet radii across, and the observer stands on
// the cloud tops, one radius from the centre: so the rings are not a disc in
// the sky but an arch, rising from one horizon, over the side of the sky
// toward the equator, and down to the other — high and wide from the
// tropics, low and squat toward the poles, edge-on as a thin line from the
// equator itself. The half of the ring system behind the planet is under
// the horizon.
//
// The geometry is built in the planet's frame — the ring plane round the
// centre, the observer at one radius up — and each vertex is put on the sky
// sphere along its true direction from the observer, so the arch has the
// right shape and the right width everywhere along it. The shader gives the
// rings their radial structure (Saturn's C, B and A rings with the Cassini
// division and the Encke gap; Uranus's handful of narrow ringlets),
// darkens them where the planet's own shadow falls across them, lights
// them on the face toward the Sun, and fades them into the air toward the
// horizon.

import * as THREE from 'three';
import type { SkyRings } from '@/lib/solar-system/world-profiles';

/** How far out the arch is drawn, m: inside the moons (1500) and the giant (1440). */
const ARC_AT = 1420;

const RingArcShader = {
  vertexShader: /* glsl */`
    attribute vec3 aPlanet;
    varying vec3 vPlanet; varying vec3 vDir;
    void main() {
      vPlanet = aPlanet;
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uSun; uniform vec3 uAxis; uniform vec3 uColor; uniform float uOpacity; uniform float uKind;
    uniform float uViewSide; uniform float uAir;
    varying vec3 vPlanet; varying vec3 vDir;
    float band(float r, float a, float b, float soft) { return smoothstep(a - soft, a + soft, r) * (1.0 - smoothstep(b - soft, b + soft, r)); }
    float thread(float r, float at, float w, float px) { float k = max(w, px); return (w / k) * (1.0 - smoothstep(0.0, k, abs(r - at))); }
    float saturn(float r) {
      // C ring (faint), B ring (bright, dense), Cassini division, A ring with the Encke gap.
      float d = band(r, 1.24, 1.525, 0.01) * (0.22 + 0.08 * sin(r * 190.0));
      d += band(r, 1.525, 1.95, 0.006) * (0.85 + 0.15 * sin(r * 260.0) * sin(r * 37.0));
      d += band(r, 2.025, 2.27, 0.006) * (0.6 + 0.08 * sin(r * 300.0));
      d *= 1.0 - band(r, 2.212, 2.218, 0.0015) * 0.9;
      return clamp(d, 0.0, 1.0);
    }
    float uranus(float r, float px) {
      float d = thread(r, 1.638, 0.002, px) + thread(r, 1.652, 0.002, px) + thread(r, 1.666, 0.002, px);
      d += thread(r, 1.750, 0.003, px) + thread(r, 1.786, 0.003, px) + thread(r, 1.846, 0.002, px);
      d += thread(r, 1.863, 0.002, px) + thread(r, 1.900, 0.003, px) + thread(r, 2.002, 0.007, px) * 1.4;
      return clamp(d, 0.0, 1.0);
    }
    void main() {
      if (vDir.y < -0.01) discard;
      // The vertices lie in the ring plane, so the distance from the centre is the ring radius.
      float r = length(vPlanet);
      float px = fwidth(r) * 1.2;
      float d = uKind > 0.5 ? uranus(r, px) : saturn(r);
      if (d < 0.004) discard;
      // The planet's shadow: does the way from this piece of ring to the Sun pass through the planet?
      float b = dot(vPlanet, uSun);
      float disc = b * b - (dot(vPlanet, vPlanet) - 1.0);
      float shadow = b < 0.0 ? mix(1.0, 0.06, smoothstep(-0.02, 0.05, disc)) : 1.0;
      // Lit on the face toward the Sun; seen from the other face, only what comes through.
      float sunSide = dot(uAxis, uSun);
      float lit = sunSide * uViewSide > 0.0 ? 0.35 + 0.65 * abs(sunSide) : 0.18 + 0.2 * abs(sunSide);
      vec3 col = uColor * lit * shadow;
      // Through the air: washed out and thinned toward the horizon.
      float airMass = 1.0 / max(vDir.y + 0.06, 0.06);
      float through = exp(-uAir * airMass);
      gl_FragColor = vec4(col, d * uOpacity * through);
    }`,
};

export interface RingArc {
  mesh: THREE.Mesh;
  dispose: () => void;
}

/**
 * The arch for a site at `rings.latDeg`, lit by a Sun in `sunDir` (local
 * frame: east +X, up +Y, north −Z). `brightness` scales the lit colour to
 * the sky it is seen against; `air` is how much the air in front dims it.
 */
export function makeRingArc(rings: SkyRings, sunDir: THREE.Vector3, brightness: number, air: number, lite: boolean): RingArc {
  const lat = (rings.latDeg * Math.PI) / 180;
  // The planet's frame, written in the site's: the spin axis, and east,
  // and the third axis of the ring plane. The centre is one radius down.
  const axis = new THREE.Vector3(0, Math.sin(lat), -Math.cos(lat));
  const east = new THREE.Vector3(1, 0, 0);
  const third = new THREE.Vector3().crossVectors(axis, east).normalize();
  const centre = new THREE.Vector3(0, -1, 0);

  const nA = lite ? 160 : 320; const nR = lite ? 6 : 12;
  const count = (nA + 1) * (nR + 1);
  const pos = new Float32Array(count * 3);
  const planet = new Float32Array(count * 3);
  const p = new THREE.Vector3(); const rel = new THREE.Vector3();
  for (let j = 0; j <= nR; j++) {
    const rr = rings.inner + (rings.outer - rings.inner) * (j / nR);
    for (let i = 0; i <= nA; i++) {
      const a = (i / nA) * Math.PI * 2;
      rel.copy(east).multiplyScalar(Math.cos(a) * rr).addScaledVector(third, Math.sin(a) * rr);
      p.copy(centre).add(rel);
      const k = (j * (nA + 1) + i) * 3;
      // The vertex sits on the sky sphere, along its direction from the observer.
      p.normalize().multiplyScalar(ARC_AT);
      pos[k] = p.x; pos[k + 1] = p.y; pos[k + 2] = p.z;
      // And remembers where it is in the planet's frame, in radii, from the centre.
      planet[k] = rel.x; planet[k + 1] = rel.y; planet[k + 2] = rel.z;
    }
  }
  const index: number[] = [];
  for (let j = 0; j < nR; j++) {
    for (let i = 0; i < nA; i++) {
      const a0 = j * (nA + 1) + i; const a1 = a0 + 1; const b0 = a0 + nA + 1; const b1 = b0 + 1;
      index.push(a0, b0, a1, a1, b0, b1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aPlanet', new THREE.BufferAttribute(planet, 3));
  geom.setIndex(index);
  geom.computeBoundingSphere();

  const mat = new THREE.ShaderMaterial({
    ...RingArcShader,
    uniforms: {
      uSun: { value: sunDir.clone().normalize() },
      uAxis: { value: axis },
      uColor: { value: new THREE.Color(...rings.color).multiplyScalar(brightness) },
      uOpacity: { value: rings.opacity },
      uKind: { value: rings.kind === 'uranus' ? 1 : 0 },
      // The observer is on the north face of the ring plane north of the equator.
      uViewSide: { value: rings.latDeg >= 0 ? 1 : -1 },
      uAir: { value: air },
    },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.name = 'ring-arc';
  mesh.renderOrder = -6;
  mesh.frustumCulled = false;
  return {
    mesh,
    dispose() { geom.dispose(); mat.dispose(); },
  };
}
