// The frame between a surface scene and its planet: local metres and globe
// kilometres must agree, or the ship lands beside the ground it was aimed at.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  PLANET_BODIES, GLOBE_WORLDS, GAS_GIANTS, siteBasis, localToGlobe, globeToLocal, localDirToGlobe,
  altitudeOf, localUpAt, curvatureDrop, airDensity, orbitalSpeed, surfaceNormal, hasAir, isGasGiant, isGlobeWorld,
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

  it('flies the six new worlds too, each with a body that makes sense', () => {
    for (const w of ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune']) expect(isGlobeWorld(w)).toBe(true);
    expect(isGlobeWorld('proximaB')).toBe(false);
    for (const w of GLOBE_WORLDS) {
      const b = PLANET_BODIES[w];
      expect(b, w).toBeDefined();
      for (const v of [b.radiusKm, b.gravity, b.orbitKm, b.rotationHours, b.datumKm, b.site.lat, b.site.lon]) expect(Number.isFinite(v)).toBe(true);
      expect(b.radiusKm).toBeGreaterThan(1000);
      expect(b.gravity).toBeGreaterThan(1);
      expect(Math.abs(b.site.lat)).toBeLessThan(90);
      // The orbit the descent starts from is above the air it enters.
      expect(b.orbitKm).toBeGreaterThan(b.atmosphereKm);
      // Air and its scale height come together, or not at all.
      expect(b.atmosphereKm > 0).toBe(b.scaleHeightKm > 0);
      // The air's drawn top is ten scale heights or more up, so heating fades in.
      if (hasAir(w)) expect(b.atmosphereKm / b.scaleHeightKm).toBeGreaterThan(9.5);
    }
  });

  it('knows which worlds have air and which are giants with no ground', () => {
    expect(GLOBE_WORLDS.filter((w) => !hasAir(w))).toEqual(['moon', 'mercury']);
    expect([...GAS_GIANTS]).toEqual(['jupiter', 'saturn', 'uranus', 'neptune']);
    expect(isGasGiant('jupiter')).toBe(true);
    expect(isGasGiant('venus')).toBe(false);
    // The giants' reference sphere is the 1-bar level, and the platform rides on it.
    for (const w of GAS_GIANTS) expect(PLANET_BODIES[w].datumKm).toBe(0);
  });

  it('turns Venus and Uranus backwards', () => {
    for (const w of GLOBE_WORLDS) {
      expect(PLANET_BODIES[w].rotationHours < 0).toBe(w === 'venus' || w === 'uranus');
    }
  });

  it('orbits the new worlds at their real speeds', () => {
    const v = (w: keyof typeof PLANET_BODIES) => orbitalSpeed(PLANET_BODIES[w], PLANET_BODIES[w].orbitKm * 1000);
    expect(v('mercury')).toBeGreaterThan(2800);
    expect(v('mercury')).toBeLessThan(3000);
    expect(v('venus')).toBeGreaterThan(7000);
    expect(v('venus')).toBeLessThan(7300);
    expect(v('jupiter')).toBeGreaterThan(40_000);
    expect(v('jupiter')).toBeLessThan(42_500);
    expect(v('saturn')).toBeGreaterThan(23_500);
    expect(v('saturn')).toBeLessThan(25_500);
    expect(v('uranus')).toBeGreaterThan(14_000);
    expect(v('neptune')).toBeGreaterThan(15_500);
  });
});
