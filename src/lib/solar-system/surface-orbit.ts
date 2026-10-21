// The whole planet under a surface scene, at any height: from the crew's
// boots to a low orbit. A surface scene is a flat patch of metres round its
// landing site (planet-frame.ts); the planet globe (planet-globe.ts) is the
// sphere in kilometres. This joins them.
//
// Three draws make each frame (moon-post `setLayers`): the scene's sky,
// through a camera that sees only SKY_LAYER; the globe over it; the scene's
// own ground and everything on it over both. So the sky needs no ground of
// its own below the horizon (the globe is there), and the ground needs no
// horizon of its own (the globe goes on past it).
//
// With height the patch gets small and the globe takes over: each part of
// the patch has a ceiling above which it is not drawn (a patch a few
// kilometres across seen from eight kilometres up is a handful of pixels
// the globe draws as well). The camera's near and far planes follow what is
// still drawn, the air thins out of the haze, and the skies turn to space
// (`setAltitude` on each: the scattering goes black, the cloud decks go).
//
// The flat patch has to meet the sphere at its edge: `withCurvature` drops
// far geometry by d²/2R in its vertex shader, the height the sphere has
// fallen below the site's tangent plane at that distance.

import * as THREE from 'three';
import type { SurfaceHost } from '@/lib/solar-system/surface-host';
import { makePlanetGlobe, type PlanetGlobe } from '@/lib/solar-system/planet-globe';
import { PLANET_BODIES, altitudeOf, type GlobeWorld } from '@/lib/solar-system/planet-frame';
import { haze } from '@/lib/solar-system/world-earth-haze';
import type { EarthWorld } from '@/lib/solar-system/world-earth';

/** The layer every sky object is on. The main camera does not see it; the sky camera sees nothing else. */
export const SKY_LAYER = 5;

/** Show a hidden tier again only this far below its ceiling, so a camera
 *  hanging at the ceiling does not flicker it on and off. */
const HYSTERESIS = 0.95;

/** Heights above the reference sphere, m, above which each part of a patch is not drawn. */
export const CEILINGS: Record<GlobeWorld, { local: number; far: number }> = {
  // The Moon's and Mars's patches are the ground square and a horizon ring
  // 1.5 km out: at 8 km up the ring is a spot 20° across the view that the
  // globe under it draws as well.
  moon: { local: 8000, far: 8000 },
  mars: { local: 8000, far: 8000 },
  // Earth's city and walk grids (12 km across) go at 12 km, and so do the
  // valley and the Caucasus (480 km across): higher up the flat square's
  // edge shows against the sphere through thinning haze, and the globe
  // already carries the same Terrarium relief out there, so it takes over.
  earth: { local: 12000, far: 12000 },
};

/** The air, for the skies: how much of it glows (1 on the ground, 0 in
 *  space) — the density scale height, and the height the sky is black by. */
export const SKY_AIR: Record<GlobeWorld, { scale: number; top: number; cloudsGone: number }> = {
  moon: { scale: 0, top: 0, cloudsGone: 0 },
  mars: { scale: 11100, top: 50000, cloudsGone: 10000 },
  earth: { scale: 8500, top: 60000, cloudsGone: 5000 },
};

/** A part of the patch with a ceiling of its own. */
export interface OrbitTier {
  objects: readonly (THREE.Object3D | null | undefined)[];
  /** Height above the reference sphere above which these are not drawn, m. */
  ceiling: number;
  /** How far from the site they reach, m: what the camera's far plane must
   *  take in while they are drawn. 0 for geometry folded into the far plane
   *  by its own shader (Earth's far rings). */
  reach: number;
  /** The patch's ground ends here, m from the site: the globe may skip inside it while this tier is drawn. */
  patch: number;
}

/** A sky that knows about height: the dome turns to space, the clouds go. */
export interface AltitudeSky {
  setAltitude: (altitudeM: number, cameraPos: THREE.Vector3) => void;
}

export interface OrbitParts {
  /** The sky's roots: moved to the sky layer, and kept centred on the camera. */
  sky: readonly (THREE.Object3D | null | undefined)[];
  /** The ground, the base, the props, the dust: the patch, under one ceiling. */
  tiers: readonly OrbitTier[];
  skies?: readonly (AltitudeSky | null | undefined)[];
  /** Toward the sun, local frame; read every frame (Earth's moves). */
  sunDir: THREE.Vector3;
  /** Local ground height, for the near plane and the haze (height above ground, not above the datum). */
  groundAt?: (x: number, z: number) => number;
  siteColor?: [number, number, number];
  /** Materials of far flat ground (the horizon rings) to curve onto the sphere. */
  curve?: readonly (THREE.Material | THREE.Material[] | null | undefined)[];
}

