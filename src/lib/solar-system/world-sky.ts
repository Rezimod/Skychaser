// The sky over another world. A dome shaded by single scattering — a
// Rayleigh-like term with the world's own coefficients per channel, and a
// Mie term with a forward lobe — through an air mass that grows toward the
// horizon: on Mars that makes a butterscotch sky with a blue glow round the
// sun, on Proxima b a violet zenith over a salmon horizon and a wide orange
// wash round a star that never sets. The star's disc is drawn in the same
// shader, dimmed by the same air. A cloud deck (world-clouds) is raymarched
// into the dome above the horizon. The moons cross it, any second suns sit
// in it, the starfield shows through by however much the sky lets it, and,
// where the star flares, aurora curtains roll overhead. A ringed giant
// (world-giant) hangs in Proxima b's.
//
// From height (surface-orbit), the dome is laid out against the true
// horizon, which sinks below the level as the camera climbs, and the air in
// it fades to black space — the star's disc stays, now unfiltered, and the
// stars come out. The planet globe is drawn over the dome below the horizon.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import { starfield } from '@/lib/solar-system/moon-surface';
import { CLOUD_GLSL, cloudSteps, cloudUniforms, driftClouds } from '@/lib/solar-system/world-clouds';
import { makeGiant } from '@/lib/solar-system/world-giant';
import type { WorldProfile } from '@/lib/solar-system/world-profiles';
import { isGlobeWorld } from '@/lib/solar-system/planet-frame';
import { skyAt } from '@/lib/solar-system/surface-orbit';

