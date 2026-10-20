// The sky over Stellar Base as it is on the day. The base stands in the
// Moon's south polar region, so Earth hangs low in the north: where, and how big, comes
// from the Moon's libration (astronomy-engine), and it drifts through the
// month as the real one does. The bright stars and the Milky Way are at their
// true places for the date, turned into the base's own frame; the faint field
// between them is seeded, so it is the same sky every visit. Earth is turned
// so the side of it in daylight right now faces the sun in the scene.
//
// The scene sun itself is not the real one: it keeps a low angle a polar
// site gives for play, but not the real hour. Everything else in the sky is
// where you would see it.
//
// Scene frame at the base (the base layout's own): north -Z, east +X, up +Y.
// Earth is to the north, over the base as seen from the pad.

import * as THREE from 'three';
import { EclipticGeoMoon, Libration, SiderealTime, SunPosition } from 'astronomy-engine';
import { BRIGHT_STARS } from '@/lib/sky/stars';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

/** Selenographic place of the base, degrees: the south polar region, on the Earth-facing side. */
export const BASE_SITE = { lat: -76, lon: 0 };
const DEG = Math.PI / 180;
const OBLIQUITY = 23.4393 * DEG;
const EARTH_KM = 6371;
/** Sky shells round the camera, m: inside the far plane, Earth behind the horizon hills. */
const STAR_R = 1800;
const SUN_R = 1700;
const EARTH_AT = 3000;

export interface SkyFrame {
  /** Unit vector toward Earth in the scene. */
  earthDir: THREE.Vector3;
  /** Earth's apparent diameter, degrees. */
  earthDiameterDeg: number;
  /** Earth's north pole, in the scene. */
  earthAxis: THREE.Vector3;
  /** Where the Sun is overhead on Earth, degrees (east longitude). */
  subsolar: { lat: number; lon: number };
  /** Ecliptic unit vector (of date) → scene direction. */
  fromEcliptic: (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3;
}

/** Equatorial (J2000) → ecliptic, a turn about x by the obliquity. */
function eqToEcl(x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(OBLIQUITY); const s = Math.sin(OBLIQUITY);
  return [x, y * c + z * s, -y * s + z * c];
}

/** The sky's geometry for a date: nothing drawn, only directions. */
export function skyFrame(date: Date): SkyFrame {
  const lib = Libration(date);
  const moonLon = EclipticGeoMoon(date).lon;
  // The Moon's body frame in ecliptic longitude: its x axis looks back at
  // Earth's mean place, which libration swings the real Earth about.
  const theta = (moonLon + 180 - lib.elon) * DEG;
  const ct = Math.cos(theta); const st = Math.sin(theta);
  const la = BASE_SITE.lat * DEG; const lo = BASE_SITE.lon * DEG;
  const up = new THREE.Vector3(Math.cos(lo) * Math.cos(la), Math.sin(lo) * Math.cos(la), Math.sin(la));
  const east = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
  const north = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la));
  const m = new THREE.Vector3();
  /** Moon-fixed → scene: east +X, up +Y, north -Z. */
  const toScene = (out: THREE.Vector3) => out.set(m.dot(east), m.dot(up), -m.dot(north));
  const fromEcliptic = (x: number, y: number, z: number, out: THREE.Vector3) => {
    m.set(x * ct + y * st, -x * st + y * ct, z);
    return toScene(out);
  };
  const el = lib.elat * DEG; const eo = lib.elon * DEG;
  m.set(Math.cos(el) * Math.cos(eo), Math.cos(el) * Math.sin(eo), Math.sin(el));
  const earthDir = toScene(new THREE.Vector3()).normalize();
  const earthAxis = fromEcliptic(...eqToEcl(0, 0, 1), new THREE.Vector3()).normalize();
  // The subsolar point: the Sun's right ascension against Greenwich sidereal time.
  const sun = SunPosition(date);
  const sl = sun.elon * DEG;
  const sx = Math.cos(sl); const sy = Math.sin(sl);
  const ra = Math.atan2(sy * Math.cos(OBLIQUITY), sx);
  const dec = Math.asin(sy * Math.sin(OBLIQUITY));
  let lon = (ra / DEG - SiderealTime(date) * 15) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return {
    earthDir, earthAxis, fromEcliptic,
    earthDiameterDeg: 2 * Math.asin(EARTH_KM / lib.dist_km) / DEG,
    subsolar: { lat: dec / DEG, lon },
  };
}

/** A point on Earth's texture sphere (three's SphereGeometry, equirectangular map). */
function earthLocal(latDeg: number, lonDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const p = latDeg * DEG; const l = lonDeg * DEG;
  return out.set(Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l));
}

