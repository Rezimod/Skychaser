// The shared frame between a surface scene and the whole planet under it.
//
// A surface scene works in metres round its landing site: east +X, up +Y,
// north −Z, the site's datum at y = 0 (Earth's scene is the exception: its
// y is height above sea level, so its datum is sea level). The planet globe
// (planet-globe.ts) works in kilometres with the planet's centre at the
// origin, body-fixed: +Z through the north pole, +X through latitude 0,
// longitude 0, +Y through latitude 0, longitude 90° east. This file is the
// one place that turns one into the other, so the ship coming down from
// orbit, the globe drawn behind it and the ground it lands on all agree.
//
// Pure: three.js maths only, nothing drawn.

import * as THREE from 'three';

/** The worlds that can be flown down to from orbit, for now. */
export type GlobeWorld = 'moon' | 'mars' | 'earth';

export const GLOBE_WORLDS: readonly GlobeWorld[] = ['moon', 'mars', 'earth'];

export function isGlobeWorld(id: string): id is GlobeWorld {
  return (GLOBE_WORLDS as readonly string[]).includes(id);
}

export interface PlanetBody {
  /** Mean radius, km. */
  radiusKm: number;
  /** Where the surface scene sits: degrees, east-positive longitude. */
  site: { lat: number; lon: number };
  /** Height of the scene's y = 0 above the globe's reference sphere, km. */
  datumKm: number;
  /** Top of the air that shows (limb glow, entry heating), km; 0 for none. */
  atmosphereKm: number;
  /** Density scale height, km; 0 for none. Entry heating and drag read it. */
  scaleHeightKm: number;
  /** Surface gravity, m/s². */
  gravity: number;
  /** A low circular orbit the descent starts from, km above the datum. */
  orbitKm: number;
  /** Sidereal rotation period, hours (negative: retrograde). */
  rotationHours: number;
}

/**
 * The bodies. Sites: the Moon's Stellar Base near the south pole (moon-sky
 * BASE_SITE), Mars at Jezero crater, Earth at the Tbilisi data's origin
 * (public/explore/tbilisi/manifest.json). Radii and gravity are the IAU
 * means; atmosphere tops are where the limb glow and heating are drawn to
 * begin, not a physical edge.
 */
export const PLANET_BODIES: Record<GlobeWorld, PlanetBody> = {
  moon: {
    radiusKm: 1737.4, site: { lat: -76, lon: 0 }, datumKm: 0,
    atmosphereKm: 0, scaleHeightKm: 0, gravity: 1.62, orbitKm: 100, rotationHours: 655.72,
  },
  mars: {
    radiusKm: 3389.5, site: { lat: 18.38, lon: 77.58 }, datumKm: 0,
    atmosphereKm: 110, scaleHeightKm: 11.1, gravity: 3.71, orbitKm: 250, rotationHours: 24.623,
  },
  earth: {
    radiusKm: 6371.0, site: { lat: 41.6935274, lon: 44.8104684 }, datumKm: 0,
    atmosphereKm: 100, scaleHeightKm: 8.5, gravity: 9.81, orbitKm: 400, rotationHours: 23.934,
  },
};

const DEG = Math.PI / 180;

/** The site's local axes in the body-fixed frame, unit vectors. */
export interface SiteBasis {
  up: THREE.Vector3;
  east: THREE.Vector3;
  north: THREE.Vector3;
  /** The site's datum point in the globe frame, km. */
  origin: THREE.Vector3;
  /** Local metres (east +X, up +Y, north −Z) → globe km, as one matrix (scale 1/1000). */
  localToGlobe: THREE.Matrix4;
  /** The rotation part only: a local direction or orientation → the globe frame. */
  rotation: THREE.Quaternion;
}

/** Body-fixed unit vector at a latitude and longitude, degrees. */
export function surfaceNormal(lat: number, lon: number, out = new THREE.Vector3()): THREE.Vector3 {
  const la = lat * DEG; const lo = lon * DEG;
  return out.set(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
}

export function siteBasis(body: PlanetBody): SiteBasis {
  const { lat, lon } = body.site;
  const la = lat * DEG; const lo = lon * DEG;
  const up = surfaceNormal(lat, lon);
  const east = new THREE.Vector3(-Math.sin(lo), Math.cos(lo), 0);
  const north = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la));
  const origin = up.clone().multiplyScalar(body.radiusKm + body.datumKm);
  // Columns: local +X → east, +Y → up, +Z → south (−north).
  const south = north.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(east, up, south);
  const rotation = new THREE.Quaternion().setFromRotationMatrix(basis);
  const localToGlobe = new THREE.Matrix4()
    .makeTranslation(origin.x, origin.y, origin.z)
    .multiply(basis)
    .multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001));
  return { up, east, north, origin, localToGlobe, rotation };
}

/** Local metres → globe km. */
export function localToGlobe(basis: SiteBasis, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(local).applyMatrix4(basis.localToGlobe);
}

/** Globe km → local metres. */
export function globeToLocal(basis: SiteBasis, globe: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const inv = new THREE.Matrix4().copy(basis.localToGlobe).invert();
  return out.copy(globe).applyMatrix4(inv);
}

/** A local direction (unit) → the globe frame. */
export function localDirToGlobe(basis: SiteBasis, dir: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(dir).applyQuaternion(basis.rotation);
}

/** Height of a local point above the reference sphere, m: the altitude an
 *  orbit or entry is flown against. At the site, y and this agree; away from
 *  it the sphere falls away under a flat frame. */
export function altitudeOf(body: PlanetBody, basis: SiteBasis, local: THREE.Vector3): number {
  const g = localToGlobe(basis, local, new THREE.Vector3());
  return (g.length() - body.radiusKm) * 1000;
}

/** Local "up" at a local point: the planet's radial direction, in the local frame. */
export function localUpAt(basis: SiteBasis, local: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  const g = localToGlobe(basis, local, new THREE.Vector3()).normalize();
  const inv = basis.rotation.clone().invert();
  return out.copy(g).applyQuaternion(inv);
}

/** How far the sphere has dropped below the flat local frame at a horizontal
 *  distance d from the site, m — what curves the flat ground at range. */
export function curvatureDrop(body: PlanetBody, d: number): number {
  const r = body.radiusKm * 1000;
  return r - Math.sqrt(Math.max(0, r * r - d * d));
}

/** Air density relative to the datum's, 0 where there is no air. */
export function airDensity(body: PlanetBody, altitudeM: number): number {
  if (body.scaleHeightKm <= 0) return 0;
  const top = body.atmosphereKm * 1000;
  if (altitudeM >= top) return 0;
  return Math.exp(-Math.max(0, altitudeM) / (body.scaleHeightKm * 1000));
}

/** Circular orbital speed at an altitude, m/s. */
export function orbitalSpeed(body: PlanetBody, altitudeM: number): number {
  const r = body.radiusKm * 1000;
  const mu = body.gravity * r * r;
  return Math.sqrt(mu / (r + altitudeM));
}
