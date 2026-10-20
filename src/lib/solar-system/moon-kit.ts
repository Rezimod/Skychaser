// The outpost's parts bin: one palette of materials, a few small drawn
// textures, and the helpers every procedural builder on the surface uses.
// Sharing them is the point — the base, the rover and the props then reuse
// the same shader programs and batch into the same buckets.
//
// Palette: lunar grey, off-white shells, thermal blankets, foil, carbon and
// anodised equipment, small amber work lights, small cool status lights.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type Canvas2D = CanvasRenderingContext2D;

function canvasTexture(w: number, h: number, draw: (ctx: Canvas2D) => void, srgb: boolean, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** A normal map from a height function on a canvas-sized grid. */
function normalFrom(size: number, height: (x: number, y: number) => number, strength: number): THREE.CanvasTexture {
  return canvasTexture(size, size, (ctx) => {
    const img = ctx.createImageData(size, size);
    const h = (x: number, y: number) => height(((x % size) + size) % size, ((y % size) + size) % size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
        const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false, true);
}

export interface Materials {
  shell: THREE.MeshStandardMaterial;
  shellDusty: THREE.MeshStandardMaterial;
  blanket: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  silver: THREE.MeshStandardMaterial;
  alu: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  anodised: THREE.MeshStandardMaterial;
  carbon: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  radiator: THREE.MeshStandardMaterial;
  solar: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  hazard: THREE.MeshStandardMaterial;
  orange: THREE.MeshStandardMaterial;
  regolith: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  cool: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  work: THREE.MeshStandardMaterial;
}

export interface Kit {
  mat: Materials;
  /** A plaque or marking: dark mono lettering on a board, cached by content. */
  label: (lines: string[], opts?: { w?: number; h?: number; bg?: string; fg?: string; px?: number; emissive?: number }) => THREE.MeshStandardMaterial;
  /** Stellar's mark: a four-point star beside the wordmark. */
  logo: THREE.MeshStandardMaterial;
  mesh: <G extends THREE.BufferGeometry>(parent: THREE.Object3D, g: G, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh<G, THREE.Material>;
  box: (parent: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  rbox: (parent: THREE.Object3D, w: number, h: number, d: number, r: number, m: THREE.Material, x?: number, y?: number, z?: number) => THREE.Mesh;
  /** A cylinder standing on Y. */
  cyl: (parent: THREE.Object3D, rTop: number, rBottom: number, h: number, m: THREE.Material, x?: number, y?: number, z?: number, seg?: number) => THREE.Mesh;
  /** A cylinder lying along X or Z. */
  cylX: (parent: THREE.Object3D, r: number, len: number, m: THREE.Material, x?: number, y?: number, z?: number, seg?: number) => THREE.Mesh;
  cylZ: (parent: THREE.Object3D, r: number, len: number, m: THREE.Material, x?: number, y?: number, z?: number, seg?: number) => THREE.Mesh;
  /** A round bar from one point to another. */
  strut: (parent: THREE.Object3D, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, m: THREE.Material) => THREE.Mesh;
  /** A pipe or cable along points, in the parent's frame. */
  tube: (parent: THREE.Object3D, pts: [number, number, number][], r: number, m: THREE.Material, segments?: number) => THREE.Mesh;
  /** The segment count to use for round things: fewer on phones. */
  seg: (n: number) => number;
  geometries: THREE.BufferGeometry[];
  dispose: () => void;
}

const UP = new THREE.Vector3(0, 1, 0);

export function makeKit(lite: boolean): Kit {
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const std = (p: THREE.MeshStandardMaterialParameters) => { const m = new THREE.MeshStandardMaterial(p); owned.push(m); return m; };
  const track = <T extends THREE.Texture>(t: T) => { textures.push(t); return t; };

  // Quilted multi-layer insulation: stitched diamonds, puffed between seams.
  const quilt = track(normalFrom(128, (x, y) => {
    const u = (x / 128) * 4; const v = (y / 128) * 4;
    const a = Math.abs(((u + v) % 1) - 0.5); const b = Math.abs(((u - v + 8) % 1) - 0.5);
    return Math.min(a, b) * 2.2 + (Math.sin(x * 1.7) * Math.cos(y * 2.3)) * 0.02;
  }, 3.2));
  quilt.repeat.set(3, 3);
  // Panel lines on hard shells: a square panel grid with a rivet row.
  const panels = track(normalFrom(128, (x, y) => {
    const gx = x % 64; const gy = y % 64;
    const seam = gx < 2 || gy < 2 ? -1 : 0;
    const rivet = (gx === 6 || gx === 58) && gy % 10 === 5 ? 0.6 : 0;
    return seam + rivet;
  }, 1.4));
  panels.repeat.set(2, 2);
  // Radiator fins.
  const fins = track(normalFrom(64, (x) => Math.sin((x / 64) * Math.PI * 16) * 0.5, 2.5));
  fins.repeat.set(2, 1);
  // Photovoltaic cells: a dark blue grid with silver busbars.
  const cells = track(canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = '#0c1526'; ctx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111d34' : '#0f1a2f';
      ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    }
    ctx.fillStyle = 'rgba(190,200,215,0.35)';
    for (let x = 0; x < 8; x++) ctx.fillRect(x * 16 + 7, 0, 1, 128);
  }, true, true));
  // Hazard stripes for edges, steps and the pad.
  const stripes = track(canvasTexture(64, 64, (ctx) => {
    ctx.fillStyle = '#d9a21a'; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#16181b';
    for (let i = -64; i < 128; i += 24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 12, 0); ctx.lineTo(i + 76, 64); ctx.lineTo(i + 64, 64); ctx.fill(); }
  }, true, true));
  // Scuffs: regolith worked into the lower edge of everything that stands in it.
  const grime = track(canvasTexture(128, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, '#8d877d'); g.addColorStop(0.35, '#c9c6bf'); g.addColorStop(1, '#ecebe7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const y = 128 - Math.pow(Math.random(), 2.2) * 128;
      ctx.fillStyle = `rgba(120,114,104,${0.08 + Math.random() * 0.14})`;
      ctx.fillRect(Math.random() * 128, y, 1 + Math.random() * 3, 1);
    }
  }, true, false));

  const mat: Materials = {
    shell: std({ color: 0xe8e6e0, roughness: 0.55, metalness: 0.05, normalMap: panels, normalScale: new THREE.Vector2(0.35, 0.35) }),
    shellDusty: std({ color: 0xffffff, map: grime, roughness: 0.72, metalness: 0.04, normalMap: panels, normalScale: new THREE.Vector2(0.3, 0.3) }),
    blanket: std({ color: 0xdcd9d1, roughness: 0.92, metalness: 0, normalMap: quilt, normalScale: new THREE.Vector2(0.55, 0.55) }),
    gold: std({ color: 0xc99a2e, roughness: 0.38, metalness: 0.9, normalMap: quilt, normalScale: new THREE.Vector2(0.4, 0.4) }),
    silver: std({ color: 0xb6bac0, roughness: 0.34, metalness: 0.85, normalMap: quilt, normalScale: new THREE.Vector2(0.35, 0.35) }),
    alu: std({ color: 0xa7abb1, roughness: 0.38, metalness: 0.85 }),
    steel: std({ color: 0x70757c, roughness: 0.45, metalness: 0.8 }),
    anodised: std({ color: 0x4b5058, roughness: 0.5, metalness: 0.65 }),
    carbon: std({ color: 0x1d2024, roughness: 0.62, metalness: 0.25 }),
    rubber: std({ color: 0x141517, roughness: 0.95, metalness: 0 }),
    deck: std({ color: 0x55595f, roughness: 0.7, metalness: 0.45, normalMap: panels, normalScale: new THREE.Vector2(0.5, 0.5) }),
    radiator: std({ color: 0xeff1f3, roughness: 0.32, metalness: 0.25, normalMap: fins, normalScale: new THREE.Vector2(0.8, 0.8) }),
    solar: std({ map: cells, roughness: 0.22, metalness: 0.55, color: 0xffffff }),
    glass: (() => { const g = new THREE.MeshPhysicalMaterial({ color: 0x8fa6b8, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.45, clearcoat: 1 }); owned.push(g); return g; })(),
    hazard: std({ map: stripes, roughness: 0.7, metalness: 0.05 }),
    orange: std({ color: 0xc4602c, roughness: 0.6, metalness: 0.05 }),
    regolith: std({ color: 0x8f8b84, roughness: 1, metalness: 0 }),
    cable: std({ color: 0x191b1e, roughness: 0.75, metalness: 0.1 }),
    amber: std({ color: 0x2a1a06, emissive: new THREE.Color(0xffb347), emissiveIntensity: 2.2, roughness: 0.4 }),
    cool: std({ color: 0x06141c, emissive: new THREE.Color(0x7fd8ff), emissiveIntensity: 1.6, roughness: 0.4 }),
    red: std({ color: 0x220606, emissive: new THREE.Color(0xff3b2e), emissiveIntensity: 1.6, roughness: 0.4 }),
    green: std({ color: 0x062210, emissive: new THREE.Color(0x4dff88), emissiveIntensity: 1.4, roughness: 0.4 }),
    screen: std({ color: 0x06202a, emissive: new THREE.Color(0x5eead4), emissiveIntensity: 0.9, roughness: 0.3 }),
    work: std({ color: 0x30281c, emissive: new THREE.Color(0xfff1d6), emissiveIntensity: 2.4, roughness: 0.4 }),
  };

  const labels = new Map<string, THREE.MeshStandardMaterial>();
  const label: Kit['label'] = (lines, opts = {}) => {
    const w = opts.w ?? 256; const h = opts.h ?? 128;
    const key = `${lines.join('\n')}|${w}|${h}|${opts.bg}|${opts.fg}|${opts.px}|${opts.emissive}`;
    const hit = labels.get(key);
    if (hit) return hit;
    const px = opts.px ?? Math.round(h / (lines.length * 1.6));
    const tex = track(canvasTexture(w, h, (ctx) => {
      ctx.fillStyle = opts.bg ?? '#ecebe6'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = opts.fg ?? '#15181d';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `600 ${px}px "JetBrains Mono", ui-monospace, monospace`;
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * px * 1.3));
    }, true));
    const m = std({ map: tex, roughness: 0.65, metalness: 0, ...(opts.emissive ? { emissiveMap: tex, emissive: new THREE.Color(0xffffff), emissiveIntensity: opts.emissive } : {}) });
    labels.set(key, m);
    return m;
  };

  const logoTex = track(canvasTexture(512, 128, (ctx) => {
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = '#e9e7e1'; ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#c8741f';
    ctx.beginPath();
    const cx = 64; const cy = 64;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
      const r = k % 2 === 0 ? 46 : 11;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.fill();
    ctx.fillStyle = '#171a1f';
    ctx.textBaseline = 'middle';
    ctx.font = '600 58px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText('STELLAR', 128, 68);
  }, true));
  const logo = std({ map: logoTex, roughness: 0.6, metalness: 0 });

  const mesh: Kit['mesh'] = (parent, g, m, x = 0, y = 0, z = 0) => {
    geometries.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const seg = (n: number) => Math.max(6, Math.round(lite ? n * 0.6 : n));
  const tmp = new THREE.Vector3();

  const kit: Kit = {
    mat, label, logo, mesh, seg, geometries,
    box: (p, w, h, d, m, x, y, z) => mesh(p, new THREE.BoxGeometry(w, h, d), m, x, y, z),
    rbox: (p, w, h, d, r, m, x, y, z) => mesh(p, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), m, x, y, z),
    cyl: (p, rt, rb, h, m, x, y, z, s = 16) => mesh(p, new THREE.CylinderGeometry(rt, rb, h, seg(s)), m, x, y, z),
    cylX: (p, r, len, m, x, y, z, s = 16) => { const o = mesh(p, new THREE.CylinderGeometry(r, r, len, seg(s)), m, x, y, z); o.rotation.z = Math.PI / 2; return o; },
    cylZ: (p, r, len, m, x, y, z, s = 16) => { const o = mesh(p, new THREE.CylinderGeometry(r, r, len, seg(s)), m, x, y, z); o.rotation.x = Math.PI / 2; return o; },
    strut(p, ax, ay, az, bx, by, bz, r, m) {
      tmp.set(bx - ax, by - ay, bz - az);
      const len = tmp.length();
      const o = mesh(p, new THREE.CylinderGeometry(r, r, len, seg(8)), m, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      o.quaternion.setFromUnitVectors(UP, tmp.normalize());
      return o;
    },
    tube(p, pts, r, m, segments = 24) {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
      const o = mesh(p, new THREE.TubeGeometry(curve, segments, r, seg(8), false), m);
      o.castShadow = false;
      return o;
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of owned) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
  return kit;
}
