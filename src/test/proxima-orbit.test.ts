// Proxima b can be dived into: at its true pace it runs about five of its
// own radii a second, so the world must hold still for a ship that has come to it.
import { describe, expect, it } from 'vitest';
import { proximaOrbitPace } from '@/lib/solar-system/star-systems';

describe('Proxima b under an arriving ship', () => {
  it('holds still where the dive is flown', () => {
    for (const d of [1.05, 2, 3, 8, 15]) expect(proximaOrbitPace(d)).toBe(0);
  });

  it('keeps its full pace far out, and slows smoothly between', () => {
    expect(proximaOrbitPace(60)).toBe(1);
    expect(proximaOrbitPace(500)).toBe(1);
    let last = 0;
    for (let d = 15; d <= 60; d += 1) {
      const k = proximaOrbitPace(d);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
  });

});
