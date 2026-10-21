/**
 * The supernova. One press: a red giant's heartbeat quickens and the camera
 * closes in; it collapses to a point and the room goes dark and silent; it
 * detonates; the camera drifts into the nebula it leaves; out of the light at
 * the nebula's heart a capsule splits and the card comes forward, face up.
 *
 * Everything is a function of one clock, t, the seconds since the press. The
 * sky is drawn in WebGL (./shaders); the card is the page's own markup, moved
 * here through the elements SkychaserReveal marks with data-sn. The sound is
 * synthesized in the browser; nothing is loaded.
 *
 * The rarer the card, the longer the star struggles, the longer the silence
 * holds, the further it goes and the brighter the card turns.
 */
import type { Rarity } from '@/lib/rarity';
import { BAKE, BLUR, DOWN, FX, SCENE } from './shaders';

export type SupernovaHandle = {
  launch: () => void;
  skip: () => void;
  setSound: (on: boolean) => void;
  /** Stop drawing (off screen) or start again. */
  setPaused: (paused: boolean) => void;
  destroy: () => void;
};

export type SupernovaOptions = {
  rarity: Rarity;
  /** The rarity's colour, #rrggbb. */
  tone: string;
  reducedMotion: boolean;
  sound: boolean;
  onDone: () => void;
  /** The star before any press: it breathes on a slow heartbeat and waits. Used where no card is opened (the home print, the set page). */
  waiting?: boolean;
  /** Draw with no sky: the canvas is transparent and the light lies straight on the page behind it (the home page). */
  clear?: boolean;
  /** With `waiting`: instead of the heartbeat, one slow, even breath — the star grows and shrinks over a few seconds (the home page). */
  breathe?: boolean;
  /** Where the star sits, as a fraction of the box's height from the top. Defaults to the reveal's own placement. */
  centre?: number;
  /** Load the photographed remnant the blast leaves (the reveal only; a waiting star never detonates). */
  remnant?: boolean;
};

/** The photographed surface, seamless and grey: granulation, faculae, spots. The colour is the star's own. */
const PHOTOSPHERE = '/supernova/photosphere.webp';
/** Two remnants side by side: the young shock shell, then the filled nebula it becomes. */
const REMNANT = '/supernova/remnant.webp';

type Tier = {
  TI: number; hold: number; X: number; flash: number; white: number; flare: number; deb: number;
  neb: number; teal: number; rings: number; blur: number; push: number; hold2: number; em: number; fl: number;
};

