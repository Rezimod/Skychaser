// One switch and one level for every sound Explore Mode and the Moon make,
// kept on the device. Every synthesiser reads the level when it is built and
// follows it while it lives, so a pilot who wants a silent deck gets one
// everywhere. The game shell can also hold the level at zero while paused.

const KEY = 'stellar_sound';
const LEVEL_KEY = 'stellar_sound_level';
const listeners = new Set<(on: boolean, level: number) => void>();
let cached: boolean | null = null;
let level: number | null = null;
let paused = false;

export function soundOn(): boolean {
  if (cached !== null) return cached;
  try {
    cached = typeof localStorage === 'undefined' ? true : localStorage.getItem(KEY) !== 'off';
  } catch {
    cached = true;
  }
  return cached;
}

/** The master volume the pilot set, 0..1, regardless of the switch or a pause. */
export function soundVolume(): number {
  if (level !== null) return level;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(LEVEL_KEY);
    const v = raw === null ? 1 : Number(raw);
    level = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    level = 1;
  }
  return level;
}

/** What the master gains should sit at right now: the volume, or nothing
 *  while the switch is off or the game is paused. */
export function soundLevel(): number {
  return soundOn() && !paused ? soundVolume() : 0;
}

function notify() {
  const on = soundOn();
  const l = soundLevel();
  for (const fn of listeners) fn(on, l);
}

export function setSoundOn(on: boolean) {
  cached = on;
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Private mode — the switch lives for the session only.
  }
  notify();
}

export function setSoundVolume(v: number) {
  level = Math.min(1, Math.max(0, v));
  try {
    if (level === 1) localStorage.removeItem(LEVEL_KEY);
    else localStorage.setItem(LEVEL_KEY, level.toFixed(2));
  } catch {
    // Private mode — the level lives for the session only.
  }
  notify();
}

/** Hold every mix at silence while the game is paused; the switch and the
 *  level are untouched, so resuming brings back exactly what was playing. */
export function setSoundPaused(on: boolean) {
  if (paused === on) return;
  paused = on;
  notify();
}

export function onSoundChange(listener: (on: boolean, level: number) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

let audioWarmed = false;

/** The browser's first AudioContext starts its audio service: 1.2 s on the
 *  main thread on a Mac, every one after it well under a millisecond. Made
 *  (and closed) once under a loading screen, so the first sound of the
 *  session — the launch swell, mid-flight — does not stop the frame. */
export function warmAudioService() {
  if (audioWarmed || typeof AudioContext === 'undefined') return;
  audioWarmed = true;
  try {
    void new AudioContext().close();
  } catch {
    // No audio device: every mix is silent anyway.
  }
}
