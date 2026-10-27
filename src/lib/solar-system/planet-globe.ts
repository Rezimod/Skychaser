// The whole planet under a surface scene, drawn behind it: what the crew see
// of the world from orbit, from inside the air on the way down, and past the
// edge of the walkable ground once they are on it.
//
// The globe lives in its own scene, in kilometres, planet at the origin,
// body-fixed (planet-frame.ts). It never shares a depth buffer with the
// surface scene: the post chain draws the sky, then the globe, then the
// surface scene over both with the depth cleared in between (moon-post
// `setLayers`), so a sphere thousands of kilometres across and a bootprint
// a centimetre deep are each drawn at their own precision.
//
// Inside, the planet is a cube-sphere quadtree of chunks that splits as the
// camera comes close (planet-globe-tiles.ts), whose heights come from
// planet-globe-height.ts (procedural Moon, Mars, Mercury and Venus, levelled
// to the landing site; the giants' flat 1-bar level) or from Earth's real
// elevation streamed as terrarium tiles (planet-globe-terrarium.ts). Chunks
// are built a row at a time inside a per-frame budget, so a split never
// stalls a frame; the parent stays drawn until its children are ready. The
// ground shader, the cloud shells (Earth's, and Venus's unbroken deck) and
// the air are in planet-globe-material.ts and planet-globe-atmosphere.ts;
// Saturn's rings in planet-globe-rings.ts; optional satellite imagery over
// Earth in planet-globe-imagery.ts.

import * as THREE from 'three';
import type { QualityProfile } from '@/game/quality';
import { makePlanetTextureLoader, disposePlanetTexture } from '@/lib/solar-system/texture-load';
import {
  PLANET_BODIES, siteBasis, localDirToGlobe, type GlobeWorld, type PlanetBody, type SiteBasis,
} from '@/lib/solar-system/planet-frame';
import {
  QuadTree, ChunkBuilder, selectChunks, lodBudget, maxLevelFor, faceToDir, type QuadNode, type ChunkArrays,
} from '@/lib/solar-system/planet-globe-tiles';
import {
  makeProceduralHeight, makeEarthHeight, makeFlatHeight, isProceduralWorld, mareMaskFromLuminance, siteAxes, localToDir, dirToLocal,
  dirToLatLon, latLonToDir, angleBetween, type HeightField, type SampleContext,
} from '@/lib/solar-system/planet-globe-height';
import {
  TerrariumStore, decodeTerrarium, terrariumUrl, tileKey, tileOf, zoomForSpacing, bakeFrame, TILE_PX,
} from '@/lib/solar-system/planet-globe-terrarium';
import { GibsImagery, gibsLevelFor, type ImageryTile } from '@/lib/solar-system/planet-globe-imagery';
import { GLOBE_AIR, makeAtmosphereShell, type AtmosphereShell } from '@/lib/solar-system/planet-globe-atmosphere';
import {
  makeGroundMaterial, makeCloudMaterial, GROUND_LOOK, CLOUD_DETAIL, SUN_FLUX, sunOf, sunIntensityFor,
} from '@/lib/solar-system/planet-globe-material';
import { makeGlobeRings, type GlobeRings } from '@/lib/solar-system/planet-globe-rings';

export interface GlobeOptions {
  quality: QualityProfile;
  lite: boolean;
  /** Unit vector toward the sun in the surface scene's local frame. */
  sunDir: THREE.Vector3;
  /** Local ground colour near the site (linear RGB), blended into the globe's
   *  own colour close in so the edge of the walkable ground does not show. */
  siteColor?: [number, number, number];
}

