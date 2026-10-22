// Every world flown down from orbit has everything the globe, the air, the
// orbit view and the entry look up by its id, and its globe builds and runs
// from orbit to the ground without WebGL: the six added after the Moon, Mars
// and Earth (Mercury, Venus and the four giants) most of all. Saturn wears
// its rings, Venus its unbroken cloud deck, the giants a flat 1-bar sphere.

import * as THREE from 'three';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { GLOBE_WORLDS, GAS_GIANTS, PLANET_BODIES, hasAir, type GlobeWorld } from '@/lib/solar-system/planet-frame';
import { makePlanetGlobe, MAPS, CLOUD_SHELLS } from '@/lib/solar-system/planet-globe';
import { GLOBE_AIR } from '@/lib/solar-system/planet-globe-atmosphere';
import { GROUND_LOOK, SUN_FLUX, sunIntensityFor, CLOUD_DETAIL } from '@/lib/solar-system/planet-globe-material';
import { ringStrip, SATURN_RINGS, RING_INNER_KM, RING_OUTER_KM } from '@/lib/solar-system/planet-globe-rings';
import { CEILINGS, SKY_AIR, skyAt } from '@/lib/solar-system/surface-orbit';
import { PLASMA, plasmaFor } from '@/lib/solar-system/entry-fx';
import { soundSpeed } from '@/lib/solar-system/orbital-descent';
import { qualityProfile } from '@/game/quality';

const NEW: GlobeWorld[] = ['mercury', 'venus', 'jupiter', 'saturn', 'uranus', 'neptune'];
const publicFile = (url: string) => path.join(process.cwd(), 'public', url);

describe('the tables every world is looked up in', () => {
  it.each([...GLOBE_WORLDS])('%s has a body, a height bound, a look, its air, ceilings, sky air and a speed of sound', (w) => {
    expect(PLANET_BODIES[w]).toBeDefined();
    const look = GROUND_LOOK[w];
    expect(look).toBeDefined();
    for (const c of [...look.fallback, ...look.rock, ...look.sun, ...look.ambient]) {
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
    }
    // Air where there is air, none where there is not.
    expect(GLOBE_AIR[w] === null).toBe(!hasAir(w));
    expect(CEILINGS[w].local).toBeGreaterThan(0);
    expect(SKY_AIR[w]).toBeDefined();
    expect(SKY_AIR[w].scale > 0).toBe(hasAir(w));
    expect(soundSpeed(w) > 0).toBe(hasAir(w));
  });

  it('points every map at a file that is there', () => {
    for (const w of GLOBE_WORLDS) {
      const m = MAPS[w];
      if (!m) continue;
      expect(fs.existsSync(publicFile(m.full)), m.full).toBe(true);
      expect(fs.existsSync(publicFile(m.lite)), m.lite).toBe(true);
    }
    for (const s of Object.values(CLOUD_SHELLS)) {
      expect(fs.existsSync(publicFile(s!.maps.full))).toBe(true);
      expect(fs.existsSync(publicFile(s!.maps.lite))).toBe(true);
    }
    // Venus's maps are its cloud tops: they go on the cloud shell, not the ground.
    expect(MAPS.venus).toBeNull();
    expect(CLOUD_SHELLS.venus!.maps.full).toContain('venus');
  });

  it('dims the sun with distance, keeping the order but nothing near black', () => {
    const k = (w: GlobeWorld) => sunIntensityFor(SUN_FLUX[w]);
    expect(k('mercury')).toBeGreaterThan(k('earth'));
    expect(k('earth')).toBeCloseTo(3, 9);
    expect(k('jupiter')).toBeLessThan(k('earth'));
    expect(k('saturn')).toBeLessThan(k('jupiter'));
    expect(k('uranus')).toBeLessThan(k('saturn'));
    expect(k('neptune')).toBeLessThan(k('uranus'));
    // Neptune gets a nine-hundredth of Earth's light; drawn, a third of it.
    expect(k('neptune')).toBeGreaterThan(1);
    // The giants' and Mercury's looks follow it (the sun's brightest channel is the intensity).
    for (const w of [...GAS_GIANTS, 'mercury' as const]) expect(Math.max(...GROUND_LOOK[w].sun) * Math.PI).toBeCloseTo(k(w), 6);
  });

  it('gives the giants and Venus drawn-in cloud structure, Jupiter the most', () => {
    for (const w of GAS_GIANTS) expect(CLOUD_DETAIL[w]).toBeDefined();
    expect(CLOUD_DETAIL.venus).toBeDefined();
    expect(CLOUD_DETAIL.jupiter!.amp).toBeGreaterThan(CLOUD_DETAIL.uranus!.amp);
  });

  it('colours each entry by the gas it burns in', () => {
    expect(plasmaFor('earth')).toBe(PLASMA.earth);
    expect(plasmaFor('mars')).toBe(PLASMA.mars);
    expect(plasmaFor('venus')).toBe(PLASMA.venus);
    for (const w of GAS_GIANTS) expect(plasmaFor(w)).toBe(PLASMA.giant);
    expect(plasmaFor('proximaB')).toBe(PLASMA.default);
    // Hydrogen burns blue-violet at the shoulders, not orange.
    expect(PLASMA.giant.hot[2]).toBeGreaterThan(PLASMA.giant.hot[0]);
  });

  it('turns the new skies to space above their air', () => {
    for (const w of NEW) {
      const top = SKY_AIR[w].top;
      expect(skyAt(w, top + 1000).air).toBe(0);
      if (hasAir(w)) expect(skyAt(w, 0).air).toBe(1);
    }
    // Venus's overcast holds most of the way to its deck, and is the globe's above it.
    expect(skyAt('venus', 25_000).clouds).toBe(1);
    expect(skyAt('venus', 40_000).clouds).toBeGreaterThan(0.5);
    expect(skyAt('venus', 60_000).clouds).toBe(0);
  });
});

