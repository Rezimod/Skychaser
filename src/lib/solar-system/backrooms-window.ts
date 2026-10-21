// Which chunks exist right now: everything within `load` chunks of the
// walker is built, anything past `unload` is let go. The gap between the two
// keeps a walker pacing a chunk border from building and freeing the same
// chunk every other second.

import { CHUNK_M } from '@/lib/solar-system/backrooms-maze';

export interface ChunkWindow<T> {
  update: (x: number, z: number) => void;
  size: () => number;
  keys: () => string[];
  values: () => T[];
  clear: () => void;
}

export function makeChunkWindow<T>(load: number, unload: number, build: (cx: number, cz: number) => T, free: (chunk: T) => void): ChunkWindow<T> {
  const live = new Map<string, { cx: number; cz: number; chunk: T }>();
  let lastCx = Number.NaN; let lastCz = Number.NaN;
  return {
    update(x, z) {
      const cx = Math.floor(x / CHUNK_M); const cz = Math.floor(z / CHUNK_M);
      if (cx === lastCx && cz === lastCz) return;
      lastCx = cx; lastCz = cz;
      for (const [k, c] of live) {
        if (Math.abs(c.cx - cx) > unload || Math.abs(c.cz - cz) > unload) { free(c.chunk); live.delete(k); }
      }
      for (let dz = -load; dz <= load; dz++) {
        for (let dx = -load; dx <= load; dx++) {
          const k = `${cx + dx},${cz + dz}`;
          if (!live.has(k)) live.set(k, { cx: cx + dx, cz: cz + dz, chunk: build(cx + dx, cz + dz) });
        }
      }
    },
    size: () => live.size,
    keys: () => [...live.keys()],
    values: () => [...live.values()].map((c) => c.chunk),
    clear() {
      for (const c of live.values()) free(c.chunk);
      live.clear();
      lastCx = Number.NaN; lastCz = Number.NaN;
    },
  };
}
