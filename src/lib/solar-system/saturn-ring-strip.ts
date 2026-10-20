import * as THREE from 'three';

let cached: THREE.CanvasTexture | null = null;

/**
 * Radial color+alpha strip encoding Saturn's real ring structure, sampled by
 * radius across the ring mesh: D (faint) → C (translucent) → B (bright,
 * opaque) → Cassini Division → A with the Encke and Keeler gaps → F (thin
 * bright thread). Fine-grained noise adds the ringlet banding Cassini saw.
 *
 * Shared by the ring plane shader and by Saturn's surface material (the ring
 * shadow on the globe samples the same alpha), so it is cached for the page.
 */
export const SATURN_RING_INNER = 1.11;
export const SATURN_RING_OUTER = 2.33;

export function getSaturnRingStripTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const W = 1024;
  const H = 16;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  const img = ctx.createImageData(W, H);
  // Band lookup: [rIn, rOut, r, g, b, alpha]
  const bands: [number, number, number, number, number, number][] = [
    [1.110, 1.236, 150, 135, 120, 0.05],  // D ring
    [1.239, 1.526, 168, 146, 122, 0.30],  // C ring
    [1.526, 1.951, 232, 214, 184, 0.94],  // B ring — brightest
    [1.951, 2.027, 130, 118, 100, 0.10],  // Cassini Division
    [2.027, 2.211, 214, 196, 164, 0.78],  // A ring (inner)
    [2.217, 2.261, 208, 190, 158, 0.72],  // A ring (mid) — Encke gap before
    [2.265, 2.269, 200, 184, 152, 0.66],  // A ring (outer edge) — Keeler gap before
    [2.320, 2.328, 240, 228, 205, 0.42],  // F ring — thin bright thread
  ];
  for (let x = 0; x < W; x++) {
    const R = SATURN_RING_INNER + (x / W) * (SATURN_RING_OUTER - SATURN_RING_INNER);
    let cr = 0, cg = 0, cb = 0, ca = 0;
    for (const [ri, ro, r, g, b, a] of bands) {
      if (R >= ri && R <= ro) {
        const t = (R - ri) / (ro - ri);
        // Slight inner-to-outer shading within each band.
        const shade = 0.92 + 0.08 * Math.sin(t * Math.PI);
        cr = r * shade; cg = g * shade; cb = b * shade; ca = a;
        break;
      }
    }
    // Ringlet noise — fine radial brightness striations.
    if (ca > 0.02) {
      const n = 0.86 + 0.14 * Math.sin(x * 0.9) * Math.sin(x * 0.23 + 1.7) + (Math.random() - 0.5) * 0.1;
      cr *= n; cg *= n; cb *= n;
      ca *= 0.9 + (Math.random() - 0.5) * 0.16;
    }
    for (let y = 0; y < H; y++) {
      const i = (y * W + x) * 4;
      img.data[i] = Math.min(255, cr);
      img.data[i + 1] = Math.min(255, cg);
      img.data[i + 2] = Math.min(255, cb);
      img.data[i + 3] = Math.min(255, Math.round(ca * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cached = tex;
  return tex;
}

/** The orrery is going away: free this renderer's copy of the strip and drop
 *  the dispose listener its renderer hung on the shared texture, which would
 *  otherwise keep that renderer reachable for the life of the page. The
 *  canvas stays; the next renderer uploads it again. */
export function releaseSaturnRingStripTexture() {
  cached?.dispose();
}
