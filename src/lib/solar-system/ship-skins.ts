// Liveries: the paint a hull flies in. Every skin works on every ship kind.
// A skin recolours the ship's own materials (hull, trim, accents, window
// glow, the drive's flame) and, for the patterned ones, lays a small
// canvas-drawn tile over the hull's light paint. The tile is projected in
// the hull's own space, so the baked panel lines and dirt still show
// through. Pattern tiles are drawn once and shared by every ship; changing
// a skin only writes uniforms and colours, nothing is rebuilt.

import * as THREE from 'three';
import type { ShipParts } from '@/lib/solar-system/ship-mesh';
import { DEFAULT_SKIN, SKINS, type Pattern, type SkinId } from '@/lib/solar-system/skin-catalog';

export { DEFAULT_SKIN, SKIN_IDS, SKINS, defaultSkinFor, isSkinId, skinOr, type Skin, type SkinId } from '@/lib/solar-system/skin-catalog';

// ── Pattern tiles: drawn once, shared, repeat-wrapped. ──

const TILE = 128;
const tiles = new Map<string, THREE.Texture>();

function tileTexture(key: string, draw: ((g: CanvasRenderingContext2D, n: number) => void) | null): THREE.Texture {
  const have = tiles.get(key);
  if (have) return have;
  let tex: THREE.Texture;
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const g = canvas?.getContext('2d') ?? null;
  if (draw && canvas && g) {
    canvas.width = canvas.height = TILE;
    draw(g, TILE);
    tex = new THREE.CanvasTexture(canvas);
  } else {
    // No pattern, or no 2D canvas (a test's DOM): one white texel.
    tex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  tiles.set(key, tex);
  return tex;
}

/** A small seeded random, so every client draws the same camo. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shape drawn nine times round the tile, so it wraps without a seam. */
function wrapped(n: number, fn: (dx: number, dy: number) => void) {
  for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) fn(dx, dy);
}

