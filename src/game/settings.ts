// The player's settings, in one versioned key. Plain TypeScript: the
// surfaces and the flight model read it directly, React subscribes to it.

import { setSoundVolume, soundVolume } from '@/lib/solar-system/sound-prefs';

export type QualityPreset = 'auto' | 'performance' | 'balanced' | 'high' | 'ultra';

export interface GameSettings {
  /** Which preset drives DPR, shadows and effects. Only `auto` exists until the performance pass. */
  quality: QualityPreset;
  /** Mouse and stick look gain, as a multiple of the tuned default. */
  sensitivity: number;
  invertY: boolean;
  /** Field of view on the surface, degrees. Flight adds the difference from this to each ship's own lens. */
  fov: number;
  /** Master volume, 0..1. Kept with the sound switch so the synths read one number. */
  volume: number;
}

const KEY = 'stellar_explore_settings';
const VERSION = 1;
export const SENSITIVITY_RANGE: [number, number] = [0.3, 3];
export const FOV_RANGE: [number, number] = [45, 90];
export const DEFAULT_FOV = 52;
export const DEFAULT_FOV_TOUCH = 62;

const listeners = new Set<(s: GameSettings) => void>();
let current: GameSettings | null = null;

const clamp = (v: unknown, [lo, hi]: [number, number], fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function defaultSettings(touch = false): GameSettings {
  return { quality: 'auto', sensitivity: 1, invertY: false, fov: touch ? DEFAULT_FOV_TOUCH : DEFAULT_FOV, volume: 1 };
}

function read(): GameSettings {
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const d = defaultSettings(touch);
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return { ...d, volume: soundVolume() };
    const v = JSON.parse(raw) as Partial<GameSettings> & { v?: number };
    if (v.v !== VERSION) return { ...d, volume: soundVolume() };
    return {
      quality: v.quality === 'performance' || v.quality === 'balanced' || v.quality === 'high' || v.quality === 'ultra' ? v.quality : 'auto',
      sensitivity: clamp(v.sensitivity, SENSITIVITY_RANGE, d.sensitivity),
      invertY: v.invertY === true,
      fov: clamp(v.fov, FOV_RANGE, d.fov),
      volume: soundVolume(),
    };
  } catch {
    return d;
  }
}

export function getSettings(): GameSettings {
  if (!current) current = read();
  return current;
}

export function updateSettings(patch: Partial<GameSettings>): GameSettings {
  const next = { ...getSettings(), ...patch };
  next.sensitivity = clamp(next.sensitivity, SENSITIVITY_RANGE, 1);
  next.fov = clamp(next.fov, FOV_RANGE, DEFAULT_FOV);
  next.volume = clamp(next.volume, [0, 1], 1);
  current = next;
  if (patch.volume !== undefined) setSoundVolume(next.volume);
  try {
    const { volume: _volume, ...stored } = next;
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...stored }));
  } catch {
    // Private mode — the settings live for the session only.
  }
  for (const fn of listeners) fn(next);
  return next;
}

export function resetSettings(): GameSettings {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
  current = null;
  setSoundVolume(1);
  const s = getSettings();
  for (const fn of listeners) fn(s);
  return s;
}

/** How far the player's lens sits from the tuned default, degrees; flight adds it to each ship's own. */
export function fovOffset(): number {
  const touch = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return getSettings().fov - (touch ? DEFAULT_FOV_TOUCH : DEFAULT_FOV);
}

export function onSettingsChange(listener: (s: GameSettings) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
