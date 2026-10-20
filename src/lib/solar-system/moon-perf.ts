// Frame accounting for Moon Mode, and the governor that keeps the frame
// inside its budget. Stats are always collected (a few numbers a frame);
// the overlay that shows them exists only in development, on the backquote
// key. The governor moves the pixel ratio in quarter steps, with hysteresis
// and a cooldown, so it can settle but never visibly oscillate; once the
// ratio is at its floor and the frame is still badly over budget, it asks
// its owner to take a whole preset level off instead (`onOverBudget`).

import type * as THREE from 'three';

export interface PerfSample {
  fps: number;
  /** Mean, 95th percentile and worst frame interval over the window, ms. */
  frameMs: number;
  p95Ms: number;
  maxMs: number;
  /** CPU time of the simulation and of the render call, ms (mean). */
  simMs: number;
  renderMs: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  pixelRatio: number;
  buildMs: number;
  /** Frames over 30 ms and over 50 ms since the scene opened. */
  long30: number;
  long50: number;
}

export interface MoonPerf {
  begin: (now: number) => void;
  /** The simulation is done; the render starts. */
  mark: () => void;
  end: () => void;
  sample: () => PerfSample;
  setBuildMs: (ms: number) => void;
  /** The loop is starting again after a pause or a hidden tab: the gap is not a frame. */
  resume: () => void;
  /** A new preset: the governor's floor and ceiling. */
  setRatioBounds: (min: number, max: number) => void;
  dispose: () => void;
}

interface Options {
  /** Pixel-ratio bounds for the governor; equal bounds switch it off. */
  minRatio: number;
  maxRatio: number;
  onPixelRatio: (ratio: number) => void;
  /** The pixel ratio has nothing left to give and the frame is still over
   *  budget: drop a preset level. A cooldown follows, so one bad stretch
   *  costs one level and the new preset gets a chance before the next. */
  onOverBudget?: () => void;
}

const WINDOW = 120;
/** The governor's window, in frames, and its two thresholds, ms. */
const GOV_WINDOW = 90;
/** Over this mean, the ratio comes down; under the second, it may go back up. */
const GOV_HIGH = 21;
const GOV_LOW = 14.5;
/** Far enough over budget (30 fps) to be worth a whole preset level. */
const GOV_PRESET = 33;
/** That many windows in a row before the preset moves. */
const GOV_PRESET_WINDOWS = 3;