const DRAW: Record<Pattern, (g: CanvasRenderingContext2D, n: number) => void> = {
  pinstripe(g, n) {
    g.fillStyle = '#1b1d21';
    g.fillRect(0, 0, n, n);
    // Faceted panels, a shade apart, and a thin red line round them.
    g.fillStyle = '#23262b';
    g.fillRect(0, 0, n / 2, n / 2);
    g.fillRect(n / 2, n / 2, n / 2, n / 2);
    g.fillStyle = '#ff2233';
    g.fillRect(0, n * 0.48, n, 3);
    g.fillRect(n * 0.7, 0, 2, n);
  },
  grid(g, n) {
    const grad = g.createLinearGradient(0, 0, 0, n);
    grad.addColorStop(0, '#2a0b46');
    grad.addColorStop(0.5, '#160634');
    grad.addColorStop(1, '#2a0b46');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#ff2bd6';
    g.fillRect(0, 0, n, 4);
    g.fillRect(0, n / 2, n, 2);
    g.fillStyle = '#21f0ff';
    g.fillRect(0, 0, 4, n);
    g.fillRect(n / 2, 0, 2, n);
  },
  camo(g, n) {
    g.fillStyle = '#eef2f5';
    g.fillRect(0, 0, n, n);
    const rand = seeded(7);
    for (const [col, count, size] of [['#c3ccd4', 9, 0.2], ['#8796a6', 7, 0.15], ['#5b6876', 5, 0.1]] as const) {
      g.fillStyle = col;
      for (let i = 0; i < count; i++) {
        const x = rand() * n;
        const y = rand() * n;
        const r = (0.5 + rand()) * size * n;
        const lobes = 3 + Math.floor(rand() * 3);
        const off = Array.from({ length: lobes }, () => [(rand() - 0.5) * r * 1.4, (rand() - 0.5) * r]);
        wrapped(n, (dx, dy) => {
          for (const [ox, oy] of off) {
            g.beginPath();
            g.ellipse(x + dx + ox, y + dy + oy, r, r * 0.6, 0.4, 0, Math.PI * 2);
            g.fill();
          }
        });
      }
    }
  },
  aurora(g, n) {
    const grad = g.createLinearGradient(0, 0, n, 0);
    grad.addColorStop(0, '#19d3c5');
    grad.addColorStop(0.35, '#3b82f6');
    grad.addColorStop(0.65, '#8b5cf6');
    grad.addColorStop(1, '#19d3c5');
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
    // Soft curtains running across it.
    g.globalAlpha = 0.28;
    g.fillStyle = '#b8fff4';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      for (let x = 0; x <= n; x += 4) {
        const y = n * (0.2 + i * 0.3) + Math.sin((x / n) * Math.PI * 2 + i) * n * 0.08;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineTo(n, n * (0.26 + i * 0.3));
      g.lineTo(0, n * (0.26 + i * 0.3));
      g.fill();
    }
    g.globalAlpha = 1;
  },
  georgia(g, n) {
    // The five-cross flag as a tile: the broad St George's cross and a
    // bolnur-katskhuri cross in each quarter.
    g.fillStyle = '#fafafa';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#e3141b';
    const w = n * 0.14;
    g.fillRect((n - w) / 2, 0, w, n);
    g.fillRect(0, (n - w) / 2, n, w);
    const c = n * 0.25;
    for (const [cx, cy] of [[c, c], [n - c, c], [c, n - c], [n - c, n - c]]) {
      const arm = n * 0.09;
      const t = n * 0.035;
      g.fillRect(cx - t / 2, cy - arm, t, arm * 2);
      g.fillRect(cx - arm, cy - t / 2, arm * 2, t);
    }
  },
  carbon(g, n) {
    // A 2x2 twill: each cell a tow of fibre, lit across its width.
    const cell = n / 4;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const across = (i + j) % 2 === 0;
        const grad = across
          ? g.createLinearGradient(i * cell, 0, (i + 1) * cell, 0)
          : g.createLinearGradient(0, j * cell, 0, (j + 1) * cell);
        grad.addColorStop(0, '#1b1c20');
        grad.addColorStop(0.5, '#43464e');
        grad.addColorStop(1, '#1b1c20');
        g.fillStyle = grad;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
  },
  hazard(g, n) {
    g.fillStyle = '#ffcc00';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#151515';
    // Two diagonal bands per tile, drawn wrapped so the stripes run on.
    wrapped(n, (dx, dy) => {
      for (const k of [0, 0.5]) {
        g.beginPath();
        g.moveTo(dx + k * n, dy);
        g.lineTo(dx + (k + 0.25) * n, dy);
        g.lineTo(dx + (k + 0.25) * n - n, dy + n);
        g.lineTo(dx + k * n - n, dy + n);
        g.fill();
      }
    });
  },
};

export const patternTexture = (p: Pattern | undefined): THREE.Texture => tileTexture(p ?? 'plain', p ? DRAW[p] : null);

// ── The hull shader hook. ──

/** Which materials of a ship a skin paints, and how. */
export interface PaintTargets {
  /** Painted through the hull hook. */
  hull: THREE.MeshStandardMaterial[];
  /** Dark panels: their colour multiplied by the skin's trim. */
  trim: THREE.MeshStandardMaterial[];
  /** Coloured flashes: take the skin's accent colour. */
  accent: THREE.MeshStandardMaterial[];
  /** Windows and lamps: their glow tinted. */
  lamp: THREE.MeshStandardMaterial[];
  /** Hull length in the hull materials' own space, for the pattern's scale. */
  unit: number;
  /** Hull maps carry baked paint (model ships): paint only their light parts.
   *  Otherwise the material colour is the paint, all of it. */
  baked: boolean;
}

interface HullUniforms {
  uSkinOn: { value: number };
  uSkinPaint: { value: THREE.Color };
  uSkinTrim: { value: THREE.Color };
  uSkinAccent: { value: THREE.Color };
  uSkinSheen: { value: THREE.Color };
  uSkinGlow: { value: number };
  uSkinPat: { value: THREE.Texture };
  uSkinScale: { value: number };
  /** Paint mask from luminance (lo, hi) and the luminance that reads as full paint. */
  uSkinMask: { value: THREE.Vector3 };
}

