// Quality presets. One place decides how much the surfaces draw: pixel ratio,
// the shadow map, the post chain, particle and print caps, prop density.
// The player sees four names; `auto` picks one from the device (never
// `ultra`, which is a desktop's own call), and the
// runtime governor (moon-perf) sits underneath as the safety net: once the
// pixel ratio has nothing left to give, it steps the whole preset down a
// level. It never steps one back up, and a preset the player names outright
// overrides it.

import { getSettings, onSettingsChange, type QualityPreset } from './settings';

export type QualityLevel = Exclude<QualityPreset, 'auto'>;

export interface QualityProfile {
  level: QualityLevel;
  /** The renderer's pixel ratio is capped here; the governor may go lower. */
  maxPixelRatio: number;
  /** Shadow map edge in texels, 0 for no shadows; half-width of the shadow box, m. */
  shadowMapSize: number;
  shadowRadius: number;
  /** Bloom on, and its render scale; MSAA samples on the composer target. */
  bloom: boolean;
  bloomScale: number;
  msaa: number;
  /** Live caps on the pooled effects. */
  dustMax: number;
  printsMax: number;
  historyMax: number;
  /** Build-time counts: the starfield, and rocks per cut as a fraction of full. */
  stars: number;
  band: number;
  propDensity: number;
  /** The far-LOD reference distance, m: each model scales its own switch off it. */
  lodDistance: number;
  /** The legacy flag the builders read: `performance` builds everything the old mobile path did. */
  lite: boolean;
  /** The screen-space passes (post-flare.ts): the Sun's lens flare, its light shafts, the colour grade. */
  flare: boolean;
  godRays: boolean;
  grade: boolean;
  /** Cloud raymarch quality for the skies that have one: 0 off, 1 coarse, 2 full. */
  clouds: 0 | 1 | 2;
  /** Texture anisotropy the builders ask for, clamped by the context. */
  anisotropy: number;
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  performance: {
    level: 'performance', maxPixelRatio: 1.25, shadowMapSize: 1024, shadowRadius: 42,
    bloom: false, bloomScale: 0.5, msaa: 0, dustMax: 900, printsMax: 400, historyMax: 500,
    stars: 2200, band: 4000, propDensity: 0.5, lodDistance: 25, lite: true,
    flare: false, godRays: false, grade: false, clouds: 0, anisotropy: 4,
  },
  balanced: {
    level: 'balanced', maxPixelRatio: 1.5, shadowMapSize: 2048, shadowRadius: 60,
    bloom: true, bloomScale: 0.5, msaa: 0, dustMax: 1600, printsMax: 900, historyMax: 1200,
    stars: 4200, band: 9000, propDensity: 1, lodDistance: 40, lite: false,
    flare: true, godRays: false, grade: true, clouds: 1, anisotropy: 8,
  },
  high: {
    level: 'high', maxPixelRatio: 2, shadowMapSize: 2048, shadowRadius: 60,
    bloom: true, bloomScale: 0.5, msaa: 4, dustMax: 1600, printsMax: 900, historyMax: 1200,
    stars: 4200, band: 9000, propDensity: 1, lodDistance: 60, lite: false,
    flare: true, godRays: true, grade: true, clouds: 1, anisotropy: 16,
  },
  // A desktop with a discrete GPU, and only ever by name: the pixel ratio is
  // still budgeted, the 8 samples fall back to what the context allows
  // (three clamps to `capabilities.maxSamples`), and the governor still
  // steps it down to `high` under `auto` — which it never picks to begin with.
  ultra: {
    level: 'ultra', maxPixelRatio: 2, shadowMapSize: 4096, shadowRadius: 70,
    bloom: true, bloomScale: 0.75, msaa: 8, dustMax: 2400, printsMax: 1400, historyMax: 1800,
    stars: 8000, band: 16000, propDensity: 1.6, lodDistance: 90, lite: false,
    flare: true, godRays: true, grade: true, clouds: 2, anisotropy: 16,
  },
};

export const QUALITY_LEVELS: QualityLevel[] = ['performance', 'balanced', 'high', 'ultra'];

export function qualityProfile(level: QualityLevel): QualityProfile {
  return PROFILES[level];
}

export interface DeviceSignals {
  /** The unmasked GPU renderer string, '' when unknown. */
  gpu: string;
  cores: number;
  touch: boolean;
  /** CSS viewport width, px. */
  width: number;
  /** navigator.deviceMemory in GB, 0 when unknown. */
  memoryGB: number;
}

const WEAK_GPU = /swiftshader|llvmpipe|software|mali|adreno|powervr|videocore|intel\(r\) hd graphics [2-5]\d{3}/i;
const INTEGRATED_GPU = /intel|iris|uhd|radeon\s*(vega|graphics)|apple gpu|apple a\d/i;
const STRONG_GPU = /apple m\d|nvidia|geforce|rtx|radeon (rx|pro)|arc/i;
/** A recent flagship phone: an Apple GPU, Adreno 640 and up, the Mali-G7x and
 *  Gx10 lines, Immortalis, Xclipse. These hold bloom and the grade; the
 *  surfaces' governor still takes a level off one that cannot. */
const FLAGSHIP_MOBILE_GPU = /apple gpu|adreno[^\d]*(6[4-9]\d|[78]\d\d)|mali-g(7[1-9]|[67]\d0)|immortalis|xclipse/i;

