// The sky over Tbilisi at the scene's own clock. The Sun and the Moon are
// where astronomy-engine puts them for the app's default observer; the dome
// is the air in world-earth-atmosphere lit by each of them; the stars are
// the real bright-star catalogue and the planets are where they are, and
// how many of them show is decided by how bright the sky behind them is —
// the naked-eye limit through the city's own glow, which is sodium orange
// and LED white and doubles under cloud. Clouds, when the forecast has any,
// are drawn in the dome at the height they sit, so the terrain covers them.
//
// The eye adapts: one number takes the scene from a noon sky to a night one
// without the night going black, and every light in the scene is scaled by it.
//
// Climbing (surface-orbit `setAltitude`), the dome is laid out against the
// true horizon, which sinks below the level, its air fades to black space by
// 60 km, and the cloud deck, 2.2 km over a camera on the ground, is passed
// through and gone by 3.2 km above the sea; the globe under the dome has
// clouds of its own.

import * as THREE from 'three';
import { Body, Illumination } from 'astronomy-engine';
import { BRIGHT_STARS } from '@/lib/sky/stars';
import { raDecToAzAlt } from '@/lib/sky/catalog';
import { DEFAULT_OBSERVER } from '@/lib/observer-location';
import {
  LUT_AZ, LUT_EL, TBILISI_AIR, bakeSkyTable, luminance, lutElevation, multipleScattering, transmittance,
} from '@/lib/solar-system/world-earth-atmosphere';
import { azAltToDir, bodyAzAlt, moonState } from '@/lib/solar-system/world-earth-tonight';
import { haze } from '@/lib/solar-system/world-earth-haze';
import { skyAt } from '@/lib/solar-system/surface-orbit';

/** Display units per unit of solar irradiance: a clear noon zenith near 0.25, the horizon under
 *  the bloom threshold, so the sky never glows over the scene. */
const SKY_SCALE = 14;
/** Luminance, cd/m², of one unit of radiance per unit irradiance (the Sun gives ~120 klx). */
const CD_PER_UNIT = 1.2e5;
/** Tbilisi's own glow at the zenith on a clear night: about 18 mag/arcsec². */
const CITY_GLOW_CD = 6.8e-3;
const MAX_ADAPT = 2.2e4;
const DOME = 1800;
/** The cloud deck over a camera on the ground, m; and the height above the sea below which the camera counts as on the ground. */
const DECK = 2200;
const DECK_FLOOR = 1000;

export interface SkyState {
  /** The scene's clock, refreshed about once a second of scene time; `dateMs` is exact every frame. */
  date: Date;
  dateMs: number;
  sunDir: THREE.Vector3;
  sunAlt: number;
  moonDir: THREE.Vector3;
  moonAlt: number;
  moonFraction: number;
  /** The shadow-casting light: the Sun by day, the Moon when it is the brighter. */
  keyDir: THREE.Vector3;
  keyColor: THREE.Color;
  keyIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  /** 0 in daylight, 1 once the street lights are all on. */
  night: number;
  adapt: number;
  /** Naked-eye limiting magnitude at the zenith. */
  limitMag: number;
  cloud: number;
  visibility: number;
}

