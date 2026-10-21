// The frame between a surface scene and its planet: local metres and globe
// kilometres must agree, or the ship lands beside the ground it was aimed at.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLANET_BODIES, GLOBE_WORLDS, siteBasis, localToGlobe, globeToLocal, localDirToGlobe,
  altitudeOf, localUpAt, curvatureDrop, airDensity, orbitalSpeed, surfaceNormal,
} from '@/lib/solar-system/planet-frame';

describe('planet frame', () => {
  for (const w of GLOBE_WORLDS) {
    const body = PLANET_BODIES[w];
    const b = siteBasis(body);

    it(`${w}: the site's datum sits on the sphere, straight up is radial`, () => {
      const o = localToGlobe(b, new THREE.Vector3(0, 0, 0));
      expect(o.length()).toBeCloseTo(body.radiusKm, 6);
      const up = localToGlobe(b, new THREE.Vector3(0, 1000, 0)).sub(o);
      expect(up.length()).toBeCloseTo(1, 9);
      expect(up.normalize().dot(surfaceNormal(body.site.lat, body.site.lon))).toBeCloseTo(1, 9);
    });

    it(`${w}: north is −Z and east is +X`, () => {
      const n = localDirToGlobe(b, new THREE.Vector3(0, 0, -1));
      expect(n.dot(b.north)).toBeCloseTo(1, 9);
      const e = localDirToGlobe(b, new THREE.Vector3(1, 0, 0));
      expect(e.dot(b.east)).toBeCloseTo(1, 9);
      // A right-handed frame: east × up = south.
      expect(new THREE.Vector3().crossVectors(b.east, b.up).dot(b.north)).toBeCloseTo(-1, 9);
    });

    it(`${w}: local → globe → local is the identity`, () => {
      const p = new THREE.Vector3(12345, 67890, -4321);
      const back = globeToLocal(b, localToGlobe(b, p));
      expect(back.distanceTo(p)).toBeLessThan(1e-3);
    });

    it(`${w}: altitude reads the sphere, not the flat frame`, () => {
      expect(altitudeOf(body, b, new THREE.Vector3(0, 5000, 0))).toBeCloseTo(5000, 3);
      const d = 100_000;
      const drop = curvatureDrop(body, d);
      expect(altitudeOf(body, b, new THREE.Vector3(d, -drop, 0))).toBeCloseTo(0, 2);
      // Away from the site, up leans back toward it.
      const up = localUpAt(b, new THREE.Vector3(d, 0, 0));
      expect(up.x).toBeGreaterThan(0);
      expect(up.y).toBeGreaterThan(0.99);
    });
  }

  it('air thins with height, and the Moon has none', () => {
    expect(airDensity(PLANET_BODIES.moon, 0)).toBe(0);
    const e = PLANET_BODIES.earth;
    expect(airDensity(e, 0)).toBeCloseTo(1, 9);
    expect(airDensity(e, 8500)).toBeCloseTo(Math.exp(-1), 9);
    expect(airDensity(e, 150_000)).toBe(0);
  });

  it('a low orbit goes at the speeds the missions flew', () => {
    expect(orbitalSpeed(PLANET_BODIES.earth, 400_000)).toBeGreaterThan(7600);
    expect(orbitalSpeed(PLANET_BODIES.earth, 400_000)).toBeLessThan(7750);
    expect(orbitalSpeed(PLANET_BODIES.moon, 100_000)).toBeGreaterThan(1600);
    expect(orbitalSpeed(PLANET_BODIES.moon, 100_000)).toBeLessThan(1660);
    expect(orbitalSpeed(PLANET_BODIES.mars, 250_000)).toBeGreaterThan(3300);
    expect(orbitalSpeed(PLANET_BODIES.mars, 250_000)).toBeLessThan(3500);
  });
});
