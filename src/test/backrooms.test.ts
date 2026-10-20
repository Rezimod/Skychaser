// The Backrooms: a floor plan that is the same every time for a seed, always
// has a way out, marks it fairly, and loads around the walker without leaks.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  makeMaze, collide, cellOf, CELL, CHUNK, CHUNK_M, DX, DZ, PERIOD, SIDE, type Dir, type Maze,
} from '@/lib/solar-system/backrooms-maze';
import { makeChunkWindow } from '@/lib/solar-system/backrooms-window';
import { loadBackrooms, recordEntry, recordEscape } from '@/lib/solar-system/backrooms-save';
import { chooseSighting } from '@/lib/solar-system/backrooms-entity';

/** Breadth-first search on the plain grid (no torus shortcut): steps to every cell within `radius`. */
function bfs(maze: Maze, from: { i: number; j: number }, radius: number): Map<string, number> {
  const key = (i: number, j: number) => `${i},${j}`;
  const dist = new Map([[key(from.i, from.j), 0]]);
  let frontier = [from];
  for (let steps = 1; frontier.length; steps++) {
    const next: { i: number; j: number }[] = [];
    for (const c of frontier) {
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        if (!maze.open(c.i, c.j, d)) continue;
        const n = { i: c.i + DX[d], j: c.j + DZ[d] };
        if (Math.abs(n.i - from.i) > radius || Math.abs(n.j - from.j) > radius) continue;
        const k = key(n.i, n.j);
        if (dist.has(k)) continue;
        dist.set(k, steps);
        next.push(n);
      }
    }
    frontier = next;
  }
  return dist;
}

describe('the floor plan', () => {
  it('is the same for the same seed and different for another', () => {
    const a = makeMaze(7); const b = makeMaze(7); const c = makeMaze(8);
    let same = true; let differs = false;
    for (let cz = -2; cz < 3; cz++) {
      for (let cx = -2; cx < 3; cx++) {
        same &&= JSON.stringify(a.chunk(cx, cz)) === JSON.stringify(b.chunk(cx, cz));
        differs ||= JSON.stringify(a.chunk(cx, cz)) !== JSON.stringify(c.chunk(cx, cz));
      }
    }
    expect(same).toBe(true);
    expect(differs).toBe(true);
    expect(a.exit).toEqual(b.exit);
    expect(a.spawn).toEqual(b.spawn);
  });

  it('agrees about every wall from both sides', () => {
    const m = makeMaze(3);
    for (let j = -20; j < 20; j++) {
      for (let i = -20; i < 20; i++) {
        expect(m.edge(i, j, 0)).toBe(m.edge(i + 1, j, 2));
        expect(m.edge(i, j, 1)).toBe(m.edge(i, j + 1, 3));
      }
    }
  });

  it('always has a way out from the spawn, by plain BFS, for many seeds', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const m = makeMaze(seed);
      const d = m.distance(m.spawn.i, m.spawn.j);
      expect(d).toBeGreaterThanOrEqual(60);
      expect(d).toBeLessThanOrEqual(140);
      // The torus answer matches one search on the open grid, to the nearest copy of the exit.
      const reach = bfs(m, m.spawn, 160);
      let best = Infinity;
      for (const oi of [-SIDE, 0, SIDE]) {
        for (const oj of [-SIDE, 0, SIDE]) {
          const steps = reach.get(`${m.exit.i + oi},${m.exit.j + oj}`);
          if (steps !== undefined) best = Math.min(best, steps);
        }
      }
      expect(best).toBe(d);
    }
  });

  it('reaches every cell of the period: nothing is walled off', () => {
    const m = makeMaze(11);
    for (let j = 0; j < SIDE; j++) for (let i = 0; i < SIDE; i++) expect(m.distance(i, j)).toBeGreaterThanOrEqual(0);
  });

  it('repeats every period and puts the exit door in a real wall', () => {
    const m = makeMaze(5);
    expect(JSON.stringify(m.chunk(1, 2))).toBe(JSON.stringify(m.chunk(1 + PERIOD, 2 - PERIOD)));
    expect(m.edge(m.exit.i, m.exit.j, m.exit.wall)).toBe(1);
  });

  it('marks the way: the path descends to the exit, arrows point along it', () => {
    const m = makeMaze(9);
    expect(m.path.length).toBe(m.distance(m.spawn.i, m.spawn.j) + 1);
    const last = m.path[m.path.length - 1];
    expect(m.distance(last.i, last.j)).toBe(0);
    expect(m.arrows.length).toBeGreaterThan(4);
    expect(m.patches.length).toBeGreaterThan(1);
    for (const a of m.arrows) {
      expect(m.edge(a.i, a.j, a.wall)).toBe(1);
      expect(m.open(a.i, a.j, a.point)).toBe(true);
      expect(m.distance(a.i + DX[a.point], a.j + DZ[a.point])).toBe(m.distance(a.i, a.j) - 1);
    }
  });
});