export interface OrbitView {
  readonly globe: PlanetGlobe;
  /** The camera's height above the reference sphere, m, as of the last update. */
  readonly altitude: number;
  readonly skyCamera: THREE.PerspectiveCamera;
  /** After the camera has moved, right before `host.render`. */
  update: (dt: number) => void;
  /** Off: one draw as before, everything shown, the planes as built. */
  setEnabled: (on: boolean) => void;
  dispose: () => void;
}

declare global {
  interface Window {
    /** Development: the globe under the surface, and a way to put the camera at a height. */
    __stellarGlobe?: {
      globe: PlanetGlobe;
      /** The surface scene, for harnesses that look inside it. */
      surface: THREE.Scene;
      altitude: () => number;
      stats: () => Record<string, number>;
      /** Pin the camera this high over where it is, looking at the horizon (`pitchDeg` below it, default 12); `null` lets it go. */
      lift: (altitudeM: number | null, pitchDeg?: number, headingDeg?: number) => void;
      setEnabled: (on: boolean) => void;
    };
  }
}

// ── Pure arithmetic: tested in surface-orbit.test.ts. ──

/** Put every object under these roots on the sky layer (and nowhere else). */
export function tagSky(roots: readonly (THREE.Object3D | null | undefined)[]): number {
  let n = 0;
  for (const r of roots) r?.traverse((o) => { o.layers.set(SKY_LAYER); n++; });
  return n;
}

/** Whether a tier is drawn at this height, given whether it was last frame. */
export function tierShown(altitudeM: number, ceiling: number, wasShown: boolean): boolean {
  return wasShown ? altitudeM <= ceiling : altitudeM < ceiling * HYSTERESIS;
}

/** Far plane: the scene's own, or enough to take in the farthest thing still drawn. */
export function farFor(baseFar: number, heightAboveGround: number, reach: number, fromSite: number): number {
  if (reach <= 0) return baseFar;
  return Math.max(baseFar, Math.hypot(Math.max(0, heightAboveGround) + 200, reach + fromSite) * 1.05);
}

/** Near plane: the scene's own on the ground; up to a metre once the camera
 *  is kilometres up, where the nearest thing is a hull ten metres off and
 *  the depth buffer has kilometres of ground to hold. */
export function nearFor(baseNear: number, heightAboveGround: number): number {
  return Math.max(baseNear, Math.min(1, (heightAboveGround - 200) / 2000));
}

/** How much of the air still glows over the camera, 1…0: the air above it
 *  (exp(−h/H)) from a kilometre up, and nothing past the top. */
export function airGlow(altitudeM: number, scaleM: number, topM: number): number {
  if (scaleM <= 0 || topM <= 0) return 0;
  const h = Math.max(0, altitudeM - 1000);
  const top = 1 - THREE.MathUtils.smoothstep(altitudeM, topM * 0.5, topM);
  return Math.exp(-h / (scaleM * 1.5)) * top;
}

/** How far the true horizon sits below the level, rad, from a height over a sphere. */
export function horizonDip(altitudeM: number, radiusM: number): number {
  const h = Math.max(0, altitudeM);
  return Math.acos(radiusM / (radiusM + h));
}

/** The ground-level haze thins as the camera climbs out of it, 1…0.02: the
 *  scenes' air is a few hundred metres to a few kilometres of visibility,
 *  and seen from above that would be a disc of fog on the globe. */
export function hazeLift(heightAboveGround: number): number {
  return Math.max(0.02, Math.exp(-Math.max(0, heightAboveGround - 700) / 1000));
}

/** What the sky shaders take from a height on one world. */
export function skyAt(world: GlobeWorld, altitudeM: number): { air: number; dip: number; clouds: number } {
  const a = SKY_AIR[world];
  return {
    air: airGlow(altitudeM, a.scale, a.top),
    dip: horizonDip(altitudeM, PLANET_BODIES[world].radiusKm * 1000),
    clouds: a.cloudsGone > 0 ? 1 - THREE.MathUtils.smoothstep(altitudeM, a.cloudsGone * 0.5, a.cloudsGone) : 0,
  };
}

/** The drop the curvature shader applies at a distance d from the site, m. */
export function curvatureDropAt(d: number, radiusM: number): number {
  return (d * d) / (2 * radiusM);
}

/** The Moon's and Mars's patch: the ground square, the horizon ring 1.5 km
 *  out and all that stands on them, under the one ceiling. */
