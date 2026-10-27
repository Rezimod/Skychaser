import { describe, expect, it } from 'vitest';
import { flightSamples } from '@/lib/solar-system/post-processing';
import { qualityProfile } from '@/game/quality';

describe('flight post chain', () => {
  it('takes the preset\'s own MSAA count, bloom or not, clamped to the context', () => {
    expect(flightSamples(qualityProfile('performance'), 8)).toBe(0);
    expect(flightSamples(qualityProfile('balanced'), 8)).toBe(0);
    expect(flightSamples(qualityProfile('high'), 8)).toBe(4);
    expect(flightSamples(qualityProfile('ultra'), 4)).toBe(4);
  });
});
