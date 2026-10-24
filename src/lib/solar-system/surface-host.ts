// What every surface scene (the Moon, Mars, Proxima b, Earth) shares: the
// renderer and its context, the camera, the one hard sun and its shadow box,
// the light pool, the post chain, the frame accounting and its governor, the
// quality preset (applied live when the player changes it), the frame loop
// with its visibility, pause and context-loss handling, the pre-compile, and
// the teardown that gives the GPU everything back. The scenes build what is
// in the world; this owns how it is drawn.

import * as THREE from 'three';
import { makeMoonPost, type MoonPostHandle } from '@/lib/solar-system/moon-post';
import { makeMoonPerf, probeCalls, type MoonPerf } from '@/lib/solar-system/moon-perf';
import { makeLightPool, type LightPool } from '@/lib/solar-system/moon-lights';
import { compileFor, releaseCompilePolls, settleWithin, uploadSceneTextures } from '@/lib/solar-system/gpu-warm';
import { makeLoopGuard } from '@/game/gpu-recovery';
import { serviceStill } from '@/game/frame-tap';
import { projectSunDirection, type SunScreen } from '@/lib/solar-system/post-flare';
import { getSettings } from '@/game/settings';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';
import { currentQuality, onQualityChange, pixelRatioFor, stepQualityDown, type QualityProfile } from '@/game/quality';

/** Seconds since the last frame, at most a tenth. 0 when no time has passed:
 *  a coarse clock (a privacy-hardened browser rounds performance.now to a
 *  millisecond or more) can stamp two frames alike, and a step of 0 s is a
 *  0/0 in the walk, the car and the rover, which sticks as NaN for good. */
export function frameSeconds(now: number, last: number): number {
  return now > last ? Math.min(0.1, (now - last) / 1000) : 0;
}

export interface SurfaceHostOptions {
  clearColor: THREE.ColorRepresentation;
  exposure: number;
  sun: { color: THREE.ColorRepresentation; intensity: number };
  near: number;
  far: number;
  /** The GPU took the context away; the owner should rebuild the scene. */
  onContextLost?: () => void;
}

export interface SurfaceHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;
  readonly lightPool: LightPool;
  readonly post: MoonPostHandle;
  readonly perf: MoonPerf;
  readonly mount: HTMLElement;
  /** The preset the scene was built on; `lite` is what the builders read. */
  readonly quality: QualityProfile;
  readonly lite: boolean;
  /** Programs are compiled and frames are being drawn. */
  readonly ready: boolean;
  readonly paused: boolean;
  /** Keep the shadow box on the crew, one texel at a time, so its edges never crawl. */
  followShadow: (crew: THREE.Vector3, sunDir: THREE.Vector3) => void;
  /** Another scene the frame draws (the planet globe under the surface):
   *  compiled and uploaded with the surface scene's own, under the loader.
   *  Register it before `start` compiles. */
  compileExtra: (scene: THREE.Scene, camera: THREE.Camera) => void;
  /** Compile every program (once `after` settles: models still loading), then run `frame` once per drawn frame. */
  start: (frame: (dt: number) => void, onReady: () => void, after?: Promise<unknown>) => void;
  /** Draw through the post chain, inside the frame accounting. */
  render: (dt: number) => void;
  setPaused: (on: boolean) => void;
  /** Development: draw calls per scene layer. */
  probe: (within?: string) => Record<string, number>;
  /** Stop, unhook, remove the canvas; `release` runs once the compile has settled, before the renderer goes. */
  dispose: (release: () => void) => void;
}

/** The PCF kernel's radius in texels: a wider, softer penumbra where the
 *  map has the texels to spare (the taps are the same five either way). */
export function shadowSoftness(q: Pick<QualityProfile, 'level'>): number {
  return q.level === 'ultra' ? 2.6 : q.level === 'high' ? 2 : 1.25;
}

/** The shadow's biases for a map of `texel` metres a texel and a PCF
 *  kernel of `radius` texels: the normal offset in metres (the receiver
 *  moved off its surface), and the depth bias in the shadow camera's depth
 *  (its range is 419 m, so 1e-4 is about 4 cm). */
