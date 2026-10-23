'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  MEAN_RADIUS_KM,
  sampleSolarSystem,
  worldRadiusForBody,
  type ScaleMode,
  type SolarBodyId,
} from '@/lib/solar-system/ephemeris';
import { AXIAL_TILT_DEG, siderealSpinY } from '@/lib/solar-system/planet-spin';
import {
  NASA_PLANET_DETAIL_URL,
  NASA_PLANET_TEXTURE_URL,
  NASA_TEXTURE_IDS,
} from '@/lib/solar-system/planet-texture-urls';
import { disposePlanetTexture, makePlanetTextureLoader } from '@/lib/solar-system/texture-load';
import { createPlanetMaterial, disposePlanetMaterial, tickPlanetMaterial } from '@/lib/solar-system/planet-textures';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import { releaseSaturnRingStripTexture } from '@/lib/solar-system/saturn-ring-strip';
import {
  makeOrbitRings,
  disposeOrbitRings,
  setOrbitRingsFade,
  makeAsteroidBelt,
  makeKuiperBelt,
  clampedPointsMaterial,
  makeEarthExtras,
  makeEarthRocket,
  makeEarthSatellites,
  makeMeteors,
  makeAtmosphereShell,
  disposeAtmosphereShell,
  makeSunExtras,
  makeMilkyWayBand,
  disposeMilkyWayBand,
  makeMilkyWayGlow,
  makeNebulae,
  makeSaturnParticleRings,
  makeUranusRings,
  makePlanetMoons,
  makeComet,
  makeAurora,
  type AuroraHandle,
  type BeltHandle,
  type EarthExtrasHandle,
  type EarthRocketHandle,
  type EarthSatellitesHandle,
  type MeteorsHandle,
  type SunExtrasHandle,
  type SaturnRingsHandle,
  type PlanetMoonsHandle,
  type CometHandle,
  type MilkyWayGlowHandle,
  type NebulaeHandle,
} from '@/lib/solar-system/scene-extras';
import { makeSunSurface } from '@/lib/solar-system/sun-surface';
import { makePostFx } from '@/lib/solar-system/post-processing';
import { projectSunPoint, type SunScreen } from '@/lib/solar-system/post-flare';
import { currentQuality, onQualityChange, pixelRatioFor } from '@/game/quality';
import { compileFor, releaseCompilePolls, settleWithin, uploadSceneTextures } from '@/lib/solar-system/gpu-warm';
import { makeLoopGuard, noteContextLoss, rebuildWhenVisible } from '@/game/gpu-recovery';
import { probeCalls } from '@/lib/solar-system/moon-perf';
import {
  createPlayerShip,
  FLIGHT_FAR,
  FLIGHT_NEAR,
  MARKER_MAX,
  type FlightAnchor,
  type FlightBody,
  type FlightSession,
  type FlightWorld,
  type PlayerShipHandle,
} from '@/lib/solar-system/player-ship';
import { makeAlphaCentauri } from '@/lib/solar-system/star-systems';
import { makeGargantua } from '@/lib/solar-system/black-hole';
import { lightYearsBetween, resolveDestination } from '@/lib/solar-system/star-routes';
import { makeSmallBodies } from '@/lib/solar-system/small-bodies';
import { makeAlienEncounters, type AlienHandle } from '@/lib/solar-system/aliens';
import { makeDeepSpaceProbes } from '@/lib/solar-system/probes';
import { makeRemoteFleet, writeFlightPose } from '@/lib/multiplayer/remote-fleet';
import { writeOrbitPose, type RoomLink } from '@/lib/multiplayer/room-link';
import {
  makeNearbyStars,
  makeMilkyWayDisk,
  makeAndromedaGalaxy,
  makeOtherGalaxies,
  makeCosmicWeb,
  tierBlendFromRadius,
} from '@/lib/solar-system/galactic-scene';
import { QA_HOOKS } from '@/game/qa';

declare global {
  interface Window {
    /** Development only: lets a headless capture teleport the ship and read the session. */
    __stellarFlight?: { session: FlightSession; ship: PlayerShipHandle; world: FlightWorld; aliens: AlienHandle };
    __stellarOrrery?: {
      probe: (within?: string) => Record<string, number>;
      /** Frame the system (theta, phi, radius) or select and orbit a body: for captures. */
      view: (v: { theta?: number; phi?: number; radius?: number; focus?: SolarBodyId | null; dist?: number }) => void;
    };
  }
}

/** The simulation clock, owned by the page and read by the canvas every
 *  frame — a mutable cell, so ticking it never re-renders anything. */
export interface EpochRef {
  current: number;
}

export interface SolarSystemCanvasProps {
  epoch: EpochRef;
  scaleMode: ScaleMode;
  includePluto: boolean;
  selectedId: SolarBodyId | null;
  /** When set, camera orbits this body at low altitude (system view when null). */
  focusBodyId: SolarBodyId | null;
  onSelect: (id: SolarBodyId | null) => void;
  /** Fired when the user clicks the Milky Way disk at the galactic tier —
   *  the page then animates the camera back into the solar system. */
  onZoomToSun?: () => void;
  /** Imperative zoom target: if non-null, the canvas eases `sysRadius` toward this value. */
  zoomTo?: number | null;
  onZoomToConsumed?: () => void;
  /** Explore Mode session. While `flight.active` the canvas spawns the player
   *  ship, hands the camera to it and turns the alien encounters hostile;
   *  the orbit camera state is left untouched and resumes on exit. */
  flight?: FlightSession;
  /** A multiplayer room: the ship's pose goes out through it, the others' come in. */
  room?: RoomLink;
  /** Called once, after the first frame has been drawn. */
  onReady?: () => void;
  /** The game is paused: the last frame stays on the glass and nothing is drawn. */
  paused?: boolean;
}

/** Project a world-space point onto CSS pixel coords. Returns null when the
 *  point is behind the camera so the overlay can hide its anchor. */
interface ScreenPoint { x: number; y: number; depth: number }
const projScratch = new THREE.Vector3();
/** The longest the loading screen waits on the planet maps before the procedural ones go up instead. */
const MAPS_WAIT_MS = 8000;

/** Project a world-space point into `out` (CSS pixels). False when the point
 *  is behind the camera, so the caller can hide its anchor. Allocation-free. */
function projectInto(worldPos: THREE.Vector3, camera: THREE.Camera, cssWidth: number, cssHeight: number, out: ScreenPoint): boolean {
  const v = projScratch.copy(worldPos).project(camera);
  if (v.z > 1 || v.z < -1) return false;
  out.x = (v.x * 0.5 + 0.5) * cssWidth;
  out.y = (-v.y * 0.5 + 0.5) * cssHeight;
  out.depth = v.z;
  return true;
}

/** Surface gravity (m/s²) and atmosphere top (× radius) for the flight
 *  model — every body is solid, the ones with air heat a ship that dives.
 *  The air is drawn thicker than the real few percent of a radius: the
 *  fighter's own hull spans that, so re-entry has to start higher up to be
 *  felt at all before the ground arrives. */
const SURFACE_G: Record<SolarBodyId, number> = {
  sun: 274, mercury: 3.7, venus: 8.87, earth: 9.81, mars: 3.71,
  jupiter: 24.79, saturn: 10.44, uranus: 8.87, neptune: 11.15, pluto: 0.62,
};
/** Earth's air stops short of 1.14 radii on purpose: that is where the
 *  station orbits, and a ship coming alongside it must not be burning. */
const ATMOSPHERE: Record<SolarBodyId, number> = {
  sun: 1.5, mercury: 1, venus: 1.3, earth: 1.1, mars: 1.15,
  jupiter: 1.22, saturn: 1.22, uranus: 1.2, neptune: 1.2, pluto: 1,
};

function disposeMat(m: THREE.Material) {
  if (m instanceof THREE.MeshStandardMaterial) disposePlanetMaterial(m);
  else m.dispose();
}

function disposeMeshTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach(disposeMat);
      else disposeMat(m);
    } else if (obj instanceof THREE.Points) {
      obj.geometry.dispose();
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else (m as THREE.Material).dispose();
    } else if (obj instanceof THREE.Sprite) {
      const m = obj.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.dispose();
    }
  });
}

/**
 * Three.js solar system: ephemeris, pinch zoom, invisible pick spheres,
 * low-orbit camera around `focusBodyId`, hero equirectangular textures when available.
 */
