// The barred-spiral galaxy model, and the painted disk drawn from it. Kept
// free of three and of the DOM so the painting — some hundred thousand
// splats, the better part of a second on an integrated laptop — can run in a
// worker (galaxy-paint.worker.ts) while the game keeps drawing.

/** A canvas 2D context on the page or in a worker. */
export type Paint2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * A galaxy's structure, in the terms astronomers describe one: how tightly the
 * arms wind, how many there are, how long the bar is, where the star-forming
 * ring sits. Both the painted disk texture and the 3D star volume are built
 * from the same model so the glow and the resolved stars trace the same arms —
 * drawn from two unrelated formulas, as they were, they cancelled into mush.
 */
export interface SpiralModel {
  /** Log-spiral pitch angle. The Milky Way winds at ~14°, Andromeda's Sb disk
   *  at ~8.5° — that difference, plus M31's much higher inclination, is most
   *  of why the two read as different galaxies and not the same one twice. */
  pitchDeg: number;
  arms: number;
  /** Relative surface brightness per arm. The Milky Way has two major arms
   *  (Perseus, Scutum–Centaurus) and two minor ones between them. */
  armWeight: number[];
  /** Central bar half-length as a fraction of the disk radius, and its angle. */
  barFraction: number;
  barAngleDeg: number;
  /** Bulge radius as a fraction of the disk radius. */
  bulge: number;
  /** Fraction of stars belonging to the bulge rather than the disk. */
  bulgeShare: number;
  /** Star-forming annulus radius (Andromeda's 10 kpc "ring of fire"). */
  ringAt?: number;
  hiiChance: number;
}

/** Milky Way: SBbc, four arms off a bar inclined ~27° to the Sun–centre line. */
export const MILKY_WAY_MODEL: SpiralModel = {
  pitchDeg: 14,
  arms: 4,
  // Perseus and Scutum–Centaurus carry most of the light; Sagittarius–Carina
  // and Norma are the minor pair between them.
  armWeight: [1, 0.35, 1, 0.35],
  barFraction: 0.2,
  barAngleDeg: 27,
  bulge: 0.13,
  bulgeShare: 0.16,
  hiiChance: 0.05,
};

/** Andromeda: Sb, tightly wound, big bulge, and the 10 kpc star-forming ring
 *  that dominates every infrared image of it. */
export const ANDROMEDA_MODEL: SpiralModel = {
  pitchDeg: 8.5,
  arms: 2,
  armWeight: [1, 0.9],
  barFraction: 0.05,
  barAngleDeg: 0,
  bulge: 0.19,
  bulgeShare: 0.24,
  ringAt: 0.64,
  hiiChance: 0.06,
};

/** Ridge longitude of arm `i` at radius `r`: the log spiral θ = θ₀ + ln(r/r₀)·cot(p). */
export function armLongitude(m: SpiralModel, arm: number, r: number, R: number): number {
  const cot = 1 / Math.tan((m.pitchDeg * Math.PI) / 180);
  return (arm * Math.PI * 2) / m.arms + Math.log(Math.max(r, R * 0.06) / (R * 0.18)) * cot;
}

export function pickArm(m: SpiralModel): number {
  const total = m.armWeight.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < m.armWeight.length; i++) {
    roll -= m.armWeight[i];
    if (roll <= 0) return i;
  }
  return 0;
}

/** Sum of three uniforms — a cheap gaussian, mean 0, range ±1.5. */
export function gauss(): number {
  return Math.random() + Math.random() + Math.random() - 1.5;
}

/**
 * The painted disk under the star volume: bulge, bar, arm splats, blue arm
 * ridges, pink HII, and dark dust lanes multiplied along the inner edge of
 * every arm — the lanes are what make a rendered spiral read as photographic
 * rather than as a swirl of dots.
 *
 * Painted upside down, so the image can go to the GPU as an ImageBitmap —
 * which three never flips — and come out the same way up as a canvas would.
 * It is pure 2D-canvas work with no three in it, so a worker can run it.
 */