export interface WorldSky {
  group: THREE.Group;
  /** The image the visor and the metal reflect. */
  environment: THREE.Texture;
  /** The star's light as it reaches the ground, after the air: for the key light's tint. */
  sunTint: THREE.Color;
  update: (dt: number, cameraPos: THREE.Vector3) => void;
  /** The camera's height above the planet's reference sphere, m: the air
   *  thins to space, the horizon sinks, the cloud deck goes. Globe worlds only. */
  setAltitude: (altitudeM: number, cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

const DOME = 1800;

/** The scattering model, as GLSL shared by the dome and the environment bake. */
const SCATTER_GLSL = /* glsl */`
  uniform vec3 uSun; uniform vec3 uBetaR; uniform vec3 uBetaM; uniform vec3 uBetaA; uniform float uG; uniform float uSunI;
  uniform float uSunCos; uniform vec3 uSunDisc; uniform vec3 uGround; uniform vec3 uHaze; uniform float uCloudGain;
  uniform vec3 uSunTint; uniform vec3 uAmbient;
  // Optical path through a flat-ish atmosphere: 1 at the zenith, ~38 at the horizon (Kasten-Young).
  float airMass(float y) {
    float yc = max(y, 0.0);
    float zen = degrees(acos(yc));
    return 1.0 / (yc + 0.15 * pow(max(93.885 - zen, 0.1), -1.253));
  }
  float rayleighPhase(float c) { return 3.0 / (16.0 * 3.14159) * (1.0 + c * c); }
  float miePhase(float c, float g) { float k = 1.0 + g * g - 2.0 * g * c; return (1.0 - g * g) / (4.0 * 3.14159 * k * sqrt(k)); }
  // The star's light after its own path through the air. Extinction is
  // scattering plus absorption: Mars's dust takes the blue out rather than
  // scattering it, which is what makes the sky butterscotch.
  vec3 sunTransmittance() { float m = airMass(uSun.y); return exp(-(uBetaR + uBetaM + uBetaA) * m); }
  // Radiance in-scattered along a view ray with elevation dir.y, single scattering, constant density along the path.
  vec3 skyRadiance(vec3 dir, out vec3 fex) {
    float m = airMass(dir.y);
    vec3 beta = uBetaR + uBetaM + uBetaA;
    fex = exp(-beta * m);
    float c = dot(dir, uSun);
    vec3 sunE = uSunI * uSunTint * sunTransmittance();
    vec3 scat = (uBetaR * rayleighPhase(c) + uBetaM * miePhase(c, uG)) / beta;
    vec3 L = sunE * scat * (1.0 - fex);
    // Multiple scattering, roughly: a floor of the sky's own colour so the shadowed side is never black.
    L += sunE * (uBetaR / beta) * 0.035 * (1.0 - fex);
    // Skylight from beyond the model — the day side over the horizon on a
    // locked world — strongest overhead, where the air in front is thinnest.
    L += uAmbient * (0.4 + 0.6 * fex);
    return L;
  }
`;

const SkyShader = {
  vertexShader: /* glsl */`varying vec3 vDir; void main() { vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w; }`,
  fragmentShader: /* glsl */`
    ${SCATTER_GLSL}
    ${CLOUD_GLSL}
    uniform float uCamY; uniform float uAir; uniform float uDip; uniform float uCloudVis;
    varying vec3 vDir;
    void main() {
      vec3 dir = normalize(vDir);
      // Against the true horizon, which sinks by uDip below the level with height.
      float el = asin(clamp(dir.y, -1.0, 1.0)) + uDip;
      vec3 sky = vec3(normalize(dir.xz + vec2(1e-6)) * cos(el), sin(el)).xzy;
      // The sky is evaluated a hair above the ground line, so the horizon band has a value to fade to.
      vec3 up = vec3(sky.x, max(sky.y, 0.006), sky.z);
      vec3 fex;
      // The air glows by how much of it is over the camera: none in space.
      vec3 col = skyRadiance(normalize(up), fex) * uAir;
      // The star: its disc through the air (none left in space), and a tight corona.
      float c = dot(dir, uSun);
      vec3 sunT = mix(vec3(1.0), sunTransmittance(), uAir);
      float edge = (1.0 - uSunCos) * 0.35;
      float disc = smoothstep(uSunCos - edge, uSunCos + edge * 0.4, c);
      col += uSunDisc * sunT * disc * step(0.0, sky.y + 0.02);
      col += uSunDisc * sunT * pow(max(c, 0.0), 800.0) * 0.12;
      // Clouds, above the horizon, lit by the star's light at their height.
      #if CLOUD_STEPS > 0
        // High cloud sees less of the dust than the ground does: half the extinction.
        vec4 cl = marchClouds(vec3(0.0, uCamY, 0.0), dir, uSun, pow(sunT, vec3(0.5)));
        col = mix(col, col * cl.a + cl.rgb * uCloudGain, uCloudVis);
      #endif
      // Below the ground line the dome is the colour of the air at a distance, dimmer.
      col = mix(col, (uHaze * uSunI * 0.05 + uGround) * uAir, smoothstep(0.012, -0.05, sky.y));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const AuroraShader = {
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float uTime; uniform float uSeed; varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = hash(i.x + i.y * 57.0 + uSeed), b = hash(i.x + 1.0 + i.y * 57.0 + uSeed), c = hash(i.x + (i.y + 1.0) * 57.0 + uSeed), d = hash(i.x + 1.0 + (i.y + 1.0) * 57.0 + uSeed);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
    void main() {
      float x = vUv.x * 9.0 + uTime * 0.05;
      float ray = noise(vec2(x, uTime * 0.12)) * 0.6 + noise(vec2(x * 3.1, uTime * 0.3)) * 0.4;
      float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
      float a = ray * ray * band * 0.9 * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
      // Green at the foot, magenta and teal higher up — an oxygen sky under a flaring star.
      vec3 col = mix(vec3(0.3, 1.0, 0.45), vec3(0.95, 0.35, 0.9), smoothstep(0.15, 0.6, vUv.y));
      col = mix(col, vec3(0.35, 0.9, 1.0), smoothstep(0.55, 0.95, vUv.y) * 0.8);
      gl_FragColor = vec4(col * a * 2.4, a);
    }`,
};

function lumpyMoon(size: number, color: number, lumpy: boolean): THREE.Mesh {
  const g = new THREE.IcosahedronGeometry(size, 3);
  if (lumpy) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = 1 + Math.sin(v.x * 2.1) * Math.cos(v.z * 1.7) * 0.16 + Math.sin(v.y * 3.3 + v.x) * 0.1;
      v.multiplyScalar(n);
      v.x *= 1.25; v.z *= 0.85;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
  }
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, fog: false }));
  return m;
}