describe('walls', () => {
  it('keep a walker out of them', () => {
    const m = makeMaze(4);
    // Find a closed +x wall and walk into it.
    let cell = { i: 0, j: 0 };
    outer: for (let j = 0; j < CHUNK; j++) for (let i = 0; i < CHUNK; i++) if (m.edge(i, j, 0) === 1) { cell = { i, j }; break outer; }
    const p = { x: (cell.i + 1) * CELL - 0.1, z: (cell.j + 0.5) * CELL };
    const v = { x: 2, z: 0 };
    collide(m, p, v, 0.3);
    expect(p.x).toBeLessThanOrEqual((cell.i + 1) * CELL - 0.3 - 0.07 + 1e-6);
    expect(v.x).toBe(0);
    expect(cellOf(p.x, p.z)).toEqual(cell);
  });
});

describe('the chunk window', () => {
  it('loads the chunks around the walker and lets go of the rest', () => {
    const built: string[] = []; const freed: string[] = [];
    const win = makeChunkWindow(2, 3, (cx, cz) => { built.push(`${cx},${cz}`); return `${cx},${cz}`; }, (h) => { freed.push(h); });
    win.update(1, 1);
    expect(win.size()).toBe(25);
    win.update(1, 1);
    expect(built.length).toBe(25);
    // Walk four chunks east: the far west column goes once it is past the unload radius.
    win.update(1 + CHUNK_M * 4, 1);
    expect(freed).toContain('-2,0');
    expect(win.size()).toBeLessThanOrEqual(7 * 7);
    for (const k of win.keys()) {
      const [cx] = k.split(',').map(Number);
      expect(Math.abs(cx - 4)).toBeLessThanOrEqual(3);
    }
    win.clear();
    expect(win.size()).toBe(0);
    expect(freed.length).toBe(built.length);
  });
});

describe('the one who watches', () => {
  const m = makeMaze(2);
  it('is never seen straight ahead, close, or in the first minute', () => {
    const at = { x: (m.spawn.i + 0.5) * CELL, z: (m.spawn.j + 0.5) * CELL };
    for (let k = 0; k < 400; k++) {
      const yaw = (k / 400) * Math.PI * 2;
      const s = chooseSighting(m, at.x, at.z, yaw, 30, k);
      expect(s).toBeNull();
    }
    let any = 0;
    for (let j = 0; j < 40; j++) {
      for (let k = 0; k < 36; k++) {
        const cx = (m.spawn.i + j - 20 + 0.5) * CELL; const cz = (m.spawn.j + 0.5) * CELL;
        const yaw = (k / 36) * Math.PI * 2;
        const s = chooseSighting(m, cx, cz, yaw, 120, j * 36 + k);
        if (!s) continue;
        any += 1;
        const dist = Math.hypot(s.x - cx, s.z - cz);
        expect(dist).toBeGreaterThanOrEqual(18);
        const fwdX = Math.sin(yaw); const fwdZ = Math.cos(yaw);
        const ang = Math.acos(((s.x - cx) * fwdX + (s.z - cz) * fwdZ) / dist);
        expect(ang).toBeGreaterThanOrEqual(0.43);
        expect(ang).toBeLessThanOrEqual(0.88);
      }
    }
    expect(any).toBeGreaterThan(0);
  });
});

describe('what is remembered', () => {
  beforeEach(() => localStorage.clear());
  it('keeps discovered, escaped and the times', () => {
    expect(loadBackrooms()).toEqual({ discovered: false, escaped: false, entries: 0, lastSeconds: 0, bestSeconds: 0 });
    recordEntry();
    expect(loadBackrooms().discovered).toBe(true);
    recordEscape(412);
    recordEntry();
    recordEscape(300);
    const s = loadBackrooms();
    expect(s).toEqual({ discovered: true, escaped: true, entries: 2, lastSeconds: 300, bestSeconds: 300 });
    localStorage.setItem('stellar_moon_backrooms_v1', '{"escaped":"yes","entries":-4}');
    expect(loadBackrooms()).toEqual({ discovered: false, escaped: false, entries: 0, lastSeconds: 0, bestSeconds: 0 });
  });
});