/** Turn Earth so its pole is on its real axis and the meridian under the Sun faces `sunDir`. */
export function earthOrientation(frame: SkyFrame, sunDir: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  const e1 = new THREE.Vector3(0, 1, 0);
  const s = earthLocal(frame.subsolar.lat, frame.subsolar.lon, new THREE.Vector3());
  const e2 = s.addScaledVector(e1, -s.dot(e1)).normalize();
  const e3 = new THREE.Vector3().crossVectors(e1, e2);
  const f1 = frame.earthAxis;
  const f2 = sunDir.clone().addScaledVector(f1, -sunDir.dot(f1)).normalize();
  const f3 = new THREE.Vector3().crossVectors(f1, f2);
  const E = new THREE.Matrix4().makeBasis(e1, e2, e3);
  const F = new THREE.Matrix4().makeBasis(f1, f2, f3);
  return out.setFromRotationMatrix(F.multiply(E.transpose()));
}

/** Seeded, so the faint sky is the same every visit. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Equatorial J2000 → galactic; its transpose goes back. */
const EQ_TO_GAL = new THREE.Matrix3().set(
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.44482963, 0.7469822445,
  -0.867666149, -0.1980763734, 0.4559837762,
);

const StarShader = {
  uniforms: { uFade: { value: 1 }, uPx: { value: 1 } },
  vertexShader: `attribute float size; attribute vec3 color; uniform float uFade; uniform float uPx; varying vec3 vC;
    void main() { vC = color * uFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = size * uPx; }`,
  fragmentShader: `varying vec3 vC;
    void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.12, d); gl_FragColor = vec4(vC * a, 1.0); }`,
};

const AtmosphereShader = {
  uniforms: { uSun: { value: new THREE.Vector3() } },
  vertexShader: `varying vec3 vN; varying vec3 vV; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 uSun; varying vec3 vN; varying vec3 vV;
    void main() { float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.2); float lit = clamp(dot(vN, uSun) * 1.4 + 0.35, 0.0, 1.0);
      gl_FragColor = vec4(vec3(0.42, 0.66, 1.0) * rim * lit * 1.6, rim * lit); }`,
};