// TI the struggle, hold the silence, X how far it goes, hold2 how long the nebula is held alone, em the card's approach, fl its turn.
const TIERS: Record<Rarity, Tier> = {
  common: { TI: 2.6, hold: 0.55, X: 0.85, flash: 1.3, white: 0.3, flare: 0.8, deb: 0.9, neb: 1.0, teal: 0.6, rings: 2, blur: 0.8, push: 1.32, hold2: 2.3, em: 2.4, fl: 0.85 },
  rare: { TI: 2.8, hold: 0.6, X: 1.0, flash: 1.55, white: 0.42, flare: 1.05, deb: 1.15, neb: 1.1, teal: 0.8, rings: 2, blur: 0.95, push: 1.38, hold2: 2.4, em: 2.5, fl: 0.9 },
  epic: { TI: 3.05, hold: 0.68, X: 1.15, flash: 1.9, white: 0.58, flare: 1.4, deb: 1.4, neb: 1.2, teal: 1.0, rings: 2, blur: 1.1, push: 1.45, hold2: 2.5, em: 2.55, fl: 0.95 },
  legendary: { TI: 3.4, hold: 0.8, X: 1.35, flash: 2.4, white: 0.78, flare: 1.9, deb: 1.7, neb: 1.32, teal: 1.2, rings: 2, blur: 1.25, push: 1.55, hold2: 2.65, em: 2.7, fl: 1.05 },
};
const TCOL = 0.5;
const BELL: Record<Rarity, number> = { common: 392, rare: 440, epic: 523.25, legendary: 587.33 };

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const ein = (x: number) => ((x = clamp(x)), x * x * x);
const ein2 = (x: number) => ((x = clamp(x)), x * x);
const eout = (x: number) => ((x = clamp(x)), 1 - Math.pow(1 - x, 3));
const eio = (x: number) => ((x = clamp(x)), x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const sm = (a: number, b: number, x: number) => {
  x = clamp((x - a) / (b - a));
  return x * x * (3 - 2 * x);
};

function times(p: Tier) {
  const TI = p.TI, TC = TI + TCOL, TB = TC + p.hold, TE = TB + p.hold2, TF = TE + p.em, TD = TF + p.fl;
  return { TI, TC, TB, TE, TF, TD };
}

/** The whole opening, start to the card face up, in seconds. */
export function supernovaLength(rarity: Rarity) {
  return times(TIERS[rarity]).TD;
}

type Beat = { t: number; a: number; s: number };
type Frame = {
  zoom: number; pan: [number, number]; dim: number; starR: number; heat: number; starI: number; wob: number;
  fa: number[]; fi: number[]; inH: number; inI: number; flash: number; flare: number;
  s1: number; s1i: number; s2: number; s2i: number; E: number; neb: number; nebHot: number; teal: number;
  deb: number; debI: number; core: number; blur: number; rays: number; ca: number; vig: number; white: number;
  shk: number; bloom: number; dof: number;
  prom: number; promH: number; remI: number; remMix: number; emb: number;
};

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function startSupernova(root: HTMLElement, opts: SupernovaOptions): SupernovaHandle {
  const p = TIERS[opts.rarity];
  const T = times(p);
  const tint = rgb(opts.tone);
  const q = <E extends HTMLElement>(k: string) => root.querySelector<E>(`[data-sn="${k}"]`);
  const cv = q<HTMLCanvasElement>('sky');
  const shake = q('shake');
  const wrap = q('wrap');
  const flip = q('flip');
  const burn = q('burn');
  const sheen = q('sheen');
  const halo = q('halo');
  const cap = q('cap');
  const seed = Math.random() * 50;

  // The star's heartbeat: each beat closer to the last, each throwing a flare off the limb.
  const beats: Beat[] = [];
  for (let tt = 0.35, gap = 0.66, i = 0; tt < p.TI - 0.12; tt += gap, gap = Math.max(0.11, gap * 0.76), i++) beats.push({ t: tt, a: 0, s: 0 });
  beats.forEach((b, i) => {
    b.a = ((i * 2.39996 + seed) % 6.283) - 3.14159;
    b.s = 0.45 + 0.55 * (i / beats.length);
  });
  const kick = (t: number, dec: number) => {
    let v = 0;
    for (const b of beats) {
      const k = t - b.t;
      if (k >= 0 && k < 1.5) v += Math.exp(-k / dec) * Math.min(1, k / 0.03) * b.s;
    }
    return v;
  };

  let t0: number | null = null;
  let done = false;
  let raf = 0;
  let dead = false;

  // ---------- WebGL ----------
  const gl = cv?.getContext('webgl', { antialias: false, alpha: !!opts.clear, premultipliedAlpha: !!opts.clear, powerPreference: 'high-performance' }) ?? null;
  type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
  let SP: Prog | null = null, PP: Prog | null = null, DP: Prog | null = null, BP: Prog | null = null;
  let tex: WebGLTexture | null = null, noise: WebGLTexture | null = null, qa: WebGLTexture | null = null, qb: WebGLTexture | null = null;
  let photo: WebGLTexture | null = null, rem: WebGLTexture | null = null;
  let fbo: WebGLFramebuffer | null = null, fa: WebGLFramebuffer | null = null, fb: WebGLFramebuffer | null = null;
  let W = 0, H = 0, CY = 0, BW = 0, BH = 0, QW = 0, QH = 0, Q = 0.75, frames = 0, acc = 0, last = 0;

  function program(src: string, names: string[]): Prog | null {
    if (!gl) return null;
    const mk = (type: number, s: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, s);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    const fs = mk(gl.FRAGMENT_SHADER, src);
    const pr = gl.createProgram();
    if (!vs || !fs || !pr) return null;
    gl.attachShader(pr, vs);
    gl.attachShader(pr, fs);
    gl.bindAttribLocation(pr, 0, 'p');
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    const u: Prog['u'] = {};
    names.forEach((n) => (u[n] = gl.getUniformLocation(pr, n)));
    return { p: pr, u };
  }
  function target(w: number, h: number, t: WebGLTexture | null, f: WebGLFramebuffer | null) {
    if (!gl) return;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  }
  if (gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // The noise, baked once.
    const bake = program(BAKE, ['uRes']);
    const NS = 1024;
    noise = gl.createTexture();
    const bf = gl.createFramebuffer();
    if (bake && noise && bf) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, noise);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, NS, NS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bf);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noise, 0);
      gl.viewport(0, 0, NS, NS);
      gl.useProgram(bake.p);
      gl.uniform2f(bake.u.uRes, NS, NS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.deleteFramebuffer(bf);
      gl.deleteProgram(bake.p);
    }
    SP = program(SCENE, ['uN', 'uPh', 'uRm', 'uHasPh', 'uHasRm', 'uProm', 'uPromH', 'uRemI', 'uRemMix', 'uEmb', 'uRes', 'uC', 'uPan', 'uTime', 'uSeed', 'uZoom', 'uStarDim', 'uStarR', 'uHeat', 'uStarI', 'uWob', 'uFA', 'uFI', 'uIn', 'uInI', 'uFlash', 'uFlare', 'uS1', 'uS1I', 'uS2', 'uS2I', 'uE', 'uNebI', 'uNebHot', 'uTeal', 'uDeb', 'uDebI', 'uCore', 'uTint']);
    PP = program(FX, ['uTex', 'uBl', 'uRes', 'uC', 'uBlur', 'uRays', 'uCA', 'uTime', 'uVig', 'uWhite', 'uBloom', 'uDof', 'uClear']);
    DP = program(DOWN, ['uTex', 'uTx']);
    BP = program(BLUR, ['uTex', 'uTx', 'uDir']);
    tex = gl.createTexture();
    qa = gl.createTexture();
    qb = gl.createTexture();
    fbo = gl.createFramebuffer();
    fa = gl.createFramebuffer();
    fb = gl.createFramebuffer();
  }
  const live = !!(gl && SP && PP && DP && BP && noise);
  root.dataset.nogl = live ? '0' : '1';

  /** A picture into a texture unit once it has loaded; until then the shader draws without it. */
  function picture(src: string, unit: number, wrap: number, onReady: (t: WebGLTexture) => void) {
    if (!live || !gl) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (dead || !gl) return;
      const t = gl.createTexture();
      if (!t) return;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.activeTexture(gl.TEXTURE0);
      onReady(t);
    };
    img.src = src;
  }
  if (gl) {
    picture(PHOTOSPHERE, 3, gl.REPEAT, (t) => (photo = t));
    if (opts.remnant) picture(REMNANT, 4, gl.CLAMP_TO_EDGE, (t) => (rem = t));
  }

  function size() {
    if (!cv) return;
    // Hold the sky to a pixel budget; slower devices drop further below.
    // A star that only waits is soft light: drawn at a little over half the pixels, the difference does not show.
    const idle = t0 === null && opts.waiting;
    let d = Math.min(2, window.devicePixelRatio || 1) * Q * (idle ? 0.6 : 1);
    if (W * H * d * d > 1.4e6) d = Math.sqrt(1.4e6 / (W * H));
    BW = Math.max(1, Math.round(W * d));
    BH = Math.max(1, Math.round(H * d));
    cv.width = BW;
    cv.height = BH;
    if (!live || !gl) return;
    gl.activeTexture(gl.TEXTURE0);
    target(BW, BH, tex, fbo);
    QW = Math.max(1, Math.round(BW / 4));
    QH = Math.max(1, Math.round(BH / 4));
    target(QW, QH, qa, fa);
    target(QW, QH, qb, fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // The sky and the card are laid out in the stage box, not the screen: during the flight the letterbox narrows it.
  const box = shake ?? root;
  function layout() {
    const r = box.getBoundingClientRect();
    W = r.width;
    H = r.height;
    const cw = Math.min(W * 0.62, H * 0.4, 330);
    CY = opts.centre != null ? H * opts.centre : Math.min(H * 0.42, (H - 210) / 2 + 30);
    root.style.setProperty('--sn-cw', `${cw}px`);
    root.style.setProperty('--sn-cy', `${CY}px`);
    size();
  }

  // ---------- the clock ----------
  function state(t: number, now: number): Frame {
    const R0 = 0.165;
    const S: Frame = {
      zoom: 1, pan: [0, 0], dim: 1, starR: R0 * (1 + 0.012 * Math.sin(now * 1.3)), heat: 0.16, starI: 1, wob: 0.025,
      fa: [0, 0, 0, 0], fi: [0, 0, 0, 0], inH: 0, inI: 0, flash: 0, flare: 0, s1: 0, s1i: 0, s2: 0, s2i: 0,
      E: 0.05, neb: 0, nebHot: 0, teal: 0, deb: 0, debI: 0, core: 0, blur: 0, rays: 0, ca: 0, vig: 0.35, white: 0, shk: 0, bloom: 0.4, dof: 0,
      prom: 0.6, promH: 1, remI: 0, remMix: 0, emb: 0,
    };
    if (t < 0) {
      if (opts.waiting && opts.breathe && !opts.reducedMotion) {
        // Breathing: one slow, even swell every 6 s — the star grows, warms and settles back.
        const sw = 0.5 - 0.5 * Math.cos((now * Math.PI * 2) / 6);
        S.starR = R0 * (0.94 + 0.16 * sw);
        S.heat = 0.16 + 0.08 * sw;
        S.starI = 0.95 + 0.3 * sw;
        S.wob = 0.03;
        S.rays = 0.06 + 0.12 * sw;
        S.bloom = 0.4 + 0.35 * sw;
        // The prominences stand taller on the swell, and each swell throws flares off the limb, one after another.
        S.prom = 0.5 + 0.45 * sw;
        S.promH = 0.85 + 0.35 * sw;
        for (let j = 0; j < 4; j++) {
          const off = 1.7 + j * 0.85, kk = (((now - off) % 6) + 6) % 6, cyc = Math.floor((now - off) / 6);
          S.fa[j] = (((cyc * 4 + j) * 2.39996 + seed) % 6.283) - 3.14159;
          S.fi[j] = [0.62, 0.42, 0.52, 0.34][j] * (0.6 + 0.4 * Math.abs(Math.sin(cyc * 12.9898 + j * 78.233))) * eout(kk / 0.35) * Math.exp(-kk / 1.5);
        }
      } else if (opts.waiting && !opts.reducedMotion) {
        // Waiting: a slow double heartbeat, every 3.4 s; the star swells, warms and throws a little light off its limb.
        const ph = now % 3.4, b = Math.exp(-Math.pow((ph - 0.25) / 0.11, 2)) + 0.55 * Math.exp(-Math.pow((ph - 0.62) / 0.12, 2));
        const swell = 0.5 + 0.5 * Math.sin(now * 0.55);
        S.starR = R0 * (1 + 0.012 * Math.sin(now * 1.3) + 0.1 * b + 0.035 * swell);
        S.heat = 0.17 + 0.14 * b + 0.05 * swell;
        S.starI = 1 + 0.55 * b + 0.12 * swell;
        S.wob = 0.03 + 0.06 * b;
        S.rays = 0.08 + 0.35 * b;
        S.bloom = 0.45 + 0.7 * b;
        S.fa[0] = ((Math.floor(now / 3.4) * 2.39996 + seed) % 6.283) - 3.14159;
        S.fi[0] = 0.55 * b;
      }
      return S;
    }
    if (t < T.TI) {
      const k = t / T.TI, bt = kick(t, 0.16);
      S.zoom = lerp(1, p.push, ein2(k) * 0.92);
      S.starR = R0 * (1 + 0.11 * bt * (0.5 + k) + 0.08 * sm(0.75, 1, k));
      S.heat = 0.16 + 0.4 * k * k + 0.1 * bt;
      S.wob = 0.025 + 0.18 * k * k + 0.08 * bt;
      S.starI = 1 + 0.25 * k + 0.35 * bt;
      beats.filter((b) => t >= b.t).slice(-4).forEach((b, i) => {
        const kk = t - b.t;
        S.fa[i] = b.a;
        S.fi[i] = b.s * eout(kk / 0.25) * Math.exp(-kk / 0.9);
      });
      S.shk = 0.25 * bt + 0.6 * k * k * k;
      S.prom = 0.7 + 0.7 * k + 0.3 * bt;
      S.promH = 1 + 0.5 * k;
      S.vig = 0.3 + 0.35 * k;
      S.rays = 0.22 * k * k;
      S.dim = 1 - 0.35 * k;
    } else if (t < T.TC) {
      const c = (t - T.TI) / TCOL, e = ein(c);
      S.zoom = lerp(p.push, p.push * 1.08, c);
      S.starR = Math.max(0.003, R0 * 1.06 * (1 - e));
      S.heat = lerp(0.5, 0.92, ein2(c));
      S.wob = 0.15 * (1 - c);
      S.starI = 1.1 + 2.4 * e;
      S.prom = 1.4 * (1 - e);
      S.promH = 1.5 * (1 - e);
      S.inH = lerp(0.62, 0, eout(c));
      S.inI = Math.sin(Math.PI * clamp(c * 1.1));
      S.core = 0.6 * e;
      S.vig = 0.65 + 0.25 * c;
      S.rays = 0.15 + 0.8 * e;
      S.dim = 0.65 - 0.5 * c;
      S.shk = 0.8 * (1 - c) + 0.6 * e;
    } else if (t < T.TB) {
      // The held breath: nothing but a point, and it flickers.
      const h = (t - T.TC) / p.hold;
      S.zoom = p.push * 1.08 + 0.02 * h;
      S.starI = 0;
      S.prom = 0;
      S.core = 0.35 + 0.2 * Math.sin(t * 70) * Math.sin(t * 23) + 0.25 * ein(h);
      S.vig = 0.9;
      S.dim = 0.12;
      S.rays = 0.6;
    } else {
      const k = t - T.TB, X = p.X;
      S.starI = 0;
      S.prom = 0;
      // The camera: thrown back by the blast, then drifting slowly into the nebula.
      S.zoom = lerp(0.78, 1, eout(k / 2.4)) + (p.push * 1.1 - 0.78) * Math.exp(-k / 0.05) + 0.08 * sm(1.6, 9, k);
      S.pan = [0.018 * Math.sin(k * 0.21) * sm(1, 4, k), 0.012 * Math.sin(k * 0.17 + 1) * sm(1, 4, k)];
      S.flash = p.flash * Math.min(1, k / 0.03) * Math.exp(-k / 0.34);
      S.white = p.white * Math.min(1, k / 0.02) * Math.exp(-k / 0.22);
      S.flare = p.flare * (Math.exp(-k / 0.65) * Math.min(1, k / 0.04)) + p.flare * 0.08 * sm(0.3, 1.2, k);
      S.s1 = X * 1.45 * eout(k / 1.5);
      S.s1i = Math.exp(-k / 0.6) * Math.min(1, k / 0.05);
      if (p.rings > 1) {
        const k2 = k - 0.32;
        if (k2 > 0) {
          S.s2 = X * 0.9 * eout(k2 / 1.7);
          S.s2i = 0.8 * Math.exp(-k2 / 0.75) * Math.min(1, k2 / 0.05);
        }
      }
      S.E = 0.06 + (0.3 + 0.1 * X) * eout(k / 3.2) + 0.005 * k;
      S.neb = p.neb * sm(0, 0.12, k) * (1.3 * Math.exp(-k / 1) + 0.52);
      S.nebHot = Math.exp(-k / 0.7);
      S.teal = p.teal * sm(0.8, 2.8, k);
      // The photographed remnant: the shock shell first, filling in to the nebula it becomes.
      S.remI = sm(0.04, 0.9, k) * (0.9 + 0.1 * p.X);
      S.remMix = sm(1.1, 4.8, k);
      S.deb = X * 1.1 * eout(k / 2);
      S.debI = p.deb * Math.exp(-k / 1.2) * Math.min(1, k / 0.05);
      S.blur = p.blur * Math.exp(-k / 0.55);
      S.ca = 0.018 * p.blur * Math.exp(-k / 0.35);
      S.rays = 0.9 * Math.exp(-k / 1.1) + 0.34;
      S.vig = lerp(0.9, 0.42, eout(k / 1.6));
      S.dim = lerp(0.1, 1, sm(0.1, 1.8, k));
      S.shk = 3.4 * X * Math.exp(-k / 0.38);
      S.bloom = 0.55 + 1.3 * Math.exp(-k / 0.7);
      // The core: bright after the blast, quiet while the nebula is held, swelling as the card comes out, a pulse as it turns.
      const kt = t - T.TE, kf = t - T.TF;
      const burst = Math.exp(-Math.pow((kf - 0.45 * p.fl) / 0.12, 2));
      // The birth: the core flares once more as the card leaves it.
      const born = Math.exp(-Math.pow(kt / 0.2, 2));
      S.core = 1.6 * Math.exp(-k / 0.35) + 0.4 + 0.05 * Math.sin(now * 8.2) + 0.9 * sm(-1.2, 0.3, kt) * (1 - sm(0.6, 2.2, kt)) + 1.9 * Math.exp(-Math.pow((kf - 0.45 * p.fl) / 0.14, 2)) + 1.2 * born;
      S.dof = 0.6 * sm(T.TE + p.em * 0.55, T.TF + p.fl * 0.6, t);
      // Embers drift out of the core once the card is born, and keep drifting while it is held.
      S.emb = sm(-0.6, 0.8, kt) * (0.7 + 0.3 * X);
      S.bloom += 0.5 * burst;
      S.rays *= 1 - 0.6 * S.dof;
      S.rays += (0.25 + (0.35 * p.flash) / 1.9) * burst + 0.25 * sm(0, 1, kt) * (1 - sm(1.5, 2.6, kt)) + 0.45 * born;
      S.white += 0.2 * X * burst * (opts.rarity === 'legendary' ? 1.6 : 1) + 0.1 * X * born;
      // The capsule splitting: a hard white flash and a jolt.
      const split = Math.exp(-Math.pow((kt - p.em * (C_CRACK + 0.04)) / 0.09, 2));
      S.white += 0.32 * split;
      S.core += 1.4 * split;
      S.rays += 0.5 * split;
      S.shk += 0.9 * burst + 0.4 * born + 1.6 * split;
      if (kf > 0.4 * p.fl && p.rings > 1) {
        const k3 = kf - 0.4 * p.fl;
        S.s2 = 0.06 + 0.6 * eout(k3 / 1.4);
        S.s2i = 0.55 * Math.exp(-k3 / 0.6) * Math.min(1, k3 / 0.04);
      }
    }
    return S;
  }

  function draw(S: Frame, now: number) {
    if (!live || !gl || !SP || !PP || !DP || !BP) return;
    const cy = BH * (1 - CY / H);
    const u = SP.u;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, BW, BH);
    gl.useProgram(SP.p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, noise);
    gl.uniform1i(u.uN, 1);
    gl.uniform2f(u.uRes, BW, BH);
    gl.uniform2f(u.uC, BW / 2, cy);
    gl.uniform2f(u.uPan, S.pan[0], S.pan[1]);
    gl.uniform1f(u.uTime, now % 1000);
    gl.uniform1f(u.uSeed, seed);
    gl.uniform1f(u.uZoom, S.zoom);
    gl.uniform1f(u.uStarDim, S.dim);
    gl.uniform1f(u.uStarR, S.starR);
    gl.uniform1f(u.uHeat, S.heat);
    gl.uniform1f(u.uStarI, S.starI);
    gl.uniform1f(u.uWob, S.wob);
    gl.uniform4fv(u.uFA, S.fa);
    gl.uniform4fv(u.uFI, S.fi);
    gl.uniform1f(u.uIn, S.inH);
    gl.uniform1f(u.uInI, S.inI);
    gl.uniform1f(u.uFlash, S.flash);
    gl.uniform1f(u.uFlare, S.flare);
    gl.uniform1f(u.uS1, S.s1);
    gl.uniform1f(u.uS1I, S.s1i);
    gl.uniform1f(u.uS2, S.s2);
    gl.uniform1f(u.uS2I, S.s2i);
    gl.uniform1f(u.uE, S.E);
    gl.uniform1f(u.uNebI, S.neb);
    gl.uniform1f(u.uNebHot, S.nebHot);
    gl.uniform1f(u.uTeal, S.teal);
    gl.uniform1f(u.uDeb, S.deb);
    gl.uniform1f(u.uDebI, S.debI);
    gl.uniform1f(u.uCore, S.core);
    gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, photo);
    gl.uniform1i(u.uPh, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, rem);
    gl.uniform1i(u.uRm, 4);
    gl.uniform1f(u.uHasPh, photo ? 1 : 0);
    gl.uniform1f(u.uHasRm, rem ? 1 : 0);
    gl.uniform1f(u.uProm, S.prom);
    gl.uniform1f(u.uPromH, S.promH);
    gl.uniform1f(u.uRemI, S.remI);
    gl.uniform1f(u.uRemMix, S.remMix);
    gl.uniform1f(u.uEmb, S.emb);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // A quarter-size, blurred copy: the bloom and the depth of field come from it.
    gl.viewport(0, 0, QW, QH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fa);
    gl.useProgram(DP.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(DP.u.uTex, 0);
    gl.uniform2f(DP.u.uTx, 1 / BW, 1 / BH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(BP.p);
    gl.uniform1i(BP.u.uTex, 0);
    gl.uniform2f(BP.u.uTx, 1 / QW, 1 / QH);
    const passes: [number, number][] = [[1.2, 0], [0, 1.2], [2.6, 0], [0, 2.6]];
    passes.forEach(([x, y], i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, i % 2 ? fa : fb);
      gl.bindTexture(gl.TEXTURE_2D, i % 2 ? qb : qa);
      gl.uniform2f(BP.u.uDir, x, y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    gl.viewport(0, 0, BW, BH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(PP.p);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, qa);
    gl.uniform1i(PP.u.uBl, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(PP.u.uTex, 0);
    gl.uniform2f(PP.u.uRes, BW, BH);
    gl.uniform2f(PP.u.uC, BW / 2, cy);
    gl.uniform1f(PP.u.uBloom, S.bloom);
    gl.uniform1f(PP.u.uClear, opts.clear ? 1 : 0);
    gl.uniform1f(PP.u.uDof, S.dof);
    gl.uniform1f(PP.u.uBlur, S.blur);
    gl.uniform1f(PP.u.uRays, S.rays);
    gl.uniform1f(PP.u.uCA, S.ca);
    gl.uniform1f(PP.u.uTime, now % 1000);
    gl.uniform1f(PP.u.uVig, S.vig);
    gl.uniform1f(PP.u.uWhite, clamp(S.white));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // A capsule leaves the core first (the first 55% of the approach), cracks along its seam, splits, and the card comes out of it.
  const C_ARRIVE = 0.55, C_CRACK = 0.7, C_OPEN = 0.9;
  function capsule(t: number, now: number) {
    if (!cap) return;
    const k = (t - T.TE) / p.em;
    if (k <= 0 || k >= 1.25) { cap.style.opacity = '0'; return; }
    const a = eio(clamp(k / C_ARRIVE));
    const sc = 1 / (1 + 16 * Math.pow(1 - a, 1.7));
    const cr = sm(C_ARRIVE - 0.02, C_CRACK, k);
    const co = eout(clamp((k - C_CRACK) / (C_OPEN - C_CRACK + 0.25)));
    const cf = sm(C_OPEN - 0.05, 1.15, k);
    const jit = cr * (1 - co) * 3.5;
    cap.style.opacity = (sm(0, 0.08, k) * (1 - cf)).toFixed(3);
    cap.style.setProperty('--cs', (sc * (1 + 0.06 * Math.sin(Math.PI * cr))).toFixed(4));
    cap.style.setProperty('--cz', `${(-14 * (1 - a) * Math.cos(k * 5) + Math.sin(now * 60) * jit).toFixed(2)}deg`);
    cap.style.setProperty('--cx', `${(Math.cos(now * 71) * jit).toFixed(2)}px`);
    cap.style.setProperty('--cr', cr.toFixed(3));
    cap.style.setProperty('--co', co.toFixed(3));
    cap.style.setProperty('--cf', cf.toFixed(3));
    cap.style.setProperty('--ch', (0.35 + 0.65 * a + 1.2 * cr * (1 - co)).toFixed(3));
  }

  function card(t: number, now: number) {
    if (!wrap || !flip) return;
    capsule(t, now);
    if (t < T.TE) {
      wrap.style.opacity = '0';
      if (halo) halo.style.opacity = '0';
      return;
    }
    // The card exists only once the capsule has split: it starts small inside it and comes forward.
    const k = clamp(((t - T.TE) / p.em - C_CRACK) / (1 - C_CRACK)), e = eio(k), kf = (t - T.TF) / p.fl;
    if ((t - T.TE) / p.em < C_CRACK) {
      wrap.style.opacity = '0';
      if (halo) halo.style.opacity = '0';
      return;
    }
    const s = 0.32 + 0.68 / (1 + 3 * Math.pow(1 - e, 1.6)) - 0.17 * (1 - e);
    const sway = 1 - e;
    // Face up from the moment it leaves the capsule: no sealed back, no turn.
    const ang = 180;
    const lift = kf > 0 && kf < 1 ? Math.sin(Math.PI * kf) * 0.05 : 0;
    const bob = Math.sin(now * 1.05) * 4 * sm(T.TD + 0.4, T.TD + 1.4, t);
    const op = sm(0, 0.18, k);
    wrap.style.opacity = op >= 0.999 ? '1' : op.toFixed(3);
    wrap.style.transform = `translateY(${(bob + 20 * sway).toFixed(2)}px) scale(${(s * (1 + lift)).toFixed(4)}) rotateZ(${(-7 * sway * Math.cos(k * 2.2)).toFixed(2)}deg)`;
    flip.style.transform = `rotateY(${(ang + 16 * sway * Math.sin(k * 2.6)).toFixed(2)}deg) rotateX(${(10 * sway).toFixed(2)}deg)`;
    if (burn) burn.style.opacity = (kf > 0 ? Math.exp(-Math.max(0, kf - 0.5) / 0.25) : 0).toFixed(3);
    if (sheen) sheen.style.setProperty('--sn-sx', `${lerp(160, -60, sm(0.85, 1.9, kf)).toFixed(1)}%`);
    if (halo) halo.style.opacity = ((0.35 + 0.45 * e) * sm(0, 0.3, k) * (1 + 0.6 * Math.exp(-Math.pow((kf - 0.45) / 0.2, 2)))).toFixed(3);
    if (!done && kf > 0.95) {
      done = true;
      opts.onDone();
    }
  }

  let paused = false;
  function frame(ms: number) {
    if (dead || paused) return;
    // Waiting, the star breathes over seconds: thirty frames a second is all it needs, and leaves the page the rest.
    const idle = t0 === null && opts.waiting;
    if (idle && last && ms - last < 30) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const now = ms / 1000;
    const t = t0 === null ? -1 : (ms - t0) / 1000;
    if (last) {
      acc += ms - last;
      if (++frames === 40) {
        const avg = acc / 40;
        if (avg > (idle ? 45 : 24) && Q > 0.42) {
          Q *= 0.82;
          size();
        } else if (avg < (idle ? 36 : 14) && Q < 0.9) {
          Q = Math.min(0.9, Q * 1.08);
          size();
        }
        frames = 0;
        acc = 0;
      }
    }
    last = ms;
    const S = state(t, now);
    draw(S, now);
    if (shake) shake.style.transform = S.shk > 0.01 ? `translate(${(Math.sin(now * 71) * S.shk * 4).toFixed(2)}px,${(Math.cos(now * 83) * S.shk * 4).toFixed(2)}px)` : '';
    card(t, now);
    raf = requestAnimationFrame(frame);
  }

  // ---------- sound ----------
  let AC: AudioContext | null = null, master: GainNode | null = null, verb: ConvolverNode | null = null, bus: GainNode | null = null;
  let soundOn = opts.sound;
  function audio() {
    if (AC) return AC;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    AC = new Ctor();
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.connect(AC.destination);
    master = AC.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    verb = AC.createConvolver();
    const len = Math.floor(AC.sampleRate * 4.5), ir = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.3);
    }
    verb.buffer = ir;
    const wet = AC.createGain();
    wet.gain.value = 0.55;
    verb.connect(wet);
    wet.connect(master);
    return AC;
  }
  function score() {
    const A = audio();
    if (!A || !master || !verb) return;
    void A.resume();
    const out = (g: AudioNode, send = 0) => {
      if (!bus || !verb) return;
      g.connect(bus);
      if (send) {
        const s = A.createGain();
        s.gain.value = send;
        g.connect(s);
        s.connect(verb);
      }
    };
    const noiseSrc = (sec: number) => {
      const b = A.createBuffer(1, Math.ceil(A.sampleRate * sec), A.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = A.createBufferSource();
      s.buffer = b;
      return s;
    };
    const tone = (f: number, t: number, dur: number, g: number, send = 0.4, type: OscillatorType = 'sine', att = 0.008) => {
      const o = A.createOscillator(), v = A.createGain();
      o.type = type;
      o.frequency.value = f;
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(g, t + att);
      v.gain.exponentialRampToValueAtTime(1e-4, t + dur);
      o.connect(v);
      out(v, send);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const thump = (t: number, g: number) => {
      const o = A.createOscillator(), v = A.createGain();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(g, t + 0.01);
      v.gain.exponentialRampToValueAtTime(1e-4, t + 0.5);
      o.connect(v);
      out(v, 0.2);
      o.start(t);
      o.stop(t + 0.6);
    };
    const filt = (type: BiquadFilterType, f0: number, t0f: number, f1: number, t1f: number, Qv = 1) => {
      const f = A.createBiquadFilter();
      f.type = type;
      f.Q.value = Qv;
      f.frequency.setValueAtTime(f0, t0f);
      f.frequency.exponentialRampToValueAtTime(f1, t1f);
      return f;
    };
    bus = A.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const T0 = A.currentTime + 0.02, X = p.X;
    const TI = T0 + T.TI, TC = T0 + T.TC, TB = T0 + T.TB, TE = T0 + T.TE, TF = T0 + T.TF;
    // The struggle: a rumble that rises, a heartbeat that quickens with the star's.
    const rb = noiseSrc(T.TC + 0.2), lp = filt('lowpass', 80, T0, 500, TI);
    const rg = A.createGain();
    rg.gain.setValueAtTime(0, T0);
    rg.gain.linearRampToValueAtTime(0.6, TI);
    rg.gain.linearRampToValueAtTime(0.25, TC - 0.05);
    rg.gain.linearRampToValueAtTime(0, TC);
    rb.connect(lp);
    lp.connect(rg);
    out(rg, 0.15);
    rb.start(T0);
    beats.forEach((b, i) => thump(T0 + b.t, 0.35 + 0.5 * (i / Math.max(1, beats.length - 1))));
    const dr = A.createOscillator();
    dr.type = 'sawtooth';
    dr.frequency.setValueAtTime(55, T0);
    dr.frequency.exponentialRampToValueAtTime(110, TC);
    const df = filt('lowpass', 120, T0, 900, TC);
    const dg = A.createGain();
    dg.gain.setValueAtTime(0, T0);
    dg.gain.linearRampToValueAtTime(0.09, TI);
    dg.gain.linearRampToValueAtTime(0.14, TC - 0.02);
    dg.gain.linearRampToValueAtTime(0, TC);
    dr.connect(df);
    df.connect(dg);
    out(dg, 0.3);
    dr.start(T0);
    dr.stop(TC + 0.05);
    // The collapse: air drawn in, rising to a cut; then the silence.
    const su = noiseSrc(TCOL + 0.1), bp = filt('bandpass', 300, TI, 7000, TC, 2);
    const ug = A.createGain();
    ug.gain.setValueAtTime(0.0001, TI);
    ug.gain.exponentialRampToValueAtTime(0.6, TC - 0.01);
    ug.gain.linearRampToValueAtTime(0, TC);
    su.connect(bp);
    bp.connect(ug);
    out(ug, 0.25);
    su.start(TI);
    tone(1760, TC, 0.9, 0.03, 0.9);
    tone(2093, TC + p.hold * 0.5, 0.5, 0.012, 0.9);
    // The detonation: a crack, a falling body of sound, a long tail in the room.
    const cr = noiseSrc(0.09), hp = A.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const cg = A.createGain();
    cg.gain.setValueAtTime(0.7 * X, TB);
    cg.gain.exponentialRampToValueAtTime(1e-4, TB + 0.09);
    cr.connect(hp);
    hp.connect(cg);
    out(cg, 0.7);
    cr.start(TB);
    const kk = A.createOscillator();
    kk.frequency.setValueAtTime(120, TB);
    kk.frequency.exponentialRampToValueAtTime(26, TB + 1.2);
    const kg = A.createGain();
    kg.gain.setValueAtTime(0, TB);
    kg.gain.linearRampToValueAtTime(1, TB + 0.01);
    kg.gain.exponentialRampToValueAtTime(1e-4, TB + 3 * X + 0.8);
    kk.connect(kg);
    out(kg, 0.3);
    kk.start(TB);
    kk.stop(TB + 5);
    const bn = noiseSrc(6), bl = filt('lowpass', 3000, TB, 140, TB + 3.2);
    const bg = A.createGain();
    bg.gain.setValueAtTime(0, TB);
    bg.gain.linearRampToValueAtTime(0.8 * X, TB + 0.02);
    bg.gain.exponentialRampToValueAtTime(1e-4, TB + 4 * X + 1);
    bn.connect(bl);
    bl.connect(bg);
    out(bg, 0.6);
    bn.start(TB);
    // The nebula: a warm open chord that blooms after the blast and holds.
    const base = BELL[opts.rarity];
    const pad = A.createGain();
    pad.gain.setValueAtTime(0, TB + 0.6);
    pad.gain.linearRampToValueAtTime(0.05, TB + 2.2);
    pad.gain.setValueAtTime(0.05, TF);
    pad.gain.exponentialRampToValueAtTime(1e-4, TF + 4);
    const pf = filt('lowpass', 500, TB + 0.6, 2200, TF);
    pf.connect(pad);
    out(pad, 0.8);
    [0.25, 0.375, 0.5, 0.75, 1.0].forEach((m, i) =>
      [0, 3].forEach((det) => {
        const o = A.createOscillator();
        o.type = i < 2 ? 'triangle' : 'sine';
        o.frequency.value = base * m;
        o.detune.value = det * (i % 2 ? 1 : -1);
        const g = A.createGain();
        g.gain.value = [0.9, 0.6, 0.5, 0.35, 0.2][i];
        o.connect(g);
        g.connect(pf);
        o.start(TB + 0.6);
        o.stop(TF + 4.2);
      }),
    );
    // The card coming forward: a rising breath.
    const rs = noiseSrc(p.em + 0.2), rf = filt('bandpass', 400, TE, 5500, TF, 3);
    const rgn = A.createGain();
    rgn.gain.setValueAtTime(0, TE);
    rgn.gain.linearRampToValueAtTime(0.09, TF - 0.05);
    rgn.gain.linearRampToValueAtTime(0, TF + 0.08);
    rs.connect(rf);
    rf.connect(rgn);
    out(rgn, 0.5);
    rs.start(TE);
    tone(base / 2, TE, p.em + 0.3, 0.05, 0.5, 'sine', p.em * 0.8);
    // The capsule: a creak as it cracks, a sharp metallic split.
    const TK = TE + p.em * (C_CRACK + 0.04);
    const ck = noiseSrc(0.3), ckf = filt('bandpass', 900, TK - 0.25, 4200, TK, 6);
    const ckg = A.createGain();
    ckg.gain.setValueAtTime(0, TK - 0.25);
    ckg.gain.linearRampToValueAtTime(0.12, TK - 0.02);
    ckg.gain.exponentialRampToValueAtTime(1e-4, TK + 0.05);
    ck.connect(ckf);
    ckf.connect(ckg);
    out(ckg, 0.4);
    ck.start(TK - 0.25);
    const sp = noiseSrc(0.12), sph = A.createBiquadFilter();
    sph.type = 'highpass';
    sph.frequency.value = 3000;
    const spg = A.createGain();
    spg.gain.setValueAtTime(0.55, TK);
    spg.gain.exponentialRampToValueAtTime(1e-4, TK + 0.12);
    sp.connect(sph);
    sph.connect(spg);
    out(spg, 0.6);
    sp.start(TK);
    tone(base * 4, TK, 1.2, 0.03, 0.8);
    tone(base * 5.4, TK, 0.8, 0.018, 0.8);
    thump(TK, 0.25);
    // The turn: a struck bell, the floor under it, and on the rarest a chord left hanging.
    const TT = TF + p.fl * 0.45;
    const partials: [number, number, number][] = [[1, 0.15, 3.8], [2.01, 0.07, 2.8], [2.76, 0.05, 2], [4.07, 0.03, 1.4], [5.4, 0.016, 1]];
    partials.forEach(([m, g, d]) => tone(base * m, TT, d * (0.8 + 0.3 * X), g * (0.7 + 0.4 * X), 0.7));
    thump(TT, 0.35);
    if (opts.rarity === 'epic' || opts.rarity === 'legendary') [1, 1.25, 1.5, 2].forEach((m, i) => tone(base * 2 * m, TT + 0.25 + i * 0.13, 3.6, 0.018, 0.9));
  }
  function hush() {
    if (AC && bus) {
      bus.gain.cancelScheduledValues(AC.currentTime);
      bus.gain.setTargetAtTime(0, AC.currentTime, 0.06);
    }
  }

  // ---------- the handle ----------
  function skip() {
    if (t0 === null || done) return;
    hush();
    t0 = performance.now() - (T.TD + 0.3) * 1000;
  }
  const onResize = () => layout();
  window.addEventListener('resize', onResize);
  const sized = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
  sized?.observe(box);
  layout();
  raf = requestAnimationFrame(frame);

  return {
    launch() {
      if (t0 !== null) return;
      if (soundOn && live && !opts.reducedMotion) score();
      t0 = performance.now();
      if (opts.reducedMotion || !live) skip();
    },
    skip,
    setPaused(on) {
      if (dead || on === paused) return;
      paused = on;
      cancelAnimationFrame(raf);
      if (!on) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    setSound(on) {
      soundOn = on;
      if (!on) hush();
    },
    destroy() {
      dead = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      sized?.disconnect();
      hush();
      if (AC) {
        const a = AC;
        window.setTimeout(() => void a.close().catch(() => undefined), 200);
      }
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
