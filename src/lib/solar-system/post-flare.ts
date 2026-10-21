// The screen-space passes both post chains share (moon-post.ts for the
// surfaces, post-processing.ts for flight): the Sun's light shafts, its lens
// flare, and the colour grade. Pure shaders, no lens-dirt texture, no
// dependency beyond three's Pass. Each one is driven by where the Sun is on
// the screen this frame (`setSun`), and each fades itself out — and stops
// drawing altogether, so a preset without it pays nothing — when the Sun is
// behind the camera.
//
// Order in a chain: Render → god rays (HDR, before bloom, so the shafts
// bloom too) → Bloom → lens flare (HDR, additive) → Output (tone map) →
// grade (LDR) → the surfaces' film pass. The flare reads the tone-mapped-
// to-be HDR buffer at the Sun's own pixel to know how much of the disc is
// showing — behind a planet, a hill or the ship, it goes with it.

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { QualityLevel } from '@/game/quality';

/** Where the Sun is on the screen, in texture space (0…1, y up). */
export interface SunScreen {
  x: number;
  y: number;
  /** In front of the camera and inside the frustum (with the margin below). */
  visible: boolean;
  /** 1 well inside the frame, falling to 0 across the margin outside it. */
  edge: number;
}

/** How far outside the frame, in texture units, the Sun still counts: the
 *  flare's ghosts trail a Sun that has just left the glass, and the fade
 *  keeps the moment it leaves from being a cut. */
export const SUN_EDGE_MARGIN = 0.25;

const _clip = new THREE.Vector4();

function finishProjection(out: SunScreen): SunScreen {
  if (_clip.w <= 1e-6) {
    out.x = 0.5; out.y = 0.5; out.visible = false; out.edge = 0;
    return out;
  }
  const nx = _clip.x / _clip.w;
  const ny = _clip.y / _clip.w;
  out.x = nx * 0.5 + 0.5;
  out.y = ny * 0.5 + 0.5;
  const outside = Math.max(0, Math.abs(nx) - 1, Math.abs(ny) - 1) * 0.5;
  out.edge = 1 - THREE.MathUtils.smoothstep(outside, 0, SUN_EDGE_MARGIN);
  out.visible = outside < SUN_EDGE_MARGIN;
  return out;
}

function syncCamera(camera: THREE.Camera) {
  // The renderer refreshes these inside render(); the feed runs just before
  // it, after the scene moved the camera, so it does the same.
  camera.updateMatrixWorld();
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
}

