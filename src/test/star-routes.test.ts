import { describe, expect, it } from 'vitest';
import { lightYearsBetween, resolveDestination, stepDestination } from '@/lib/solar-system/star-routes';

describe('star routes', () => {
  it('falls back to the default hop when the pick is the current system', () => {
    expect(resolveDestination('sol', 'sol')).toBe('alphaCentauri');
    expect(resolveDestination('gargantua', 'gargantua')).toBe('sol');
    expect(resolveDestination('alphaCentauri', '')).toBe('sol');
    expect(resolveDestination('sol', 'gargantua')).toBe('gargantua');
  });

  it('measures the routes in light years', () => {
    expect(lightYearsBetween('sol', 'alphaCentauri')).toBeCloseTo(4.37);
    expect(lightYearsBetween('alphaCentauri', 'gargantua')).toBeGreaterThan(1e9);
    expect(lightYearsBetween('sol', 'sol')).toBe(0);
  });

  it('steps through every system except the one the ship is in', () => {
    expect(stepDestination('sol', 'alphaCentauri', 1)).toBe('gargantua');
    expect(stepDestination('sol', 'gargantua', 1)).toBe('alphaCentauri');
    expect(stepDestination('gargantua', 'sol', -1)).toBe('alphaCentauri');
  });
});