describe('Saturn\'s rings', () => {
  it('are the same on every run, and opaque where the B ring is and clear in the Cassini Division', () => {
    const a = ringStrip(512);
    expect(ringStrip(512)).toEqual(a);
    const alphaAt = (km: number) => a[Math.floor(((km - RING_INNER_KM) / (RING_OUTER_KM - RING_INNER_KM)) * 512) * 4 + 3] / 255;
    expect(alphaAt(105_000)).toBeGreaterThan(0.75);
    expect(alphaAt(119_900)).toBeLessThan(0.15);
    expect(alphaAt(128_000)).toBeGreaterThan(0.5);
    // Between the A ring and the F ring, nothing.
    expect(alphaAt(138_500)).toBe(0);
    expect(SATURN_RINGS[0][0]).toBe(RING_INNER_KM);
    // They start outside the planet and outside the air.
    expect(RING_INNER_KM).toBeGreaterThan(PLANET_BODIES.saturn.radiusKm + PLANET_BODIES.saturn.atmosphereKm);
  });
});

describe('the globe of every world, without WebGL', () => {
  const sunDir = new THREE.Vector3(0.3, 0.8, -0.4).normalize();

  it.each(NEW)('%s builds, follows a camera from orbit to the ground and lets go', (w) => {
    const body = PLANET_BODIES[w];
    const globe = makePlanetGlobe(w, { quality: qualityProfile('performance'), lite: true, sunDir });
    globe.setViewport?.(700);
    globe.setPatch(1500);
    const cam = new THREE.PerspectiveCamera(60, 16 / 10, 0.1, 1e8);
    const look = new THREE.Vector3();
    for (const alt of [body.orbitKm * 1000, 300_000, 60_000, 10_000, 1000, 40]) {
      cam.position.set(-alt * 0.3, alt, alt * 0.2);
      cam.lookAt(look.set(0, 0, -alt * 2));
      cam.updateMatrixWorld();
      for (let i = 0; i < 20; i++) {
        globe.sync(cam);
        globe.update(1 / 60);
      }
      const s = globe.stats();
      for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
      expect(s.tiles).toBeGreaterThan(0);
      expect(s.altitudeKm * 1000).toBeGreaterThan(alt * 0.98 - 100);
      expect(globe.camera.near).toBeGreaterThan(0);
      expect(globe.camera.far).toBeGreaterThan(globe.camera.near);
    }
    // The ground under the site is the datum the surface scene stands on.
    expect(globe.groundHeightAt(0, 0)).toBeCloseTo(body.datumKm * 1000, 3);
    expect(!!globe.scene.getObjectByName('globe-rings')).toBe(w === 'saturn');
    expect(!!globe.scene.getObjectByName('globe-atmosphere')).toBe(hasAir(w));
    expect(!!globe.scene.getObjectByName('globe-clouds')).toBe(w === 'venus');
    globe.dispose();
  });

  it('keeps the giants cheap: a flat sphere splits no deeper than a 2 km grid', () => {
    const globe = makePlanetGlobe('jupiter', { quality: qualityProfile('performance'), lite: true, sunDir });
    const cam = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1e8);
    cam.position.set(0, 50, 0);
    cam.lookAt(0, 0, -5000);
    cam.updateMatrixWorld();
    for (let i = 0; i < 200; i++) { globe.sync(cam); globe.update(1 / 60); }
    expect(globe.stats().maxLevel).toBeLessThanOrEqual(11);
    expect(globe.groundHeightAt(12_000, -40_000)).toBe(0);
    globe.dispose();
  });
});