/** A Sun at a point in the world (flight: the origin). */
export function projectSunPoint(point: THREE.Vector3, camera: THREE.Camera, out: SunScreen): SunScreen {
  syncCamera(camera);
  _clip.set(point.x, point.y, point.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  return finishProjection(out);
}

/** A Sun at infinity along a direction (the surfaces: the DirectionalLight).
 *  A direction has w = 0, so its clip-space w is just its view depth. */
export function projectSunDirection(dir: THREE.Vector3, camera: THREE.Camera, out: SunScreen): SunScreen {
  syncCamera(camera);
  _clip.set(dir.x, dir.y, dir.z, 0).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  return finishProjection(out);
}

/** What every sun-driven pass takes each frame. */
export interface SunFeed {
  setSun: (x: number, y: number, visible: boolean, strength: number) => void;
}

export interface SunPassHandle extends SunFeed {
  pass: Pass;
  setEnabled: (on: boolean) => void;
  setQuality: (level: QualityLevel) => void;
  dispose: () => void;
}

/** Bloom per preset. The threshold stays above every lit planet surface
 *  (planet-textures.ts clips them at 0.78) so only the Sun, the engines and
 *  the emissive props glow; what the presets buy is how far the glow reaches. */
export function bloomFor(level: QualityLevel, kind: 'surface' | 'flight'): { strength: number; radius: number; threshold: number } {
  if (kind === 'surface') {
    if (level === 'ultra') return { strength: 0.55, radius: 0.75, threshold: 0.9 };
    if (level === 'high') return { strength: 0.45, radius: 0.7, threshold: 0.9 };
    return { strength: 0.35, radius: 0.6, threshold: 0.9 };
  }
  if (level === 'ultra') return { strength: 0.6, radius: 0.8, threshold: 0.85 };
  if (level === 'high') return { strength: 0.5, radius: 0.75, threshold: 0.85 };
  return { strength: 0.4, radius: 0.7, threshold: 0.85 };
}

/** Radial-blur taps per pixel for the light shafts. */
export function godRaySamples(level: QualityLevel): number {
  return level === 'ultra' ? 64 : level === 'high' ? 48 : 32;
}

/** Ghosts in the lens flare. */
export function flareGhosts(level: QualityLevel): number {
  return level === 'ultra' || level === 'high' ? 6 : 4;
}

const VERTEX = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** How quickly a pass follows the Sun in and out, per second. */
const SUN_EASE = 10;

/** The Sun-driven passes: an eased strength, a first frame that always
 *  draws (so the warm-up compiles the programs), and a skip that leaves
 *  the composer's buffers alone when there is nothing to add. */
abstract class SunPass extends Pass {
  protected strength = 0;
  protected target = 0;
  protected sun = new THREE.Vector2(0.5, 0.5);
  protected warmed = false;
  protected width = 1;
  protected height = 1;

  setSun(x: number, y: number, visible: boolean, strength: number) {
    this.sun.set(x, y);
    this.target = visible ? THREE.MathUtils.clamp(strength, 0, 1) : 0;
  }

  /** The eased strength this frame; whether the pass should draw at all. */
  protected advance(dt: number): boolean {
    this.strength += (this.target - this.strength) * (1 - Math.exp(-dt * SUN_EASE));
    if (this.target === 0 && this.strength < 0.002) this.strength = 0;
    const draw = this.strength > 0 || !this.warmed;
    this.warmed = true;
    // Skipped, the composer must not swap: the next pass reads what this
    // one would have passed through.
    this.needsSwap = draw;
    return draw;
  }

  /** The eased strength, for tests and the overlay. */
  get sunStrength() { return this.strength; }
}

/* ─────────────────────────────── god rays ─────────────────────────────── */

const RAY_MASK_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec2 uSun; uniform vec2 uTexel; uniform float uAspect;
  uniform float uThreshold; uniform float uRadius;
  varying vec2 vUv;
  void main() {
    // A 2×2 box at the quarter-res texel keeps the mask from shimmering.
    vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-0.5, -0.5)).rgb
           + texture2D(tDiffuse, vUv + uTexel * vec2( 0.5, -0.5)).rgb
           + texture2D(tDiffuse, vUv + uTexel * vec2(-0.5,  0.5)).rgb
           + texture2D(tDiffuse, vUv + uTexel * vec2( 0.5,  0.5)).rgb;
    c *= 0.25;
    float peak = max(c.r, max(c.g, c.b));
    // Only what is over the threshold, and only near the Sun: an engine on
    // the other side of the glass is not a source of sunbeams.
    float bright = smoothstep(uThreshold, uThreshold + 1.5, peak);
    vec2 d = (vUv - uSun) * vec2(uAspect, 1.0);
    float near = 1.0 - smoothstep(0.0, uRadius, length(d));
    gl_FragColor = vec4(c * bright * near, 1.0);
  }`;

const RAY_BLUR_FRAG = /* glsl */ `
  uniform sampler2D tMask; uniform vec2 uSun; uniform float uDensity; uniform float uDecay; uniform float uWeight;
  varying vec2 vUv;
  void main() {
    vec2 step = (uSun - vUv) * uDensity / float(SAMPLES);
    vec2 uv = vUv;
    float illum = 1.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < SAMPLES; i++) {
      uv += step;
      acc += texture2D(tMask, uv).rgb * illum;
      illum *= uDecay;
    }
    gl_FragColor = vec4(acc * uWeight, 1.0);
  }`;

const RAY_COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse; uniform sampler2D tRays; uniform float uIntensity; uniform vec3 uTint;
  varying vec2 vUv;
  void main() {
    vec3 scene = texture2D(tDiffuse, vUv).rgb;
    vec3 rays = texture2D(tRays, vUv).rgb * uTint;
    gl_FragColor = vec4(scene + rays * uIntensity, 1.0);
  }`;