export function patchTiers(world: GlobeWorld, objects: readonly (THREE.Object3D | null | undefined)[], reach = 1500): OrbitTier[] {
  return [{ objects, ceiling: CEILINGS[world].local, reach, patch: reach }];
}

/** Earth's: the city, the walk area and everything in them to 12 km up; the
 *  valley and the Caucasus, folded into the far plane by their own shader
 *  (so the far plane need not grow for them), to 12 km, with the city. */
export function earthTiers(earth: Pick<EarthWorld, 'group' | 'terrain'>, extra: readonly (THREE.Object3D | null | undefined)[] = []): OrbitTier[] {
  const { valley, caucasus, city } = earth.terrain.rings;
  const near = [
    ...earth.group.children.filter((o) => o !== earth.terrain.group),
    ...earth.terrain.group.children.filter((o) => o !== valley && o !== caucasus),
    ...extra,
  ];
  const half = (m: THREE.Mesh) => {
    const box = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox!);
    return Math.min(box.max.x, -box.min.x, box.max.z, -box.min.z);
  };
  return [
    { objects: near, ceiling: CEILINGS.earth.local, reach: half(city) * Math.SQRT2, patch: half(city) },
    { objects: [valley, caucasus], ceiling: CEILINGS.earth.far, reach: 0, patch: half(caucasus) },
  ];
}

// ── The curvature hook. ──

const CURVE_GLSL = `#include <begin_vertex>
  {
    // The site's tangent plane falls away under the sphere: d² / 2R at a
    // distance d from the site (the local origin). The mesh stands upright
    // and unscaled in y, so the drop is the same in its own frame.
    vec2 cSite = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;
    transformed.y -= dot( cSite, cSite ) * uCurveK;
  }`;

/**
 * Curve a material's far geometry down onto the sphere of radius `radiusM`.
 * Wraps whatever `onBeforeCompile` the material already has (the haze, the
 * rim light, the grain) and extends its program key rather than replacing
 * either, so it can go on in any order after them.
 */
export function withCurvature<M extends THREE.Material>(material: M, radiusM: number): M {
  const before = material.onBeforeCompile;
  const keyOf = material.customProgramCacheKey;
  // three's default key is the hook's own source: read it before the hook is
  // replaced, or every wrapped material would share the wrapper's.
  const baseKey = keyOf === THREE.Material.prototype.customProgramCacheKey ? before.toString() : null;
  const k = { value: 1 / (2 * radiusM) };
  material.onBeforeCompile = function onCurve(shader, renderer) {
    before.call(this, shader, renderer);
    shader.uniforms.uCurveK = k;
    shader.vertexShader = 'uniform float uCurveK;\n' + shader.vertexShader.replace('#include <begin_vertex>', CURVE_GLSL);
  };
  material.customProgramCacheKey = function curveKey() {
    return `${baseKey ?? keyOf.call(this)}|curve`;
  };
  material.needsUpdate = true;
  return material;
}

// ── The view. ──

