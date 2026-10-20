// Scene → bloom → film. The film pass is what makes it a photograph rather
// than a render: fine grain, a soft vignette, and in the helmet a slight
// colour fringe at the edge of the visor and the visor's own curvature. In the
// Backrooms it becomes a cheap camcorder: heavier bloom off the panels, colour
// fringing across the frame, lines that do not quite hold still, a tracking
// smear at the bottom, a sick yellow-green cast. It can also fade to black.
//
// The scene is drawn into the composer's own target, so that is where the
// anti-aliasing has to live: MSAA samples on the target, by preset. Bloom is
// a blur, so it runs at half resolution and can be dropped altogether.
//
// The whole chain: Render → god rays (HDR) → Bloom → lens flare (HDR) →
// Output (tone map) → grade (LDR) → Film. The three Sun-and-grade passes
// come from post-flare.ts, shared with flight, and each preset switches
// them on or off; off, they are skipped by the composer and cost nothing.
//
// Under a sky that reaches orbit, the Render step is three draws into the
// one target (`setLayers`): the sky layer through its own camera, the planet
// globe (kilometres, its own scene) over it with only the depth cleared, and
// the surface scene over both, again with only the depth cleared. Each keeps
// the full precision of the depth buffer for its own range, and everything
// after the Render step sees one HDR image as before.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { bloomFor, makeGodRaysPass, makeGradePass, makeLensFlarePass } from '@/lib/solar-system/post-flare';
import type { QualityLevel } from '@/game/quality';

/** What the post chain takes from a quality preset. */
export interface PostQuality {
  level: QualityLevel;
  bloom: boolean;
  bloomScale: number;
  msaa: number;
  lite: boolean;
  flare: boolean;
  godRays: boolean;
  grade: boolean;
}

/** The two extra draws under the surface scene: its sky, then the planet. */
export interface PostLayers {
  /** Sees only the sky layer of the surface scene. */
  skyCamera: THREE.Camera;
  globe: { scene: THREE.Scene; camera: THREE.Camera };
}

/**
 * The Render step. Single, it is three's RenderPass. Layered, the surface
 * scene is drawn twice — the sky through `skyCamera`, the rest through the
 * main camera, which no longer sees the sky layer — with the globe between.
 * The layers belong to the scene they were set with: a different scene put
 * in (the Moon's Backrooms) is drawn single.
 */
class SurfaceRenderPass extends Pass {
  layers: PostLayers | null = null;
  home: THREE.Scene;

  constructor(public scene: THREE.Scene, public camera: THREE.Camera) {
    super();
    this.home = scene;
    this.needsSwap = false;
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
    const L = this.scene === this.home ? this.layers : null;
    if (!L) {
      renderer.render(this.scene, this.camera);
    } else {
      const scene = this.scene;
      // The sky pass leaves the shadow map to three: seen from the sky
      // camera it has no casters, so it is only cleared, and the surface
      // pass draws it again. Held back instead, the lit sky objects would
      // sample a map that does not exist yet on the first frame.
      renderer.render(scene, L.skyCamera);
      renderer.clearDepth();
      renderer.render(L.globe.scene, L.globe.camera);
      renderer.clearDepth();
      // A background would paint over the globe; the sky pass has drawn it.
      // Nothing moved since the sky pass updated the matrices.
      const background = scene.background;
      const autoMatrix = scene.matrixWorldAutoUpdate;
      scene.background = null;
      scene.matrixWorldAutoUpdate = false;
      renderer.render(scene, this.camera);
      scene.background = background;
      scene.matrixWorldAutoUpdate = autoMatrix;
    }
    renderer.autoClear = autoClear;
  }
}

export interface MoonPostHandle {
  render: (dt: number) => void;
  setSize: (w: number, h: number) => void;
  /** 0 chase camera, 1 inside the helmet. */
  setHelmet: (k: number) => void;
  /** Draw a different scene through the same passes. */
  setScene: (scene: THREE.Scene) => void;
  /** Sky, globe, surface as three draws (see the head of the file); `null`
   *  goes back to the one. Only for the scene the chain was made with. */
  setLayers: (layers: PostLayers | null) => void;
  /** The scene being drawn. */
  scene: () => THREE.Scene;
  /** 0 the Moon, 1 the Backrooms' camcorder look. */
  setBackrooms: (k: number) => void;
  /** 0…1 fade to black. */
  setBlack: (k: number) => void;
  /** A new preset: bloom on or off, and the samples on the target. */
  setQuality: (q: PostQuality) => void;
  /** Where the Sun is on the screen this frame (texture space, y up), for
   *  the flare and the light shafts; `visible` false fades them out. */
  setSun: (x: number, y: number, visible: boolean, strength: number) => void;
  /** Where the scene is drawn: a pre-compile must target it to build the variants the frame uses. */
  drawTarget: () => THREE.WebGLRenderTarget;
  dispose: () => void;
}

const FilmShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uHelmet: { value: 0 },
    uGrain: { value: 0.045 },
    uBack: { value: 0 },
    uBlack: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uHelmet; uniform float uGrain;
    uniform float uBack; uniform float uBlack;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // Visor curvature: a touch of barrel distortion inside the helmet.
      uv = 0.5 + c * (1.0 + uHelmet * 0.08 * r2);
      float fringe = uHelmet * 0.0035 * r2 * 4.0;
      if (uBack > 0.001) {
        // Tape: each line a hair off, now and then a lot, and a smear along the bottom.
        float line = floor(vUv.y * 360.0);
        float tick = floor(uTime * 30.0);
        float jit = fract(sin(line * 91.7 + tick * 13.1) * 43758.5453) - 0.5;
        float tear = step(0.985, fract(sin(tick * 7.13) * 4375.85)) * step(abs(vUv.y - fract(tick * 0.173)), 0.03);
        uv.x += (jit * 0.0009 + tear * 0.012 + (1.0 - smoothstep(0.0, 0.04, vUv.y)) * 0.008) * uBack;
        fringe += uBack * (0.0012 + r2 * 0.012);
      }
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * fringe).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * fringe).b;
      float g = (hash(uv * 1000.0) - 0.5) * (uGrain + uBack * 0.06);
      col += g * (0.6 + 0.4 * (1.0 - clamp(length(col), 0.0, 1.0)));
      if (uBack > 0.001) {
        float luma = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(luma), 0.14 * uBack);
        col *= mix(vec3(1.0), vec3(1.03, 1.01, 0.84), uBack);
        col *= 1.0 - uBack * 0.04 * (0.5 + 0.5 * sin(vUv.y * 900.0));
      }
      float vig = 1.0 - smoothstep(0.35, 1.05, sqrt(r2) * (1.15 + uHelmet * 0.55 + uBack * 0.25));
      col *= mix(0.86 - uBack * 0.2, 1.0, vig);
      col *= 1.0 - uBlack;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeMoonPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: PostQuality): MoonPostHandle {
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  // `ultra` asks for 8 samples; the context may not have them, and three
  // would clamp silently. Clamping here keeps the target's own record true.
  const samplesFor = (n: number) => Math.min(n, renderer.capabilities.maxSamples ?? 0);
  const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: samplesFor(quality.msaa) });
  const composer = new EffectComposer(renderer, target);
  let q = quality;
  let bl = bloomFor(q.level, 'surface');
  const renderPass = new SurfaceRenderPass(scene, camera);
  const godRays = makeGodRaysPass(q.level, q.godRays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * q.bloomScale, size.y * q.bloomScale), bl.strength, bl.radius, bl.threshold);
  bloom.enabled = q.bloom;
  const flare = makeLensFlarePass(q.level, q.flare);
  const grade = makeGradePass(q.grade);
  const film = new ShaderPass(FilmShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(godRays.pass);
  composer.addPass(bloom);
  composer.addPass(flare.pass);
  composer.addPass(output);
  composer.addPass(grade.pass);
  composer.addPass(film);
  let time = 0;
  let helmet = 0;
  let helmetTarget = 0;
  let back = 0;
  const setSize = (w: number, h: number) => {
    const ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    bloom.setSize(w * ratio * q.bloomScale, h * ratio * q.bloomScale);
  };
  setSize(size.x, size.y);
  return {
    render(dt) {
      time += dt;
      helmet += (helmetTarget - helmet) * (1 - Math.exp(-dt * 6));
      film.uniforms.uTime.value = time % 100;
      film.uniforms.uHelmet.value = helmet;
      film.uniforms.uGrain.value = q.lite ? 0.03 : 0.045;
      film.uniforms.uBack.value = back;
      bloom.strength = bl.strength + back * 0.3;
      bloom.threshold = bl.threshold - back * 0.05;
      composer.render(dt);
    },
    setSun(x, y, visible, strength) {
      godRays.setSun(x, y, visible, strength);
      flare.setSun(x, y, visible, strength);
    },
    setSize,
    setHelmet(k) { helmetTarget = k; },
    setScene(next) { renderPass.scene = next; },
    setLayers(layers) { renderPass.layers = layers; },
    scene: () => renderPass.scene,
    setBackrooms(k) { back = k; },
    setBlack(k) { film.uniforms.uBlack.value = k; },
    drawTarget: () => composer.renderTarget1,
    setQuality(next) {
      q = next;
      bl = bloomFor(q.level, 'surface');
      bloom.enabled = q.bloom;
      bloom.radius = bl.radius;
      godRays.setEnabled(q.godRays);
      godRays.setQuality(q.level);
      flare.setEnabled(q.flare);
      flare.setQuality(q.level);
      grade.setEnabled(q.grade);
      // The targets keep their sample count from creation: drop them and
      // they come back at the new one on the next frame.
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        rt.samples = samplesFor(q.msaa);
        rt.dispose();
      }
    },
    dispose() {
      renderPass.dispose(); godRays.dispose(); bloom.dispose(); flare.dispose(); grade.dispose(); film.dispose(); output.dispose(); composer.dispose();
    },
  };
}