/** Light shafts: a thresholded, Sun-centred mask at quarter resolution,
 *  radially blurred toward the Sun and added back in HDR. */
export class GodRaysPass extends SunPass {
  private samples: number;
  private readonly scale = 0.25;
  private readonly rtMask = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  private readonly rtRays = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  readonly maskMaterial: THREE.ShaderMaterial;
  readonly blurMaterial: THREE.ShaderMaterial;
  readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(samples: number) {
    super();
    this.samples = samples;
    this.rtMask.texture.name = 'GodRaysPass.mask';
    this.rtRays.texture.name = 'GodRaysPass.rays';
    this.maskMaterial = new THREE.ShaderMaterial({
      name: 'GodRaysMask',
      uniforms: {
        tDiffuse: { value: null }, uSun: { value: this.sun }, uTexel: { value: new THREE.Vector2(1, 1) },
        uAspect: { value: 1 }, uThreshold: { value: 1.0 }, uRadius: { value: 0.55 },
      },
      vertexShader: VERTEX, fragmentShader: RAY_MASK_FRAG, depthTest: false, depthWrite: false,
    });
    this.blurMaterial = new THREE.ShaderMaterial({
      name: 'GodRaysBlur',
      defines: { SAMPLES: samples },
      uniforms: {
        tMask: { value: this.rtMask.texture }, uSun: { value: this.sun },
        uDensity: { value: 0.92 }, uDecay: { value: 1 }, uWeight: { value: 1 },
      },
      vertexShader: VERTEX, fragmentShader: RAY_BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      name: 'GodRaysComposite',
      uniforms: {
        tDiffuse: { value: null }, tRays: { value: this.rtRays.texture },
        uIntensity: { value: 0.32 }, uTint: { value: new THREE.Vector3(1.0, 0.94, 0.84) },
      },
      vertexShader: VERTEX, fragmentShader: RAY_COMPOSITE_FRAG, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.maskMaterial);
    this.fitSamples();
  }

  /** Decay and weight follow the tap count so the shafts reach the same
   *  distance and add up to the same light whatever the preset. */
  private fitSamples() {
    const n = this.samples;
    const decay = Math.pow(0.12, 1 / n);
    this.blurMaterial.uniforms.uDecay.value = decay;
    this.blurMaterial.uniforms.uWeight.value = (1 - decay) / (1 - Math.pow(decay, n));
  }

  setSamples(samples: number) {
    if (samples === this.samples) return;
    this.samples = samples;
    this.blurMaterial.defines.SAMPLES = samples;
    this.blurMaterial.needsUpdate = true;
    this.fitSamples();
  }

  get sampleCount() { return this.samples; }

  override setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    this.rtMask.setSize(w, h);
    this.rtRays.setSize(w, h);
    this.maskMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.maskMaterial.uniforms.uAspect.value = this.width / this.height;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number) {
    if (!this.advance(deltaTime)) return;
    this.compositeMaterial.uniforms.uIntensity.value = 0.32 * this.strength;
    this.maskMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.maskMaterial;
    renderer.setRenderTarget(this.rtMask);
    this.quad.render(renderer);
    this.quad.material = this.blurMaterial;
    renderer.setRenderTarget(this.rtRays);
    this.quad.render(renderer);
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose() {
    this.rtMask.dispose();
    this.rtRays.dispose();
    this.maskMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}

/* ─────────────────────────────── lens flare ─────────────────────────────── */

interface Ghost { t: number; r: number; color: [number, number, number]; weight: number }

/** Along the Sun→centre axis: t = 0 is the centre of the frame, 1 is the
 *  Sun's mirror image, negative is back toward the Sun. Warm ones near the
 *  Sun, cool ones past the centre, as a real coated lens sorts them. */
const GHOSTS: Ghost[] = [
  { t: 0.32, r: 0.055, color: [1.0, 0.62, 0.34], weight: 0.55 },
  { t: 0.58, r: 0.10, color: [0.45, 0.72, 1.0], weight: 0.35 },
  { t: 0.86, r: 0.032, color: [1.0, 0.85, 0.55], weight: 0.7 },
  { t: 1.22, r: 0.15, color: [0.55, 0.85, 0.95], weight: 0.28 },
  { t: 1.6, r: 0.07, color: [0.85, 0.6, 1.0], weight: 0.4 },
  { t: -0.36, r: 0.045, color: [1.0, 0.72, 0.45], weight: 0.45 },
];

function ghostCode(count: number): string {
  return GHOSTS.slice(0, count).map((g) => /* glsl */ `
    flare += ghost(p, axis * ${g.t.toFixed(3)}, ${g.r.toFixed(4)}) * vec3(${g.color.map((c) => c.toFixed(3)).join(', ')}) * ${g.weight.toFixed(3)};`).join('');
}

function flareFragment(ghosts: number): string {
  return /* glsl */ `
  uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uAspect; uniform float uStrength; uniform float uIntensity;
  uniform vec2 uTexel;
  varying vec2 vUv;
  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
  // A soft disc with a brighter rim, per channel a hair apart: the fringe
  // of a real ghost.
  vec3 ghost(vec2 p, vec2 at, float r) {
    float d = length(p - at);
    vec3 e = d / (r * vec3(0.965, 1.0, 1.035));
    vec3 body = (1.0 - smoothstep(vec3(0.55), vec3(1.0), e)) * 0.4;
    vec3 rim = smoothstep(vec3(0.72), vec3(0.94), e) * (1.0 - smoothstep(vec3(0.94), vec3(1.06), e)) * 0.7;
    return body + rim;
  }
  vec3 ring(vec2 p, vec2 at, float r, float w) {
    float d = length(p - at);
    vec3 e = abs(d - r * vec3(0.985, 1.0, 1.015));
    return 1.0 - smoothstep(vec3(0.0), vec3(w), e);
  }
  void main() {
    vec3 scene = texture2D(tDiffuse, vUv).rgb;
    // How much of the disc is showing: the HDR buffer at the Sun's own
    // pixel and four around it. Behind a planet or a hill it reads dark.
    vec2 k = uTexel * 6.0;
    float occ = luma(texture2D(tDiffuse, uSun).rgb)
              + luma(texture2D(tDiffuse, uSun + vec2( k.x, 0.0)).rgb)
              + luma(texture2D(tDiffuse, uSun - vec2( k.x, 0.0)).rgb)
              + luma(texture2D(tDiffuse, uSun + vec2(0.0,  k.y)).rgb)
              + luma(texture2D(tDiffuse, uSun - vec2(0.0,  k.y)).rgb);
    float show = smoothstep(0.7, 2.0, occ * 0.2) * uStrength;
    if (show < 0.001) { gl_FragColor = vec4(scene, 1.0); return; }
    vec2 asp = vec2(uAspect, 1.0);
    vec2 p = (vUv - 0.5) * asp;
    vec2 s = (uSun - 0.5) * asp;
    vec2 axis = -s;
    vec3 flare = vec3(0.0);
    ${ghostCode(ghosts)}
    // The halo: one wide thin ring, slid a little past the centre away
    // from the Sun, the way it sits in the reference frames.
    flare += ring(p, axis * 0.22, 0.4, 0.028) * vec3(0.85, 0.6, 0.95) * 0.16;
    // The anamorphic streak: a horizontal line through the Sun, blue,
    // with a tight bright core and a long soft tail.
    float dy = abs(p.y - s.y);
    float dx = abs(p.x - s.x);
    float streak = exp(-dy * dy * 1400.0) * exp(-dx * 2.6) * 0.5
                 + exp(-dy * dy * 9000.0) * exp(-dx * 4.5) * 0.9;
    flare += vec3(0.5, 0.72, 1.0) * streak * 0.55;
    // No dirt on the glass, but the corners stay clean: the whole flare
    // fades toward the edge of the frame.
    float vig = 1.0 - smoothstep(0.55, 1.0, length(p) / (0.5 * max(uAspect, 1.0)) * 0.78);
    gl_FragColor = vec4(scene + flare * show * uIntensity * vig, 1.0);
  }`;
}

/** The lens flare: ghosts mirrored through the centre with a chromatic
 *  fringe, a halo, and an anamorphic streak, all from the Sun's screen
 *  position and only as much as the disc is showing. */
export class LensFlarePass extends SunPass {
  private ghosts: number;
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(ghosts: number) {
    super();
    this.ghosts = ghosts;
    this.material = new THREE.ShaderMaterial({
      name: 'LensFlare',
      uniforms: {
        tDiffuse: { value: null }, uSun: { value: this.sun }, uAspect: { value: 1 },
        uStrength: { value: 0 }, uIntensity: { value: 1 }, uTexel: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: VERTEX, fragmentShader: flareFragment(ghosts), depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setGhosts(ghosts: number) {
    if (ghosts === this.ghosts) return;
    this.ghosts = ghosts;
    this.material.fragmentShader = flareFragment(ghosts);
    this.material.needsUpdate = true;
  }

  get ghostCount() { return this.ghosts; }

  override setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.material.uniforms.uAspect.value = this.width / this.height;
    this.material.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number) {
    if (!this.advance(deltaTime)) return;
    this.material.uniforms.uStrength.value = this.strength;
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

/* ─────────────────────────────── colour grade ─────────────────────────────── */

/** The grade, applied after the tone map on display-ready values: exposure
 *  and contrast, lift / gamma / gain, a split tone that cools the shadows
 *  and warms the highlights, and saturation. The defaults are the reference
 *  frames: clean whites, blue-black shadows, a warm Sun. */
export const GradeShader = {
  name: 'ColourGrade',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.05 },
    uSaturation: { value: 1.1 },
    uLift: { value: new THREE.Vector3(-0.012, -0.004, 0.018) },
    uGamma: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uGain: { value: new THREE.Vector3(1.03, 1.0, 0.965) },
    uShadowTint: { value: new THREE.Vector3(-0.05, 0.02, 0.08) },
    uHighlightTint: { value: new THREE.Vector3(0.06, 0.02, -0.04) },
    uSplit: { value: 0.5 },
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uExposure; uniform float uContrast; uniform float uSaturation;
    uniform vec3 uLift; uniform vec3 uGamma; uniform vec3 uGain; uniform vec3 uShadowTint; uniform vec3 uHighlightTint;
    uniform float uSplit;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      c = (c - 0.5) * uContrast + 0.5;
      c = max(c * uGain + uLift, 0.0);
      c = pow(c, 1.0 / uGamma);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Shadows take the cool tint, the mids the warm one; the top stop is
      // left alone so a white stays white.
      float sw = 1.0 - smoothstep(0.0, 0.45, l);
      float hw = smoothstep(0.35, 0.8, l) * (1.0 - smoothstep(0.85, 1.0, l));
      c += (uShadowTint * sw + uHighlightTint * hw) * uSplit;
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export interface GradeHandle {
  pass: ShaderPass;
  setEnabled: (on: boolean) => void;
  dispose: () => void;
}

export function makeGradePass(enabled: boolean): GradeHandle {
  const pass = new ShaderPass(GradeShader);
  pass.enabled = enabled;
  return {
    pass,
    setEnabled(on) { pass.enabled = on; },
    dispose() { pass.dispose(); },
  };
}

export function makeGodRaysPass(level: QualityLevel, enabled: boolean): SunPassHandle & { pass: GodRaysPass } {
  const pass = new GodRaysPass(godRaySamples(level));
  pass.enabled = enabled;
  return {
    pass,
    setSun: (x, y, visible, strength) => pass.setSun(x, y, visible, strength),
    setEnabled(on) { pass.enabled = on; },
    setQuality(next) { pass.setSamples(godRaySamples(next)); },
    dispose() { pass.dispose(); },
  };
}

export function makeLensFlarePass(level: QualityLevel, enabled: boolean): SunPassHandle & { pass: LensFlarePass } {
  const pass = new LensFlarePass(flareGhosts(level));
  pass.enabled = enabled;
  return {
    pass,
    setSun: (x, y, visible, strength) => pass.setSun(x, y, visible, strength),
    setEnabled(on) { pass.enabled = on; },
    setQuality(next) { pass.setGhosts(flareGhosts(next)); },
    dispose() { pass.dispose(); },
  };
}
