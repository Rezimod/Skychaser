// Earth's air, single scattering, computed on the CPU. Rayleigh for the blue,
// Mie for the haze and the glare round the sun (Tbilisi's valley air is
// hazier than the textbook, so the aerosol is thicker at the ground), and
// ozone absorption — which is what keeps the sky blue, not grey, in the
// half hour after sunset. The sky is symmetric about the vertical plane
// through the light, so one small table per light (elevation × azimuth from
// it) holds the whole dome; it is rebuilt only when the light moves.
//
// Radiance is per unit solar irradiance. The scene scales it.

export const EARTH_R = 6360e3;
export const ATMO_R = 6420e3;
const BETA_R = [5.802e-6, 13.558e-6, 33.1e-6];
const BETA_O = [0.65e-6 * 1.5, 1.881e-6 * 1.5, 0.085e-6 * 1.5];
const H_R = 8000;
const H_M = 1200;
const MIE_G = 0.78;

export interface AirParams {
  /** Height of the observer above sea level, m. */
  height: number;
  /** Aerosol scattering at sea level, 1/m. 3.996e-6 is a clear day; a hazy city is several times that. */
  mie: number;
}

export const TBILISI_AIR: AirParams = { height: 490, mie: 1.2e-5 };

/** Optical depth along a ray from radius r0 with direction cosine mu (to vertical), to the top of the air. */
function depthToTop(r0: number, mu: number, steps: number, mie: number, out: number[]) {
  const b = r0 * mu;
  const c = r0 * r0 - ATMO_R * ATMO_R;
  const tMax = -b + Math.sqrt(Math.max(0, b * b - c));
  let dr = 0; let dm = 0; let dozone = 0;
  const ds = tMax / steps;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * ds;
    const h = Math.sqrt(r0 * r0 + t * t + 2 * r0 * t * mu) - EARTH_R;
    dr += Math.exp(-h / H_R) * ds;
    dm += Math.exp(-h / H_M) * ds;
    dozone += Math.max(0, 1 - Math.abs(h - 25000) / 15000) * ds;
  }
  for (let k = 0; k < 3; k++) out[k] = BETA_R[k] * dr + mie * 1.11 * dm + BETA_O[k] * dozone;
}

/** Does a ray from r0 with cosine mu hit the ground? */
const hitsGround = (r0: number, mu: number) => mu < 0 && r0 * r0 * (mu * mu - 1) + EARTH_R * EARTH_R >= 0;

/** How much of the light arrives down here, per channel, for a light at elevation `el` (rad). */
export function transmittance(el: number, air: AirParams, out: number[] = [0, 0, 0]): number[] {
  const r0 = EARTH_R + air.height;
  const mu = Math.sin(el);
  if (hitsGround(r0, mu)) { out[0] = out[1] = out[2] = 0; return out; }
  depthToTop(r0, mu, 24, air.mie, out);
  for (let k = 0; k < 3; k++) out[k] = Math.exp(-out[k]);
  return out;
}

/**
 * Sky radiance looking at elevation `el`, `dAz` radians round from the
 * light, with the light at elevation `lightEl`. Per unit irradiance.
 */
export function skyRadiance(el: number, dAz: number, lightEl: number, air: AirParams, out: number[] = [0, 0, 0]): number[] {
  const r0 = EARTH_R + air.height;
  const ve = Math.max(el, 0.002);
  const vx = Math.cos(ve) * Math.cos(dAz); const vy = Math.sin(ve); const vz = Math.cos(ve) * Math.sin(dAz);
  const lx = Math.cos(lightEl); const ly = Math.sin(lightEl);
  const cosTheta = vx * lx + vy * ly;
  const phaseR = (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
  const g2 = MIE_G * MIE_G;
  const phaseM = (3 / (8 * Math.PI)) * ((1 - g2) * (1 + cosTheta * cosTheta)) / ((2 + g2) * Math.pow(1 + g2 - 2 * MIE_G * cosTheta, 1.5));
  const b = r0 * vy;
  const tMax = -b + Math.sqrt(b * b - (r0 * r0 - ATMO_R * ATMO_R));
  const N = 20;
  out[0] = out[1] = out[2] = 0;
  const odView = [0, 0, 0];
  const odSun = [0, 0, 0];
  let prevT = 0;
  for (let i = 0; i < N; i++) {
    // Samples crowd toward the observer, where the air is.
    const t = tMax * Math.pow((i + 1) / N, 2);
    const ds = t - prevT;
    const tm = (t + prevT) / 2;
    prevT = t;
    const px = vx * tm; const py = r0 + vy * tm; const pz = vz * tm;
    const r = Math.sqrt(px * px + py * py + pz * pz);
    const h = r - EARTH_R;
    const rhoR = Math.exp(-h / H_R);
    const rhoM = Math.exp(-h / H_M);
    const rhoO = Math.max(0, 1 - Math.abs(h - 25000) / 15000);
    for (let k = 0; k < 3; k++) odView[k] += (BETA_R[k] * rhoR + air.mie * 1.11 * rhoM + BETA_O[k] * rhoO) * ds;
    // Toward the light from this sample.
    const muL = (px * lx + py * ly) / r;
    if (hitsGround(r, muL)) continue;
    depthToTop(r, muL, 6, air.mie, odSun);
    for (let k = 0; k < 3; k++) {
      const tr = Math.exp(-(odView[k] + odSun[k]));
      const sR = BETA_R[k] * rhoR; const sM = air.mie * rhoM;
      // A little isotropic light stands in for the second bounce.
      out[k] += tr * (sR * (phaseR + 0.012) + sM * (phaseM + 0.008)) * ds;
    }
  }
  return out;
}

export const LUT_EL = 32;
export const LUT_AZ = 32;

/** Elevation of a LUT row: denser near the horizon. Row 0 is just under the horizon. */
export const lutElevation = (row: number) => {
  const v = row / (LUT_EL - 1);
  return -0.03 + (v * v) * (Math.PI / 2 + 0.03);
};

/** Light that has bounced more than once: blue, even, and what holds the
 *  colour of the sky after the direct light has left the upper air. Scaled
 *  from the brightest part of the single-scattered sky. */
const MS_TINT = [0.32, 0.55, 1];
export function multipleScattering(lightEl: number, air: AirParams): number {
  return luminance(skyRadiance(0.05, 0, lightEl, air)) * 0.2;
}

/** The dome for one light, as an RGB float table LUT_AZ × LUT_EL; azimuth runs 0…π away from the light.
 *  Rows `from`…`to` only, so a bake can be spread over frames. */
export function bakeSkyTable(lightEl: number, air: AirParams, out = new Float32Array(LUT_AZ * LUT_EL * 4), from = 0, to = LUT_EL, ms = multipleScattering(lightEl, air)): Float32Array {
  const rgb = [0, 0, 0];
  for (let j = from; j < to; j++) {
    const el = lutElevation(j);
    for (let i = 0; i < LUT_AZ; i++) {
      skyRadiance(el, (i / (LUT_AZ - 1)) * Math.PI, lightEl, air, rgb);
      const lift = ms * (0.65 + 0.35 * Math.sin(Math.max(0, el)));
      for (let c = 0; c < 3; c++) rgb[c] += lift * MS_TINT[c];
      const k = (j * LUT_AZ + i) * 4;
      out[k] = rgb[0]; out[k + 1] = rgb[1]; out[k + 2] = rgb[2]; out[k + 3] = 1;
    }
  }
  return out;
}

export const luminance = (c: ArrayLike<number>) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
