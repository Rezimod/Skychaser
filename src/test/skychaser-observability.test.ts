import { describe, expect, it } from 'vitest';
import { NODES } from '@/lib/observatory/nodes';
import { resolvingPowerArcsec } from '@/lib/observatory/optics';
import {
  arcsecFromKm,
  arcsecFromKmAtAu,
  meanSurfaceBrightness,
  MOON_DISTANCE_KM,
  observability,
  resolutionLimitArcsec,
  skyBrightness,
  type ObservabilitySubject,
} from '@/lib/skychaser/observability';

const node = NODES[0];
const active = { ...node, status: 'active' as const };

const subject = (s: Partial<ObservabilitySubject> & { targetId: string }): ObservabilitySubject => ({
  decDeg: null,
  resolveArcsec: null,
  magnitude: null,
  sizeArcmin: null,
  ...s,
});

describe('the instrument, read from the node', () => {
  it('is a 150 mm under a Bortle 8 sky', () => {
    expect(node.instrument.apertureMm).toBe(150);
    expect(node.bortle).toBe(8);
  });

  it('resolves to the seeing, not to Dawes', () => {
    expect(resolvingPowerArcsec(node.instrument)).toBeCloseTo(0.773, 3);
    expect(resolutionLimitArcsec(node)).toBe(2.6);
  });
});

describe('what Live Telescope V1 cannot record', () => {
  it('cannot resolve Europa as a disc, though Dawes alone would allow it', () => {
    const europa = arcsecFromKmAtAu(3_122, 4.2);
    expect(europa).toBeGreaterThan(resolvingPowerArcsec(node.instrument));
    const verdict = observability(subject({ targetId: 'jupiter', resolveArcsec: europa, magnitude: 5.3 }), node);
    expect(verdict.status).toBe('not_available');
    expect(verdict.reason).toMatch(/1\.0″ across, and the air blurs anything under 2\.6″/);
  });

  it('cannot see the Apollo 11 descent stage', () => {
    const lander = arcsecFromKm(0.0094, MOON_DISTANCE_KM);
    expect(observability(subject({ targetId: 'moon', resolveArcsec: lander }), node).status).toBe('not_available');
  });

  it('never works what does not climb above the envelope floor from 41.7° N', () => {
    // Canopus culminates below the horizon; Omega Centauri under a degree up.
    for (const decDeg of [-52.696, -47.4795]) {
      const verdict = observability(subject({ targetId: 'm42', decDeg }), node);
      expect(verdict.status).toBe('not_available');
      expect(verdict.reason).toMatch(/Never climbs high enough in the sky: .*, and the Live Telescope needs 20°/);
    }
    // -28° culminates at about 20.3°, just inside.
    expect(observability(subject({ targetId: 'm42', decDeg: -28 }), node).status).toBe('eligible');
  });

  it('cannot record a point fainter than its deepest unattended stack reaches', () => {
    const verdict = observability(subject({ targetId: 'm57', magnitude: 17.5 }), node);
    expect(verdict.status).toBe('not_available');
    expect(verdict.reason).toMatch(/Too faint: magnitude 17\.5, and the Live Telescope reaches/);
  });

  it('loses a low-surface-brightness galaxy to the city sky', () => {
    expect(skyBrightness(8)).toBe(18.5);
    // M101: 7.9 mag spread over 28.8' x 26.9'.
    expect(meanSurfaceBrightness(7.9, 28.8, 26.9)).toBeCloseTo(23.75, 1);
    const verdict = observability(
      subject({ targetId: 'm57', decDeg: 54.349, magnitude: 7.9, sizeArcmin: { major: 28.8, minor: 26.9 } }),
      node,
    );
    expect(verdict.status).toBe('not_available');
    expect(verdict.reason).toContain('surface brightness');
  });

  it('keeps the Orion Nebula, bright enough for all its size', () => {
    const m42 = subject({ targetId: 'm42', decDeg: -5.391, magnitude: 4.0, sizeArcmin: { major: 85, minor: 60 } });
    expect(observability(m42, node).status).toBe('eligible');
  });

  it('refuses an object many fields across, which it would only ever show in part', () => {
    const verdict = observability(
      subject({ targetId: 'm42', decDeg: 20, magnitude: 1, sizeArcmin: { major: 200, minor: 200 } }),
      node,
    );
    expect(verdict.status).toBe('not_available');
    expect(verdict.reason).toMatch(/Too big to fit: 200′ across, more than 3 times/);
  });

  it('does not fake a target its capture path does not carry', () => {
    const verdict = observability(subject({ targetId: 'm51', decDeg: 47.195 }), node);
    expect(verdict.status).toBe('not_available');
    expect(verdict.reason).toBe('Not on the Live Telescope’s list of targets yet.');
  });

  it('gives the physical reason before the missing target', () => {
    const verdict = observability(subject({ targetId: 'canopus', decDeg: -52.696 }), node);
    expect(verdict.reason).toMatch(/^Never climbs/);
  });
});

describe('eligible and dedicated', () => {
  const tycho = subject({ targetId: 'moon', resolveArcsec: arcsecFromKm(85, MOON_DISTANCE_KM) });

  it('holds back dedicated while the node is commissioning', () => {
    expect(node.status).toBe('commissioning');
    expect(observability(tycho, node).status).toBe('eligible');
  });

  it('dedicates a large bright subject once the node is active', () => {
    expect(observability(tycho, active).status).toBe('dedicated');
  });

  it('does not dedicate a faint target, however large', () => {
    const m42 = subject({ targetId: 'm42', decDeg: -5.391, resolveArcsec: 60, magnitude: 4.0 });
    expect(observability(m42, active).status).toBe('eligible');
  });

  it('does not dedicate a subject only a few resolution elements across', () => {
    const redSpot = subject({ targetId: 'jupiter', resolveArcsec: arcsecFromKmAtAu(11_000, 4.2) });
    expect(observability(redSpot, active).status).toBe('eligible');
  });
});
