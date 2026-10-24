// The surface loop's step: never a step of 0 s (a coarse clock can stamp two
// frames alike, and 0 s is a 0/0 in the walk, the car and the rover), never
// backwards, never more than a tenth of a second.
import { describe, expect, it } from 'vitest';
import { frameSeconds } from '@/lib/solar-system/surface-host';

describe('the surface frame step', () => {
  it('is the time since the last frame, in seconds', () => {
    expect(frameSeconds(1016, 1000)).toBeCloseTo(0.016, 6);
  });

  it('is 0 for a frame stamped like the last, or earlier, so the loop skips it', () => {
    expect(frameSeconds(1000, 1000)).toBe(0);
    expect(frameSeconds(999, 1000)).toBe(0);
  });

  it('is at most a tenth of a second after a long gap', () => {
    expect(frameSeconds(60_000, 1000)).toBe(0.1);
  });
});
