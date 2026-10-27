import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { QualityProfile } from '@/game/quality';
import { bloomFor, makeGodRaysPass, makeGradePass, makeLensFlarePass } from '@/lib/solar-system/post-flare';

export interface PostFxHandle {
  render: (dtSec: number) => void;
  setSize: (cssWidth: number, cssHeight: number) => void;
  /** Where the scene is drawn: a pre-compile must target it to build the variants the frame uses. */
  drawTarget: () => THREE.WebGLRenderTarget;
  /** A new preset, live: bloom, the Sun passes, the grade, the samples on the target. */
  setQuality: (q: QualityProfile) => void;
  /** Where the Sun is on the screen this frame (texture space, y up); `visible` false fades the Sun passes out. */
  setSun: (x: number, y: number, visible: boolean, strength: number) => void;
  dispose: () => void;
}

/** MSAA samples on the flight composer's target: the preset's own, clamped to the context. */
export function flightSamples(q: Pick<QualityProfile, 'msaa'>, maxSamples: number): number {
  return Math.min(q.msaa, maxSamples);
}

/**
 * Scene → god rays → bloom → lens flare → tone-mapped output → grade. The
 * bloom threshold sits above every lit planet surface so only HDR emitters
 * bloom: the Sun's photosphere, engine glows, laser bolts.
 *
 * The chain is what the preset says it is, the same as the surfaces'
 * (`moon-post.ts`). `performance` drops the bloom outright: UnrealBloom is
 * five blur levels — a dozen passes, each one a program bind and a quad —
 * and on a phone that is the frame, not a garnish. The Sun still reads,
 * because the tone map is doing the work either way. A disabled pass is
 * skipped by the composer, and its targets are never allocated.
 */
export function makePostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: QualityProfile,
): PostFxHandle {
  const size = renderer.getSize(new THREE.Vector2());
  const pr0 = renderer.getPixelRatio();
  // The scene is drawn into the composer's target, never the canvas, so the
  // anti-aliasing has to live here: the preset's own sample count, clamped
  // to the context, and the bloom chain at the preset's scale.
  const samplesFor = (q: QualityProfile) => flightSamples(q, renderer.capabilities.maxSamples ?? 0);
  let q0 = quality;
  const target = new THREE.WebGLRenderTarget(size.x * pr0, size.y * pr0, {
    type: THREE.HalfFloatType,
    samples: samplesFor(quality),
  });
  const composer = new EffectComposer(renderer, target);
  let bl = bloomFor(quality.level, 'flight');
  const renderPass = new RenderPass(scene, camera);
  const godRays = makeGodRaysPass(quality.level, quality.godRays);
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x * pr0 * quality.bloomScale, size.y * pr0 * quality.bloomScale), bl.strength, bl.radius, bl.threshold);
  bloom.enabled = quality.bloom;
  const flare = makeLensFlarePass(quality.level, quality.flare);
  const output = new OutputPass();
  const grade = makeGradePass(quality.grade);
  composer.addPass(renderPass);
  composer.addPass(godRays.pass);
  composer.addPass(bloom);
  composer.addPass(flare.pass);
  composer.addPass(output);
  composer.addPass(grade.pass);

  const setSize = (w: number, h: number) => {
    const ratio = renderer.getPixelRatio();
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    bloom.setSize(w * ratio * q0.bloomScale, h * ratio * q0.bloomScale);
  };
  setSize(size.x, size.y);

  return {
    render(dtSec) {
      composer.render(dtSec);
    },
    setSize,
    drawTarget: () => composer.renderTarget1,
    setQuality(q) {
      q0 = q;
      bl = bloomFor(q.level, 'flight');
      bloom.enabled = q.bloom;
      bloom.strength = bl.strength;
      bloom.radius = bl.radius;
      bloom.threshold = bl.threshold;
      godRays.setEnabled(q.godRays);
      godRays.setQuality(q.level);
      flare.setEnabled(q.flare);
      flare.setQuality(q.level);
      grade.setEnabled(q.grade);
      // The targets keep their sample count from creation: drop them and
      // they come back at the new one on the next frame.
      for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
        rt.samples = samplesFor(q);
        rt.dispose();
      }
      const size = renderer.getSize(new THREE.Vector2());
      setSize(size.x, size.y);
    },
    setSun(x, y, visible, strength) {
      godRays.setSun(x, y, visible, strength);
      flare.setSun(x, y, visible, strength);
    },
    dispose() {
      renderPass.dispose();
      godRays.dispose();
      bloom.dispose();
      flare.dispose();
      output.dispose();
      grade.dispose();
      composer.dispose();
    },
  };
}