/** The dome's uniforms from the profile: the coefficients are zenith optical depths. */
function skyUniforms(profile: WorldProfile) {
  const A = profile.atmosphere;
  const mie = A.mie * A.turbidity;
  // The disc's angular radius, from the old sprite's size at its distance.
  const discRad = Math.atan((profile.sun.discScale * 0.5) / 1700);
  return {
    uSun: { value: profile.sunDir.clone().normalize() },
    uBetaR: { value: new THREE.Vector3(...A.rayleigh) },
    uBetaM: { value: new THREE.Vector3(A.mieTint[0] * mie, A.mieTint[1] * mie, A.mieTint[2] * mie) },
    uBetaA: { value: new THREE.Vector3(...A.absorb) },
    uG: { value: A.mieG }, uSunI: { value: A.sunIntensity },
    uSunTint: { value: new THREE.Vector3(...A.sunTint) }, uAmbient: { value: new THREE.Color(...A.ambient) },
    uSunCos: { value: Math.cos(discRad) }, uSunDisc: { value: profile.sun.disc.clone() },
    uGround: { value: profile.sky.horizon.clone().multiplyScalar(0.35) },
    uHaze: { value: new THREE.Color(...A.hazeColor) },
    uCloudGain: { value: A.sunIntensity * 0.05 },
    uCamY: { value: 0 },
    /** 1 on the ground, 0 in space; the horizon's dip, rad; the cloud deck, 1…0. */
    uAir: { value: 1 }, uDip: { value: 0 }, uCloudVis: { value: 1 },
  };
}

/** The star's light at the ground, after the air, on the CPU: the same arithmetic as the shader. */
function sunAtGround(profile: WorldProfile): THREE.Color {
  const A = profile.atmosphere;
  const y = Math.max(profile.sunDir.y, 0);
  const zen = (Math.acos(y) * 180) / Math.PI;
  const m = 1 / (y + 0.15 * Math.pow(Math.max(93.885 - zen, 0.1), -1.253));
  const mie = A.mie * A.turbidity;
  const t = (k: number) => A.sunTint[k] * Math.exp(-(A.rayleigh[k] + A.mieTint[k] * mie + A.absorb[k]) * m);
  return new THREE.Color(t(0), t(1), t(2));
}

