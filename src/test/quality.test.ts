import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  budgetedPixelRatio, clearQualityGovernor, currentQuality, detectQuality, governedQuality, onQualityChange, qualityProfile,
  QUALITY_LEVELS, resetQualityDetection, setDetectedQuality, stepQualityDown, type DeviceSignals,
} from '@/game/quality';
import { resetSettings, updateSettings } from '@/game/settings';

const desktop: DeviceSignals = { gpu: 'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, OpenGL 4.1)', cores: 4, touch: false, width: 1440, memoryGB: 16 };

describe('quality presets', () => {
  beforeEach(() => { localStorage.clear(); resetSettings(); resetQualityDetection(); });

  it('the target Mac (Iris Plus 640, 4 cores) starts balanced', () => {
    expect(detectQuality(desktop)).toBe('balanced');
  });
  it('touch, narrow, few cores or little memory start on performance', () => {
    expect(detectQuality({ ...desktop, touch: true })).toBe('performance');
    expect(detectQuality({ ...desktop, width: 720 })).toBe('performance');
    expect(detectQuality({ ...desktop, cores: 2 })).toBe('performance');
    expect(detectQuality({ ...desktop, memoryGB: 2 })).toBe('performance');
    expect(detectQuality({ ...desktop, gpu: 'Google SwiftShader' })).toBe('performance');
  });
  it('a flagship phone starts balanced; a mid-range or small-memory one stays on performance', () => {
    const phone = { gpu: 'Adreno (TM) 740', cores: 8, touch: true, width: 412, memoryGB: 8 };
    expect(detectQuality(phone)).toBe('balanced');
    expect(detectQuality({ ...phone, gpu: 'Apple GPU', cores: 6, memoryGB: 0 })).toBe('balanced');
    expect(detectQuality({ ...phone, gpu: 'Mali-G710' })).toBe('balanced');
    expect(detectQuality({ ...phone, gpu: 'Adreno (TM) 610' })).toBe('performance');
    expect(detectQuality({ ...phone, gpu: 'Mali-G57' })).toBe('performance');
    expect(detectQuality({ ...phone, memoryGB: 4 })).toBe('performance');
    expect(detectQuality({ ...phone, cores: 4 })).toBe('performance');
  });
  it('a strong GPU with enough cores starts high; unknown hardware stays balanced', () => {
    expect(detectQuality({ ...desktop, gpu: 'ANGLE (Apple, Apple M2, OpenGL 4.1)', cores: 8 })).toBe('high');
    expect(detectQuality({ ...desktop, gpu: 'NVIDIA GeForce RTX 3060', cores: 12 })).toBe('high');
    expect(detectQuality({ ...desktop, gpu: 'NVIDIA GeForce RTX 3060', cores: 4 })).toBe('balanced');
    expect(detectQuality({ ...desktop, gpu: '', cores: 8 })).toBe('balanced');
  });
  it('ultra is never detected, only named: even the strongest desktop starts high', () => {
    expect(detectQuality({ ...desktop, gpu: 'NVIDIA GeForce RTX 4090', cores: 32, memoryGB: 64, width: 3840 })).toBe('high');
    expect(detectQuality({ ...desktop, gpu: 'AMD Radeon RX 7900 XTX', cores: 16 })).toBe('high');
    expect(detectQuality({ ...desktop, gpu: 'ANGLE (Apple, Apple M3 Max, OpenGL 4.1)', cores: 16 })).toBe('high');
    expect(QUALITY_LEVELS).toEqual(['performance', 'balanced', 'high', 'ultra']);
  });
  it('ultra is the desktop preset: 4K shadows, 8 samples, every pass on, the pixel ratio still budgeted', () => {
    const u = qualityProfile('ultra');
    expect(u).toMatchObject({
      level: 'ultra', maxPixelRatio: 2, shadowMapSize: 4096, shadowRadius: 70, bloom: true, bloomScale: 0.75, msaa: 8,
      dustMax: 2400, printsMax: 1400, historyMax: 1800, stars: 8000, band: 16000, propDensity: 1.6, lodDistance: 90, lite: false,
      flare: true, godRays: true, grade: true, clouds: 2, anisotropy: 16,
    });
    // Still under the integrated-graphics budget: ultra on an Iris is the governor's problem, not a 3 MP frame.
    expect(budgetedPixelRatio(2, u.maxPixelRatio, desktop.gpu, 1440, 900)).toBeLessThan(1.2);
  });
  it('the screen-space passes and the cloud quality follow the preset', () => {
    const [p, b, h] = QUALITY_LEVELS.map(qualityProfile);
    expect(p).toMatchObject({ flare: false, godRays: false, grade: false, clouds: 0, anisotropy: 4 });
    expect(b).toMatchObject({ flare: true, godRays: false, grade: true, clouds: 1, anisotropy: 8 });
    expect(h).toMatchObject({ flare: true, godRays: true, grade: true, clouds: 1, anisotropy: 16 });
  });
  it('every preset is ordered: nothing costs more on a lower preset', () => {
    const [p, b, h, u] = QUALITY_LEVELS.map(qualityProfile);
    expect(h.maxPixelRatio).toBeLessThanOrEqual(u.maxPixelRatio);
    expect(h.shadowMapSize).toBeLessThanOrEqual(u.shadowMapSize);
    expect(h.msaa).toBeLessThanOrEqual(u.msaa);
    expect(h.stars).toBeLessThanOrEqual(u.stars);
    expect(h.propDensity).toBeLessThanOrEqual(u.propDensity);
    expect(h.lodDistance).toBeLessThanOrEqual(u.lodDistance);
    expect(h.anisotropy).toBeLessThanOrEqual(u.anisotropy);
    expect(h.clouds).toBeLessThanOrEqual(u.clouds);
    expect(u.lite).toBe(false);
    expect(p.maxPixelRatio).toBeLessThanOrEqual(b.maxPixelRatio);
    expect(b.maxPixelRatio).toBeLessThanOrEqual(h.maxPixelRatio);
    expect(p.shadowMapSize).toBeLessThanOrEqual(b.shadowMapSize);
    expect(p.dustMax).toBeLessThanOrEqual(b.dustMax);
    expect(p.printsMax).toBeLessThanOrEqual(b.printsMax);
    expect(p.stars).toBeLessThanOrEqual(b.stars);
    expect(p.propDensity).toBeLessThanOrEqual(b.propDensity);
    expect(p.msaa).toBeLessThanOrEqual(h.msaa);
    expect(p.lite).toBe(true);
    expect(b.lite).toBe(false);
    expect(p.lodDistance).toBeLessThanOrEqual(b.lodDistance);
    expect(b.lodDistance).toBeLessThanOrEqual(h.lodDistance);
  });
  it('the player\'s choice overrides the device, and listeners hear only real changes', () => {
    const seen: string[] = [];
    const off = onQualityChange((q) => seen.push(q.level));
    const auto = currentQuality().level;
    updateSettings({ quality: 'performance' });
    expect(currentQuality().level).toBe('performance');
    updateSettings({ sensitivity: 2 });
    updateSettings({ quality: 'performance' });
    updateSettings({ quality: 'high' });
    expect(seen).toEqual(auto === 'performance' ? ['high'] : ['performance', 'high']);
    off();
    updateSettings({ quality: 'balanced' });
    expect(seen.length).toBe(auto === 'performance' ? 1 : 2);
    vi.restoreAllMocks();
  });

  describe('the governor', () => {
    it('takes one level at a time, tells its listeners, and stops at the floor', () => {
      const seen: string[] = [];
      const off = onQualityChange((q) => seen.push(q.level));
      updateSettings({ quality: 'auto' });
      const from = currentQuality().level;
      const steps = QUALITY_LEVELS.indexOf(from);
      for (let i = 0; i < steps; i++) expect(stepQualityDown()).toBe(true);
      expect(currentQuality().level).toBe('performance');
      expect(governedQuality()).toBe(steps > 0 ? 'performance' : null);
      // Nothing below performance, and nothing said about a step that did not happen.
      expect(stepQualityDown()).toBe(false);
      expect(seen).toEqual(QUALITY_LEVELS.slice(0, steps).reverse());
      off();
    });

    it('steps ultra down to high, one level like any other', () => {
      updateSettings({ quality: 'auto' });
      setDetectedQuality('ultra');
      expect(currentQuality().level).toBe('ultra');
      expect(stepQualityDown()).toBe(true);
      expect(currentQuality().level).toBe('high');
      expect(governedQuality()).toBe('high');
      // Named outright, ultra is the player's: the governor keeps its hands off.
      updateSettings({ quality: 'ultra' });
      expect(currentQuality().level).toBe('ultra');
      expect(stepQualityDown()).toBe(false);
      expect(currentQuality().level).toBe('ultra');
    });

    it('never steps back up, and gives way to a preset the player names', () => {
      updateSettings({ quality: 'auto' });
      stepQualityDown();
      // A named preset is the player's, whatever the governor found.
      updateSettings({ quality: 'high' });
      expect(currentQuality().level).toBe('high');
      // ... and the governor will not touch it.
      expect(stepQualityDown()).toBe(false);
      expect(currentQuality().level).toBe('high');
      // Back to automatic with the finding discarded: the device decides again.
      clearQualityGovernor();
      updateSettings({ quality: 'auto' });
      expect(governedQuality()).toBe(null);
      expect(currentQuality().level).toBe(detectQuality({ gpu: '', cores: navigator.hardwareConcurrency || 4, touch: false, width: window.innerWidth, memoryGB: 0 }));
    });
  });
});

describe('the pixel budget', () => {
  const iris = desktop.gpu;
  it('a Retina Mac on Intel graphics draws about 1.1x at 1440×900, not the preset\'s 1.5', () => {
    const r = budgetedPixelRatio(2, 1.5, iris, 1440, 900);
    expect(r).toBeGreaterThan(1);
    expect(r).toBeLessThan(1.2);
    expect(1440 * 900 * r * r).toBeLessThanOrEqual(1.6e6 + 1);
  });
  it('never goes under 1 for a big window: that is the governor\'s ground', () => {
    expect(budgetedPixelRatio(2, 1.5, iris, 2560, 1440)).toBe(1);
  });
  it('leaves a discrete or Apple GPU at the preset', () => {
    expect(budgetedPixelRatio(2, 2, 'ANGLE Metal Renderer: Apple M2', 1440, 900)).toBe(2);
    expect(budgetedPixelRatio(2, 1.5, 'NVIDIA GeForce RTX 3070', 1920, 1080)).toBe(1.5);
  });
  it('a screen of ratio 1 stays at 1', () => {
    expect(budgetedPixelRatio(1, 1.5, iris, 800, 600)).toBe(1);
  });
});