export function shadowBiasFor(texel: number, radius: number): { normal: number; depth: number } {
  return { normal: texel * (1.1 + 0.55 * radius), depth: -0.00012 };
}

export function makeSurfaceHost(mount: HTMLElement, opts: SurfaceHostOptions): SurfaceHost {
  const buildStart = performance.now();
  const quality = currentQuality();
  const lite = quality.lite;
  // MSAA lives on the composer's target (moon-post); the default framebuffer
  // only ever receives the final quad, so it needs none of its own.
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  let profile = quality;
  const ratioFor = (q: QualityProfile) => pixelRatioFor(q, mount.clientWidth, mount.clientHeight);
  let maxRatio = ratioFor(quality);
  renderer.setPixelRatio(maxRatio);
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure;
  renderer.shadowMap.enabled = quality.shadowMapSize > 0;
  // Always PCF. three r184 dropped PCFSoftShadowMap: it has no define of its
  // own, so a program compiled while it is set gets the BASIC path and a
  // plain sampler2D, then the first shadow pass swaps the type to PCF and
  // allocates a depth texture with a compare mode — the two meet as
  // "Mismatch between texture format and sampler type" on every lit draw.
  // The softness is the PCF kernel's radius instead (`shadowSoftness`).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(opts.clearColor, 1);
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(getSettings().fov, mount.clientWidth / mount.clientHeight, opts.near, opts.far);

  const sun = new THREE.DirectionalLight(opts.sun.color, opts.sun.intensity);
  sun.castShadow = true;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  let shadowTexel = 1;
  const fitShadow = (q: QualityProfile) => {
    const size = Math.max(1, q.shadowMapSize);
    sun.shadow.mapSize.set(size, size);
    const sr = q.shadowRadius;
    sun.shadow.camera.left = -sr; sun.shadow.camera.right = sr; sun.shadow.camera.top = sr; sun.shadow.camera.bottom = -sr;
    sun.shadow.camera.updateProjectionMatrix();
    shadowTexel = (sr * 2) / size;
    sun.shadow.radius = shadowSoftness(q);
    // Bias in texels, not metres: the old fixed 0.22 m of normal offset and
    // 0.17 m of depth bias lifted every receiver a third of a metre toward
    // the sun, so boots, rocks and anything under knee height cast nothing,
    // and every shadow stood short of what cast it. A texel and a bit, plus
    // the PCF kernel's own reach, keeps the ground clean under a low sun.
    const b = shadowBiasFor(shadowTexel, sun.shadow.radius);
    sun.shadow.normalBias = b.normal;
    sun.shadow.bias = b.depth;
  };
  fitShadow(quality);
  scene.add(sun);
  scene.add(sun.target);
  const lightPool = makeLightPool(2);
  for (const l of lightPool.lights) scene.add(l);
  const shadowU = new THREE.Vector3();
  const shadowV = new THREE.Vector3();

  const post = makeMoonPost(renderer, scene, camera, quality);
  // The Sun the post chain flares from is this light: its direction is the
  // sprite's in every sky, and at infinity a direction is all the flare
  // needs. Its strength follows the light's own — Earth's key light is the
  // Moon at night, and that is not a Sun to flare from.
  const sunDir = new THREE.Vector3();
  const sunScreen: SunScreen = { x: 0.5, y: 0.5, visible: false, edge: 0 };
  const feedSun = () => {
    sunDir.copy(sun.position).sub(sun.target.position);
    if (sunDir.lengthSq() < 1e-8) { post.setSun(0.5, 0.5, false, 0); return; }
    sunDir.normalize();
    projectSunDirection(sunDir, camera, sunScreen);
    const strength = THREE.MathUtils.clamp(sun.intensity / Math.max(1e-3, opts.sun.intensity), 0, 1);
    post.setSun(sunScreen.x, sunScreen.y, sunScreen.visible, sunScreen.edge * strength);
  };
  const pinned = process.env.NODE_ENV !== 'production' && new URLSearchParams(window.location.search).has('fixedpx');
  const perf = makeMoonPerf(renderer, mount, {
    minRatio: pinned ? maxRatio : Math.min(1, maxRatio),
    maxRatio,
    onPixelRatio: (r) => { renderer.setPixelRatio(r); post.setSize(mount.clientWidth, mount.clientHeight); },
    // A pinned bench must be reproducible, so it keeps the preset it was given.
    // Everything the renderer owns follows the step at once (below); what was
    // decided at build time — props, stars, LOD distances — follows on the
    // next scene, which is where a step down matters least.
    onOverBudget: pinned ? undefined : () => { stepQualityDown(); },
  });

  // ── A new preset, live: the pixel ratio, the shadow map, the post chain. ──
  const unsubQuality = onQualityChange((q) => {
    profile = q;
    maxRatio = ratioFor(q);
    perf.setRatioBounds(pinned ? maxRatio : Math.min(1, maxRatio), maxRatio);
    renderer.setPixelRatio(maxRatio);
    fitShadow(q);
    // The old map is the old size: drop it and three allocates the new one.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    renderer.shadowMap.enabled = q.shadowMapSize > 0;
    post.setQuality(q);
    post.setSize(mount.clientWidth, mount.clientHeight);
  });

  let raf = 0;
  let last = performance.now();
  let docVisible = !document.hidden;
  let contextLost = false;
  let paused = false;
  let ready = false;
  let disposed = false;
  let frameFn: ((dt: number) => void) | null = null;
  const resume = () => {
    last = performance.now();
    perf.resume();
    if (docVisible && !paused && !raf && ready && !contextLost && frameFn) raf = requestAnimationFrame(loop);
  };
  const onVis = () => {
    docVisible = !document.hidden;
    if (docVisible) resume();
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    if (contextLost) return;
    contextLost = true;
    // Pending compiles would poll the dead context for ever, holding the
    // whole scene; this lets them settle and it be freed.
    releaseCompilePolls(renderer);
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    opts.onContextLost?.();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  // A frame that throws is skipped, not fatal; one that throws every frame
  // is a scene that cannot recover, and is rebuilt like a lost context.
  let rendered = false;
  const guard = makeLoopGuard('surface', () => { if (!disposed) opts.onContextLost?.(); });
  const loop = () => {
    raf = 0;
    if (!docVisible || paused || !frameFn) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = frameSeconds(now, last);
    // Nothing has moved on since the last frame: wait for the next one.
    if (dt <= 0) return;
    last = now;
    perf.begin(now);
    rendered = false;
    try {
      frameFn(dt);
      guard.ok();
    } catch (e) {
      guard.fail(e);
      // Keep the timing pairs matched for the quality governor.
      if (!rendered) perf.end();
    }
  };
  // One resize per frame at most, and none that changes nothing: each one
  // re-allocates the post chain's targets.
  let resizeRaf = 0;
  let sizedW = 0;
  let sizedH = 0;
  const onResize = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; applySize(); });
  };
  const applySize = () => {
    const w = mount.clientWidth; const h = mount.clientHeight;
    if (!w || !h) return;
    const capNow = ratioFor(profile);
    if (w === sizedW && h === sizedH && Math.abs(capNow - maxRatio) <= 0.01) return;
    sizedW = w; sizedH = h;
    // A bigger window is more pixels: the budget may want a different ratio.
    const cap = ratioFor(profile);
    if (Math.abs(cap - maxRatio) > 0.01) {
      maxRatio = cap;
      perf.setRatioBounds(pinned ? maxRatio : Math.min(1, maxRatio), maxRatio);
      renderer.setPixelRatio(maxRatio);
    }
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  };
  window.addEventListener('resize', onResize);
  const sizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
  sizeObserver?.observe(mount);
  document.addEventListener('visibilitychange', onVis);

  let compiling: Promise<unknown> = Promise.resolve();
  const extras: { scene: THREE.Scene; camera: THREE.Camera }[] = [];
  const host: SurfaceHost = {
    renderer, scene, camera, sun, lightPool, post, perf, mount, quality, lite,
    get ready() { return ready; },
    get paused() { return paused; },
    followShadow(crew, sunDir) {
      shadowU.crossVectors(THREE.Object3D.DEFAULT_UP, sunDir).normalize();
      shadowV.crossVectors(sunDir, shadowU);
      const su = Math.round(crew.dot(shadowU) / shadowTexel) * shadowTexel;
      const sv = Math.round(crew.dot(shadowV) / shadowTexel) * shadowTexel;
      sun.target.position.copy(shadowU).multiplyScalar(su).addScaledVector(shadowV, sv).addScaledVector(sunDir, crew.dot(sunDir));
      sun.position.copy(sun.target.position).addScaledVector(sunDir, 220);
    },
    compileExtra(extraScene, extraCamera) { extras.push({ scene: extraScene, camera: extraCamera }); },
    start(frame, onReady, after) {
      frameFn = frame;
      // Compile every program before the first frame — in parallel where the
      // driver allows it — so the descent does not open on a long stall.
      // Hidden props are shown for the compile so they cannot stall later.
      const compile = () => {
        if (disposed || contextLost) return undefined;
        const hiddenForCompile: THREE.Object3D[] = [];
        scene.traverse((o) => { if (!o.visible) { hiddenForCompile.push(o); o.visible = true; } });
        const begin = () => {
          if (!disposed && !raf && !contextLost) {
            // Still under the loader: every upload, and one frame through
            // the shadow pass and the whole post chain, whose programs the
            // compile above never sees. With the hidden props still shown,
            // their maps go up too.
            try {
              uploadSceneTextures(renderer, scene);
              for (const e of extras) uploadSceneTextures(renderer, e.scene);
              post.render(0);
            } catch { /* a lost context mid-warm: the loss handler rebuilds */ }
          }
          for (const o of hiddenForCompile) o.visible = false;
          perf.setBuildMs(performance.now() - buildStart);
          if (disposed || raf || contextLost) return;
          ready = true;
          onReady();
          resume();
        };
        // Bounded: a compile that never settles (a lost context, a driver
        // that never reports) must not keep the loading screen up for good.
        return settleWithin(compileFor(renderer, post.drawTarget(), () => Promise.all([
          renderer.compileAsync(scene, camera),
          ...extras.map((e) => renderer.compileAsync(e.scene, e.camera)),
        ])), 30000).then(begin);
      };
      // Nor may what the build waits on (the crew's model, say) hold it.
      compiling = after ? settleWithin(after, 30000).then(compile) : compile() ?? Promise.resolve();
    },
    render(dt) {
      perf.mark();
      feedSun();
      post.render(dt);
      rendered = true;
      // A handover asked for this frame as a picture (game/frame-tap).
      serviceStill(renderer.domElement);
      perf.end();
    },
    setPaused(on) {
      if (paused === on) return;
      paused = on;
      if (on && raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!on) resume();
    },
    probe: (within) => probeCalls(renderer, post.scene(), () => post.render(0), within),
    dispose(release) {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      perf.dispose();
      unsubQuality();
      window.removeEventListener('resize', onResize);
      sizeObserver?.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      document.removeEventListener('visibilitychange', onVis);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      // The GPU side goes once the async compile has settled: three keeps
      // polling the programs it is compiling, and they must still exist.
      const finish = () => {
        release();
        sun.shadow.dispose();
        for (const l of lightPool.lights) l.dispose();
        post.dispose();
        scene.environment?.dispose();
        // The soft sprite is one texture for the whole page: each renderer
        // that uploads it hangs a dispose listener on it, and that listener
        // keeps this whole renderer reachable after the surface is gone. Its
        // dispose frees only this context's copy; the next scene re-uploads.
        softSpriteTexture().dispose();
        renderer.dispose();
        // Give the context back now rather than when the canvas is collected:
        // the next surface and the orrery each want one of their own. A
        // context the GPU already took has nothing to give back, and three
        // warns that the extension is gone if asked.
        if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
      };
      // A lost context has nothing left to compile: free it now. Otherwise
      // wait for the compile, but not for ever.
      if (contextLost || renderer.getContext().isContextLost()) {
        releaseCompilePolls(renderer);
        finish();
      } else {
        void settleWithin(compiling, 6000).then(() => { releaseCompilePolls(renderer); finish(); });
      }
    },
  };
  return host;
}