export function makeWorldSky(renderer: THREE.WebGLRenderer, profile: WorldProfile, lite: boolean, cloudLevel = lite ? 0 : 1): WorldSky {
  const group = new THREE.Group();
  const S = profile.sky;
  const owned: THREE.Material[] = [];
  const geoms: THREE.BufferGeometry[] = [];

  const uniforms = { ...skyUniforms(profile), ...cloudUniforms(profile.clouds) };
  const steps = profile.clouds ? cloudSteps(cloudLevel) : 0;
  const domeGeom = new THREE.SphereGeometry(DOME, 48, 24);
  const domeMat = new THREE.ShaderMaterial({
    ...SkyShader, uniforms, defines: { CLOUD_STEPS: steps },
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const dome = new THREE.Mesh(domeGeom, domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);
  geoms.push(domeGeom); owned.push(domeMat);

  const stars = starfield(lite ? 2200 : 4200, lite ? 4000 : 9000);
  // Added over the sky, so they show through a dim one and drown in a bright one.
  const starMat = stars.material as THREE.PointsMaterial;
  const starsGround = 0.9 * S.stars;
  starMat.opacity = starsGround;
  starMat.blending = THREE.AdditiveBlending;
  stars.visible = S.stars > 0;
  stars.renderOrder = -9;
  group.add(stars);

  const glowTex = softSpriteTexture();
  const sprite = (color: THREE.Color | number, opacity: number, dir: THREE.Vector3, dist: number, scale: number) => {
    const mat = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    owned.push(mat);
    const sp = new THREE.Sprite(mat);
    sp.position.copy(dir).multiplyScalar(dist);
    sp.scale.setScalar(scale);
    sp.renderOrder = -8;
    group.add(sp);
    return sp;
  };
  // The disc and its glow are in the dome now; the second suns keep their sprites.
  for (const st of S.stars2) {
    sprite(st.color, 1, st.dir, 1750, st.scale);
    sprite(st.color, 0.25, st.dir, 1750, st.scale * 4);
  }

  const moons = S.moons.map((mn) => {
    const mesh = lumpyMoon(mn.size, mn.color, mn.lumpy);
    geoms.push(mesh.geometry); owned.push(mesh.material as THREE.Material);
    mesh.renderOrder = -7;
    group.add(mesh);
    return { mesh, dir: mn.dir.clone(), axis: mn.axis, rate: mn.rate, spin: Math.random() * 6 };
  });

  const curtains: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial }[] = [];
  if (S.aurora) {
    for (let i = 0; i < (lite ? 2 : 4); i++) {
      const mat = new THREE.ShaderMaterial({
        ...AuroraShader, uniforms: { uTime: { value: 0 }, uSeed: { value: i * 17.3 } },
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const geom = new THREE.PlaneGeometry(1500, 480, 1, 1);
      const mesh = new THREE.Mesh(geom, mat);
      const a = i * 1.7 + 0.6;
      mesh.position.set(Math.cos(a) * 560, 560 + i * 40, Math.sin(a) * 560);
      mesh.lookAt(0, 380, 0);
      mesh.renderOrder = -6;
      mesh.frustumCulled = false;
      group.add(mesh);
      curtains.push({ mesh, mat });
      geoms.push(geom); owned.push(mat);
    }
  }

  // The ringed giant, where the profile has one.
  const giant = profile.giant ? makeGiant(profile.giant, profile.sunDir, profile.atmosphere.hazeColor, lite) : null;
  if (giant) group.add(giant.group);

  // The visor's environment: this sky (without the clouds, which move), this ground, this sun.
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.ShaderMaterial({ ...SkyShader, uniforms: domeMat.uniforms, defines: { CLOUD_STEPS: 0 }, side: THREE.BackSide }));
  envScene.add(envSky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(...profile.ground.plain) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  envScene.add(ground);
  const sun = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshBasicMaterial({ color: profile.sun.disc.clone().multiplyScalar(5) }));
  sun.position.copy(profile.sunDir).multiplyScalar(40);
  envScene.add(sun);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene, 0.03);
  const environment = envTarget.texture;
  pmrem.dispose();
  for (const o of [envSky, ground, sun]) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }

  let t = 0;
  const q = new THREE.Quaternion();
  return {
    group,
    environment,
    sunTint: sunAtGround(profile),
    setAltitude(altitudeM, cameraPos) {
      if (!isGlobeWorld(profile.id)) return;
      const k = skyAt(profile.id, altitudeM);
      uniforms.uAir.value = k.air;
      uniforms.uDip.value = k.dip;
      uniforms.uCloudVis.value = k.clouds;
      uniforms.uCamY.value = cameraPos.y;
      // The stars come out as the air goes, and only once the sky is dark.
      starMat.opacity = starsGround + (0.9 - starsGround) * Math.pow(1 - k.air, 3);
      stars.visible = starMat.opacity > 0.001;
    },
    update(dt, cameraPos) {
      t += dt;
      group.position.copy(cameraPos);
      uniforms.uCamY.value = cameraPos.y;
      driftClouds(uniforms, profile.clouds, t);
      for (const mn of moons) {
        q.setFromAxisAngle(mn.axis, mn.rate * dt);
        mn.dir.applyQuaternion(q);
        mn.mesh.position.copy(mn.dir).multiplyScalar(1500);
        mn.mesh.rotation.y = mn.spin + t * 0.02;
      }
      for (const c of curtains) c.mat.uniforms.uTime.value = t;
    },
    dispose() {
      giant?.dispose();
      for (const g of geoms) g.dispose();
      for (const m of owned) m.dispose();
      stars.geometry.dispose();
      (stars.material as THREE.Material).dispose();
      envTarget.dispose();
    },
  };
}