/** Stars, sized and bright by magnitude: the catalogue's bright ones where they are, a seeded faint field, the Milky Way. */
function starPoints(frame: SkyFrame, faint: number, band: number): THREE.Points {
  const total = BRIGHT_STARS.length + faint + band;
  const pos = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const size = new Float32Array(total);
  const v = new THREE.Vector3();
  let n = 0;
  const put = (eqx: number, eqy: number, eqz: number, bright: number, px: number, warm: number) => {
    frame.fromEcliptic(...eqToEcl(eqx, eqy, eqz), v).multiplyScalar(STAR_R);
    pos[n * 3] = v.x; pos[n * 3 + 1] = v.y; pos[n * 3 + 2] = v.z;
    col[n * 3] = bright * (0.88 + warm * 0.14);
    col[n * 3 + 1] = bright * 0.93;
    col[n * 3 + 2] = bright * (1.04 - warm * 0.18);
    size[n] = px;
    n += 1;
  };
  const r = rng(76);
  for (const s of BRIGHT_STARS) {
    const a = s.ra * 15 * DEG; const d = s.dec * DEG;
    // No air: magnitude sets the light, and the brightest are a touch bigger, never a blob.
    const bright = Math.pow(10, -0.4 * (s.mag - 1.2)) * 0.9;
    put(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d), Math.min(2.2, bright), 2.2 + Math.max(0, 1.5 - s.mag) * 0.5, r());
  }
  for (let i = 0; i < faint; i++) {
    const u = r() * 2 - 1; const a = r() * Math.PI * 2; const q = Math.sqrt(1 - u * u);
    // Magnitudes 2.5…6.5, many more faint than bright.
    const mag = 6.5 - 4 * Math.pow(r(), 2.6);
    // A gentler curve than the true one: a screen cannot show a sixth magnitude star honestly.
    put(q * Math.cos(a), q * Math.sin(a), u, 0.6 * Math.pow(10, -0.25 * (mag - 2.5)), 1.3 + (6.5 - mag) * 0.12, r());
  }
  const gal = new THREE.Vector3();
  const back = EQ_TO_GAL.clone().transpose();
  for (let i = 0; i < band; i++) {
    // Along the galactic plane, thicker and denser toward the centre.
    let l = r() * Math.PI * 2;
    if (r() > 0.5 + 0.5 * Math.cos(l)) l = r() * Math.PI * 2;
    const b = (r() + r() + r() - 1.5) * 0.13 * (1 + 0.8 * Math.max(0, Math.cos(l)));
    gal.set(Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)).applyMatrix3(back);
    put(gal.x, gal.y, gal.z, 0.03 + Math.pow(r(), 2) * 0.12, 1.1, r());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({ ...StarShader, uniforms: THREE.UniformsUtils.clone(StarShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  p.name = 'moon-stars';
  return p;
}

export interface MoonSkyHandle {
  /** Rides with the camera: the sky has no parallax. */
  group: THREE.Group;
  /** Toward Earth in the scene: the dish tracks it, the missions point at it. */
  earthDir: THREE.Vector3;
  frame: SkyFrame;
  update: (dt: number, camera: THREE.Camera, pixelRatio: number) => void;
  dispose: () => void;
}

export function makeMoonSky(sunDir: THREE.Vector3, stars: { faint: number; band: number }, date = new Date()): MoonSkyHandle {
  const group = new THREE.Group();
  group.name = 'moon-sky';
  let frame = skyFrame(date);
  const points = starPoints(frame, stars.faint, stars.band);
  group.add(points);
  const starMat = points.material as THREE.ShaderMaterial;

  const glowTex = softSpriteTexture();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(6, 5.7, 5.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunSprite.position.copy(sunDir).multiplyScalar(SUN_R);
  sunSprite.scale.setScalar(90);
  // No air: the glare round the Sun is the visor's, not the sky's, so it stays tight and the sky beside it stays black.
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1d6, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunHalo.position.copy(sunSprite.position);
  sunHalo.scale.setScalar(300);
  group.add(sunSprite, sunHalo);

  // Earth at its true apparent size: about two degrees across.
  const R = EARTH_AT * Math.tan((frame.earthDiameterDeg / 2) * DEG);
  const earthGeom = new THREE.SphereGeometry(R, 48, 32);
  const earthMat = new THREE.MeshStandardMaterial({ color: 0x8fb7ff, roughness: 0.9, metalness: 0 });
  const earth = new THREE.Mesh(earthGeom, earthMat);
  earth.name = 'earth';
  earth.position.copy(frame.earthDir).multiplyScalar(EARTH_AT);
  earthOrientation(frame, sunDir, earth.quaternion);
  group.add(earth);
  const cloudGeom = new THREE.SphereGeometry(R * 1.012, 48, 32);
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const clouds = new THREE.Mesh(cloudGeom, cloudMat);
  earth.add(clouds);
  const atmoGeom = new THREE.SphereGeometry(R * 1.05, 48, 32);
  const atmoMat = new THREE.ShaderMaterial({ ...AtmosphereShader, uniforms: THREE.UniformsUtils.clone(AtmosphereShader.uniforms), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  earth.add(new THREE.Mesh(atmoGeom, atmoMat));
  let cancelled = false;
  const loader = new THREE.TextureLoader();
  loader.load('/solar-system/planets/earth-1k.jpg', (tex) => {
    if (cancelled) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    earthMat.map = tex;
    earthMat.color.set(0xffffff);
    earthMat.needsUpdate = true;
  });
  loader.load('/solar-system/planets/earth-clouds-1k.jpg', (tex) => {
    if (cancelled) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    cloudMat.map = tex;
    cloudMat.alphaMap = tex;
    cloudMat.opacity = 0.9;
    cloudMat.needsUpdate = true;
  });

  const fwd = new THREE.Vector3();
  let fade = 1;
  let turnAt = 20;
  let elapsed = 0;
  const handle: MoonSkyHandle = {
    group, earthDir: frame.earthDir, frame,
    update(dt, camera, pixelRatio) {
      group.position.copy(camera.position);
      // A real camera: with the Sun or the bright Earth in frame the exposure
      // drops, and the faint stars go first.
      camera.getWorldDirection(fwd);
      const sunIn = THREE.MathUtils.smoothstep(fwd.dot(sunDir), Math.cos(42 * DEG), Math.cos(14 * DEG));
      const earthIn = THREE.MathUtils.smoothstep(fwd.dot(frame.earthDir), Math.cos(30 * DEG), Math.cos(6 * DEG));
      const want = Math.max(0.12, 1 - sunIn * 0.85 - earthIn * 0.35);
      fade += (want - fade) * (1 - Math.exp(-dt * 3));
      starMat.uniforms.uFade.value = fade;
      starMat.uniforms.uPx.value = pixelRatio;
      atmoMat.uniforms.uSun.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      clouds.rotation.y += dt * 0.0006;
      // Earth turns fifteen degrees an hour: re-aim it now and then.
      turnAt -= dt;
      elapsed += dt;
      if (turnAt <= 0) {
        turnAt = 20;
        frame = skyFrame(new Date(date.getTime() + elapsed * 1000));
        handle.frame = frame;
        handle.earthDir.copy(frame.earthDir);
        earth.position.copy(frame.earthDir).multiplyScalar(EARTH_AT);
        earthOrientation(frame, sunDir, earth.quaternion);
      }
    },
    dispose() {
      cancelled = true;
      points.geometry.dispose(); starMat.dispose();
      sunSprite.material.dispose(); sunHalo.material.dispose();
      earthGeom.dispose(); cloudGeom.dispose(); atmoGeom.dispose();
      earthMat.map?.dispose(); cloudMat.map?.dispose();
      earthMat.dispose(); cloudMat.dispose(); atmoMat.dispose();
    },
  };
  return handle;
}
