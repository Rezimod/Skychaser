import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { makeMoonPerf } from '@/lib/solar-system/moon-perf';

/** Just enough renderer for the frame accounting to read. */
function fakeRenderer(pixelRatio = 1) {
  const info = {
    autoReset: true,
    reset: () => undefined,
    render: { calls: 12, triangles: 3000 },
    memory: { geometries: 4, textures: 2 },
    programs: [] as unknown[],
  };
  return { info, getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer;
}

function governor(opts: { minRatio: number; maxRatio: number }) {
  const ratios: number[] = [];
  let overBudget = 0;
  const perf = makeMoonPerf(fakeRenderer(opts.maxRatio), document.createElement('div'), {
    ...opts,
    onPixelRatio: (r) => ratios.push(r),
    onOverBudget: () => { overBudget += 1; },
  });
  /** Feed `frames` frames each `ms` long. The very first frame of the scene
   *  has no interval before it, so one is spent priming the clock. */
  let now = 16;
  perf.begin(now);
  perf.end();
  const run = (frames: number, ms: number) => {
    for (let i = 0; i < frames; i++) { now += ms; perf.begin(now); perf.end(); }
  };
  return { perf, run, ratios, over: () => overBudget };
}

describe('the frame governor', () => {
  it('walks the pixel ratio down a quarter at a time while the frame is over budget', () => {
    const g = governor({ minRatio: 1, maxRatio: 2 });
    // 25 ms a frame: over the 21 ms threshold, under the preset's 33. A drop
    // every other window, because a three-second cooldown follows each one.
    g.run(90 * 10, 25);
    expect(g.ratios[0]).toBeCloseTo(1.75);
    expect(g.ratios).toEqual([...g.ratios].sort((a, b) => b - a));
    expect(g.ratios[g.ratios.length - 1]).toBeCloseTo(1);
    // It stops at the floor, and asks for nothing more at this frame time.
    expect(g.ratios.filter((r) => r < 1)).toEqual([]);
    expect(g.over()).toBe(0);
  });

  it('asks for a preset only once the ratio is at its floor, and not on a stall', () => {
    const g = governor({ minRatio: 1, maxRatio: 1 });
    // One window at 40 ms is not a trend; three in a row are.
    g.run(90, 40);
    expect(g.over()).toBe(0);
    g.run(90 * 2, 40);
    expect(g.over()).toBe(1);
    // A cooldown follows, so one bad stretch costs one level.
    g.run(90 * 3, 40);
    expect(g.over()).toBe(1);
    // Frames over 250 ms (a tab switch, a compile) are not counted at all.
    const h = governor({ minRatio: 1, maxRatio: 1 });
    h.run(90 * 4, 400);
    expect(h.over()).toBe(0);
  });

  it('lets go of the preset once the frame comes back inside its budget', () => {
    const g = governor({ minRatio: 1, maxRatio: 1 });
    g.run(90 * 2, 40);
    g.run(90, 16);
    g.run(90 * 2, 40);
    expect(g.over()).toBe(0);
  });

  it('leaves a pinned bench alone: no callback, no step', () => {
    const ratios: number[] = [];
    const perf = makeMoonPerf(fakeRenderer(1), document.createElement('div'), {
      minRatio: 1, maxRatio: 1, onPixelRatio: (r) => ratios.push(r),
    });
    let now = 0;
    for (let i = 0; i < 90 * 6; i++) { now += 40; perf.begin(now); perf.end(); }
    expect(ratios).toEqual([]);
    expect(perf.sample().frameMs).toBeCloseTo(40, 0);
  });
});