const hooks = new WeakMap<THREE.Material, HullUniforms>();

const VERT_HEAD = 'varying vec3 vSkinPos;\nvarying vec3 vSkinN;';
const FRAG_HEAD = `varying vec3 vSkinPos;
varying vec3 vSkinN;
uniform float uSkinOn;
uniform vec3 uSkinPaint;
uniform vec3 uSkinTrim;
uniform vec3 uSkinAccent;
uniform vec3 uSkinSheen;
uniform float uSkinGlow;
uniform sampler2D uSkinPat;
uniform float uSkinScale;
uniform vec3 uSkinMask;`;
// After the maps and emissive are read, before the lights: light paint takes
// the skin's colour (times the pattern), dark panels the trim, saturated
// flashes the accent; the baked shading stays as a multiplier.
const FRAG_BODY = `#include <emissivemap_fragment>
if (uSkinOn > 0.5) {
  vec3 base = diffuseColor.rgb;
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float mx = max(base.r, max(base.g, base.b));
  float mn = min(base.r, min(base.g, base.b));
  float flash = smoothstep(0.45, 0.7, (mx - mn) / max(mx, 0.001)) * step(0.04, mx);
  float paintMask = smoothstep(uSkinMask.x, uSkinMask.y, lum) * (1.0 - flash);
  vec3 an = abs(vSkinN);
  vec2 puv = (an.x > an.y && an.x > an.z) ? vSkinPos.zy : ((an.y > an.z) ? vSkinPos.zx : vSkinPos.xy);
  vec3 pat = texture2D(uSkinPat, puv * uSkinScale).rgb;
  float detail = clamp(lum / uSkinMask.z, 0.0, 1.25);
  vec3 painted = pat * uSkinPaint * detail;
  float graze = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
  painted = mix(painted, uSkinSheen * detail, graze * step(0.001, dot(uSkinSheen, vec3(1.0))));
  vec3 c = mix(base * uSkinTrim, painted, paintMask);
  diffuseColor.rgb = mix(c, uSkinAccent * (0.35 + 0.65 * mx), flash);
  totalEmissiveRadiance += uSkinGlow * pat * paintMask;
}`;

function hook(mat: THREE.MeshStandardMaterial): HullUniforms {
  let u = hooks.get(mat);
  if (u) return u;
  u = {
    uSkinOn: { value: 0 },
    uSkinPaint: { value: new THREE.Color(1, 1, 1) },
    uSkinTrim: { value: new THREE.Color(1, 1, 1) },
    uSkinAccent: { value: new THREE.Color(1, 1, 1) },
    uSkinSheen: { value: new THREE.Color(0, 0, 0) },
    uSkinGlow: { value: 0 },
    uSkinPat: { value: patternTexture(undefined) },
    uSkinScale: { value: 1 },
    uSkinMask: { value: new THREE.Vector3(0.12, 0.35, 0.5) },
  };
  const uniforms = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPos = position;\nvSkinN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <emissivemap_fragment>', FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'shipskin';
  mat.needsUpdate = true;
  hooks.set(mat, u);
  return u;
}

/** The hook's uniforms on a material, if it has been painted (tests, debugging). */
export const skinUniforms = (mat: THREE.Material) => hooks.get(mat) as Readonly<HullUniforms> | undefined;

// ── Factory values, so a skin can always be taken off again. ──

interface Base {
  color: THREE.Color;
  emissive: THREE.Color;
  metalness: number;
  roughness: number;
}
const bases = new WeakMap<THREE.Material, Base>();

function base(mat: THREE.MeshStandardMaterial): Base {
  let b = bases.get(mat);
  if (!b) {
    b = { color: mat.color.clone(), emissive: mat.emissive.clone(), metalness: mat.metalness, roughness: mat.roughness };
    bases.set(mat, b);
  }
  return b;
}