export function paintSpiralGalaxy(ctx: Paint2D, m: SpiralModel, lite: boolean, size: number) {
  ctx.save();
  ctx.setTransform(1, 0, 0, -1, 0, size);
  const mid = size / 2;
  const R = size * 0.47;
  const barAngle = (m.barAngleDeg * Math.PI) / 180;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const toCanvas = (r: number, theta: number): [number, number] => [
    mid + Math.cos(theta) * r,
    mid + Math.sin(theta) * r,
  ];

  // Bulge — the luminous heart, warm and steeply peaked.
  const bulgeR = R * (m.bulge * 2.6);
  const bg = ctx.createRadialGradient(mid, mid, 0, mid, mid, bulgeR);
  bg.addColorStop(0, 'rgba(255,246,222,0.98)');
  bg.addColorStop(0.08, 'rgba(255,226,168,0.82)');
  bg.addColorStop(0.26, 'rgba(255,186,104,0.34)');
  bg.addColorStop(0.6, 'rgba(180,168,190,0.09)');
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Bar — an elongated glow through the centre at its real position angle.
  if (m.barFraction > 0.08) {
    ctx.save();
    ctx.translate(mid, mid);
    ctx.rotate(barAngle);
    ctx.scale(1, 0.3);
    const barR = R * m.barFraction * 1.5;
    const barGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, barR);
    barGrad.addColorStop(0, 'rgba(255,232,182,0.72)');
    barGrad.addColorStop(0.55, 'rgba(255,204,132,0.30)');
    barGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = barGrad;
    ctx.fillRect(-barR, -barR, barR * 2, barR * 2);
    ctx.restore();
  }

  // Arm splats. Radius is drawn from an exponential disk so the arms are
  // dense where the galaxy is bright, and each splat's own scatter widens
  // outward, which is what gives the arms their frayed outer ends.
  const armSplats = lite ? 22000 : 62000;
  for (let i = 0; i < armSplats; i++) {
    const arm = pickArm(m);
    const rNorm = Math.min(0.99, 0.1 + Math.pow(Math.random(), 0.62) * 0.92);
    const r = rNorm * R;
    const sigma = (0.09 + 0.4 * rNorm) * 0.55;
    const scatter = gauss() * sigma;
    const theta = armLongitude(m, arm, r, R) + scatter;
    const [x, y] = toCanvas(r, theta);
    const ridge = Math.abs(scatter) < sigma * 0.5;
    const fade = 1 - rNorm * 0.72;
    if (ridge && Math.random() < 0.34) {
      // Young blue stars trace the ridge line itself.
      ctx.fillStyle = `rgba(178,206,255,${0.36 * fade + 0.05})`;
    } else {
      const warm = Math.floor(214 - 40 * rNorm);
      ctx.fillStyle = `rgba(${warm + 26},${warm},${Math.floor(170 + 60 * rNorm)},${0.3 * fade + 0.04})`;
    }
    ctx.fillRect(x, y, 2.1, 2.1);
  }

  // Star-forming ring, where the model has one.
  if (m.ringAt != null) {
    for (let i = 0; i < (lite ? 4000 : 14000); i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = R * (m.ringAt + gauss() * 0.028);
      const [x, y] = toCanvas(r, theta);
      ctx.fillStyle = `rgba(184,208,255,${0.16 + Math.random() * 0.24})`;
      ctx.fillRect(x, y, 1.7, 1.7);
    }
  }

  // HII regions — soft pink glows loosely scattered along the arms.
  for (let i = 0; i < (lite ? 40 : 120); i++) {
    const arm = pickArm(m);
    const rNorm = 0.28 + Math.random() * 0.66;
    const r = rNorm * R;
    const theta = armLongitude(m, arm, r, R) + gauss() * 0.05;
    const [x, y] = toCanvas(r, theta);
    const rad = size * (0.004 + Math.random() * 0.006);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(255,152,176,0.42)');
    grad.addColorStop(0.55, 'rgba(255,112,144,0.16)');
    grad.addColorStop(1, 'rgba(255,80,110,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Dust lanes — dark cloud on the inner (concave) edge of each arm, where a
  // density wave piles gas up before it forms stars.
  ctx.globalCompositeOperation = 'multiply';
  const dustSplats = lite ? 12000 : 34000;
  for (let i = 0; i < dustSplats; i++) {
    const arm = pickArm(m);
    const rNorm = 0.12 + Math.pow(Math.random(), 0.55) * 0.82;
    const r = rNorm * R;
    const sigma = (0.07 + 0.26 * rNorm) * 0.5;
    // The lane leads the ridge by a small, radius-independent angle.
    const theta = armLongitude(m, arm, r, R) - 0.17 + gauss() * sigma;
    const [x, y] = toCanvas(r, theta);
    const a = 0.5 - rNorm * 0.34;
    ctx.fillStyle = `rgba(24,14,20,${a})`;
    ctx.fillRect(x, y, 1.7, 1.7);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Fade the rim to transparent so the disk has no cut circular edge.
  ctx.globalCompositeOperation = 'destination-in';
  const rim = ctx.createRadialGradient(mid, mid, R * 0.62, mid, mid, R * 1.02);
  rim.addColorStop(0, 'rgba(0,0,0,1)');
  rim.addColorStop(0.72, 'rgba(0,0,0,0.55)');
  rim.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
