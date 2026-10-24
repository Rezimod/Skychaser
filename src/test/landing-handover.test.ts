// The handover between the flight and a surface without a screen of its own:
// the last frame is taken from whichever loop draws next, and Earth's data is
// fetched on the way in and handed to the surface (or let go).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestStill, serviceStill, stillPending } from '@/game/frame-tap';

describe('the last frame', () => {
  afterEach(() => vi.useRealTimers());

  it('is copied from the next loop to draw, scaled down', async () => {
    const draw = vi.fn();
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: draw })) as unknown as typeof orig;
    const source = document.createElement('canvas');
    source.width = 800; source.height = 400;
    const p = requestStill(0.5);
    expect(stillPending()).toBe(true);
    serviceStill(source);
    const still = await p;
    expect(still).not.toBeNull();
    expect(still!.width).toBe(400);
    expect(still!.height).toBe(200);
    expect(draw).toHaveBeenCalledWith(source, 0, 0, 400, 200);
    expect(stillPending()).toBe(false);
    HTMLCanvasElement.prototype.getContext = orig;
  });

  it('is nothing (the plain veil) if no loop draws in time', async () => {
    vi.useFakeTimers();
    const p = requestStill(0.5, 300);
    vi.advanceTimersByTime(301);
    await expect(p).resolves.toBeNull();
    expect(stillPending()).toBe(false);
  });

  it('costs a loop nothing when no one asked', () => {
    expect(() => serviceStill(document.createElement('canvas'))).not.toThrow();
  });
});

describe("Earth's data on the way in", () => {
  it('is handed to the surface, and a ship that pulls away lets it go', async () => {
    vi.resetModules();
    const data = { manifest: {}, grids: {} } as unknown;
    vi.doMock('@/lib/solar-system/world-earth-data', () => ({ loadTbilisi: vi.fn(() => Promise.resolve(data)) }));
    vi.doMock('@/lib/solar-system/world-earth', () => ({ prepareEarthCity: vi.fn(() => Promise.resolve({ city: 'prepared' })) }));
    const m = await import('@/lib/solar-system/earth-preload');
    const first = m.preloadEarth(true);
    expect(m.preloadEarth(true)).toBe(first);
    expect(m.takeEarthPreload(false)).toBeNull();
    const taken = m.takeEarthPreload(true)!;
    await expect(taken.promise).resolves.toMatchObject({ prepared: { city: 'prepared' } });
    expect(m.earthPreloading()).toBe(false);
    m.preloadEarth(true);
    m.cancelEarthPreload();
    expect(m.earthPreloading()).toBe(false);
    vi.doUnmock('@/lib/solar-system/world-earth-data');
    vi.doUnmock('@/lib/solar-system/world-earth');
  });
});