/** The material was reloaded (a model's hull copied in): its factory look is what it is now. */
export function rebaseSkin(mat: THREE.Material) {
  bases.delete(mat);
}

const tmp = new THREE.Color();
const driveBases = new WeakMap<ShipParts, THREE.Color>();

/** Paints a ship. Cheap: colours and uniforms only, so it can run on a skin
 *  change mid-flight. A model hull that arrives later is painted when it
 *  lands (ship-mesh calls this again with `parts.skin`). */
export function applySkin(parts: ShipParts, id: SkinId) {
  const skin = SKINS[id] ?? SKINS[DEFAULT_SKIN];
  const on = skin.id !== 'factory';
  parts.skin = skin.id;
  const t = parts.paint;
  if (t) {
    for (const m of t.hull) {
      const b = base(m);
      const u = hook(m);
      u.uSkinOn.value = on ? 1 : 0;
      u.uSkinPaint.value.setHex(skin.paint);
      u.uSkinTrim.value.setHex(skin.trim);
      u.uSkinAccent.value.setHex(skin.accent);
      if (skin.sheen !== undefined) u.uSkinSheen.value.setHex(skin.sheen).multiplyScalar(skin.sheenAmt ?? 1);
      else u.uSkinSheen.value.setRGB(0, 0, 0);
      u.uSkinGlow.value = skin.glow ?? 0;
      u.uSkinPat.value = patternTexture(skin.pattern);
      u.uSkinScale.value = (skin.repeats ?? 1) / Math.max(1e-6, t.unit);
      if (t.baked) u.uSkinMask.value.set(0.12, 0.35, 0.5);
      else u.uSkinMask.value.set(-1, 0, Math.max(0.05, b.color.r * 0.2126 + b.color.g * 0.7152 + b.color.b * 0.0722));
      m.metalness = on ? skin.metal : b.metalness;
      m.roughness = on ? skin.rough : b.roughness;
    }
    for (const m of t.trim) {
      const b = base(m);
      m.color.copy(b.color);
      if (on) m.color.multiply(tmp.setHex(skin.trim));
    }
    for (const m of t.accent) {
      const b = base(m);
      if (on) {
        m.color.setHex(skin.accent);
        m.emissive.setHex(skin.accent);
      } else {
        m.color.copy(b.color);
        m.emissive.copy(b.emissive);
      }
    }
    for (const m of t.lamp) {
      const b = base(m);
      m.emissive.copy(b.emissive);
      if (on) m.emissive.multiply(tmp.setHex(skin.lamp));
    }
  }
  // The drive: core, plume haze, plume core and the glow sprites.
  if (parts.plumeMat) {
    let d = driveBases.get(parts);
    if (!d) {
      d = parts.engineMat.emissive.clone();
      driveBases.set(parts, d);
    }
    const drive = on && skin.drive ? tmp.setHex(skin.drive) : tmp.copy(d);
    parts.engineMat.emissive.copy(drive);
    parts.plumeMat.color.copy(drive).multiplyScalar(1.5);
    if (parts.plumeCoreMat) parts.plumeCoreMat.color.copy(plumeCore(drive));
    for (const g of parts.glowMats) g.color.copy(parts.plumeMat.color);
  }
}

// Same as ship-mesh's plumeCoreColor, without the allocation.
const white = new THREE.Color(0.95, 0.98, 1.0);
const coreTmp = new THREE.Color();
function plumeCore(drive: THREE.Color): THREE.Color {
  return coreTmp.copy(drive).lerp(white, 0.72).multiplyScalar(2.6);
}

/** The bolt colour a skin suggests, as an HDR colour for a bloom pass. */
export function skinBoltColor(id: SkinId, out = new THREE.Color()): THREE.Color {
  return out.setHex(SKINS[id]?.bolt ?? SKINS.factory.bolt).multiplyScalar(2.4);
}