export function attachOrbitView(host: SurfaceHost, world: GlobeWorld, parts: OrbitParts): OrbitView {
  const { camera, scene, post } = host;
  const body = PLANET_BODIES[world];
  const globe = makePlanetGlobe(world, { quality: host.quality, lite: host.lite, sunDir: parts.sunDir, siteColor: parts.siteColor });
  const skyCamera = new THREE.PerspectiveCamera();
  const skyRoots = parts.sky.filter((o): o is THREE.Object3D => !!o);
  for (const m of parts.curve ?? []) {
    for (const x of Array.isArray(m) ? m : m ? [m] : []) withCurvature(x, body.radiusKm * 1000);
  }
  tagSky(skyRoots);
  // Lit sky objects (Mars's moons, the Earth over the Moon) keep the scene's
  // lights: every light is on both layers, so both cameras see the same set
  // and the programs compiled for one serve the other.
  scene.traverse((o) => { if ((o as THREE.Light).isLight) o.layers.enable(SKY_LAYER); });
  const layers = { skyCamera, globe: { scene: globe.scene, camera: globe.camera } };
  host.compileExtra(globe.scene, globe.camera);

  const baseNear = camera.near;
  const baseFar = camera.far;
  const fog = scene.fog;
  const fogFar = fog instanceof THREE.Fog ? fog.far : 0;
  const fogDensity = fog instanceof THREE.FogExp2 ? fog.density : 0;
  const tiers = parts.tiers.map((t) => ({ ...t, shown: true, hidden: new Set<THREE.Object3D>() }));
  const skies = (parts.skies ?? []).filter((s): s is AltitudeSky => !!s);

  let enabled = false;
  let altitude = 0;
  let pin: { alt: number; pitch: number; heading: number | null } | null = null;
  const at = new THREE.Vector3();
  const look = new THREE.Vector3();

  const showTier = (t: (typeof tiers)[number]) => {
    for (const o of t.hidden) o.visible = true;
    t.hidden.clear();
  };
  const setPlanes = (near: number, far: number) => {
    if (Math.abs(camera.near - near) < 1e-4 && Math.abs(camera.far - far) < 0.5) return;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  };
  const setEnabled = (on: boolean) => {
    if (on === enabled) return;
    enabled = on;
    if (on) {
      camera.layers.disable(SKY_LAYER);
      post.setLayers(layers);
    } else {
      camera.layers.enable(SKY_LAYER);
      post.setLayers(null);
      for (const t of tiers) { t.shown = true; showTier(t); }
      setPlanes(baseNear, baseFar);
      haze.uHazeLift.value = 1;
      if (fog instanceof THREE.Fog) fog.far = fogFar;
      if (fog instanceof THREE.FogExp2) fog.density = fogDensity;
      for (const s of skies) s.setAltitude(0, camera.position);
    }
  };
  setEnabled(true);

  /** Development: hold the camera at a height, over where it is, looking at the horizon. */
  const applyPin = () => {
    if (!pin) return;
    const heading = pin.heading ?? Math.atan2(-look.set(0, 0, -1).applyQuaternion(camera.quaternion).x, -look.z);
    camera.position.y = pin.alt;
    const down = horizonDip(pin.alt, body.radiusKm * 1000) + (pin.pitch * Math.PI) / 180;
    look.set(-Math.sin(heading) * Math.cos(down), -Math.sin(down), -Math.cos(heading) * Math.cos(down));
    camera.lookAt(at.copy(camera.position).add(look));
  };

  const update = (dt: number) => {
    applyPin();
    camera.updateMatrixWorld();
    altitude = altitudeOf(body, globe.basis, camera.position);
    if (!enabled) return;
    const ground = parts.groundAt ? parts.groundAt(camera.position.x, camera.position.z) : 0;
    const agl = Math.max(0, camera.position.y - ground);
    const fromSite = Math.hypot(camera.position.x, camera.position.z);

    // What of the patch is drawn, and so how far the camera must see.
    let reach = 0;
    let patch = 0;
    for (const t of tiers) {
      t.shown = tierShown(altitude, t.ceiling, t.shown);
      if (t.shown) {
        showTier(t);
        reach = Math.max(reach, t.reach);
        patch = Math.max(patch, t.patch);
      } else {
        // Every frame: a scene may show one of these itself.
        for (const o of t.objects) if (o && o.visible) { o.visible = false; t.hidden.add(o); }
      }
    }
    setPlanes(nearFor(baseNear, agl), farFor(baseFar, agl, reach, fromSite));
    globe.setPatch(patch);

    // The haze thins as the camera climbs out of it.
    const lift = hazeLift(agl);
    haze.uHazeLift.value = lift;
    if (fog instanceof THREE.Fog) fog.far = fogFar / lift;
    if (fog instanceof THREE.FogExp2) fog.density = fogDensity * lift;

    // The sky rides with the camera, and knows how high it is.
    for (const s of skyRoots) s.position.copy(camera.position);
    for (const s of skies) s.setAltitude(altitude, camera.position);
    skyCamera.copy(camera, false);
    skyCamera.layers.set(SKY_LAYER);

    globe.setSun(parts.sunDir);
    globe.sync(camera);
    globe.update(dt);
  };

  const view: OrbitView = {
    globe, skyCamera,
    get altitude() { return altitude; },
    update, setEnabled,
    dispose() {
      setEnabled(false);
      host.post.setLayers(null);
      globe.dispose();
      if (window.__stellarGlobe?.globe === globe) delete window.__stellarGlobe;
    },
  };
  if (process.env.NODE_ENV !== 'production') {
    window.__stellarGlobe = {
      globe, surface: scene,
      altitude: () => altitude,
      stats: () => ({ ...globe.stats(), altitude, near: camera.near, far: camera.far, hazeLift: haze.uHazeLift.value }),
      lift(alt, pitchDeg = 12, headingDeg) {
        pin = alt === null ? null : { alt, pitch: pitchDeg, heading: headingDeg === undefined ? null : (headingDeg * Math.PI) / 180 };
      },
      setEnabled,
    };
  }
  return view;
}
