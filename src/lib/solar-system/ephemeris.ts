import * as THREE from 'three';
import {
  Body,
  HelioVector,
  Rotation_EQJ_ECL,
  RotateVector,
  type Vector,
} from 'astronomy-engine';

/** J2000 mean ecliptic → Three.js Y-up (ecliptic plane mostly XZ). */
const ROT_EQJ_ECL = Rotation_EQJ_ECL();

export type SolarBodyId =
  | 'sun'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

export type ScaleMode = 'orrery' | 'linear';

/** Mean radii (km) for display sizing — not to scale with orbit compression. */
export const MEAN_RADIUS_KM: Record<SolarBodyId, number> = {
  sun: 696_000,
  mercury: 2_439,
  venus: 6_052,
  earth: 6_371,
  mars: 3_390,
  jupiter: 69_911,
  saturn: 58_232,
  uranus: 25_362,
  neptune: 24_622,
  pluto: 1_188,
};

/** J2000 equatorial vector → Three.js ecliptic frame (Y up, ecliptic ≈ XZ). */
export function helioEqjToThree(vec: Vector): THREE.Vector3 {
  const e = RotateVector(ROT_EQJ_ECL, vec);
  return new THREE.Vector3(e.x, e.z, -e.y);
}

/** Sidereal orbital periods (days) — used to sample true orbit paths and to
 *  drive epoch-accurate small-body motion. */
export const ORBIT_PERIOD_DAYS: Record<Exclude<SolarBodyId, 'sun'>, number> = {
  mercury: 87.969,
  venus: 224.701,
  earth: 365.256,
  mars: 686.980,
  jupiter: 4332.589,
  saturn: 10_759.22,
  uranus: 30_685.4,
  neptune: 60_189,
  pluto: 90_560,
};

const ORBIT_BODY: Record<Exclude<SolarBodyId, 'sun'>, Body> = {
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

/**
 * True orbit path for a body: heliocentric positions sampled over one full
 * sidereal period, so eccentricity and inclination (Mercury's ellipse,
 * Pluto's 17° tilt crossing Neptune) render exactly as they are in space.
 */
export function sampleOrbitPath(
  id: Exclude<SolarBodyId, 'sun'>,
  mode: ScaleMode,
  segments = 192,
): THREE.Vector3[] {
  const body = ORBIT_BODY[id];
  const periodMs = ORBIT_PERIOD_DAYS[id] * 86_400_000;
  const t0 = Date.now();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < segments; i++) {
    const date = new Date(t0 + (i / segments) * periodMs);
    pts.push(helioScenePosition(HelioVector(body, date), mode));
  }
  return pts;
}

/**
 * Map heliocentric distance (AU) to scene radius while preserving direction.
 * `orrery` compresses outer system like pocket-planetarium apps; `linear` is true AU × factor.
 */
export function sceneRadiusFromAu(distanceAu: number, mode: ScaleMode): number {
  const d = Math.max(distanceAu, 0.0008);
  if (mode === 'linear') return d * 0.58;
  return 1.02 * Math.pow(d, 0.435);
}

export function helioScenePosition(helioEqj: Vector, mode: ScaleMode): THREE.Vector3 {
  const v = helioEqjToThree(helioEqj);
  const au = v.length();
  if (au < 1e-12) return new THREE.Vector3(0, 0, 0);
  v.normalize();
  v.multiplyScalar(sceneRadiusFromAu(au, mode));
  return v;
}

export interface BodySceneSample {
  id: SolarBodyId;
  position: THREE.Vector3;
  /** AU before scene compression (for readouts). */
  helioDistanceAu: number;
}

/**
 * Positions for the main solar-system mesh graph at `date` (planets + Sun only).
 */
export function sampleSolarSystem(date: Date, mode: ScaleMode, includePluto: boolean): BodySceneSample[] {
  const out: BodySceneSample[] = [];

  const sunVec = HelioVector(Body.Sun, date);
  const sunHelioAu = helioEqjToThree(sunVec).length();
  out.push({
    id: 'sun',
    position: new THREE.Vector3(0, 0, 0),
    helioDistanceAu: sunHelioAu,
  });

  const majors: { id: SolarBodyId; body: Body }[] = [
    { id: 'mercury', body: Body.Mercury },
    { id: 'venus', body: Body.Venus },
    { id: 'earth', body: Body.Earth },
    { id: 'mars', body: Body.Mars },
    { id: 'jupiter', body: Body.Jupiter },
    { id: 'saturn', body: Body.Saturn },
    { id: 'uranus', body: Body.Uranus },
    { id: 'neptune', body: Body.Neptune },
  ];
  if (includePluto) majors.push({ id: 'pluto', body: Body.Pluto });

  for (const { id, body } of majors) {
    const hv = HelioVector(body, date);
    const au = helioEqjToThree(hv).length();
    const pos = helioScenePosition(hv, mode);
    out.push({ id, position: pos, helioDistanceAu: au });
  }

  return out;
}

export function worldRadiusForBody(id: SolarBodyId): number {
  const km = MEAN_RADIUS_KM[id];
  return 0.028 * Math.pow(km / 6_371, 0.36);
}

export function bodyColor(id: SolarBodyId): number {
  switch (id) {
    case 'sun': return 0xf6c15c;
    case 'mercury': return 0xb5b8bc;
    case 'venus': return 0xe4d6b8;
    case 'earth': return 0x4a7cbf;
    case 'mars': return 0xc45c3e;
    case 'jupiter': return 0xc4a574;
    case 'saturn': return 0xd8c896;
    case 'uranus': return 0x7eb8c6;
    case 'neptune': return 0x3f5fbd;
    case 'pluto': return 0xb9a89a;
    default: return 0x8899aa;
  }
}