export interface PlanetGlobe {
  readonly world: GlobeWorld;
  readonly body: PlanetBody;
  readonly basis: SiteBasis;
  /** Kilometres, planet at the origin. */
  readonly scene: THREE.Scene;
  /** Follows the surface camera through `sync`. */
  readonly camera: THREE.PerspectiveCamera;
  /** Put the globe camera where the surface camera is: same view, in km,
   *  with near and far fitted to the altitude. Call once per frame, after the
   *  surface camera has moved and before the frame is drawn. */
  sync: (local: THREE.PerspectiveCamera) => void;
  /** Where the surface scene's own ground ends, m from the site: inside it
   *  the globe's ground is never seen, and the globe may skip it. */
  setPatch: (radiusM: number) => void;
  /** The sun moved (local frame, unit). */
  setSun: (localDir: THREE.Vector3) => void;
  /** Detail and streaming; cloud drift. */
  update: (dt: number) => void;
  /** Height of the globe's ground above the reference sphere at a local
   *  point's latitude and longitude, m (what the globe draws there). */
  groundHeightAt: (localX: number, localZ: number) => number;
  /** Development: draw calls, tiles, streamed tiles. */
  stats: () => Record<string, number>;
  dispose: () => void;
  /** Optional: the drawing buffer's height in pixels, which the level of
   *  detail aims its screen-space error at (900 until told). */
  setViewport?: (heightPx: number) => void;
  /** Optional: an extra multiplier on the atmosphere shell's own sky (the
   *  limb), 0…1, for when the surface scene's sky dome is drawn under it. It
   *  already fades out by itself below 10–30 km (planet-globe-atmosphere.ts). */
  setAtmosphereWeight?: (w: number) => void;
}

const map = (full: string, lite = full) => ({ full: `/solar-system/planets/${full}`, lite: `/solar-system/planets/${lite}` });
/** The ground's albedo map. Venus has none: its maps show the cloud tops,
 *  which go on its cloud shell (CLOUD_SHELLS), and its ground is drawn from code. */
export const MAPS: Record<GlobeWorld, { full: string; lite: string } | null> = {
  moon: map('moon-4k.jpg', 'moon.jpg'),
  mars: map('mars-4k.jpg', 'mars.jpg'),
  earth: map('earth-4k.jpg', 'earth.jpg'),
  mercury: map('mercury-4k.jpg', 'mercury.jpg'),
  venus: null,
  jupiter: map('jupiter-4k.jpg', 'jupiter.jpg'),
  saturn: map('saturn-4k.jpg', 'saturn.jpg'),
  uranus: map('uranus.jpg'),
  neptune: map('neptune.jpg'),
};
const EARTH_NIGHT = '/solar-system/planets/earth-night.jpg';
/** A small map the Moon's maria are read from (dark = mare). */
const MOON_MARE_MAP = '/solar-system/planets/moon-512.jpg';

/** The cloud shells: height over the datum, km; the map; the camera
 *  heights over which the shell fades in, km; how fast it drifts (turns
 *  of the map per second of play). Earth's broken clouds go below 4 km,
 *  where the surface scene's own sky has them. Venus's deck is unbroken and
 *  stays drawn down to its base, seen from under it as its dim underside. */
export const CLOUD_SHELLS: Partial<Record<GlobeWorld, { km: number; maps: { full: string; lite: string }; fade: [number, number]; drift: number }>> = {
  earth: { km: 8, maps: map('earth-clouds.jpg', 'earth-clouds-1k.jpg'), fade: [4, 12], drift: 4e-6 },
  venus: { km: 64, maps: map('venus-4k.jpg', 'venus.jpg'), fade: [44, 52], drift: 1.2e-5 },
};

/** Cells as fine as this at the deepest level, m. The giants' 1-bar level is
 *  a sphere: a 2 km grid already curves within a hundredth of a metre of it,
 *  and everything finer is the shader's. */
const FINEST_CELL: Record<GlobeWorld, number> = {
  moon: 10, mars: 12, earth: 20, mercury: 10, venus: 12, jupiter: 2000, saturn: 2000, uranus: 2000, neptune: 2000,
};
/** Terrarium zoom caps: everywhere, and within `SITE_ZOOM_KM` of the site. */
const ZOOM_CAP = 11;
const SITE_ZOOM_CAP = 13;
const SITE_ZOOM_KM = 60;
/** Chunks this coarse are never let go of once built (see the cache in `update`). */
const KEEP_LEVEL = 3;
/** How long a chunk waits for its terrarium tiles before building with a coarser one, ms. */
const TILE_WAIT_MS = 1200;

interface Chunk {
  node: QuadNode;
  mesh: THREE.Mesh;
  /** The chunk's centre relative to the site's datum point, km (float64). */
  site: THREE.Vector3;
  lastUsed: number;
  /** Tiles it was built without; it rebuilds once they have all come or failed. */
  waiting: Set<number> | null;
  stale: boolean;
  epoch: number;
  imagery: ImageryTile | null;
}

