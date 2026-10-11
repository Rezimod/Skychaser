// The surface scenes without the game round them: one scene in a bare page,
// built straight from the library, with the same dev hooks the game exposes
// (window.__stellarMoon / __stellarWorld / __stellarGlobe / __stellarQuality).
// For scripts/qa-surfaces.mjs --harness: the Next dev server the game needs
// is several gigabytes of memory, this is a few hundred megabytes.
//
//   ?world=moon|mars|proximaB|earth  &ship=kestrel|xfoil|cruiser|lander  &preset=performance|balanced|high|ultra  &fixedpx
//
// window.__qaHarness: `remount(startOnSurface)` builds the scene again (the
// way the game lands a second time), `ascended` counts the climbs back to
// orbit (each one disposes the scene, as the game's return to orbit does),
// `contextRebuilds` the rebuilds after a lost GPU context.
import { makeMoonSurface, type MoonSurfaceHandle } from '@/lib/solar-system/moon-surface';
import { makeWorldSurface, type WorldSurfaceHandle } from '@/lib/solar-system/world-surface';
import { loadTbilisi } from '@/lib/solar-system/world-earth-data';
import { currentQuality, governedQuality, setDetectedQuality, stepQualityDown, type QualityLevel } from '@/game/quality';
import type { WorldId } from '@/lib/solar-system/world-profiles';
import type { ShipKind } from '@/lib/solar-system/ship-mesh';

declare global {
  interface Window {
    __qaHarness?: { remount: (startOnSurface?: boolean) => Promise<void>; ascended: number; contextRebuilds: number; disposed: boolean };
    __stellarQuality?: { level: () => string; governed: () => string | null; step: () => boolean; pretend: (l: QualityLevel) => void };
  }
}

const q = new URLSearchParams(location.search);
const world = (q.get('world') ?? 'moon') as WorldId | 'moon';
const ship = (q.get('ship') ?? 'kestrel') as ShipKind | 'lander';
const mount = document.getElementById('mount')!;
// A preset as if the device had picked it (SwiftShader alone would get `performance`).
const preset = q.get('preset') as QualityLevel | null;
if (preset) setDetectedQuality(preset);
let handle: MoonSurfaceHandle | WorldSurfaceHandle | null = null;
let watch = 0;
const earthData = world === 'earth' ? loadTbilisi(new AbortController().signal) : null;

window.__stellarQuality = {
  level: () => currentQuality().level,
  governed: governedQuality,
  step: stepQualityDown,
  pretend: setDetectedQuality,
};

async function build(startOnSurface: boolean) {
  const shipKind = ship === 'lander' ? undefined : ship;
  const onContextLost = () => {
    window.setTimeout(() => {
      harness.contextRebuilds++;
      void harness.remount(true);
    }, 1200);
  };
  if (world === 'moon') handle = makeMoonSurface(mount, { startOnSurface, onContextLost, shipKind });
  else handle = makeWorldSurface(mount, world as WorldId, { startOnSurface, onContextLost, shipKind, earth: earthData ? await earthData : undefined });
  harness.disposed = false;
  // The game's return to orbit: once the ship is back up, the scene goes.
  window.clearInterval(watch);
  watch = window.setInterval(() => {
    if (handle && handle.telemetry.ascended) {
      handle.telemetry.ascended = false;
      harness.ascended++;
      handle.dispose();
      handle = null;
      harness.disposed = true;
      window.clearInterval(watch);
    }
  }, 100);
}

const harness = {
  ascended: 0,
  contextRebuilds: 0,
  disposed: false,
  async remount(startOnSurface = false) {
    if (handle) { handle.dispose(); handle = null; }
    await build(startOnSurface);
  },
};
window.__qaHarness = harness;
void build(q.has('surface'));
