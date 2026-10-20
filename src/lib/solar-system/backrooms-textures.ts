// Everything the Backrooms are papered with, drawn on canvas: the yellowed
// wallpaper with its faded chevron stripe, seams that do not quite meet and
// water coming through; the damp mustard loop carpet; the speckled ceiling
// tile; and one atlas of the small things — an outlet, somebody's arrows,
// stains, a dropped mission patch, a hole where a tile used to be.

import * as THREE from 'three';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
};

/** Fine per-pixel grain over whatever is there. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, rand: () => number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
}

function blot(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rand: () => number, rings = 3) {
  for (let k = 0; k < rings; k++) {
    const rr = r * (1 - k * 0.22) * (0.9 + rand() * 0.2);
    const grad = g.createRadialGradient(x, y, rr * 0.2, x, y, rr);
    grad.addColorStop(0, color);
    grad.addColorStop(0.75, color.replace(/[\d.]+\)$/, '0.04)'));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x + (rand() - 0.5) * r * 0.2, y + (rand() - 0.5) * r * 0.2, rr, rr * (0.7 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // A tide line at the edge.
  g.strokeStyle = color.replace(/[\d.]+\)$/, '0.22)');
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(x, y, r * 0.95, r * 0.8, rand(), 0, Math.PI * 2);
  g.stroke();
}

/** 512 wide = 1.06 m of wall, 1024 tall = floor to ceiling. */
export function wallpaperTexture(): THREE.CanvasTexture {
  const W = 512; const H = 1024;
  const { c, g } = canvas(W, H);
  const rand = rng(401);
  g.fillStyle = '#c9b574';
  g.fillRect(0, 0, W, H);
  // Two strips per tile; each strip: a pale ground, a faded stripe, and the chevron.
  for (let s = 0; s < 2; s++) {
    const x0 = s * (W / 2);
    const tone = s === 0 ? 0 : 2;
    g.fillStyle = `rgb(${205 + tone},${186 + tone},${118 + tone})`;
    g.fillRect(x0, 0, W / 2, H);
    g.fillStyle = 'rgba(160,138,70,0.08)';
    g.fillRect(x0 + 40, 0, 16, H);
    g.fillRect(x0 + W / 2 - 56, 0, 16, H);
    // Vertical chevrons down the middle of the strip, very faint.
    g.strokeStyle = 'rgba(150,126,58,0.16)';
    g.lineWidth = 4;
    const cx = x0 + W / 4;
    for (let y = -40; y < H + 40; y += 44) {
      g.beginPath();
      g.moveTo(cx - 44, y + 22);
      g.lineTo(cx, y);
      g.lineTo(cx + 44, y + 22);
      g.stroke();
    }
    g.strokeStyle = 'rgba(232,218,160,0.18)';
    g.lineWidth = 2;
    for (let y = -34; y < H + 40; y += 44) {
      g.beginPath();
      g.moveTo(cx - 44, y + 22);
      g.lineTo(cx, y);
      g.lineTo(cx + 44, y + 22);
      g.stroke();
    }
  }
  // The seams: a dark hairline and a lifted, lighter edge that has started to peel at the top.
  for (const sx of [0, W / 2]) {
    g.fillStyle = 'rgba(90,72,30,0.45)';
    g.fillRect(sx, 0, 2, H);
    g.fillStyle = 'rgba(240,228,180,0.35)';
    g.fillRect(sx + 2, 0, 2, H);
    g.fillStyle = 'rgba(70,55,22,0.35)';
    g.beginPath();
    g.moveTo(sx + 2, 0); g.lineTo(sx + 26, 0); g.lineTo(sx + 4, 90); g.closePath();
    g.fill();
  }
  // Water: down from the ceiling in long runs, and a tide mark along the skirting.
  for (let k = 0; k < 2; k++) {
    const x = rand() * W;
    const len = 120 + rand() * 420;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(110,86,36,0.16)');
    grad.addColorStop(1, 'rgba(110,86,36,0)');
    g.fillStyle = grad;
    g.fillRect(x - 6 - rand() * 18, 0, 12 + rand() * 30, len);
  }
  blot(g, rand() * W, 60 + rand() * 120, 50, 'rgba(120,92,40,0.1)', rand);
  const skirt = g.createLinearGradient(0, H - 110, 0, H);
  skirt.addColorStop(0, 'rgba(90,70,30,0)');
  skirt.addColorStop(0.7, 'rgba(90,70,30,0.16)');
  skirt.addColorStop(1, 'rgba(60,46,20,0.3)');
  g.fillStyle = skirt;
  g.fillRect(0, H - 110, W, 110);
  // The skirting board itself: the bottom 10 cm, a scuffed beige.
  g.fillStyle = '#a8966a';
  g.fillRect(0, H - 38, W, 38);
  g.fillStyle = 'rgba(60,48,24,0.5)';
  g.fillRect(0, H - 38, W, 2);
  grain(g, W, H, 14, rand);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

/** 512² = 1.5 m of carpet. */
export function carpetTexture(): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = canvas(S, S);
  const rand = rng(509);
  const img = g.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // The loops: a tight woven cell with a lot of random variation.
      const loop = (Math.sin(x * 1.9) * Math.sin(y * 1.9) + 1) * 0.5;
      const n = rand();
      const v = 0.78 + loop * 0.1 + (n - 0.5) * 0.36;
      d[i] = 150 * v; d[i + 1] = 124 * v; d[i + 2] = 64 * v; d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Worn tracks and flecks.
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rand() < 0.5 ? 'rgba(80,60,24,0.35)' : 'rgba(196,172,110,0.25)';
    g.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** One 0.6 m ceiling tile with its grid line. */
export function ceilingTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S, S);
  const rand = rng(613);
  g.fillStyle = '#d9cfa4';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 2200; k++) {
    g.fillStyle = rand() < 0.7 ? `rgba(120,104,60,${0.2 + rand() * 0.35})` : 'rgba(250,244,220,0.4)';
    const r = 0.6 + rand() * 1.4;
    g.beginPath();
    g.arc(rand() * S, rand() * S, r, 0, Math.PI * 2);
    g.fill();
  }
  // The T-bar grid between tiles.
  g.fillStyle = '#b9ab78';
  g.fillRect(0, 0, S, 6);
  g.fillRect(0, 0, 6, S);
  g.fillStyle = 'rgba(80,66,30,0.4)';
  g.fillRect(0, 6, S, 2);
  g.fillRect(6, 0, 2, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Large, soft damp: floor wet patches and ceiling stains, sampled at a big scale. */
export function dampTexture(): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = canvas(S, S);
  const rand = rng(719);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 9; k++) {
    const x = rand() * S; const y = rand() * S; const r = 12 + rand() * 40;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) blot(g, x + ox, y + oy, r, 'rgba(90,80,60,0.5)', rng(k * 7 + 1));
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export type DecalId = 'outlet' | 'arrow' | 'stainA' | 'stainB' | 'patch' | 'ceilingStain' | 'hole' | 'drip';
const SLOTS: Record<DecalId, [number, number]> = {
  outlet: [0, 0], arrow: [1, 0], stainA: [2, 0], stainB: [3, 0],
  patch: [0, 1], ceilingStain: [1, 1], hole: [2, 1], drip: [3, 1],
};
/** UV rectangle [u0, v0, u1, v1] of a decal in the atlas. */
export function decalUV(id: DecalId): [number, number, number, number] {
  const [sx, sy] = SLOTS[id];
  const pad = 2 / 1024;
  return [sx / 4 + pad, 1 - (sy + 1) / 2 + pad * 2, (sx + 1) / 4 - pad, 1 - sy / 2 - pad * 2];
}

