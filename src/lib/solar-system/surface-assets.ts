// What a surface has to have on disk before it can be built. The arrival
// flies for eleven seconds, and these come down during them, so the loading
// screen after it is a moment rather than a wait. Each file names the
// checklist line it sits behind, and how the scene itself acquires it —
// the key has to match, or the prefetch and the scene miss each other.

import type { PrefetchItem } from '@/game/models';
import type { ShipKind } from '@/lib/solar-system/ship-mesh';

/** The player's own ship comes down on every world, so its file rides the
 *  arrival too. The Endurance is a station-sized ring; its crew take the
 *  lander down instead, which the Moon's list already carries. The urls
 *  are the ones moon-lander.ts acquires, with the node tree kept. */
const SHIP_MODELS: Record<ShipKind, string> = {
  kestrel: '/explore/models/ship-stellar.glb',
  xfoil: '/explore/models/ship-fighter.glb',
  cruiser: '/explore/models/ship-cruiser.glb',
  endurance: '/explore/models/lander.glb',
};
export const shipAssetFor = (kind: ShipKind): PrefetchItem | null => {
  const url = SHIP_MODELS[kind];
  return url ? { url, keepNodes: true, group: 'vehicle' } : null;
};

const MOON: PrefetchItem[] = [
  { url: '/explore/models/base-kit.glb', keepNodes: true, group: 'habitat' },
  { url: '/explore/models/crate.glb', keepNodes: false, group: 'habitat' },
  { url: '/explore/models/lander.glb', keepNodes: true, group: 'vehicle' },
  { url: '/explore/models/rover.glb', keepNodes: true, group: 'vehicle' },
  { url: '/explore/models/cosmonaut.glb', keepNodes: true, group: 'crew' },
];

/** The checklist, in the order the arrival reads it out. */
export const SURFACE_GROUPS = ['habitat', 'vehicle', 'crew'] as const;

/** Mars, Proxima b and Tbilisi are built out of code: they have no files to wait for. */
export const SURFACE_ASSETS: Record<string, PrefetchItem[]> = { moon: MOON };

/** What `site` needs, plus the ship the crew are flying down in when the caller names it. */
export const assetsFor = (site: string, kind?: ShipKind): PrefetchItem[] => {
  const base = SURFACE_ASSETS[site] ?? [];
  const ship = kind ? shipAssetFor(kind) : null;
  if (!ship || base.some((a) => a.url === ship.url)) return base;
  return [...base, ship];
};