export function makeMoonPerf(renderer: THREE.WebGLRenderer, mount: HTMLElement, opts: Options): MoonPerf {
  renderer.info.autoReset = false;
  const intervals = new Float32Array(WINDOW);
  const sims = new Float32Array(WINDOW);
  const renders = new Float32Array(WINDOW);
  const sorted = new Float32Array(WINDOW);
  let head = 0;
  let filled = 0;
  let lastNow = 0;
  let frameStart = 0;
  let simEnd = 0;
  let buildMs = 0;
  let long30 = 0;
  let long50 = 0;
  let ratio = renderer.getPixelRatio();
  let minRatio = opts.minRatio;
  let cap = Math.min(ratio, opts.maxRatio);

  // ── The governor: a 90-frame mean, down a step when the frame is
  // sustained over budget, back up only after a long stretch well inside it,
  // and never up again once it has had to come down twice. ──
  let govFrames = 0;
  let govSum = 0;
  let calmWindows = 0;
  let cooldown = 0;
  let drops = 0;
  let overWindows = 0;
  const govern = (interval: number) => {
    // A stall (tab switch, GC, shader compile) is not a trend.
    if (interval > 250) return;
    govSum += interval;
    govFrames += 1;
    cooldown = Math.max(0, cooldown - interval);
    if (govFrames < GOV_WINDOW) return;
    const mean = govSum / govFrames;
    govSum = 0;
    govFrames = 0;
    // The pixel ratio has nowhere left to go and the frame is still well
    // outside its budget: the preset itself is too much for this machine.
    if (opts.onOverBudget && cooldown <= 0 && mean > GOV_PRESET && ratio <= minRatio) {
      overWindows += 1;
      if (overWindows >= GOV_PRESET_WINDOWS) {
        overWindows = 0;
        cooldown = 6000;
        opts.onOverBudget?.();
      }
    } else if (mean < GOV_PRESET) {
      overWindows = 0;
    }
    if (minRatio >= cap || cooldown > 0) return;
    if (mean > GOV_HIGH && ratio > minRatio) {
      ratio = Math.max(minRatio, ratio - 0.25);
      drops += 1;
      calmWindows = 0;
      cooldown = 3000;
      opts.onPixelRatio(ratio);
    } else if (mean < GOV_LOW && ratio < cap && drops < 2) {
      calmWindows += 1;
      if (calmWindows >= 10) {
        ratio = Math.min(cap, ratio + 0.25);
        calmWindows = 0;
        cooldown = 6000;
        opts.onPixelRatio(ratio);
      }
    } else {
      calmWindows = 0;
    }
  };

  const dev = process.env.NODE_ENV !== 'production';
  let overlay: HTMLPreElement | null = null;
  let overlayT = 0;
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Backquote') return;
    if (overlay) { overlay.remove(); overlay = null; return; }
    overlay = document.createElement('pre');
    overlay.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:40;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.72);pointer-events:none;white-space:pre';
    mount.appendChild(overlay);
  };
  if (dev) window.addEventListener('keydown', onKey);

  const handle: MoonPerf = {
    begin(now) {
      if (lastNow > 0) {
        const interval = now - lastNow;
        intervals[head] = interval;
        if (interval > 30) long30 += 1;
        if (interval > 50) long50 += 1;
        govern(interval);
      }
      lastNow = now;
      frameStart = performance.now();
      renderer.info.reset();
    },
    mark() { simEnd = performance.now(); },
    end() {
      const done = performance.now();
      sims[head] = simEnd - frameStart;
      renders[head] = done - simEnd;
      head = (head + 1) % WINDOW;
      filled = Math.min(WINDOW, filled + 1);
      if (overlay && done - overlayT > 250) {
        overlayT = done;
        const s = handle.sample();
        overlay.textContent = `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms  p95 ${s.p95Ms.toFixed(1)}  max ${s.maxMs.toFixed(0)}\n`
          + `sim ${s.simMs.toFixed(2)}  render ${s.renderMs.toFixed(2)}  px ${s.pixelRatio}\n`
          + `calls ${s.calls}  tris ${(s.triangles / 1000).toFixed(0)}k  geo ${s.geometries}  tex ${s.textures}  prog ${s.programs}\n`
          + `>30ms ${s.long30}  >50ms ${s.long50}  build ${s.buildMs.toFixed(0)} ms`;
      }
    },
    sample() {
      const n = filled;
      let sum = 0; let max = 0; let sim = 0; let ren = 0;
      for (let i = 0; i < n; i++) {
        sum += intervals[i]; sim += sims[i]; ren += renders[i];
        if (intervals[i] > max) max = intervals[i];
        sorted[i] = intervals[i];
      }
      const view = sorted.subarray(0, n).sort();
      const mean = n ? sum / n : 0;
      const info = renderer.info;
      return {
        fps: mean > 0 ? 1000 / mean : 0,
        frameMs: mean,
        p95Ms: n ? view[Math.min(n - 1, Math.floor(n * 0.95))] : 0,
        maxMs: max,
        simMs: n ? sim / n : 0,
        renderMs: n ? ren / n : 0,
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        pixelRatio: ratio,
        buildMs,
        long30,
        long50,
      };
    },
    setBuildMs(ms) { buildMs = ms; },
    resume() { lastNow = 0; govSum = 0; govFrames = 0; overWindows = 0; },
    setRatioBounds(min, max) {
      minRatio = min;
      cap = max;
      ratio = max;
      drops = 0;
      calmWindows = 0;
      overWindows = 0;
      cooldown = 3000;
    },
    dispose() {
      if (dev) window.removeEventListener('keydown', onKey);
      overlay?.remove();
    },
  };
  return handle;
}

/** Development only: what each top-level object in the scene, the shadow
 *  pass and the post chain cost in draw calls, by hiding each in turn. */
export function probeCalls(renderer: THREE.WebGLRenderer, scene: THREE.Scene, render: () => void, within?: string): Record<string, number> {
  const was = renderer.info.autoReset;
  renderer.info.autoReset = false;
  const count = () => { renderer.info.reset(); render(); return renderer.info.render.calls; };
  const out: Record<string, number> = {};
  const total = count();
  out.total = total;
  const root = within ? scene.getObjectByName(within) ?? scene : scene;
  root.children.forEach((o, i) => {
    if (!o.visible) return;
    o.visible = false;
    const d = total - count();
    o.visible = true;
    if (d > 0) out[`${o.name || o.type}#${i}`] = d;
  });
  renderer.shadowMap.enabled = false;
  out.shadowPass = total - count();
  renderer.shadowMap.enabled = true;
  renderer.info.autoReset = was;
  return out;
}