export function decalAtlas(): THREE.CanvasTexture {
  const W = 1024; const H = 512; const T = 256;
  const { c, g } = canvas(W, H);
  const rand = rng(823);
  g.clearRect(0, 0, W, H);
  const at = (id: DecalId, draw: () => void) => {
    const [sx, sy] = SLOTS[id];
    g.save();
    g.translate(sx * T, sy * T);
    g.beginPath(); g.rect(0, 0, T, T); g.clip();
    draw();
    g.restore();
  };
  at('outlet', () => {
    g.fillStyle = '#ddd4bd';
    g.fillRect(78, 48, 100, 160);
    g.strokeStyle = 'rgba(80,70,50,0.6)'; g.lineWidth = 3;
    g.strokeRect(78, 48, 100, 160);
    for (const y of [78, 142]) {
      g.fillStyle = '#e9e2cf';
      g.beginPath(); g.ellipse(128, y + 16, 30, 26, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a241a';
      g.fillRect(112, y + 4, 6, 18); g.fillRect(138, y + 4, 6, 18);
      g.beginPath(); g.arc(128, y + 32, 5, Math.PI, 0); g.fill();
    }
    g.fillStyle = '#6d6250';
    g.beginPath(); g.arc(128, 128, 4, 0, Math.PI * 2); g.fill();
  });
  at('arrow', () => {
    // Marker on wallpaper, drawn fast by someone who meant it: a shaft and a head, twice over.
    g.strokeStyle = 'rgba(92,28,20,0.86)';
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = 13 - pass * 4;
      const j = () => (rand() - 0.5) * 7;
      g.beginPath();
      g.moveTo(30 + j(), 128 + j());
      g.bezierCurveTo(90, 120 + j(), 150, 134 + j(), 212 + j(), 126 + j());
      g.moveTo(160 + j(), 78 + j());
      g.lineTo(216 + j(), 127 + j());
      g.lineTo(158 + j(), 176 + j());
      g.stroke();
    }
  });
  at('stainA', () => blot(g, 128, 128, 108, 'rgba(96,74,34,0.55)', rand, 4));
  at('stainB', () => {
    blot(g, 110, 80, 70, 'rgba(70,56,26,0.5)', rand, 3);
    blot(g, 160, 170, 60, 'rgba(90,70,30,0.45)', rand, 3);
  });
  at('patch', () => {
    // A mission patch that is not anyone's: a dark disc, a gold ring, a four-point star over a crescent.
    g.fillStyle = '#1b2438';
    g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#d6a64a'; g.lineWidth = 12;
    g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#e8e2d0';
    g.beginPath(); g.arc(118, 146, 44, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b2438';
    g.beginPath(); g.arc(136, 134, 42, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f2c86a';
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 - Math.PI / 2; const r = k % 2 ? 9 : 34; g.lineTo(150 + Math.cos(a) * r, 92 + Math.sin(a) * r); }
    g.fill();
    g.strokeStyle = 'rgba(40,30,20,0.35)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(40, 190); g.lineTo(90, 170); g.stroke();
  });
  at('ceilingStain', () => blot(g, 128, 128, 112, 'rgba(120,94,40,0.6)', rand, 5));
  at('hole', () => {
    g.fillStyle = '#0c0a07';
    g.fillRect(4, 4, T - 8, T - 8);
    // Insulation hanging down at one edge.
    g.fillStyle = 'rgba(160,140,100,0.5)';
    for (let k = 0; k < 40; k++) g.fillRect(4 + rand() * (T - 8), 4 + rand() * 30, 3 + rand() * 8, 3 + rand() * 20);
  });
  at('drip', () => {
    const grad = g.createLinearGradient(0, 0, 0, T);
    grad.addColorStop(0, 'rgba(100,78,34,0.6)');
    grad.addColorStop(1, 'rgba(100,78,34,0)');
    g.fillStyle = grad;
    for (let k = 0; k < 6; k++) g.fillRect(60 + rand() * 130, 0, 4 + rand() * 14, 80 + rand() * 170);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