export interface EarthSky {
  group: THREE.Group;
  environment: THREE.Texture;
  state: SkyState;
  setDate: (date: Date) => void;
  setWeather: (cloud: number, visibilityM: number) => void;
  /** Advance the clock by dt seconds of real time and follow the camera. */
  update: (dt: number, cameraPos: THREE.Vector3) => void;
  /** The camera's height above sea level, m: the air thins to space, the horizon sinks, the deck goes. */
  setAltitude: (altitudeM: number, cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

const DomeShader = {
  vertexShader: `varying vec3 vDir; void main() { vDir = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w; }`,
  fragmentShader: `
    uniform sampler2D uSunLut; uniform sampler2D uMoonLut; uniform float uSunLutMax; uniform float uMoonLutMax;
    uniform vec3 uSunDir; uniform vec3 uMoonDir; uniform float uMoonK;
    uniform vec3 uSunDisc; uniform vec3 uGlow; uniform float uGain;
    uniform float uCloud; uniform float uTime; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform vec2 uWind;
    uniform float uAir; uniform float uDip; uniform float uDeck;
    varying vec3 vDir;
    vec3 lut(sampler2D t, float peak, vec3 d, vec3 L) {
      float el = asin(clamp(d.y, -1.0, 1.0));
      vec2 a = normalize(d.xz + vec2(1e-5)); vec2 b = normalize(L.xz + vec2(1e-5));
      float daz = acos(clamp(dot(a, b), -1.0, 1.0));
      float v = sqrt(clamp((max(el, -0.03) + 0.03) / (1.5708 + 0.03), 0.0, 1.0));
      vec3 c = texture2D(t, vec2((daz / 3.14159265 * ${LUT_AZ - 1}.0 + 0.5) / ${LUT_AZ}.0, (v * ${LUT_EL - 1}.0 + 0.5) / ${LUT_EL}.0)).rgb;
      c *= c;
      return c * c * peak;
    }
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
    void main() {
      vec3 v = normalize(vDir);
      // The air against the true horizon, which sinks by uDip below the level with height.
      float vel = asin(clamp(v.y, -1.0, 1.0)) + uDip;
      vec3 d = vec3(normalize(v.xz + vec2(1e-6)) * cos(vel), sin(vel)).xzy;
      vec3 col = lut(uSunLut, uSunLutMax, d, uSunDir) + lut(uMoonLut, uMoonLutMax, d, uMoonDir) * uMoonK;
      float up = max(d.y, 0.0);
      col += uGlow * (0.3 + 1.8 * pow(1.0 - up, 6.0));
      // How much of the air is over the camera: none in space. The disc stays.
      col *= uAir;
      float cs = dot(v, uSunDir);
      col += uSunDisc * smoothstep(0.99997, 0.999985, cs) + uSunDisc * 0.03 * pow(max(cs, 0.0), 900.0);
      if (uCloud > 0.01 && uDeck > 1.0 && d.y > 0.004) {
        // The deck, uDeck over the eye: where the line of sight crosses it, and how far away that is.
        vec2 hit = d.xz / d.y * uDeck;
        float dist = length(hit);
        vec2 p = hit / 2600.0 + uWind * uTime;
        float n = fbm(p) * 0.75 + fbm(p * 3.1 + 4.0) * 0.25;
        float cover = smoothstep(1.02 - uCloud * 0.62, 1.2 - uCloud * 0.62, n + 0.18);
        float fade = exp(-dist / 26000.0);
        float lit = 0.55 + 0.45 * pow(max(dot(d, uSunDir), 0.0), 3.0);
        vec3 cloud = mix(uCloudShade, uCloudLit, lit * (1.0 - n * 0.5));
        // Thinning out as the camera climbs into it, rather than gone at once.
        col = mix(col, cloud * max(uAir, 0.2), cover * fade * 0.94 * smoothstep(0.0, 400.0, uDeck));
      }
      col *= uGain;
      col *= mix(0.4, 1.0, smoothstep(-0.08, 0.0, d.y));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const StarShader = {
  vertexShader: `
    attribute float aSize; attribute vec3 aColor; varying vec3 vColor;
    void main() { vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * 0.99999; gl_PointSize = aSize; }`,
  fragmentShader: `
    varying vec3 vColor;
    void main() { vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0; float a = exp(-r * 4.0); gl_FragColor = vec4(vColor * a, a); }`,
};

const MoonShader = {
  vertexShader: `varying vec3 vN; varying vec2 vUv; void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99998; }`,
  fragmentShader: `
    uniform sampler2D uMap; uniform float uHasMap; uniform vec3 uSun; uniform vec3 uTint; varying vec3 vN; varying vec2 vUv;
    void main() {
      vec3 alb = uHasMap > 0.5 ? texture2D(uMap, vUv).rgb : vec3(0.55);
      float lit = max(dot(normalize(vN), uSun), 0.0);
      gl_FragColor = vec4(alb * lit * uTint + alb * 0.0015 * uTint, 1.0);
    }`,
};

/** Night radiance is a millionth of day's: stored as the fourth root of a
 *  fraction of the table's own peak, so half floats keep the dark end. */
function halfTable(src: Float32Array, dst: Uint16Array): number {
  let peak = 1e-30;
  for (let i = 0; i < src.length; i += 4) peak = Math.max(peak, src[i], src[i + 1], src[i + 2]);
  for (let i = 0; i < src.length; i++) dst[i] = THREE.DataUtils.toHalfFloat(i % 4 === 3 ? 1 : Math.sqrt(Math.sqrt(Math.max(0, src[i]) / peak)));
  return peak;
}

export function makeEarthSky(renderer: THREE.WebGLRenderer, lite: boolean, start: Date): EarthSky {
  const group = new THREE.Group();
  group.name = 'earth-sky';
  const air = { ...TBILISI_AIR };
  const lutTex = () => {
    const t = new THREE.DataTexture(new Uint16Array(LUT_AZ * LUT_EL * 4), LUT_AZ, LUT_EL, THREE.RGBAFormat, THREE.HalfFloatType);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.needsUpdate = true;
    return t;
  };
  const sunLut = lutTex();
  const moonLut = lutTex();
  const sunTable = new Float32Array(LUT_AZ * LUT_EL * 4);
  const moonTable = new Float32Array(LUT_AZ * LUT_EL * 4);

  const uniforms = {
    uSunLut: { value: sunLut }, uMoonLut: { value: moonLut }, uSunLutMax: { value: 0 }, uMoonLutMax: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uMoonK: { value: 0 }, uSunDisc: { value: new THREE.Vector3() }, uGlow: { value: new THREE.Vector3() },
    uGain: { value: SKY_SCALE }, uCloud: { value: 0 }, uTime: { value: 0 },
    uCloudLit: { value: new THREE.Vector3(1, 1, 1) }, uCloudShade: { value: new THREE.Vector3(0.5, 0.5, 0.55) },
    uWind: { value: new THREE.Vector2(0.0011, 0.0004) },
    /** 1 on the ground, 0 in space; the horizon's dip, rad; the cloud deck's height over the eye, m. */
    uAir: { value: 1 }, uDip: { value: 0 }, uDeck: { value: DECK },
  };
  const domeGeom = new THREE.SphereGeometry(DOME, lite ? 32 : 48, lite ? 16 : 24);
  const domeMat = new THREE.ShaderMaterial({ ...DomeShader, uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const dome = new THREE.Mesh(domeGeom, domeMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // ── Stars and planets: one point each at its real place. ──
  const PLANETS: [Body, string][] = [[Body.Venus, 'venus'], [Body.Jupiter, 'jupiter'], [Body.Mars, 'mars'], [Body.Saturn, 'saturn'], [Body.Mercury, 'mercury']];
  const nStars = BRIGHT_STARS.length + PLANETS.length;
  const starPos = new Float32Array(nStars * 3);
  const starSize = new Float32Array(nStars);
  const starCol = new Float32Array(nStars * 3);
  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeom.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  starGeom.setAttribute('aColor', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.ShaderMaterial({ ...StarShader, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const stars = new THREE.Points(starGeom, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  group.add(stars);

  // ── The Moon: the real map, lit from where the Sun really is. ──
  const moonGeom = new THREE.SphereGeometry(1, 32, 16);
  const moonUniforms = { uMap: { value: null as THREE.Texture | null }, uHasMap: { value: 0 }, uSun: { value: new THREE.Vector3() }, uTint: { value: new THREE.Vector3(1, 1, 1) } };
  const moonMat = new THREE.ShaderMaterial({ ...MoonShader, uniforms: moonUniforms, depthWrite: false, depthTest: false });
  const moon = new THREE.Mesh(moonGeom, moonMat);
  moon.renderOrder = -8;
  moon.frustumCulled = false;
  group.add(moon);
  let cancelled = false;
  new THREE.TextureLoader().load('/solar-system/planets/moon-512.jpg', (tex) => {
    if (cancelled) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    moonUniforms.uMap.value = tex; moonUniforms.uHasMap.value = 1;
  });

  // ── The visor's and the windows' reflection: this sky, re-rendered when it changes. ──
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ ...DomeShader, uniforms, side: THREE.BackSide, depthWrite: false }));
  envScene.add(envDome);
  const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(60, 24), envGroundMat);
  envGround.rotation.x = -Math.PI / 2;
  envGround.position.y = -1.5;
  envScene.add(envGround);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget: THREE.WebGLRenderTarget | null = null;

  const state: SkyState = {
    date: new Date(start), dateMs: start.getTime(), sunDir: new THREE.Vector3(), sunAlt: 0, moonDir: new THREE.Vector3(), moonAlt: 0, moonFraction: 0,
    keyDir: new THREE.Vector3(0, 1, 0), keyColor: new THREE.Color(), keyIntensity: 0,
    hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0, night: 0, adapt: 1, limitMag: 0, cloud: 0, visibility: 30000,
  };
  const handle: EarthSky = {
    group, environment: null as unknown as THREE.Texture, state,
    setDate: () => {}, setWeather: () => {}, update: () => {}, dispose: () => {},
    setAltitude(altitudeM) {
      const k = skyAt('earth', altitudeM);
      uniforms.uAir.value = k.air;
      uniforms.uDip.value = k.dip;
      // Every walkable place in Tbilisi is under the floor, where the deck is where it always was.
      uniforms.uDeck.value = Math.max(0, DECK - Math.max(0, altitudeM - DECK_FLOOR));
    },
  };

  const tmpRgb = [0, 0, 0];
  const tr = [0, 0, 0];
  const v3 = { x: 0, y: 0, z: 0 };
  let bakedSunAlt = NaN; let bakedMoonAlt = NaN;
  let bakeRow = LUT_EL; let bakeTarget: 'sun' | 'moon' = 'sun'; let bakeAlt = 0; let bakeMs = 0;
  let starsAt = -1e12; let envAt = -1e12; let envAdapt = 0;
  let clock = 0;
  /** When the Date object and the Sun/Moon altitude checks last ran, scene ms. */
  let tickedAt = -1e12;

  const upload = (which: 'sun' | 'moon') => {
    const tex = which === 'sun' ? sunLut : moonLut;
    const peak = halfTable(which === 'sun' ? sunTable : moonTable, tex.image.data as Uint16Array);
    if (which === 'sun') uniforms.uSunLutMax.value = peak; else uniforms.uMoonLutMax.value = peak;
    tex.needsUpdate = true;
  };
  /** The average of a table over the upper sky, weighted toward the zenith: the sky's fill light. */
  const tableAverage = (table: Float32Array, out: number[]) => {
    out[0] = out[1] = out[2] = 0; let w = 0;
    for (let j = 1; j < LUT_EL; j++) {
      const el = lutElevation(j);
      if (el < 0) continue;
      const k = Math.sin(el) * Math.cos(el) + 0.05;
      for (let i = 0; i < LUT_AZ; i++) { const p = (j * LUT_AZ + i) * 4; out[0] += table[p] * k; out[1] += table[p + 1] * k; out[2] += table[p + 2] * k; w += k; }
    }
    out[0] /= w; out[1] /= w; out[2] /= w;
    return out;
  };

  const refreshStars = () => {
    const date = state.date;
    // How bright the sky is behind a star, cd/m², at the zenith and toward the horizon.
    const zen = (luminance(tableAverage(sunTable, tmpRgb)) + luminance(tableAverage(moonTable, tmpRgb)) * uniforms.uMoonK.value) * CD_PER_UNIT * 0.6
      + CITY_GLOW_CD * (0.35 + state.cloud * 1.6) * state.night + 2e-4;
    const limit = (bgCd: number) => {
      const bmag = -2.5 * Math.log10(bgCd / 10.8e4);
      return 7.93 - 5 * Math.log10(Math.pow(10, 4.316 - bmag / 5) + 1);
    };
    state.limitMag = limit(zen);
    const place = (k: number, az: number, alt: number, mag: number, warm: number) => {
      azAltToDir(az, alt, v3);
      starPos[k * 3] = v3.x * DOME * 0.98; starPos[k * 3 + 1] = v3.y * DOME * 0.98; starPos[k * 3 + 2] = v3.z * DOME * 0.98;
      const lim = limit(zen * (1 + 3 * Math.pow(1 - Math.max(0, Math.sin((alt * Math.PI) / 180)), 3))) - (1 - Math.min(1, Math.max(0, alt / 8))) * 1.5;
      const seen = alt < -0.5 ? 0 : THREE.MathUtils.clamp((lim - mag) / 1.2, 0, 1) * (1 - state.cloud * 0.85);
      const b = seen * THREE.MathUtils.clamp(0.35 + (lim - mag) * 0.28, 0, 1.8);
      starSize[k] = (lite ? 2.2 : 2.6) + Math.max(0, 1.5 - mag) * 0.9;
      starCol[k * 3] = b * (0.9 + warm * 0.2); starCol[k * 3 + 1] = b * 0.95; starCol[k * 3 + 2] = b * (1.08 - warm * 0.25);
    };
    BRIGHT_STARS.forEach((s, k) => {
      const { azimuth, altitude } = raDecToAzAlt(s.ra, s.dec, DEFAULT_OBSERVER.lat, DEFAULT_OBSERVER.lon, date);
      place(k, azimuth, altitude, s.mag, /betelgeuse|antares|aldebaran|arcturus|pollux/.test(s.id) ? 1 : 0);
    });
    PLANETS.forEach(([body], i) => {
      const { az, alt } = bodyAzAlt(body, date);
      place(BRIGHT_STARS.length + i, az, alt, Illumination(body, date).mag, body === Body.Mars ? 1 : 0.4);
    });
    starGeom.attributes.position.needsUpdate = true;
    starGeom.attributes.aSize.needsUpdate = true;
    starGeom.attributes.aColor.needsUpdate = true;
  };

  const refreshEnv = () => {
    envGroundMat.color.setRGB(0.09, 0.085, 0.08).multiplyScalar(Math.max(0.02, state.keyIntensity * 0.4 + state.hemiIntensity * 0.6));
    // The disc itself stays out of the reflections: a point that bright only turns metal into glare.
    const disc = uniforms.uSunDisc.value.clone();
    uniforms.uSunDisc.value.set(0, 0, 0);
    // The reflections are the sky from the ground, whatever height the camera is at.
    const air = uniforms.uAir.value; const dip = uniforms.uDip.value; const deck = uniforms.uDeck.value;
    uniforms.uAir.value = 1; uniforms.uDip.value = 0; uniforms.uDeck.value = DECK;
    const next = pmrem.fromScene(envScene, 0.04);
    uniforms.uSunDisc.value.copy(disc);
    uniforms.uAir.value = air; uniforms.uDip.value = dip; uniforms.uDeck.value = deck;
    envTarget?.dispose();
    envTarget = next;
    handle.environment = next.texture;
    envAdapt = state.adapt;
  };

  /** Everything that follows from where the lights are and the tables for them. */
  const derive = () => {
    const sunAz = bodyAzAlt(Body.Sun, state.date);
    state.sunAlt = sunAz.alt;
    azAltToDir(sunAz.az, sunAz.alt, v3);
    state.sunDir.set(v3.x, v3.y, v3.z);
    const m = moonState(state.date);
    state.moonAlt = m.alt;
    state.moonFraction = m.fraction;
    azAltToDir(m.az, m.alt, v3);
    state.moonDir.set(v3.x, v3.y, v3.z);
    uniforms.uSunDir.value.copy(state.sunDir);
    uniforms.uMoonDir.value.copy(state.moonDir);
    // Full moonlight is about 2.5 millionths of sunlight; it falls off steeply with phase.
    const moonK = m.alt > -3 ? 2.5e-6 * Math.pow(m.fraction, 2.2) : 0;
    uniforms.uMoonK.value = moonK;
    state.night = THREE.MathUtils.smoothstep(-state.sunAlt, -1, 7);

    const zenith = tableAverage(sunTable, [0, 0, 0]);
    const zenMoon = tableAverage(moonTable, [0, 0, 0]);
    const glowCd = CITY_GLOW_CD * (0.35 + state.cloud * 1.6) * state.night;
    const glow = glowCd / CD_PER_UNIT;
    const skyLum = luminance(zenith) + luminance(zenMoon) * moonK + glow;
    state.adapt = THREE.MathUtils.clamp(0.018 / Math.max(skyLum, 1e-12), 1, MAX_ADAPT);
    // The glow: most of it the older sodium lamps, the rest LED.
    uniforms.uGlow.value.set(glow * 1.35, glow * 0.95, glow * 0.62);
    const gain = SKY_SCALE * state.adapt;
    uniforms.uGain.value = gain;

    transmittance((state.sunAlt * Math.PI) / 180, air, tr);
    const sunUp = THREE.MathUtils.smoothstep(state.sunAlt, -0.9, 0.6);
    // Bright enough to clip and bloom where it is, not so bright the bloom veils the whole frame.
    uniforms.uSunDisc.value.set(tr[0], tr[1], tr[2]).multiplyScalar(1.4 * sunUp * (1 - 0.9 * state.cloud * state.cloud));

    // The key light: whichever of the Sun and the Moon lights the ground more.
    const sunLight = sunUp * luminance(tr);
    const moonTr = transmittance((Math.max(m.alt, -1) * Math.PI) / 180, air, [0, 0, 0]);
    const moonLight = moonK * luminance(moonTr) * THREE.MathUtils.smoothstep(m.alt, -1, 3);
    // Cloud takes the direct light and gives some of it back as fill.
    const overcast = state.cloud * state.cloud;
    if (sunLight >= moonLight * 400 || state.sunAlt > -4) {
      state.keyDir.copy(state.sunDir);
      state.keyColor.setRGB(tr[0], tr[1], tr[2]);
      const l = Math.max(1e-6, luminance(tr));
      state.keyColor.multiplyScalar(1 / l);
      state.keyIntensity = 3.2 * sunLight * Math.min(state.adapt, 30);
    } else {
      state.keyDir.copy(state.moonDir);
      state.keyColor.setRGB(0.78, 0.86, 1.0);
      state.keyIntensity = 3.1 * moonLight * state.adapt * 0.45;
    }
    state.keyIntensity = Math.min(state.keyIntensity, 4) * (1 - 0.8 * overcast);

    const fill = [zenith[0] + zenMoon[0] * moonK, zenith[1] + zenMoon[1] * moonK, zenith[2] + zenMoon[2] * moonK];
    state.hemiSky.setRGB(fill[0] + glow * 1.3, fill[1] + glow * 0.9, fill[2] + glow * 0.6).multiplyScalar(gain * 1.6);
    const hemiL = luminance([state.hemiSky.r, state.hemiSky.g, state.hemiSky.b]);
    state.hemiIntensity = Math.min(1.1, 0.3 + hemiL * 0.9) * (1 + 0.3 * overcast);
    if (hemiL > 0) state.hemiSky.multiplyScalar(1 / Math.max(hemiL, 1e-6));
    // The ground bounces sunlight warm, and at night the streets bounce their own.
    state.hemiGround.setRGB(0.42, 0.36, 0.3).lerp(new THREE.Color(0.55, 0.36, 0.2), state.night);

    // The air between the eye and the far ground.
    const horizonAway = [0, 0, 0];
    const k = ((LUT_EL >> 3) * LUT_AZ + (LUT_AZ >> 1)) * 4;
    horizonAway[0] = sunTable[k] + moonTable[k] * moonK + glow * 2.2;
    horizonAway[1] = sunTable[k + 1] + moonTable[k + 1] * moonK + glow * 1.5;
    horizonAway[2] = sunTable[k + 2] + moonTable[k + 2] * moonK + glow * 1.0;
    haze.uHazeColor.value.setRGB(horizonAway[0], horizonAway[1], horizonAway[2]).multiplyScalar(gain * 0.8 * (1 - 0.35 * overcast));
    const kt = ((LUT_EL >> 3) * LUT_AZ) * 4;
    haze.uHazeSunColor.value.setRGB(sunTable[kt] + glow * 2.2, sunTable[kt + 1] + glow * 1.5, sunTable[kt + 2] + glow).multiplyScalar(Math.min(gain * 0.55 * (1 - 0.6 * overcast), 1.1 / Math.max(1e-6, luminance([sunTable[kt], sunTable[kt + 1], sunTable[kt + 2]]))));
    haze.uHazeSunDir.value.copy(state.sunDir);
    haze.uHazeBeta.value = 3.912 / Math.max(2000, state.visibility);

    // Clouds: lit by the Sun where it is up, by the city from underneath where it is not.
    // A cloud base is lit through the cloud: a few percent of the sunlight, plus the sky under it.
    const lit = new THREE.Vector3(tr[0], tr[1], tr[2]).multiplyScalar(0.035 * sunUp * Math.sqrt(Math.max(0.05, state.sunDir.y))).addScaledVector(new THREE.Vector3(fill[0], fill[1], fill[2]), 0.9);
    uniforms.uCloudLit.value.copy(lit).add(new THREE.Vector3(glow * 5, glow * 3.2, glow * 1.8));
    uniforms.uCloudShade.value.copy(uniforms.uCloudLit.value).multiplyScalar(0.55);

    // The Moon's disc.
    const mTr = transmittance((Math.max(m.alt, 0) * Math.PI) / 180, air, [0, 0, 0]);
    const moonR = DOME * 0.95 * Math.tan((0.26 * Math.PI) / 180);
    moon.scale.setScalar(moonR);
    moon.position.copy(state.moonDir).multiplyScalar(DOME * 0.95);
    moon.visible = m.alt > -1;
    moonUniforms.uSun.value.copy(state.sunDir);
    // Albedo over π, in the same units as the sky: the Moon is a day-sky object too.
    const moonScale = 0.12 / Math.PI * 1.6 * SKY_SCALE * state.adapt;
    moonUniforms.uTint.value.set(mTr[0], mTr[1], mTr[2]).multiplyScalar(Math.min(moonScale, 24));
  };

  const bakeNow = (which: 'sun' | 'moon', altDeg: number) => {
    const el = (altDeg * Math.PI) / 180;
    bakeSkyTable(el, air, which === 'sun' ? sunTable : moonTable);
    upload(which);
    if (which === 'sun') bakedSunAlt = altDeg; else bakedMoonAlt = altDeg;
  };

  handle.setDate = (date) => {
    state.date = new Date(date);
    state.dateMs = state.date.getTime();
    tickedAt = state.dateMs;
    const s = bodyAzAlt(Body.Sun, state.date).alt;
    const m = bodyAzAlt(Body.Moon, state.date).alt;
    bakeNow('sun', s);
    bakeNow('moon', m);
    bakeRow = LUT_EL;
    derive();
    refreshStars();
    starsAt = state.date.getTime();
    refreshEnv();
    envAt = state.date.getTime();
  };
  handle.setWeather = (cloud, visibility) => {
    state.cloud = THREE.MathUtils.clamp(cloud, 0, 1);
    state.visibility = visibility > 0 ? visibility : state.visibility;
    uniforms.uCloud.value = state.cloud;
    derive();
    refreshStars();
  };
  handle.update = (dt, cameraPos) => {
    clock += dt;
    uniforms.uTime.value = clock;
    state.dateMs += dt * 1000;
    group.position.copy(cameraPos);
    // Once a second: the Date the rest of the scene reads, and whether a light has moved enough to re-bake its table (a few rows a frame).
    if (state.dateMs - tickedAt >= 1000) {
      tickedAt = state.dateMs;
      state.date = new Date(state.dateMs);
      if (bakeRow >= LUT_EL) {
        const s = bodyAzAlt(Body.Sun, state.date).alt;
        const m = bodyAzAlt(Body.Moon, state.date).alt;
        if (Math.abs(s - bakedSunAlt) > 0.12) { bakeTarget = 'sun'; bakeAlt = s; bakeRow = 0; bakeMs = multipleScattering((s * Math.PI) / 180, air); }
        else if (Math.abs(m - bakedMoonAlt) > 0.5) { bakeTarget = 'moon'; bakeAlt = m; bakeRow = 0; bakeMs = multipleScattering((m * Math.PI) / 180, air); }
      }
    }
    if (bakeRow < LUT_EL) {
      const to = Math.min(LUT_EL, bakeRow + 3);
      bakeSkyTable((bakeAlt * Math.PI) / 180, air, bakeTarget === 'sun' ? sunTable : moonTable, bakeRow, to, bakeMs);
      bakeRow = to;
      if (bakeRow >= LUT_EL) {
        upload(bakeTarget);
        if (bakeTarget === 'sun') bakedSunAlt = bakeAlt; else bakedMoonAlt = bakeAlt;
        derive();
      }
    }
    const now = state.dateMs;
    if (now - starsAt > 4000) { starsAt = now; derive(); refreshStars(); }
    if (now - envAt > 120000 || Math.abs(Math.log(state.adapt / Math.max(envAdapt, 1e-6))) > 0.4) { envAt = now; refreshEnv(); }
  };
  handle.dispose = () => {
    cancelled = true;
    domeGeom.dispose(); domeMat.dispose();
    starGeom.dispose(); starMat.dispose();
    moonGeom.dispose(); moonMat.dispose(); moonUniforms.uMap.value?.dispose();
    sunLut.dispose(); moonLut.dispose();
    envDome.geometry.dispose(); (envDome.material as THREE.Material).dispose();
    envGround.geometry.dispose(); envGroundMat.dispose();
    envTarget?.dispose();
    pmrem.dispose();
  };
  handle.setDate(start);
  return handle;
}