interface Job {
  node: QuadNode;
  builder: ChunkBuilder;
  ctx: SampleContext | null;
  wantedAt: number;
  epoch: number;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function makePlanetGlobe(world: GlobeWorld, opts: GlobeOptions): PlanetGlobe {
  const body = PLANET_BODIES[world];
  const basis = siteBasis(body);
  const R = body.radiusKm;
  const scene = new THREE.Scene();
  scene.name = `globe-${world}`;
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 1e5);
  const lite = opts.lite || opts.quality.level === 'performance';
  const budget = lodBudget(opts.quality.level, lite);
  const axes = siteAxes(body.site.lat, body.site.lon);
  const siteDir = latLonToDir(body.site.lat, body.site.lon);
  const siteOrigin = basis.origin.clone();
  let disposed = false;
  let frame = 0;

  // ── Heights ─────────────────────────────────────────────────────────────
  let store: TerrariumStore<HTMLImageElement> | null = null;
  let field: HeightField;
  let epoch = 0;
  if (world === 'earth') {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const ctx2d = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (canvas) { canvas.width = TILE_PX; canvas.height = TILE_PX; }
    const loader = new THREE.ImageLoader();
    loader.setCrossOrigin('anonymous');
    store = new TerrariumStore<HTMLImageElement>({
      load: (z, x, y) => new Promise((resolve, reject) => {
        loader.load(terrariumUrl(z, x, y), resolve, undefined, reject);
      }),
      decode: (img) => {
        if (!ctx2d) throw new Error('no canvas');
        ctx2d.clearRect(0, 0, TILE_PX, TILE_PX);
        ctx2d.drawImage(img, 0, 0);
        return decodeTerrarium(ctx2d.getImageData(0, 0, TILE_PX, TILE_PX).data);
      },
      maxTiles: lite ? 72 : 144,
      maxConcurrent: 6,
    });
    // Near the site, sample through the frame the Tbilisi bake used, so the
    // globe's heights sit under the same local x and z as the scene's own
    // terrain; far off, plain spherical latitude and longitude.
    const bake = bakeFrame(body.site.lat, body.site.lon);
    const Rm = R * 1000;
    const latLonOf = (x: number, y: number, z: number): [number, number] => {
      const geo = dirToLatLon(x, y, z);
      const dKm = angleBetween(x, y, z, siteDir[0], siteDir[1], siteDir[2]) * R;
      if (dKm >= 600) return geo;
      const [lx, lz] = dirToLocal(axes, Rm, x, y, z);
      const local = bake.toGeo(lx, lz);
      if (dKm <= 300) return local;
      const t = (dKm - 300) / 300; const w = t * t * (3 - 2 * t);
      return [local[0] + (geo[0] - local[0]) * w, local[1] + (geo[1] - local[1]) * w];
    };
    const s = store;
    field = makeEarthHeight((x, y, z, zoom, ctx) => {
      const [lat, lon] = latLonOf(x, y, z);
      return s.sample(lat, lon, zoom, ctx?.missing, 0);
    });
    // The coarse world and the column of tiles over the site first: what
    // every chunk falls back on.
    s.request(tileKey(0, 0, 0), 1e9);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) s.request(tileKey(1, x, y), 1e8);
    for (let z = 2; z <= 8; z++) {
      const [tx, ty] = tileOf(body.site.lat, body.site.lon, z);
      s.request(tileKey(z, tx, ty), 1e7 - z);
    }
  } else if (isProceduralWorld(world)) {
    field = makeProceduralHeight(world, body);
  } else {
    field = makeFlatHeight(world);
  }

  // ── Materials and maps ──────────────────────────────────────────────────
  const air = GLOBE_AIR[world];
  const rings: GlobeRings | null = world === 'saturn' ? makeGlobeRings(R, GROUND_LOOK.saturn.sun, lite) : null;
  const ground = makeGroundMaterial(world, air, R, lite, rings ? { rings } : {});
  ground.uniforms.uSiteUp.value.set(siteDir[0], siteDir[1], siteDir[2]);
  if (opts.siteColor) {
    ground.uniforms.uSiteColor.value.set(...opts.siteColor);
    ground.uniforms.uSiteMix.value = 1;
  }
  const textures: THREE.Texture[] = [];
  const texLoader = makePlanetTextureLoader();
  const loadMap = (url: string, apply: (t: THREE.Texture) => void) => {
    texLoader.load(url, (tex) => {
      if (disposed) { disposePlanetTexture(tex); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = opts.quality.anisotropy;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      textures.push(tex);
      apply(tex);
    }, () => { /* the fallback colour stays */ });
  };
  // A 4K map is 45 MB of GPU memory with its mips: never on a phone or a
  // tablet, whatever preset was picked — mobile browsers kill the tab long
  // before the GPU runs out, and the 2K map is under a pixel per cell at
  // every height the descent flies on a screen that size.
  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const smallMaps = lite || coarse;
  const maps = MAPS[world];
  if (maps) {
    loadMap(smallMaps ? maps.lite : maps.full, (t) => {
      ground.uniforms.uMap.value = t;
      ground.uniforms.uMapOn.value = 1;
    });
  }
  if (world === 'earth') loadMap(EARTH_NIGHT, (t) => { ground.uniforms.uNight.value = t; ground.uniforms.uNightOn.value = 1; });

  let clouds: THREE.Mesh | null = null;
  let cloudMat: THREE.ShaderMaterial | null = null;
  let cloudShift = 0;
  const shellDef = CLOUD_SHELLS[world] ?? null;
  if (shellDef) {
    // Venus's deck is lit by the full sun over the clouds, not the dim light
    // its ground gets under them; its drawn structure starts at 24 km, about
    // twice the cloud map's texel.
    const sunOver = world === 'venus' ? sunOf(0xfff4e0, sunIntensityFor(SUN_FLUX.venus)) : GROUND_LOOK[world].sun;
    const detail = CLOUD_DETAIL[world];
    cloudMat = makeCloudMaterial(sunOver, air ? air.twilight : [1, 0.5, 0.3], world === 'venus' && detail
      ? { overcast: { shellKm: R + shellDef.km, lam: 24, amp: 0.22, lite } } : {});
    const cg = new THREE.SphereGeometry(R + shellDef.km, lite ? 128 : 256, lite ? 64 : 128);
    clouds = new THREE.Mesh(cg, cloudMat);
    clouds.name = 'globe-clouds';
    clouds.frustumCulled = false;
    clouds.renderOrder = 2;
    clouds.visible = false;
    scene.add(clouds);
    loadMap(smallMaps ? shellDef.maps.lite : shellDef.maps.full, (t) => {
      if (world === 'earth') {
        ground.uniforms.uClouds.value = t;
        ground.uniforms.uCloudsOn.value = 1;
      }
      cloudMat!.uniforms.uClouds.value = t;
      clouds!.visible = true;
    });
  }
  if (rings) scene.add(rings.mesh);

  if (world === 'moon' && typeof document !== 'undefined') {
    // The maria: sunk and smoothed where the map is dark. A small map, read
    // once; the chunks already built are rebuilt with it.
    const img = new THREE.ImageLoader();
    img.load(MOON_MARE_MAP, (image) => {
      if (disposed) return;
      const w = image.naturalWidth || image.width; const h = image.naturalHeight || image.height;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      g.drawImage(image, 0, 0);
      const data = g.getImageData(0, 0, w, h).data;
      const lum = new Float32Array(w * h);
      for (let i = 0; i < lum.length; i++) lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
      field = makeProceduralHeight('moon', body, { mare: mareMaskFromLuminance(lum, w, h) });
      invalidateAll();
    }, undefined, () => { /* no maria, then */ });
  }

  let shell: AtmosphereShell | null = null;
  if (air && body.atmosphereKm > 0) {
    // The lowest ground the shell's rays may run to: a typical deep basin,
    // not the bound (the air there is the ground shader's business).
    shell = makeAtmosphereShell(body, air, lite, Math.max(field.min, field.floor, -8000));
    scene.add(shell.mesh);
  }

  const imagery = world === 'earth' ? new GibsImagery({ maxTextures: lite ? 16 : 40, maxConcurrent: 4, anisotropy: opts.quality.anisotropy }) : null;
  imagery?.start(body.site.lat, body.site.lon);

  // ── Sun ─────────────────────────────────────────────────────────────────
  const sunGlobe = new THREE.Vector3(1, 0, 0);
  const setSun = (localDir: THREE.Vector3) => {
    localDirToGlobe(basis, localDir, sunGlobe).normalize();
    (ground.uniforms.uSun.value as THREE.Vector3).copy(sunGlobe);
    if (cloudMat) (cloudMat.uniforms.uSun.value as THREE.Vector3).copy(sunGlobe);
    shell?.setSun(sunGlobe);
    rings?.setSun(sunGlobe);
  };
  setSun(opts.sunDir);

  // ── The quadtree and its chunks ─────────────────────────────────────────
  const tree = new QuadTree({ radiusKm: R, segments: budget.segments, hMin: field.min, hMax: field.max });
  const maxLevel = maxLevelFor(R, budget.segments, FINEST_CELL[world]);
  const group = new THREE.Group();
  group.name = 'globe-chunks';
  scene.add(group);
  const chunks = new Map<string, Chunk>();
  let drawn: Chunk[] = [];
  let prevSplit = new Set<string>();
  let job: Job | null = null;
  const waitingSince = new Map<string, number>();
  let patchKm = 0;
  let viewPx = 900;
  let camAltKm = 1e6;
  let groundUnderKm = 0;
  let lastBuildMs = 0;
  let builtTotal = 0;
  let wantedCount = 0;

  const zoomFor = (n: QuadNode): number => {
    const [lat] = dirToLatLon(n.centre[0], n.centre[1], n.centre[2]);
    const near = angleBetween(n.centre[0], n.centre[1], n.centre[2], siteDir[0], siteDir[1], siteDir[2]) * R - n.angRadius * R;
    return zoomForSpacing(n.spacingKm * 1000, lat, near < SITE_ZOOM_KM ? SITE_ZOOM_CAP : ZOOM_CAP);
  };

  const startJob = (n: QuadNode): Job => {
    const ctx: SampleContext | null = world === 'earth' ? { zoom: zoomFor(n), missing: new Set() } : null;
    // Band-limit to the grid, and sample the ring round the chunk too.
    const h = field.region(n.centre[0], n.centre[1], n.centre[2], n.angRadius * 1.15, n.spacingKm * 1000, ctx ?? undefined);
    return { node: n, builder: new ChunkBuilder(n, budget.segments, R, h, field.floor), ctx, wantedAt: frame, epoch };
  };

  const toGeometry = (a: ChunkArrays): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
    g.setAttribute('aHeight', new THREE.BufferAttribute(a.height, 1));
    g.setIndex(new THREE.BufferAttribute(a.index, 1));
    return g;
  };

  const finishJob = (j: Job) => {
    const a = j.builder.arrays();
    tree.setBounds(j.node, a.hMin, a.hMax);
    const geom = toGeometry(a);
    let c = chunks.get(j.node.key);
    if (c) {
      const old = c.mesh.geometry;
      c.mesh.geometry = geom;
      old.dispose();
    } else {
      const mesh = new THREE.Mesh(geom, ground);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.position.set(a.origin[0], a.origin[1], a.origin[2]);
      mesh.updateMatrix();
      mesh.visible = false;
      const site = new THREE.Vector3(a.origin[0] - siteOrigin.x, a.origin[1] - siteOrigin.y, a.origin[2] - siteOrigin.z);
      const chunk: Chunk = { node: j.node, mesh, site, lastUsed: frame, waiting: null, stale: false, epoch: j.epoch, imagery: null };
      // Per chunk: where it is from the site (exact in float64 here, small
      // enough for float32 on the GPU), and Earth's imagery tile.
      mesh.onBeforeRender = () => {
        const u = ground.uniforms;
        (u.uChunkSite.value as THREE.Vector3).copy(chunk.site);
        if (world === 'earth') {
          const t = chunk.imagery;
          u.uImgOn.value = t ? 1 : 0;
          u.uImg.value = t ? t.texture : null;
          if (t) (u.uImgRect.value as THREE.Vector4).set(t.bounds[0], t.bounds[1], t.bounds[2], t.bounds[3]);
        }
        ground.uniformsNeedUpdate = true;
      };
      group.add(mesh);
      c = chunk;
      chunks.set(j.node.key, c);
    }
    c.epoch = j.epoch;
    c.stale = j.epoch !== epoch;
    c.waiting = null;
    if (j.ctx && j.ctx.missing.size && store) {
      c.waiting = new Set(j.ctx.missing);
      for (const k of j.ctx.missing) store.request(k, 1 + j.node.level);
    }
    builtTotal++;
  };

  const disposeChunk = (c: Chunk) => {
    group.remove(c.mesh);
    c.mesh.geometry.dispose();
    chunks.delete(c.node.key);
  };

  function invalidateAll() {
    epoch++;
    const shown = new Set(drawn);
    for (const c of [...chunks.values()]) {
      // Drawn chunks and the ones split above them stay (stale) until
      // rebuilt: dropping the split ones would cut every branch to its root.
      if (shown.has(c) || c.node.level === 0 || prevSplit.has(c.node.key)) c.stale = true;
      else disposeChunk(c);
    }
    job = null;
  }

  store?.onArrive((key) => {
    for (const c of chunks.values()) {
      if (!c.waiting || !c.waiting.has(key)) continue;
      c.waiting.delete(key);
      if (!c.waiting.size) { c.waiting = null; c.stale = true; }
    }
  });

  // The six roots, now: there is always a whole planet to draw.
  for (const r of tree.roots) {
    const j = startJob(r);
    j.builder.step(() => true);
    finishJob(j);
  }

  // ── Per-frame ───────────────────────────────────────────────────────────
  const frustum = new THREE.Frustum();
  const projView = new THREE.Matrix4();
  const camArr = [0, 0, 0];

  /** Would a chunk's tiles be here? If not, ask, and say whether to wait. */
  const tilesReady = (n: QuadNode, priority: number): boolean => {
    if (!store) return true;
    const z = zoomFor(n);
    const keys = new Set<number>();
    const d = [0, 0, 0];
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      const dir = faceToDir(n.face, n.u0 + (n.u1 - n.u0) * a, n.v0 + (n.v1 - n.v0) * b, d);
      const [lat, lon] = dirToLatLon(dir[0], dir[1], dir[2]);
      const [tx, ty] = tileOf(lat, lon, z);
      keys.add(tileKey(z, tx, ty));
    }
    let ok = true;
    for (const k of keys) if (!store.has(k)) { ok = false; store.request(k, priority); }
    if (ok) { waitingSince.delete(n.key); return true; }
    const since = waitingSince.get(n.key);
    if (since === undefined) { waitingSince.set(n.key, nowMs()); return false; }
    return nowMs() - since > TILE_WAIT_MS;
  };

  const update = (dt: number) => {
    if (disposed) return;
    frame++;
    const t0 = nowMs();
    const deadline = t0 + budget.buildMs;
    const more = () => nowMs() < deadline;

    // Choose what to draw.
    projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projView);
    camArr[0] = camera.position.x; camArr[1] = camera.position.y; camArr[2] = camera.position.z;
    const sel = selectChunks(tree, {
      cam: camArr, frustum, pxPerRad: viewPx / (2 * Math.tan((camera.fov * Math.PI) / 360)),
    }, {
      radiusKm: R,
      occluderKm: R + Math.max(field.min, field.floor) / 1000,
      targetPx: budget.targetPx,
      maxLevel,
      maxChunks: budget.maxChunks,
      site: siteDir,
      patchAngle: patchKm / R,
      ready: (n) => chunks.has(n.key),
      wasSplit: (n) => prevSplit.has(n.key),
      frame,
    });
    prevSplit = sel.split;
    // The chunks split on the way down to what is drawn are in use too: the
    // next frame descends through them, and without one the whole branch
    // falls back to its root until it is rebuilt.
    for (const k of sel.split) {
      const c = chunks.get(k);
      if (c) c.lastUsed = frame;
    }
    for (const c of drawn) c.mesh.visible = false;
    drawn = [];
    for (const n of sel.draw) {
      const c = chunks.get(n.key);
      if (!c) continue;
      c.mesh.visible = true;
      c.lastUsed = frame;
      drawn.push(c);
      if (imagery && imagery.enabled && n.spacingKm < 6) assignImagery(c);
    }

    // Build: carry on with the chunk in hand while it is still wanted, then
    // the most wanted, then rebuilds of drawn chunks that went stale.
    const wantKeys = new Set(sel.want.map((w) => w.node.key));
    wantedCount = wantKeys.size;
    if (job && !wantKeys.has(job.node.key) && !(chunks.get(job.node.key)?.stale) && frame - job.wantedAt > 30) job = null;
    if (job && wantKeys.has(job.node.key)) job.wantedAt = frame;
    let guard = 0;
    while (more() && guard++ < 16) {
      if (!job) {
        const next = sel.want.find((w) => !chunks.has(w.node.key) && tilesReady(w.node, w.priority));
        if (next) job = startJob(next.node);
        else {
          const stale = drawn.find((c) => c.stale && !c.waiting) ?? [...chunks.values()].find((c) => c.stale && !c.waiting && c.node.level === 0);
          if (stale) job = startJob(stale.node);
        }
      }
      if (!job) break;
      if (job.builder.step(more)) {
        finishJob(job);
        job = null;
      }
    }
    lastBuildMs = nowMs() - t0;

    // Streaming.
    store?.pump(() => nowMs() < deadline + 1);
    imagery?.pump();

    // Keep a few built chunks round after they go out of view; let the rest
    // go. Never the coarse levels (at most 6 + 24 + 96 + 384 chunks, and only
    // the few the flight has seen are ever built): a node is split only when
    // all its children in view are built, so one missing coarse child sends
    // the whole view back to its root — the planet turns to a blur each time
    // the camera swings back to ground it saw a while ago.
    const spare = chunks.size - drawn.length;
    if (spare > budget.cache) {
      const shown = new Set(drawn);
      const idle = [...chunks.values()].filter((c) => !shown.has(c) && c.node.level > KEEP_LEVEL && !prevSplit.has(c.node.key)).sort((a, b) => a.lastUsed - b.lastUsed);
      for (let i = 0; i < idle.length && chunks.size - drawn.length > budget.cache; i++) disposeChunk(idle[i]);
    }
    if (frame % 240 === 0) {
      tree.prune(frame, 600, (n) => chunks.has(n.key));
      for (const k of waitingSince.keys()) if (!wantKeys.has(k)) waitingSince.delete(k);
    }
    if (frame % 8 === 1) {
      const p = camera.position; const l = p.length() || 1;
      groundUnderKm = Math.max(field.floor, field.sample(p.x / l, p.y / l, p.z / l, 500)) / 1000;
    }

    // The air and the clouds.
    shell?.setAltitude(camAltKm);
    if (air) {
      ground.uniforms.uCamAlt.value = camAltKm;
      ground.uniforms.uCamAgl.value = Math.max(0, camAltKm - groundUnderKm);
    }
    if (cloudMat && clouds && shellDef) {
      cloudShift = (cloudShift + dt * shellDef.drift) % 1;
      cloudMat.uniforms.uCloudShift.value = cloudShift;
      if (world === 'earth') ground.uniforms.uCloudShift.value = cloudShift;
      const a = camAltKm;
      const [lo, hi] = shellDef.fade;
      cloudMat.uniforms.uOpacity.value = Math.max(0, Math.min(1, (a - lo) / (hi - lo)));
      // Under the deck, its underside: dimmer the further below its middle.
      if (cloudMat.uniforms.uUnder) cloudMat.uniforms.uUnder.value = 1 - THREE.MathUtils.smoothstep(a, shellDef.km - 4, shellDef.km + 1);
      clouds.visible = !!cloudMat.uniforms.uClouds.value && cloudMat.uniforms.uOpacity.value > 0.01;
    }
    rings?.setAltitude(camAltKm);
  };

  const assignImagery = (c: Chunk) => {
    if (!imagery) return;
    const n = c.node;
    const d = [0, 0, 0];
    let south = 90; let north = -90; let west = 180; let east = -180;
    for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]]) {
      const dir = faceToDir(n.face, n.u0 + (n.u1 - n.u0) * a, n.v0 + (n.v1 - n.v0) * b, d);
      const [lat, lon] = dirToLatLon(dir[0], dir[1], dir[2]);
      south = Math.min(south, lat); north = Math.max(north, lat); west = Math.min(west, lon); east = Math.max(east, lon);
    }
    // Across the antimeridian or a pole: the map will do.
    if (east - west > 60 || north > 84 || south < -84) { c.imagery = null; return; }
    const spacingDeg = (n.spacingKm / R) * (180 / Math.PI);
    c.imagery = imagery.tileFor(south, west, north, east, gibsLevelFor(spacingDeg), n.level);
  };

  // ── Camera ──────────────────────────────────────────────────────────────
  const localPos = new THREE.Vector3();
  const sync = (local: THREE.PerspectiveCamera) => {
    local.getWorldPosition(localPos);
    camera.position.copy(localPos).applyMatrix4(basis.localToGlobe);
    local.getWorldQuaternion(camera.quaternion);
    camera.quaternion.premultiply(basis.rotation);
    camera.fov = local.fov;
    camera.aspect = local.aspect;
    const d = camera.position.length();
    camAltKm = d - R;
    // Near: a fraction of the height over the ground below, and no nearer
    // than the patch the surface scene covers, when the camera is over it.
    const overGround = Math.max(0.001, camAltKm - groundUnderKm);
    let near = Math.max(0.002, overGround * 0.35);
    if (patchKm > 0) {
      const p = camera.position;
      const across = angleBetween(p.x / d, p.y / d, p.z / d, siteDir[0], siteDir[1], siteDir[2]) * R;
      if (across < patchKm) near = Math.max(near, Math.min((patchKm - across) * 0.5, Math.hypot(overGround, patchKm - across) * 0.5));
    }
    // A cloud deck in view is drawn from where it actually is: a near plane
    // pushed out over the patch would cut a ~120 km hole in it around the
    // camera, snapping open and shut at the top of the descent.
    if (clouds?.visible && shellDef) near = Math.min(near, Math.max(0.002, Math.abs(camAltKm - shellDef.km) * 0.35));
    // Far: the horizon over the lowest ground, and on past it to the top of
    // the air (or the highest ground): the last thing a grazing ray meets.
    const r0 = R + Math.max(field.min, field.floor) / 1000;
    // The shell's mesh is drawn a little larger than the air's top
    // (planet-globe-atmosphere.ts): on a giant that margin is hundreds of
    // kilometres, and a grazing ray's back face out there must not be clipped.
    const top = Math.max(R + Math.max(body.atmosphereKm, field.max / 1000 + 1, shellDef ? shellDef.km + 1 : 0), shell ? shell.radiusKm + 1 : 0);
    const far = (Math.sqrt(Math.max(0, d * d - r0 * r0)) + Math.sqrt(Math.max(0, top * top - r0 * r0))) * 1.02 + 1;
    camera.near = Math.min(near, far * 0.5);
    camera.far = far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  // ── Queries ─────────────────────────────────────────────────────────────
  const groundHeightAt = (localX: number, localZ: number): number => {
    const d = localToDir(axes, R * 1000, localX, localZ);
    if (store) {
      // Earth: the finest tiles there are, and the zoom the globe would draw
      // there, through the same bake-frame mapping.
      const near = Math.hypot(localX, localZ) / 1000 < SITE_ZOOM_KM;
      return Math.max(field.floor, field.sample(d[0], d[1], d[2], 20, { zoom: near ? SITE_ZOOM_CAP : ZOOM_CAP, missing: new Set() }));
    }
    return field.sample(d[0], d[1], d[2], FINEST_CELL[world]);
  };

  const stats = (): Record<string, number> => {
    const s = store?.stats();
    const im = imagery?.stats();
    let deepest = 0;
    for (const c of drawn) deepest = Math.max(deepest, c.node.level);
    return {
      calls: drawn.length + (clouds?.visible ? 1 : 0) + (shell?.mesh.visible ? 1 : 0) + (rings ? 1 : 0),
      tiles: drawn.length,
      built: chunks.size,
      builtTotal,
      pending: (job ? 1 : 0) + wantedCount + [...chunks.values()].filter((c) => c.stale || c.waiting).length + (s ? s.inflight + s.queued + s.decoding : 0),
      streamed: s ? s.streamed : 0,
      inflight: s ? s.inflight : 0,
      heightTiles: s ? s.tiles : 0,
      failed: s ? s.failed : 0,
      level: deepest,
      maxLevel,
      nodes: tree.size(),
      buildMs: Math.round(lastBuildMs * 100) / 100,
      altitudeKm: Math.round(camAltKm * 1000) / 1000,
      imagery: im ? im.imagery : 0,
      imageryOn: im ? im.imageryOn : 0,
    };
  };

  return {
    world, body, basis, scene, camera, sync,
    setPatch(radiusM: number) {
      patchKm = Math.max(0, radiusM) / 1000;
      ground.uniforms.uPatchKm.value = patchKm;
      // Out to 30 km, or a little past a patch wider than that (Earth's).
      ground.uniforms.uSiteBlendKm.value = Math.max(30, patchKm * 1.08 + 0.5);
    },
    setSun,
    update,
    groundHeightAt,
    stats,
    setViewport(heightPx: number) {
      if (heightPx > 0) viewPx = heightPx;
    },
    setAtmosphereWeight(w: number) {
      shell?.setWeight(w);
    },
    dispose() {
      disposed = true;
      job = null;
      for (const c of [...chunks.values()]) disposeChunk(c);
      ground.dispose();
      for (const t of textures) disposePlanetTexture(t);
      textures.length = 0;
      if (clouds) { clouds.geometry.dispose(); cloudMat?.dispose(); scene.remove(clouds); }
      if (shell) { scene.remove(shell.mesh); shell.dispose(); }
      if (rings) { scene.remove(rings.mesh); rings.dispose(); }
      store?.dispose();
      imagery?.dispose();
      scene.remove(group);
    },
  };
}