export function SolarSystemCanvas({
  epoch,
  scaleMode,
  includePluto,
  selectedId,
  focusBodyId,
  onSelect,
  onZoomToSun,
  zoomTo,
  onZoomToConsumed,
  flight,
  room,
  onReady,
  paused = false,
}: SolarSystemCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const epochRef = useRef(epoch);
  const scaleRef = useRef(scaleMode);
  const plutoRef = useRef(includePluto);
  const selectedRef = useRef(selectedId);
  const focusRef = useRef(focusBodyId);
  const onSelectRef = useRef(onSelect);
  const onZoomToSunRef = useRef(onZoomToSun);
  const zoomToRef = useRef(zoomTo);
  const onZoomToConsumedRef = useRef(onZoomToConsumed);
  // Where the ship was when this canvas last went away. A canvas is torn
  // down and rebuilt whenever a surface takes the screen (and twice on
  // mount in development's strict mode); the ship belongs where the pilot
  // left it, not back at the Earth. A launch from the deck itself asks for
  // the default anchor instead (`input.fromHome`).
  const parkedRef = useRef<FlightAnchor | null>(null);
  const flightRef = useRef(flight);

  epochRef.current = epoch;
  scaleRef.current = scaleMode;
  plutoRef.current = includePluto;
  selectedRef.current = selectedId;
  focusRef.current = focusBodyId;
  onSelectRef.current = onSelect;
  onZoomToSunRef.current = onZoomToSun;
  zoomToRef.current = zoomTo;
  onZoomToConsumedRef.current = onZoomToConsumed;
  flightRef.current = flight;
  const roomRef = useRef(room);
  roomRef.current = room;
  const onReadyRef = useRef(onReady);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  onReadyRef.current = onReady;
  /** Bumped when the GPU drops the context: the whole scene is rebuilt on a fresh one. */
  const [glGeneration, setGlGeneration] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    type NavWithConn = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
    const conn = (navigator as NavWithConn).connection;
    const lowData = !!conn && (conn.saveData === true || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g');
    // The orrery and the flight world answer to the same preset as the
    // surfaces: the player's choice in Settings, or the device's. `lowData`
    // stays on top of it — a narrow pipe is not the same thing as a slow GPU.
    const quality = currentQuality();
    const lite = quality.lite || isMobile || lowData;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        // The scene is drawn into the composer's multisampled target; the
        // canvas itself only receives the final blit.
        antialias: false,
        alpha: false,
        // 'default' avoids pinning the discrete GPU on for the tab's lifetime on
        // dual-GPU laptops (macOS), which keeps the machine hot/slow.
        powerPreference: 'default',
      });
    } catch {
      // No WebGL (disabled, or the browser is out of contexts): let the
      // loading screen go rather than leave it up, and draw nothing. After a
      // lost context the GPU process may still be coming back: try again.
      onReadyRef.current?.();
      if (glGeneration > 0) {
        const cancel = rebuildWhenVisible(() => setGlGeneration((g) => g + 1), noteContextLoss());
        return cancel;
      }
      return;
    }
    const ratioFor = () => pixelRatioFor(currentQuality(), mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(ratioFor());
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.setClearColor(0x01030a, 1);
    mount.appendChild(renderer.domElement);
    // A GPU under memory pressure (integrated graphics, two scenes, a sleep)
    // can take the context away. Without this the page just goes black; with
    // it the scene is rebuilt on a new canvas a moment later.
    let contextLost = false;
    let cancelRebuild: (() => void) | null = null;
    const rebuild = (delayMs: number) => {
      if (cancelRebuild) return;
      cancelRebuild = rebuildWhenVisible(() => setGlGeneration((g) => g + 1), delayMs);
    };
    const onContextLost = (e: Event) => {
      e.preventDefault();
      if (contextLost) return;
      contextLost = true;
      // Pending compiles would poll a dead context for ever.
      releaseCompilePolls(renderer);
      rebuild(noteContextLoss());
    };
    // A frame that throws must not stop the loop; one that throws every
    // frame gets the scene rebuilt.
    const guard = makeLoopGuard('orbit', () => rebuild(1000));
    // Materials are freed only between compiles: three's compile poll reads
    // each material's program, and a freed one breaks it.
    let compiling = 0;
    const retired: THREE.Material[] = [];
    const retireMat = (m: THREE.Material) => {
      if (compiling > 0) retired.push(m);
      else disposeMat(m);
    };
    const compileScene = () => {
      compiling += 1;
      return settleWithin(compileFor(renderer, postFx.drawTarget(), () => renderer.compileAsync(scene, camera)), 25000).finally(() => {
        compiling -= 1;
        if (compiling === 0) for (const m of retired.splice(0)) disposeMat(m);
      });
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    // Far plane reaches past the cosmic-web shell (112k units out) plus the
    // widest camera radius, so the large-scale structure stays in view at
    // maximum zoom-out instead of being clipped away.
    const ORBIT_NEAR = 0.02;
    const ORBIT_FAR = 140000;
    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight),
      ORBIT_NEAR,
      ORBIT_FAR,
    );

    // Furthest the camera pulls back. Everything past the Milky Way is laid
    // out beyond this, so you frame the galaxy and its neighbours rather than
    // flying through them (see tierBlendFromRadius).
    const MAX_SYS_RADIUS = 22000;

    let sysTheta = 0.72;
    let sysPhi = 1.02;
    let sysRadius = isMobile ? 20 : 26;

    let orbTheta = 0.5;
    let orbPhi = 0.95;
    let orbDist = 2.4;

    const vTarget = new THREE.Vector3();
    const vOffset = new THREE.Vector3();
    const vZero = new THREE.Vector3();

    const updateSystemCamera = () => {
      const st = Math.sin(sysPhi);
      camera.position.set(
        sysRadius * st * Math.cos(sysTheta),
        sysRadius * Math.cos(sysPhi),
        sysRadius * st * Math.sin(sysTheta),
      );
      camera.lookAt(0, 0, 0);
    };

    const updateOrbitCamera = (target: THREE.Vector3, pr: number) => {
      const minD = Math.max(pr * 1.05, 0.06);
      const maxD = Math.max(pr * 110, 8);
      orbDist = THREE.MathUtils.clamp(orbDist, minD, maxD);
      const st = Math.sin(orbPhi);
      vOffset.set(
        orbDist * st * Math.cos(orbTheta),
        orbDist * Math.cos(orbPhi),
        orbDist * st * Math.sin(orbTheta),
      );
      camera.position.copy(target).add(vOffset);
      camera.lookAt(target);
    };

    updateSystemCamera();

    // Scene → bloom → tone-mapped output (the Sun, engine glows and bolts
    // bloom; lit planet surfaces sit under the threshold and stay sharp).
    const postFx = makePostFx(renderer, scene, camera, quality);
    // The Sun sits at the origin; its place on the glass drives the flare
    // and the light shafts, and it fades as it leaves the frame.
    const sunOrigin = new THREE.Vector3();
    const sunScreen: SunScreen = { x: 0.5, y: 0.5, visible: false, edge: 0 };

    // Space lighting: the sun is the only real source, but a dim ambient
    // keeps night sides identifiable — without it, the Moon and any planet
    // showing us its dark side render as anonymous black balls (users read
    // night-side Mercury near Earth as "a second moon").
    scene.add(new THREE.AmbientLight(0x33405e, 0.8));
    const sunLight = new THREE.PointLight(0xfff4e0, 5.4, 380, 1.1);
    sunLight.name = 'sunLight';
    scene.add(sunLight);
    // The ship's fill light lives in the scene from the start, dark, and rides
    // the ship while flying: the light count never changes, so no material
    // recompiles when the deck launches.
    const shipFill = new THREE.PointLight(0xdfe9ff, 0, 1, 1.4);
    shipFill.name = 'shipFill';
    scene.add(shipFill);

    const starSprite = softSpriteTexture();

    // 8,000 white pinpricks + 2,000 tinted stars (warm K/M orange, cool O/B
    // blue, a few blue-white) — the mix the eye reads as a real sky.
    const STAR_WHITE = lite ? 2400 : 8000;
    const STAR_TINTED = lite ? 600 : 2000;
    const STAR_N = STAR_WHITE + STAR_TINTED;
    const starPos = new Float32Array(STAR_N * 3);
    const starCol = new Float32Array(STAR_N * 3);
    const starSize = new Float32Array(STAR_N);
    const TINTS = [
      { weight: 0.45, r: 1.00, g: 0.78, b: 0.55 }, // warm orange
      { weight: 0.35, r: 0.62, g: 0.76, b: 1.00 }, // cool blue
      { weight: 0.20, r: 0.86, g: 0.92, b: 1.00 }, // blue-white
    ];
    const pickTint = () => {
      let r = Math.random();
      for (const t of TINTS) {
        if (r < t.weight) return t;
        r -= t.weight;
      }
      return TINTS[TINTS.length - 1];
    };
    // Real sky statistics: brightness follows a steep power law (a handful of
    // bright stars over thousands of faint ones), and ~40% of stars crowd
    // toward the Milky Way band's plane the way the real sky thickens there.
    const BAND_INCL = 0.42; // matches makeMilkyWayBand
    for (let i = 0; i < STAR_N; i++) {
      const t = 2 * Math.PI * Math.random();
      let p: number;
      if (Math.random() < 0.4) {
        // Galactic-plane population — latitude pinched toward the band.
        const lat = (Math.random() + Math.random() - 1) * 0.45;
        p = Math.PI / 2 - lat;
      } else {
        p = Math.acos(2 * Math.random() - 1);
      }
      const r = 120 + Math.random() * 180;
      const x = r * Math.sin(p) * Math.cos(t);
      const zBand = r * Math.sin(p) * Math.sin(t);
      const yBand = r * Math.cos(p);
      // Rotate the band population into the Milky Way band's inclination.
      starPos[i * 3] = x;
      starPos[i * 3 + 1] = yBand * Math.cos(BAND_INCL) - zBand * Math.sin(BAND_INCL);
      starPos[i * 3 + 2] = yBand * Math.sin(BAND_INCL) + zBand * Math.cos(BAND_INCL);
      const c = 0.4 + Math.random() * 0.6;
      if (i < STAR_WHITE) {
        const w = 0.94 + Math.random() * 0.06;
        starCol[i * 3] = w * c;
        starCol[i * 3 + 1] = w * c;
        starCol[i * 3 + 2] = c;
      } else {
        const tint = pickTint();
        starCol[i * 3] = tint.r * c;
        starCol[i * 3 + 1] = tint.g * c;
        starCol[i * 3 + 2] = tint.b * c;
      }
      // Power-law magnitudes — mostly pinpricks, the occasional bright star.
      starSize[i] = 0.35 + Math.pow(Math.random(), 3.2) * 2.3;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
    const stars = new THREE.Points(
      starGeo,
      clampedPointsMaterial({
        map: starSprite,
        size: lite ? 0.15 : 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        sizeAttenuation: true,
        alphaTest: 0.02,
      }, 2.6, true),
    );
    scene.add(stars);

    const milkyWay = makeMilkyWayBand(lite);
    scene.add(milkyWay);
    const milkyGlow: MilkyWayGlowHandle = makeMilkyWayGlow(lite);
    scene.add(milkyGlow.group);
    // Deep-background nebulae — behind the star shell, fade out with the tier.
    const nebulae: NebulaeHandle = makeNebulae(lite);
    scene.add(nebulae.group);

    // Galactic-tier layers — start fully faded; the per-frame loop dials
    // them up as the camera radius grows past the solar-system tier.
    const nearbyStars = makeNearbyStars(lite);
    nearbyStars.setFade(0);
    scene.add(nearbyStars.group);

    const galaxyDisk = makeMilkyWayDisk(lite);
    galaxyDisk.setFade(0);
    scene.add(galaxyDisk.group);

    const andromeda = makeAndromedaGalaxy(lite);
    andromeda.setFade(0);
    scene.add(andromeda.group);

    const otherGalaxies = makeOtherGalaxies();
    otherGalaxies.setFade(0, 0);
    scene.add(otherGalaxies.group);

    const cosmicWeb = makeCosmicWeb(lite);
    cosmicWeb.setFade(0);
    scene.add(cosmicWeb.group);

    const orbitRings = makeOrbitRings(scaleRef.current, plutoRef.current);
    scene.add(orbitRings);

    // The five spacecraft leaving the solar system, at their real positions.
    const probes = makeDeepSpaceProbes(scaleRef.current);
    scene.add(probes.group);

    // Occasional alien sightings — decorative, real-time.
    const aliens = makeAlienEncounters();
    scene.add(aliens.group);

    const auroraHandles: AuroraHandle[] = [];

    const asteroidBelt: BeltHandle = makeAsteroidBelt(scaleRef.current, lite);
    scene.add(asteroidBelt.group);

    const kuiperBelt: BeltHandle = makeKuiperBelt(scaleRef.current, lite);
    scene.add(kuiperBelt.group);

    const comet: CometHandle = makeComet(scaleRef.current, lite);
    scene.add(comet.group);

    const sunExtras: SunExtrasHandle = makeSunExtras(worldRadiusForBody('sun'));
    scene.add(sunExtras.group);
    // Photosphere shader — the NASA map warped by animated convection noise.
    const sunSurface = makeSunSurface(lite);
    // The next star over — only rendered while a ship can fly there.
    const alphaCen = makeAlphaCentauri(sunSurface.material, lite);
    scene.add(alphaCen.group);
    // Gargantua, the black hole a galaxy away — also only while flying.
    const gargantua = makeGargantua(lite);
    scene.add(gargantua.group);
    // A far system is shown and hidden by its meshes, never by its lights:
    // three builds every lit program for the number of lights in view, so a
    // light that came and went with the system would rebuild every program
    // in the scene in one frame at each jump (seconds on a weak GPU). Its
    // lights stay counted and only go dark.
    const systemShown = new Map<THREE.Object3D, boolean>();
    const showSystem = (group: THREE.Object3D, on: boolean) => {
      if (systemShown.get(group) === on) return;
      systemShown.set(group, on);
      group.visible = true;
      for (const c of group.children) {
        const light = c as THREE.Light;
        if (light.isLight) {
          if (light.userData.litIntensity === undefined) light.userData.litIntensity = light.intensity;
          if (!on && light.intensity > 0) light.userData.litIntensity = light.intensity;
          light.intensity = on ? light.userData.litIntensity : 0;
          light.visible = true;
        } else c.visible = on;
      }
    };
    const systemOn = (group: THREE.Object3D) => systemShown.get(group) === true;
    showSystem(alphaCen.group, false);
    showSystem(gargantua.group, false);
    // Ceres and Vesta — small worlds in the belt, always on their orbits.
    const smallBodies = makeSmallBodies(lite);
    scene.add(smallBodies.group);

    let earthExtras: EarthExtrasHandle | null = null;
    let earthRocket: EarthRocketHandle | null = null;
    let earthSats: EarthSatellitesHandle | null = null;
    let earthMeteors: MeteorsHandle | null = null;
    let saturnRings: SaturnRingsHandle | null = null;
    const atmosphereShells = new Map<SolarBodyId, THREE.Mesh>();

    const bodies = new THREE.Group();
    bodies.name = 'bodies';
    scene.add(bodies);

    const planetMoons: PlanetMoonsHandle = makePlanetMoons(lite);
    bodies.add(planetMoons.group);

    const meshById = new Map<SolarBodyId, THREE.Mesh>();
    const hitById = new Map<SolarBodyId, THREE.Mesh>();

    const textureById = new Map<SolarBodyId, THREE.Texture>();
    let textureLoadsCancelled = false;
    // Off the main thread where the browser allows it: see texture-load.ts.
    const loader = makePlanetTextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    // The loading screen stays up until the base maps (and the night lights)
    // are in and on the GPU: a map that lands after it has gone swaps a
    // material and uploads four megabytes in the middle of the first seconds
    // the player sees. A slow connection gets the procedural maps instead.
    let mapsPending = NASA_TEXTURE_IDS.length + 1;
    const mapsDeadline = performance.now() + MAPS_WAIT_MS;
    const mapSettled = () => { mapsPending -= 1; };

    // NASA Black Marble-derived night lights — the dark side of Earth glows
    // with real city grids via the material's emissive map.
    let earthNightTex: THREE.Texture | null = null;
    const applyEarthNight = () => {
      const mesh = meshById.get('earth');
      if (!mesh || !earthNightTex) return;
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.emissiveMap = earthNightTex;
      m.needsUpdate = true;
    };
    loader.load('/solar-system/planets/earth-night.jpg', (tex) => {
      mapSettled();
      if (textureLoadsCancelled) {
        disposePlanetTexture(tex);
        return;
      }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      earthNightTex = tex;
      applyEarthNight();
    }, mapSettled);

    const detailLoaded = new Set<SolarBodyId>();
    const applyLoadedTexture = (id: SolarBodyId, tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(quality.anisotropy, maxAniso);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      const previous = textureById.get(id);
      textureById.set(id, tex);
      if (id === 'sun') {
        sunSurface.setMap(tex);
        disposePlanetTexture(previous);
        return;
      }
      const mesh = meshById.get(id);
      if (mesh) {
        const oldMaterial = mesh.material as THREE.MeshStandardMaterial;
        if (oldMaterial.emissiveMap === earthNightTex) oldMaterial.emissiveMap = null;
        retireMat(oldMaterial);
        mesh.material = createPlanetMaterial(id, lite, tex);
        if (id === 'earth') applyEarthNight();
      } else {
        disposePlanetTexture(previous);
      }
    };

    for (const id of NASA_TEXTURE_IDS) {
      const url = NASA_PLANET_TEXTURE_URL[id];
      loader.load(
        url,
        (tex) => {
          mapSettled();
          if (textureLoadsCancelled || detailLoaded.has(id)) {
            disposePlanetTexture(tex);
            return;
          }
          applyLoadedTexture(id, tex);
        },
        () => {
          mapSettled();
          if (textureLoadsCancelled || detailLoaded.has(id) || id === 'sun') return;
          const mesh = meshById.get(id);
          if (mesh) {
            // The night map is shared and outlives this material: hand it
            // back before the material is freed, as the success path does.
            const failed = mesh.material as THREE.MeshStandardMaterial;
            if (failed.emissiveMap === earthNightTex) failed.emissiveMap = null;
            retireMat(failed);
            mesh.material = createPlanetMaterial(id, lite, null);
            if (id === 'earth') applyEarthNight();
          }
        },
      );
    }

    // Once a body fills enough of the frame that a 2K map would show its
    // pixels, pull the 4K one in behind it. One fetch per body per session.
    const detailRequested = new Set<SolarBodyId>();
    // `performance` never asks for a four-megapixel map: the fetch, the decode
    // and the upload together cost more than the pixels are worth on a phone,
    // and the base map is already 2K.
    // Nor does a phone or tablet: a 4K map is 32 MB of memory twice over.
    const wantsDetail = !lowData && !quality.lite && !window.matchMedia('(pointer: coarse)').matches;
    const maybeLoadDetailMap = (id: SolarBodyId, mesh: THREE.Mesh) => {
      if (!wantsDetail || detailRequested.has(id)) return;
      // Not during an arrival: the decode is off the main thread now
      // (texture-load.ts), but the upload is not, and the crew are watching a
      // world come up. Whatever they pass on the way keeps its base map; by
      // the time they ask again they are back at the controls.
      const flying = flightRef.current;
      if (flying && (flying.telemetry.approachPhase || flying.input.approachRequest)) return;
      const url = NASA_PLANET_DETAIL_URL[id];
      if (!url) return;
      // Apparent radius as a fraction of the viewport height.
      const apparent =
        worldRadiusForBody(id) / Math.max(camera.position.distanceTo(mesh.position), 1e-6);
      if (apparent < 0.06) return;
      detailRequested.add(id);
      loader.load(url, (tex) => {
        if (textureLoadsCancelled) {
          disposePlanetTexture(tex);
          return;
        }
        detailLoaded.add(id);
        applyLoadedTexture(id, tex);
      }, () => {
        // A dropped connection: the body keeps its base map and may ask again.
        detailRequested.delete(id);
      });
    };

    const hitPickRadiusMul = 4.2;

    let lastFocus: SolarBodyId | null = null;

    // Auroral ovals for every body that really has them. Earth's magnetic
    // pole sits ~11° off the spin axis; the ice giants' fields are wildly
    // tilted (Uranus ~59°, Neptune ~47°) — rendered slightly tamed so the
    // ovals stay readable.
    const AURORA_BY_ID: Partial<Record<SolarBodyId, Parameters<typeof makeAurora>[1]>> = {
      earth: { color: 0x3dff8a, topColor: 0xff5a6a, latitudeDeg: 68, magneticTiltDeg: 11, intensity: 0.34 },
      jupiter: { color: 0x6a8cff, topColor: 0xb08cff, latitudeDeg: 76, magneticTiltDeg: 10, intensity: 0.2 },
      saturn: { color: 0x7aa0ff, topColor: 0x9fc0ff, latitudeDeg: 78, magneticTiltDeg: 0, intensity: 0.16 },
      uranus: { color: 0x9fd8e8, topColor: 0xc0ecf4, latitudeDeg: 62, magneticTiltDeg: 45, intensity: 0.26 },
      neptune: { color: 0x8fb4ff, topColor: 0xb4ccff, latitudeDeg: 65, magneticTiltDeg: 40, intensity: 0.2 },
    };

    const makeBodyMesh = (id: SolarBodyId): THREE.Mesh => {
      const r = worldRadiusForBody(id);
      const segs =
        id === 'saturn' ? (lite ? 80 : 128) :
        lite ? 64 : 96;
      const geom = new THREE.SphereGeometry(r, segs, segs);
      // Real polar flattening — Jupiter and Saturn are visibly oblate.
      const oblate =
        id === 'jupiter' ? 0.935 :
        id === 'saturn' ? 0.902 :
        id === 'uranus' ? 0.977 :
        id === 'neptune' ? 0.983 :
        1;
      if (oblate !== 1) geom.scale(1, oblate, 1);
      const mat = id === 'sun'
        ? sunSurface.material
        : createPlanetMaterial(id, lite, textureById.get(id) ?? null);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData.bodyId = id;
      // Real axial tilt. Euler order ZYX applies the tilt (Z) on top of the
      // per-frame spin (Y), so each body rotates around its own tilted pole —
      // Uranus rolls on its side, Earth leans its true 23.4°.
      mesh.rotation.order = 'ZYX';
      mesh.rotation.z = THREE.MathUtils.degToRad(AXIAL_TILT_DEG[id]);
      return mesh;
    };

    let sampledEpoch = NaN;
    let samples: ReturnType<typeof sampleSolarSystem> = [];
    const sampledIds = new Set<SolarBodyId>();
    const syncMeshes = (epochMs: number) => {
      if (sampledEpoch !== epochMs) {
        sampledEpoch = epochMs;
        samples = sampleSolarSystem(
          new Date(epochMs),
          scaleRef.current,
          plutoRef.current,
        );
        sampledIds.clear();
        for (const smp of samples) sampledIds.add(smp.id);
      }

      for (const id of meshById.keys()) {
        if (!sampledIds.has(id)) {
          const m = meshById.get(id);
          const h = hitById.get(id);
          if (m) {
            bodies.remove(m);
            disposeMeshTree(m);
            meshById.delete(id);
          }
          if (h) {
            bodies.remove(h);
            h.geometry.dispose();
            (h.material as THREE.Material).dispose();
            hitById.delete(id);
          }
          atmosphereShells.delete(id);
          if (id === 'earth' && earthExtras) {
            bodies.remove(earthExtras.moonGroup);
            earthExtras.dispose();
            earthExtras = null;
            if (earthRocket) {
              bodies.remove(earthRocket.group);
              earthRocket.dispose();
              earthRocket = null;
            }
            if (earthSats) {
              bodies.remove(earthSats.group);
              earthSats.dispose();
              earthSats = null;
            }
            if (earthMeteors) {
              bodies.remove(earthMeteors.group);
              earthMeteors.dispose();
              earthMeteors = null;
            }
          }
          if (id === 'saturn' && saturnRings) {
            bodies.remove(saturnRings.group);
            saturnRings.dispose();
            saturnRings = null;
          }
        }
      }

      for (const s of samples) {
        let mesh = meshById.get(s.id);
        let hit = hitById.get(s.id);
        if (!mesh) {
          mesh = makeBodyMesh(s.id);
          meshById.set(s.id, mesh);
          bodies.add(mesh);

          const hRad = Math.max(worldRadiusForBody(s.id) * hitPickRadiusMul, 0.22);
          const hGeom = new THREE.SphereGeometry(hRad, 20, 20);
          const hMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          hit = new THREE.Mesh(hGeom, hMat);
          // Picking only: the camera never draws layer 1.
          hit.layers.set(1);
          hit.userData.bodyId = s.id;
          hitById.set(s.id, hit);
          bodies.add(hit);

          if (s.id === 'earth' && !earthExtras) {
            const er = worldRadiusForBody('earth');
            earthExtras = makeEarthExtras(er, lite);
            mesh.add(earthExtras.cloudMesh);
            mesh.add(earthExtras.atmosphereMesh);
            // Moon group attached at scene level so it doesn't inherit Earth's spin.
            bodies.add(earthExtras.moonGroup);
            // Occasional rocket launch — attached in an inertial frame too.
            earthRocket = makeEarthRocket(er);
            bodies.add(earthRocket.group);
            // Satellite constellation on faint orbit rings.
            earthSats = makeEarthSatellites(er, lite);
            bodies.add(earthSats.group);
            // Sporadic meteors burning up in the high atmosphere.
            earthMeteors = makeMeteors(er);
            bodies.add(earthMeteors.group);
          }

          if ((s.id === 'venus' || s.id === 'mars') && !atmosphereShells.has(s.id)) {
            const pr = worldRadiusForBody(s.id);
            const color = s.id === 'venus' ? 0xffd9a0 : 0xff8c5a;
            const intensity = s.id === 'venus' ? 1.3 : 0.85;
            const shell = makeAtmosphereShell(pr, color, 1.05, intensity, 2.6);
            atmosphereShells.set(s.id, shell);
            mesh.add(shell);
          }

          if ((s.id === 'uranus' || s.id === 'neptune') && !atmosphereShells.has(s.id)) {
            const pr = worldRadiusForBody(s.id);
            const color = s.id === 'uranus' ? 0x9fe6ec : 0x6f93ff;
            const shell = makeAtmosphereShell(pr, color, 1.045, 1.05, 2.4);
            atmosphereShells.set(s.id, shell);
            mesh.add(shell);
          }

          if (s.id === 'jupiter' && !atmosphereShells.has('jupiter')) {
            const pr = worldRadiusForBody('jupiter');
            const shell = makeAtmosphereShell(pr, 0xffd9a8, 1.035, 0.85, 2.8);
            atmosphereShells.set('jupiter', shell);
            mesh.add(shell);
          }

          if (s.id === 'saturn' && !saturnRings) {
            const sr = worldRadiusForBody('saturn');
            saturnRings = makeSaturnParticleRings(sr, lite);
            // Rings share the planet's real tilt but sit at scene level so
            // they don't inherit Saturn's spin (particles orbit on their own).
            saturnRings.group.rotation.z = THREE.MathUtils.degToRad(AXIAL_TILT_DEG.saturn);
            bodies.add(saturnRings.group);
          }

          if (s.id === 'uranus') {
            // Child of the planet mesh — inherits the 82° tilt; the ring is
            // rotationally symmetric around the spin axis so spin is invisible.
            mesh.add(makeUranusRings(worldRadiusForBody('uranus')));
          }

          if (s.id === 'earth') applyEarthNight();

          const auroraSpec = AURORA_BY_ID[s.id];
          if (auroraSpec) {
            const aurora = makeAurora(worldRadiusForBody(s.id), auroraSpec);
            mesh.add(aurora.group);
            auroraHandles.push(aurora);
          }
        }
        mesh.position.copy(s.position);
        hit?.position.copy(s.position);
      }

      // A body looks the same whether or not it is selected: the popup and
      // the camera say what is selected, so nothing here inflates the sphere
      // or floods it with emissive — both read as a loss of detail up close.
      meshById.forEach((mesh, id) => {
        if (id === 'sun') return;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (id === 'earth' && mat.emissiveMap) {
          // Night-side city lights ride the emissive map.
          mat.emissive.setHex(0xffd9a0);
          mat.emissiveIntensity = 0.85;
        }
      });

      const focus = focusRef.current;
      if (focus && focus !== lastFocus) {
        lastFocus = focus;
        const pr = worldRadiusForBody(focus);
        orbDist = Math.max(pr * 5.5, 1.1);
        orbTheta = 0.65;
        orbPhi = 1.05;
      }
      if (!focus) lastFocus = null;
    };

    const raycaster = new THREE.Raycaster();
    const planetPosOf = (id: SolarBodyId) => meshById.get(id)?.position ?? null;
    const ndc = new THREE.Vector2();
    // Cosmic tier blend, updated each frame from the camera's sysRadius.
    // Used both for fading the galactic layers and for gating picking.
    let currentTier = tierBlendFromRadius(sysRadius);

    const pick = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      // At the galactic tier the Milky Way disk is the only selectable
      // object — tapping it kicks the camera back into the solar system.
      // We use the live tier blend so the disk isn't pickable when it's
      // still mostly faded out.
      if (galaxyDisk.group.visible && currentTier.galactic > 0.5) {
        raycaster.layers.set(0);
        const galaxyHit = raycaster.intersectObject(galaxyDisk.pickTarget, false);
        if (galaxyHit.length > 0) {
          onZoomToSunRef.current?.();
          return;
        }
      }
      raycaster.layers.set(1);
      const hits = raycaster.intersectObjects([...hitById.values()], false);
      const first = hits[0]?.object as THREE.Mesh | undefined;
      const id = (first?.userData.bodyId as SolarBodyId | undefined) ?? null;
      onSelectRef.current(id);
    };

    let drag = false;
    let downOk = false;
    let lx = 0;
    let ly = 0;
    let downX = 0;
    let downY = 0;

    let pinchActive = false;
    let lastPinchDist = 0;
    /** A pinch happened in this gesture: no finger lifting out of it is a tap. */
    let hadPinch = false;

    const flying = () => !!flightRef.current?.active;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || flying()) return;
      downOk = true;
      drag = true;
      downX = lx = e.clientX;
      downY = ly = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || flying()) return;
      if (!drag) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const focus = focusRef.current;
      if (focus) {
        orbTheta += dx * 0.006;
        orbPhi = THREE.MathUtils.clamp(orbPhi - dy * 0.005, 0.12, Math.PI - 0.08);
      } else {
        sysTheta += dx * 0.0055;
        sysPhi = THREE.MathUtils.clamp(sysPhi - dy * 0.0045, 0.18, Math.PI - 0.12);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || flying()) return;
      if (downOk && drag) {
        const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (moved < 8) pick(e.clientX, e.clientY);
      }
      downOk = false;
      drag = false;
    };

    // Zoom accelerates once the camera leaves the solar tier — without this,
    // the ~1300× radius span from planets to the cosmic web takes dozens of
    // wheel flicks and the galaxies feel unreachable.
    const zoomAccel = () => 1 + Math.min(2.4, Math.max(0, Math.log10(sysRadius / 40)));

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (flying()) return;
      if (focusRef.current) {
        orbDist *= Math.exp(e.deltaY * 0.0011);
      } else {
        sysRadius *= Math.exp(e.deltaY * 0.0011 * zoomAccel());
        // Clamp spans the stellar neighbourhood, the Milky Way disk, the
        // Local Group, and the cosmic-web tier.
        sysRadius = THREE.MathUtils.clamp(sysRadius, 5.2, MAX_SYS_RADIUS);
      }
    };

    const touchDist = (t: TouchList) => {
      if (t.length < 2) return 0;
      const a = t[0];
      const b = t[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (flying()) { e.preventDefault(); return; }
      if (e.touches.length === 2) {
        pinchActive = true;
        hadPinch = true;
        lastPinchDist = touchDist(e.touches);
        drag = false;
        downOk = false;
      } else if (e.touches.length === 1) {
        pinchActive = false;
        hadPinch = false;
        lastPinchDist = 0;
        downOk = true;
        drag = true;
        const t = e.touches[0];
        downX = lx = t.clientX;
        downY = ly = t.clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (flying()) { e.preventDefault(); return; }
      if (e.touches.length >= 2) {
        const d = touchDist(e.touches);
        if (lastPinchDist > 4 && d > 4) {
          const factor = d / lastPinchDist;
          if (focusRef.current) {
            orbDist = THREE.MathUtils.clamp(orbDist / factor, 0.04, 420);
          } else {
            // Same acceleration as the wheel so a few pinches reach the web.
            sysRadius = THREE.MathUtils.clamp(
              sysRadius / Math.pow(factor, zoomAccel()),
              5.2,
              MAX_SYS_RADIUS,
            );
          }
        }
        lastPinchDist = d;
        pinchActive = true;
        e.preventDefault();
        return;
      }
      if (!drag || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - lx;
      const dy = t.clientY - ly;
      lx = t.clientX;
      ly = t.clientY;
      const focus = focusRef.current;
      if (focus) {
        orbTheta += dx * 0.0065;
        orbPhi = THREE.MathUtils.clamp(orbPhi - dy * 0.0055, 0.12, Math.PI - 0.08);
      } else {
        sysTheta += dx * 0.0065;
        sysPhi = THREE.MathUtils.clamp(sysPhi - dy * 0.005, 0.18, Math.PI - 0.12);
      }
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (flying()) return;
      if (e.touches.length < 2) {
        pinchActive = false;
        lastPinchDist = 0;
      }
      // Out of a pinch with one finger still down: that finger turns the view.
      if (hadPinch && e.touches.length === 1) {
        drag = true;
        lx = e.touches[0].clientX;
        ly = e.touches[0].clientY;
      }
      if (e.type === 'touchend' && e.changedTouches.length === 1 && e.touches.length === 0 && !hadPinch) {
        const t = e.changedTouches[0];
        const moved = Math.hypot(t.clientX - downX, t.clientY - downY);
        if (moved < 10) pick(t.clientX, t.clientY);
      }
      if (e.touches.length === 0) {
        drag = false;
        downOk = false;
        hadPinch = false;
      }
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    const onPointerLeave = () => { downOk = false; drag = false; };
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);

    // Resizes are folded into one per frame, and one that changes nothing is
    // dropped: each re-allocates the post chain's targets, and a phone's URL
    // bar or a rotation sends a burst of them.
    let sizedW = -1;
    let sizedH = -1;
    let sizedRatio = -1;
    let resizeRaf = 0;
    const onResize = () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        applySize();
      });
    };
    const applySize = (force = false) => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const r = ratioFor();
      if (!force && w === sizedW && h === sizedH && r === sizedRatio) return;
      sizedW = w; sizedH = h; sizedRatio = r;
      camera.aspect = Math.max(1, mount.clientWidth) / Math.max(1, mount.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(ratioFor());
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      postFx.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', onResize);
    // The container can change size without the window doing so (the
    // landscape toggle, a rotation that lands after its resize event).
    const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    sizeObserver?.observe(mount);
    // A new preset: the pixel ratio and the post chain follow at once. What
    // was decided when the scene was built — the star and belt counts —
    // follows on the next build, as it does on the surfaces.
    const offQuality = onQualityChange((q) => { postFx.setQuality(q); applySize(true); });

    // How much of the glass a sunlit world is filling, eased: see worldGlare().
    let bodyGlare = 0;
    const toCam = new THREE.Vector3();
    const toStar = new THREE.Vector3();
    const camFwd = new THREE.Vector3();
    /**
     * A lit face is the brightest thing in the frame once it fills the glass:
     * the surface does not get brighter as the ship closes, there is only
     * more of it, burning out and blooming until the screen is a haze. Scored
     * 0…1 as the share of the view the nearest lit world covers, times how
     * much of what the camera sees of it is in daylight.
     */
    const worldGlare = (bodies: readonly FlightBody[]) => {
      camera.getWorldDirection(camFwd);
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      let worst = 0;
      for (const b of bodies) {
        if (b.kind === 'star' || b.kind === 'blackhole' || b.kind === 'station' || b.destroyed) continue;
        toCam.subVectors(camera.position, b.position);
        const d = toCam.length();
        if (d <= b.radius) continue;
        const ang = Math.asin(b.radius / d);
        // Behind the camera, or out past the edge of the view: not in the frame.
        const off = Math.acos(THREE.MathUtils.clamp(-toCam.dot(camFwd) / d, -1, 1));
        if (off > halfFov * 1.4 + ang) continue;
        const cover = Math.min(1, (ang / halfFov) ** 2);
        if (cover < 0.02) continue;
        let star: FlightBody | null = null; let best = Infinity;
        for (const s of bodies) {
          if (s.kind !== 'star') continue;
          const ds = s.position.distanceToSquared(b.position);
          if (ds < best) { best = ds; star = s; }
        }
        if (!star) continue;
        toStar.subVectors(star.position, b.position).normalize();
        const lit = 0.5 + 0.5 * toCam.normalize().dot(toStar);
        worst = Math.max(worst, cover * lit);
      }
      return worst;
    };

    let raf = 0;
    let lastFrame = performance.now();
    const t0 = lastFrame;
    let docVisible = !document.hidden;

    // Explore Mode: the ship exists only while the session is active. It is
    // created lazily inside the loop and torn down the frame the session
    // goes inactive (or on unmount), so repeated enter/exit never leaks.
    let ship: PlayerShipHandle | null = null;
    // The other explorers in the room — drawn only while this one is flying.
    const fleet = makeRemoteFleet();
    fleet.group.visible = false;
    scene.add(fleet.group);
    const teardownShip = () => {
      if (!ship) return;
      // Where the pilot left it, for the canvas that comes after this one.
      const at = ship.group.position;
      parkedRef.current = {
        position: at.clone(),
        lookAt: new THREE.Vector3(0, 0, 1).applyQuaternion(ship.group.quaternion).add(at),
        yaw: 0,
      };
      aliens.setHostile(null);
      shipFill.intensity = 0;
      scene.add(shipFill);
      scene.remove(ship.group);
      scene.remove(ship.boltGroup);
      scene.remove(ship.fxGroup);
      ship.dispose();
      ship = null;
      delete window.__stellarFlight;
      showSystem(alphaCen.group, false);
      showSystem(gargantua.group, false);
      // The follow camera rolls its up vector, widens the lens and pulls the
      // clipping planes in around the ship; the orbit camera needs them back.
      camera.up.set(0, 1, 0);
      camera.fov = 42;
      camera.near = ORBIT_NEAR;
      camera.far = ORBIT_FAR;
      camera.updateProjectionMatrix();
      renderer.toneMappingExposure = 1.18;
      bodyGlare = 0;
    };

    // The flight model's view of the world: every solid body with its real
    // radius and surface gravity, the respawn point of whichever system the
    // ship is in, and the hyperdrive's destination — the other system.
    const flightBodies = new Map<string, FlightBody>();
    const bodyFor = (
      id: string, kind: FlightBody['kind'], radius: number, radiusKm: number, surfaceG: number, atmosphere: number,
    ): FlightBody => {
      let b = flightBodies.get(id);
      if (!b) {
        b = { id, kind, position: new THREE.Vector3(), radius, radiusKm, surfaceG, atmosphere };
        flightBodies.set(id, b);
      }
      return b;
    };
    // A rammed or shot-down station stays dark for a while, then is back.
    let stationDownUntil = 0;
    const world: FlightWorld = {
      bodies: [],
      pois: [],
      home: { position: new THREE.Vector3(), lookAt: new THREE.Vector3(), yaw: 0 },
      jump: { name: 'alphaCentauri', distanceLy: 4.37, position: new THREE.Vector3(), lookAt: new THREE.Vector3(), yaw: 0 },
      systemName: 'sol',
    };
    const anchorUp = new THREE.Vector3();
    const anchorRight = new THREE.Vector3();
    const anchorFwd = new THREE.Vector3();
    // A few Earth radii out on a tangent, a little above the ecliptic, with
    // the planet framed ahead and to one side of the nose.
    const solAnchor = (earth: THREE.Vector3 | null, out: FlightAnchor) => {
      const anchor = earth ?? anchorFwd.set(1, 0, 0);
      anchorRight.copy(anchor).normalize();
      anchorUp.set(0, 1, 0);
      anchorFwd.crossVectors(anchorUp, anchorRight).normalize();
      out.position.copy(anchor).addScaledVector(anchorFwd, 0.14).addScaledVector(anchorUp, 0.03);
      out.lookAt.copy(anchor);
      out.yaw = 0.45;
    };
    const copyAnchor = (from: FlightAnchor, to: FlightAnchor) => {
      to.position.copy(from.position);
      to.lookAt.copy(from.lookAt);
      to.yaw = from.yaw;
    };
    let syncEarth: THREE.Vector3 | null = null;
    const arrivalOf = (name: string, out: FlightAnchor) => {
      if (name === 'sol') solAnchor(syncEarth, out);
      else copyAnchor(name === 'gargantua' ? gargantua.arrival : alphaCen.arrival, out);
    };
    const syncWorld = (shipPos: THREE.Vector3 | null, earth: THREE.Vector3 | null, nowMs: number) => {
      syncEarth = earth;
      world.bodies.length = 0;
      for (const [id, mesh] of meshById) {
        const b = bodyFor(id, id === 'sun' ? 'star' : 'planet', worldRadiusForBody(id), MEAN_RADIUS_KM[id], SURFACE_G[id], ATMOSPHERE[id]);
        b.position.copy(mesh.position);
        // A world taken apart under a standing order stays gone.
        if (b.destroyed) mesh.visible = false;
        world.bodies.push(b);
      }
      // The Moon, every planet's moons, the belt's dwarf planets, the station.
      if (earthExtras && earth) {
        const er = worldRadiusForBody('earth');
        const moon = bodyFor('moon', 'moon', er * 0.273, 1737, 1.62, 1);
        moon.position.copy(earth).add(earthExtras.moonMesh.position);
        world.bodies.push(moon);
      }
      for (const m of planetMoons.moons) {
        const planet = meshById.get(m.planet);
        if (!planet) continue;
        const km = MEAN_RADIUS_KM[m.planet] * (m.radius / worldRadiusForBody(m.planet));
        const b = bodyFor(m.name.toLowerCase(), 'moon', m.radius, km, 1.62 * (km / 1737), 1);
        b.position.copy(planet.position).add(m.mesh.position);
        world.bodies.push(b);
      }
      for (const b of smallBodies.bodies) world.bodies.push(b);
      if (earthSats && earth) {
        const iss = bodyFor('iss', 'station', earthSats.stationRadius, 0.11, 0, 1);
        iss.position.copy(earth).add(earthSats.station.position);
        if (iss.destroyed && stationDownUntil === 0) stationDownUntil = nowMs + 90_000;
        if (iss.destroyed && nowMs >= stationDownUntil) {
          iss.destroyed = false;
          iss.hp = undefined;
          stationDownUntil = 0;
        }
        earthSats.station.visible = !iss.destroyed;
        world.bodies.push(iss);
      }
      for (const b of alphaCen.bodies) world.bodies.push(b);
      for (const b of gargantua.bodies) world.bodies.push(b);
      world.pois = probes.targets;
      // The ship is in whichever system's centre is nearest; the drive points
      // at the system the pilot picked, or the default hop if that is here.
      let current = 'sol';
      if (shipPos) {
        let best = shipPos.length();
        if (shipPos.distanceTo(alphaCen.center) < best) {
          best = shipPos.distanceTo(alphaCen.center);
          current = 'alphaCentauri';
        }
        if (shipPos.distanceTo(gargantua.center) < best) current = 'gargantua';
      }
      const dest = resolveDestination(current, flightRef.current?.destination ?? '');
      world.systemName = current;
      arrivalOf(current, world.home);
      arrivalOf(dest, world.jump);
      world.jump.name = dest;
      world.jump.distanceLy = lightYearsBetween(current, dest);
    };
    /** Screen brackets for what is worth naming out of the canopy: bodies
     *  ahead of the ship, close enough to matter, and small enough on screen
     *  that a label tells you something. Anything that already fills the
     *  frame is obvious without a tag. */
    const markPt: ScreenPoint = { x: 0, y: 0, depth: 0 };
    const markTargets = (
      tel: FlightSession['telemetry'],
      w: FlightWorld,
      cam: THREE.PerspectiveCamera,
    ) => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      let n = 0;
      tel.markerIds.length = 0;
      const halfFov = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      for (const b of w.bodies) {
        if (n >= MARKER_MAX || b.destroyed) continue;
        const dist = cam.position.distanceTo(b.position);
        if (dist > b.radius * 260) continue;
        // The locked target carries its own marker.
        if (b.id === tel.navId) continue;
        // How much of the frame height the body covers. Anything filling
        // more than a small part of it needs no name — you are looking at it.
        const screenFrac = b.radius / Math.max(dist, 1e-9) / halfFov;
        if (screenFrac > 0.13) continue;
        const p = markPt;
        // The name runs to the right of the bracket, so the right margin has
        // to be wide enough to hold it rather than clip it at the edge.
        if (!projectInto(b.position, cam, width, height, p) || p.x < 40 || p.x > width - 150 || p.y < 40 || p.y > height - 120) continue;
        // Two names on the same spot read as neither; keep the first.
        let crowded = false;
        for (let k = 0; k < n && !crowded; k++) {
          crowded = Math.abs(tel.markers[k * 3] - p.x) < 150 && Math.abs(tel.markers[k * 3 + 1] - p.y) < 26;
        }
        if (crowded) continue;
        tel.markers[n * 3] = p.x;
        tel.markers[n * 3 + 1] = p.y;
        tel.markers[n * 3 + 2] = screenFrac / 0.13;
        tel.markerIds.push(b.id);
        n += 1;
      }
      tel.markerCount = n;
    };

    // Epoch anchor for shader time uniforms — keeps the float32 value the GPU
    // sees small enough to stay precise across the ±2 year scrub range.
    const baseEpochMs = epochRef.current.current;
    // Everything that is a pure function of the epoch is only moved when the
    // epoch moves: paused, in flight or out at the galaxy nothing is recomputed.
    let movedEpoch = NaN;

    const stopLoop = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const startLoop = () => {
      if (raf || !docVisible) return;
      lastFrame = performance.now();
      raf = requestAnimationFrame(loop);
    };

    const onVis = () => {
      docVisible = !document.hidden;
      if (docVisible) startLoop();
      else stopLoop();
    };
    document.addEventListener('visibilitychange', onVis);

    // The next frame is asked for before this one runs, so nothing this
    // frame does can stop the loop.
    const loop = () => {
      if (!docVisible) {
        stopLoop();
        return;
      }
      if (contextLost) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(loop);
      try {
        frame();
        guard.ok();
      } catch (e) {
        guard.fail(e);
      }
    };
    const frame = () => {
      const now = performance.now();
      const dtSec = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      if (pausedRef.current && readyFired) return;
      // Wall-clock seconds for shader animation (convection, cloud bands).
      const sceneTime = reduceMotion ? 0 : (now - t0) / 1000;
      const epochNow = epochRef.current.current;
      const epochMoved = epochNow !== movedEpoch;
      movedEpoch = epochNow;

      syncMeshes(epochNow);
      // Spin phase is a pure function of the simulation epoch — bodies hold
      // still while time is paused and track playback/scrubbing exactly.
      for (const [id, mesh] of meshById) {
        if (epochMoved) mesh.rotation.y = siderealSpinY(id, epochNow);
        tickPlanetMaterial(mesh.material as THREE.Material, sceneTime);
        maybeLoadDetailMap(id, mesh);
      }
      sunSurface.setTime(sceneTime);

      const sunMesh = meshById.get('sun');
      if (sunMesh) sunLight.position.copy(sunMesh.position);
      const earthPos = meshById.get('earth')?.position ?? null;

      const session = flightRef.current;
      const flightActive = !!session?.active;
      if (session && flightActive) {
        if (!ship) {
          ship = createPlayerShip(session);
          scene.add(ship.group);
          scene.add(ship.boltGroup);
          scene.add(ship.fxGroup);
          // The ship's programs start building now, in parallel where the
          // driver allows, rather than one by one inside its first frame.
          void compileScene();
          // Which star system is drawn follows the ship; see below.
          ship.fillAnchor.add(shipFill);
          shipFill.position.set(0, 0, 0);
          shipFill.distance = ship.fillDistance;
          shipFill.intensity = 0.05;
          // A ship is a fraction of a planet's radius across and the camera
          // rides just behind it, so the near plane comes in. Nothing beyond
          // the star shell is drawn in flight, so the far plane comes in too.
          camera.near = FLIGHT_NEAR;
          camera.far = FLIGHT_FAR;
          camera.updateProjectionMatrix();
          syncWorld(null, earthPos, now);
          const fromHome = session.input.fromHome;
          session.input.fromHome = false;
          ship.spawn(fromHome || !parkedRef.current ? world.home : parkedRef.current);
          const live = ship;
          aliens.setHostile({ group: live.group, onHit: (dmg) => live.takeDamage(dmg) });
          if (QA_HOOKS) window.__stellarFlight = { session, ship: live, world, aliens };
        }
      } else if (ship) {
        teardownShip();
      }
      if (!ship) {
        fleet.group.visible = false;
        if (roomRef.current) writeOrbitPose(roomRef.current.self);
      }

      const focus = focusRef.current;
      if (ship) {
        syncWorld(ship.group.position, earthPos, now);
        ship.update(dtSec, (now - t0) / 1000, camera, aliens, world);
        // Only the system the ship is in — or is jumping to — is drawn: the
        // other stars are light-years away, and their lights would cost every
        // lit fragment here. During a jump both ends are up so arrival is seamless.
        const tel = session!.telemetry;
        const jumping = tel.jumpPhase !== 'none';
        const inSystem = (name: string) => tel.systemName === name || (jumping && tel.targetName === name);
        showSystem(alphaCen.group, inSystem('alphaCentauri'));
        showSystem(gargantua.group, inSystem('gargantua'));
        if (systemOn(alphaCen.group)) alphaCen.update(session?.paused ? 0 : dtSec, camera.position, camera);
        if (systemOn(gargantua.group)) gargantua.update(session?.paused ? 0 : dtSec, camera.position, camera);
        const link = roomRef.current;
        fleet.group.visible = !!link;
        if (link) {
          writeFlightPose(link.self, ship.group, tel.pilot === 'eva' ? ship.eva : null, session!.shipKind, world.bodies);
          fleet.update(link, world.bodies, camera, now);
        }
        markTargets(tel, world, camera);
        // Exposure adapts against the Sun: the closer and the more the nose
        // is on it, the further the iris closes, so the disc keeps a
        // surface and the rest of the frame goes dark and dangerous. It
        // closes the same way, less far, on a sunlit world that fills the
        // glass, so a close pass keeps its colour instead of burning white.
        bodyGlare += (worldGlare(world.bodies) - bodyGlare) * (1 - Math.exp(-dtSec * 2.5));
        renderer.toneMappingExposure = Math.max(0.42, 1.18 - 0.62 * session!.telemetry.sunGlare - 0.5 * bodyGlare);
      } else if (focus && meshById.has(focus)) {
        vTarget.copy(meshById.get(focus)!.position);
        const pr = worldRadiusForBody(focus);
        updateOrbitCamera(vTarget, pr);
      } else {
        updateSystemCamera();
      }
      if (!reduceMotion) {
        // Ambient background drift + decorative real-time layers: rocket
        // launches, aurora shimmer.
        // Tuned at 60 Hz: the same drift at any refresh rate.
        stars.rotation.y += 0.0033 * dtSec;
        milkyWay.rotation.y += 0.00132 * dtSec;
        milkyGlow.group.rotation.y += 0.00132 * dtSec;
        earthRocket?.update(dtSec);
        earthMeteors?.update(dtSec);
        for (const a of auroraHandles) a.update(dtSec);
      }
      // Alien sightings are decorative (reduce-motion pauses them) — but in
      // Explore Mode they are the opposition, so they always run.
      if ((!reduceMotion || flightActive) && !session?.paused) aliens.update(dtSec, earthPos);
      // Epoch-accurate motion — belts, clouds, the real Moon, and Saturn's
      // ring particles all track simulation time (Kepler rates), so they
      // respond to play/scrub/speed exactly like the planets do.
      asteroidBelt.update(epochNow);
      kuiperBelt.update(epochNow);
      if (epochMoved) smallBodies.update(epochNow, scaleRef.current);
      earthExtras?.update(epochNow, reduceMotion ? 0 : dtSec);
      // Probe labels are system-view furniture — hidden in low orbit and in flight.
      probes.update(epochNow, focusRef.current || ship ? 0 : sysRadius);
      if (epochMoved) saturnRings?.update((epochNow - baseEpochMs) / 1000);
      if (earthExtras) {
        const earthMesh = meshById.get('earth');
        if (earthMesh) {
          earthExtras.moonGroup.position.copy(earthMesh.position);
          if (earthRocket) earthRocket.group.position.copy(earthMesh.position);
          if (earthMeteors) earthMeteors.group.position.copy(earthMesh.position);
          if (earthSats) {
            earthSats.group.position.copy(earthMesh.position);
            if (epochMoved) earthSats.update(epochNow, earthMesh.position);
            // In flight the deck brackets everything worth naming; the
            // sprite labels would double up on them.
            earthSats.setLabels(!ship);
          }
        }
      }
      if (saturnRings) {
        const saturnMesh = meshById.get('saturn');
        if (saturnMesh) saturnRings.group.position.copy(saturnMesh.position);
      }
      sunExtras.update(camera.position, sunMesh?.position ?? vZero, dtSec, camera);

      // Moons + comet at their epoch-accurate orbital phases (real periods).
      if (epochMoved) {
        planetMoons.update(epochNow, planetPosOf);
        comet.update(epochNow, sunMesh?.position ?? vZero);
      }

      // Imperative zoom (e.g. "zoom into Sun" from the galactic tier) —
      // ease sysRadius toward the requested target, then clear the request.
      const zoomReq = zoomToRef.current;
      if (zoomReq != null && !focusRef.current) {
        const diff = zoomReq - sysRadius;
        if (Math.abs(diff) < Math.max(0.5, zoomReq * 0.01)) {
          sysRadius = zoomReq;
          zoomToRef.current = null;
          onZoomToConsumedRef.current?.();
        } else {
          // Logarithmic easing — handles huge ratio gaps cleanly.
          sysRadius = sysRadius * Math.pow(zoomReq / sysRadius, Math.min(1, dtSec * 2.4));
        }
      }

      // Cosmic tier blend + galactic-layer fades.
      currentTier = tierBlendFromRadius(ship ? 26 : sysRadius);
      // Star-system labels belong to the stellar tier only — over the whole
      // galaxy thirty floating names would just be noise.
      // The catalogue stars are drawn on a compressed local scale — at the
      // galactic tier they would sprawl across half the disk, so they hand
      // over to the Milky Way's own star volume as it arrives.
      nearbyStars.setFade(
        currentTier.stellar * (1 - currentTier.galactic * 0.92),
        currentTier.stellar * (1 - currentTier.galactic),
      );
      galaxyDisk.setFade(currentTier.galactic);
      andromeda.setFade(currentTier.local);
      otherGalaxies.setFade(currentTier.local, currentTier.universe);
      cosmicWeb.setFade(currentTier.web);
      // The dense particle Milky Way ribbon at the solar tier overlaps
      // visually with the new disk — fade it out once the disk takes over.
      const milkyMat = milkyWay.material as THREE.PointsMaterial;
      milkyMat.opacity = 0.55 * (1 - currentTier.galactic);
      milkyGlow.setFade(1 - currentTier.galactic);
      nebulae.setFade(1 - currentTier.stellar);
      // Orbit paths orient you from far out. Close in — orbiting a body, or
      // flying — they just draw lines across the thing you came to look at,
      // so they fade away as the camera closes on the subject.
      setOrbitRingsFade(orbitRings, ship ? 0.14 : focus ? 0 : THREE.MathUtils.clamp((sysRadius - 9) / 9, 0, 1));

      projectSunPoint(sunOrigin, camera, sunScreen);
      postFx.setSun(sunScreen.x, sunScreen.y, sunScreen.visible, sunScreen.edge);
      // Under the loader nothing is drawn until the programs are built: a
      // frame drawn with half-built programs waits for them on the main
      // thread, and the loader's own animation freezes with it.
      if (readyFired || compiled) postFx.render(dtSec);
      if (!readyFired) {
        if (mapsPending > 0 && now < mapsDeadline) {
          // Still waiting on the maps; the loader covers the canvas.
        } else if (!warmed) {
          // Every program in the scene — the galactic tiers and the belts
          // that are faded out now included — built in parallel off the main
          // thread where the driver allows, then every texture uploaded,
          // before the loader goes. Then a couple of frames to show it holds.
          warmed = true;
          void compileScene().then(() => {
            if (contextLost) return;
            try { uploadSceneTextures(renderer, scene); } catch { /* drawn on first use instead */ }
            compiled = true;
          });
        } else if (compiled && ++settledFrames >= 2) {
          readyFired = true;
          onReadyRef.current?.();
        }
      }
    };
    let readyFired = false;
    let warmed = false;
    let compiled = false;
    let settledFrames = 0;
    startLoop();
    if (QA_HOOKS) {
      window.__stellarOrrery = {
        probe: (within) => probeCalls(renderer, scene, () => postFx.render(0), within),
        view: (v) => {
          if (v.theta !== undefined) sysTheta = v.theta;
          if (v.phi !== undefined) sysPhi = v.phi;
          if (v.radius !== undefined) sysRadius = THREE.MathUtils.clamp(v.radius, 5.2, MAX_SYS_RADIUS);
          if (v.focus !== undefined) onSelectRef.current(v.focus);
          if (v.dist !== undefined) { lastFocus = v.focus ?? lastFocus; orbDist = v.dist; }
        },
      };
    }

    return () => {
      stopLoop();
      delete window.__stellarOrrery;
      cancelRebuild?.();
      // Pending compile polls settle now rather than read freed materials.
      releaseCompilePolls(renderer);
      compiling = 0;
      for (const m of retired.splice(0)) disposeMat(m);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      sizeObserver?.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      offQuality();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);

      teardownShip();
      fleet.dispose();
      textureLoadsCancelled = true;
      textureById.forEach(disposePlanetTexture);
      textureById.clear();

      if (earthExtras) {
        bodies.remove(earthExtras.moonGroup);
        earthExtras.dispose();
        earthExtras = null;
      }
      if (earthRocket) {
        bodies.remove(earthRocket.group);
        earthRocket.dispose();
        earthRocket = null;
      }
      if (earthSats) {
        bodies.remove(earthSats.group);
        earthSats.dispose();
        earthSats = null;
      }
      if (earthMeteors) {
        bodies.remove(earthMeteors.group);
        earthMeteors.dispose();
        earthMeteors = null;
      }
      if (saturnRings) {
        bodies.remove(saturnRings.group);
        saturnRings.dispose();
        saturnRings = null;
      }
      atmosphereShells.forEach((shell) => disposeAtmosphereShell(shell));
      atmosphereShells.clear();
      for (const a of auroraHandles) a.dispose();
      auroraHandles.length = 0;
      scene.remove(probes.group);
      probes.dispose();
      scene.remove(aliens.group);
      aliens.dispose();
      disposePlanetTexture(earthNightTex ?? undefined);
      asteroidBelt.dispose();
      kuiperBelt.dispose();
      bodies.remove(planetMoons.group);
      planetMoons.dispose();
      scene.remove(comet.group);
      comet.dispose();
      sunExtras.dispose();
      scene.remove(alphaCen.group);
      alphaCen.dispose();
      scene.remove(gargantua.group);
      gargantua.dispose();
      scene.remove(smallBodies.group);
      smallBodies.dispose();
      sunSurface.dispose();
      disposeOrbitRings(orbitRings);
      disposeMilkyWayBand(milkyWay);
      scene.remove(milkyGlow.group);
      milkyGlow.dispose();
      scene.remove(nebulae.group);
      nebulae.dispose();
      scene.remove(nearbyStars.group);
      scene.remove(galaxyDisk.group);
      scene.remove(andromeda.group);
      scene.remove(otherGalaxies.group);
      scene.remove(cosmicWeb.group);
      nearbyStars.dispose();
      galaxyDisk.dispose();
      andromeda.dispose();
      otherGalaxies.dispose();
      cosmicWeb.dispose();

      meshById.forEach((mesh) => disposeMeshTree(mesh));
      meshById.clear();
      hitById.forEach((h) => {
        h.geometry.dispose();
        (h.material as THREE.Material).dispose();
      });
      hitById.clear();
      starGeo.dispose();
      (stars.material as THREE.Material).dispose();
      // The soft sprite is one texture for the whole page (stars, glows,
      // plumes): each renderer that uploads it hangs a dispose listener on
      // it, and that listener keeps the whole renderer reachable after this
      // canvas is gone — one more per trip to a surface and back. Disposing
      // it frees only this context's copy; the next renderer re-uploads it.
      starSprite.dispose();
      releaseSaturnRingStripTexture();
      postFx.dispose();
      renderer.dispose();
      // Give the context back now rather than when the canvas is collected:
      // the Moon scene and every rebuild after a context loss want one too.
      // (A context the GPU already took has nothing to give back, and asking
      // for its extension only logs a warning.)
      if (!contextLost) renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [scaleMode, includePluto, glGeneration]);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    focusRef.current = focusBodyId;
  }, [focusBodyId]);

  return <div ref={mountRef} className="solar-system__canvas" />;
}