/** Which preset a device should start on. Pure, so it is tested. `ultra`
 *  is never detected: a strong GPU starts on `high`, and the desktop player
 *  who wants the 4K shadow map and the 8 samples names it in Settings. */
export function detectQuality(s: DeviceSignals): QualityLevel {
  if (s.touch && FLAGSHIP_MOBILE_GPU.test(s.gpu) && s.cores >= 6 && (s.memoryGB === 0 || s.memoryGB >= 6)) return 'balanced';
  if (s.touch || s.width <= 768 || s.cores <= 2 || (s.memoryGB > 0 && s.memoryGB <= 2)) return 'performance';
  if (WEAK_GPU.test(s.gpu)) return 'performance';
  if (STRONG_GPU.test(s.gpu) && s.cores >= 6) return 'high';
  if (INTEGRATED_GPU.test(s.gpu) || s.cores <= 4) return 'balanced';
  return 'balanced';
}

let gpuCached: string | null = null;

function gpuString(): string {
  if (gpuCached !== null) return gpuCached;
  gpuCached = readGpuString();
  return gpuCached;
}

function readGpuString(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return '';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const s = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  } catch {
    return '';
  }
}

let detected: QualityLevel | null = null;

export function deviceSignals(): DeviceSignals {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu: gpuString(),
    cores: navigator.hardwareConcurrency || 4,
    touch: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    width: window.innerWidth,
    memoryGB: nav.deviceMemory ?? 0,
  };
}

/** Render pixels an integrated GPU fills through the post chain inside a
 *  frame: about a 1440×900 window at 1.2. A Retina laptop on Intel graphics
 *  would otherwise draw 2.9 MP at the preset's 1.5 and spend the first ten
 *  seconds of every scene waiting for the governor to find that out. */
const INTEGRATED_PIXEL_BUDGET = 1.6e6;
const BUDGETED_GPU = /intel|iris|uhd|radeon\s*(vega|graphics)/i;

/** The pixel ratio to draw a `cssWidth`×`cssHeight` canvas at: the screen's,
 *  capped by the preset and, on integrated or weak graphics, by the pixel
 *  budget — never under 1, which is where the governor takes over. */
export function pixelRatioFor(q: QualityProfile, cssWidth: number, cssHeight: number): number {
  return budgetedPixelRatio(window.devicePixelRatio || 1, q.maxPixelRatio, gpuString(), cssWidth, cssHeight);
}

/** The arithmetic behind `pixelRatioFor`. Pure, so it is tested. */
export function budgetedPixelRatio(dpr: number, maxRatio: number, gpu: string, cssWidth: number, cssHeight: number): number {
  const ratio = Math.min(dpr, maxRatio);
  const area = cssWidth * cssHeight;
  if (area <= 0 || !(WEAK_GPU.test(gpu) || BUDGETED_GPU.test(gpu))) return ratio;
  return Math.min(ratio, Math.max(1, Math.sqrt(INTEGRATED_PIXEL_BUDGET / area)));
}

/** How far the governor has had to come down, under `auto` only. */
let governed: QualityLevel | null = null;
const listeners = new Set<() => void>();

function autoLevel(): QualityLevel {
  if (!detected) detected = typeof window === 'undefined' ? 'balanced' : detectQuality(deviceSignals());
  return governed ?? detected;
}

/** The preset in force: the player's choice, or the device's as the governor left it. */
export function currentQuality(): QualityProfile {
  const pick = getSettings().quality;
  if (pick !== 'auto') return PROFILES[pick];
  return PROFILES[autoLevel()];
}

/** The level the governor has settled on, or null while it has not had to act. */
export function governedQuality(): QualityLevel | null {
  return governed;
}

/** The frame is over budget with the pixel ratio already at its floor: take
 *  a level off. Only under `auto` — a named preset is the player's call — and
 *  only ever downwards, so a mission cannot be interrupted twice by the same
 *  stretch of slow frames. Returns whether anything moved. */
export function stepQualityDown(): boolean {
  if (getSettings().quality !== 'auto') return false;
  const i = QUALITY_LEVELS.indexOf(autoLevel());
  if (i <= 0) return false;
  governed = QUALITY_LEVELS[i - 1];
  for (const fn of listeners) fn();
  return true;
}

/** The player has named a preset (or asked for `auto` again): the governor's
 *  own finding is theirs to discard. */
export function clearQualityGovernor() {
  governed = null;
}

/** Fires with the new profile when the resolved preset changes. */
export function onQualityChange(fn: (q: QualityProfile) => void): () => void {
  let last = currentQuality().level;
  const check = () => {
    const next = currentQuality();
    if (next.level === last) return;
    last = next.level;
    fn(next);
  };
  listeners.add(check);
  const offSettings = onSettingsChange(check);
  return () => { listeners.delete(check); offSettings(); };
}

/** Development and tests: pretend the device detected this preset, so the
 *  governor and the presets can be exercised on hardware that would not
 *  otherwise reach them. */
export function setDetectedQuality(level: QualityLevel) {
  detected = level;
  governed = null;
  for (const fn of listeners) fn();
}

/** Tests only. */
export function resetQualityDetection() {
  detected = null;
  governed = null;
}
