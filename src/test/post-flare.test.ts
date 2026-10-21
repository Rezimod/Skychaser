import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  bloomFor, flareGhosts, godRaySamples, GodRaysPass, LensFlarePass, makeGodRaysPass, makeGradePass, makeLensFlarePass,
  projectSunDirection, projectSunPoint, SUN_EDGE_MARGIN, type SunScreen,
} from '@/lib/solar-system/post-flare';

/** A camera at the origin looking down -Z, 16:10, 60° — enough to project against. */
function camera() {
  const c = new THREE.PerspectiveCamera(60, 1.6, 0.1, 1000);
  c.position.set(0, 0, 0);
  c.lookAt(0, 0, -1);
  return c;
}

/** A pass's render, with no GPU behind it: the composer's contract is what
 *  the pass sets on itself before it draws, so a renderer that records the
 *  targets it was handed is all the test needs. */
function fakeRenderer() {
  const targets: unknown[] = [];
  return {
    targets,
    renderer: {
      setRenderTarget: (t: unknown) => { targets.push(t); },
      render: () => undefined,
    } as unknown as THREE.WebGLRenderer,
  };
}

const fresh = (): SunScreen => ({ x: 0, y: 0, visible: false, edge: 0 });

describe('the Sun on the glass', () => {
  it('a point dead ahead lands in the middle of the frame, visible and whole', () => {
    const s = projectSunPoint(new THREE.Vector3(0, 0, -50), camera(), fresh());
    expect(s.x).toBeCloseTo(0.5);
    expect(s.y).toBeCloseTo(0.5);
    expect(s.visible).toBe(true);
    expect(s.edge).toBe(1);
  });
  it('a point behind the camera is not visible and carries no strength', () => {
    const s = projectSunPoint(new THREE.Vector3(0, 0, 50), camera(), fresh());
    expect(s.visible).toBe(false);
    expect(s.edge).toBe(0);
  });
  it('a direction projects like a point at infinity: up and to the right lands up and to the right', () => {
    const cam = camera();
    const dir = new THREE.Vector3(0.3, 0.3, -1).normalize();
    const d = projectSunDirection(dir, cam, fresh());
    const p = projectSunPoint(dir.clone().multiplyScalar(500), cam, fresh());
    expect(d.x).toBeCloseTo(p.x, 4);
    expect(d.y).toBeCloseTo(p.y, 4);
    expect(d.x).toBeGreaterThan(0.5);
    expect(d.y).toBeGreaterThan(0.5);
    expect(d.visible).toBe(true);
  });
  it('a direction with the Sun behind is invisible, whichever way the camera turns', () => {
    const cam = camera();
    expect(projectSunDirection(new THREE.Vector3(0, 0, 1), cam, fresh()).visible).toBe(false);
    cam.rotation.y = Math.PI;
    cam.updateMatrixWorld();
    expect(projectSunDirection(new THREE.Vector3(0, 0, 1), cam, fresh()).visible).toBe(true);
    expect(projectSunDirection(new THREE.Vector3(0, 0, -1), cam, fresh()).visible).toBe(false);
  });
  it('fades across the margin outside the frame rather than cutting at the edge', () => {
    const cam = camera();
    // Just inside the right edge: whole. Well past it: gone. In between: between.
    const halfW = Math.tan(THREE.MathUtils.degToRad(30)) * 1.6;
    const inside = projectSunPoint(new THREE.Vector3(halfW * 0.95, 0, -1), cam, fresh());
    const margin = projectSunPoint(new THREE.Vector3(halfW * (1 + SUN_EDGE_MARGIN * 0.8), 0, -1), cam, fresh());
    const gone = projectSunPoint(new THREE.Vector3(halfW * (1 + SUN_EDGE_MARGIN * 3), 0, -1), cam, fresh());
    expect(inside.visible).toBe(true);
    expect(inside.edge).toBe(1);
    expect(margin.visible).toBe(true);
    expect(margin.edge).toBeGreaterThan(0);
    expect(margin.edge).toBeLessThan(1);
    expect(gone.visible).toBe(false);
    expect(gone.edge).toBe(0);
  });
});

describe('the Sun passes', () => {
  it('ease their strength in and out with the feed, and snap to nothing once faded', () => {
    const { pass } = makeLensFlarePass('high', true);
    const { renderer } = fakeRenderer();
    const rt = new THREE.WebGLRenderTarget(4, 4);
    pass.setSun(0.6, 0.7, true, 1);
    pass.render(renderer, rt, rt, 1 / 60);
    const first = pass.sunStrength;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(1);
    for (let i = 0; i < 120; i++) pass.render(renderer, rt, rt, 1 / 60);
    expect(pass.sunStrength).toBeCloseTo(1, 2);
    expect(pass.material.uniforms.uSun.value.x).toBeCloseTo(0.6);
    expect(pass.material.uniforms.uSun.value.y).toBeCloseTo(0.7);
    pass.setSun(0.6, 0.7, false, 1);
    for (let i = 0; i < 120; i++) pass.render(renderer, rt, rt, 1 / 60);
    expect(pass.sunStrength).toBe(0);
    // A strength beyond 1 is clamped; a hidden Sun is 0 whatever the strength says.
    pass.setSun(0.5, 0.5, true, 7);
    for (let i = 0; i < 200; i++) pass.render(renderer, rt, rt, 1 / 60);
    expect(pass.sunStrength).toBeCloseTo(1, 2);
  });

  it('draw their first frame whatever the Sun is doing (the warm-up compiles them), then skip while it is hidden', () => {
    const { pass } = makeGodRaysPass('ultra', true);
    const { renderer, targets } = fakeRenderer();
    const rt = new THREE.WebGLRenderTarget(4, 4);
    pass.setSun(0.5, 0.5, false, 0);
    pass.render(renderer, rt, rt, 0);
    // Mask, blur, composite: three targets, the last the write buffer.
    expect(targets.length).toBe(3);
    expect(targets[2]).toBe(rt);
    expect(pass.needsSwap).toBe(true);
    pass.render(renderer, rt, rt, 1 / 60);
    // Nothing to add: nothing drawn, and the composer told not to swap.
    expect(targets.length).toBe(3);
    expect(pass.needsSwap).toBe(false);
    pass.setSun(0.5, 0.5, true, 1);
    pass.render(renderer, rt, rt, 1 / 60);
    expect(targets.length).toBe(6);
    expect(pass.needsSwap).toBe(true);
  });

  it('the god rays take their tap count from the preset and keep the same total light', () => {
    expect(godRaySamples('balanced')).toBe(32);
    expect(godRaySamples('high')).toBe(48);
    expect(godRaySamples('ultra')).toBe(64);
    const h = makeGodRaysPass('high', true);
    expect(h.pass.sampleCount).toBe(48);
    expect(h.pass.blurMaterial.defines.SAMPLES).toBe(48);
    const sum = (p: GodRaysPass) => {
      const decay = p.blurMaterial.uniforms.uDecay.value as number;
      const weight = p.blurMaterial.uniforms.uWeight.value as number;
      let s = 0; let illum = 1;
      for (let i = 0; i < p.sampleCount; i++) { s += illum * weight; illum *= decay; }
      return s;
    };
    const before = sum(h.pass);
    h.setQuality('ultra');
    expect(h.pass.sampleCount).toBe(64);
    expect(h.pass.blurMaterial.defines.SAMPLES).toBe(64);
    expect(sum(h.pass)).toBeCloseTo(before, 6);
    expect(sum(h.pass)).toBeCloseTo(1, 6);
  });

  it('the god rays size their own quarter-res targets from what the composer gives them', () => {
    const { pass } = makeGodRaysPass('high', true);
    pass.setSize(1600, 1000);
    expect(pass.maskMaterial.uniforms.uAspect.value).toBeCloseTo(1.6);
    expect(pass.maskMaterial.uniforms.uTexel.value.x).toBeCloseTo(1 / 400);
    expect(pass.maskMaterial.uniforms.uTexel.value.y).toBeCloseTo(1 / 250);
  });

  it('the flare carries the ghost count of the preset in its shader, and rebuilds when it changes', () => {
    expect(flareGhosts('balanced')).toBe(4);
    expect(flareGhosts('ultra')).toBe(6);
    const f = makeLensFlarePass('balanced', true);
    const count = (p: LensFlarePass) => (p.material.fragmentShader.match(/ghost\(p, axis/g) ?? []).length;
    expect(count(f.pass)).toBe(4);
    f.setQuality('ultra');
    expect(f.pass.ghostCount).toBe(6);
    expect(count(f.pass)).toBe(6);
    // The streak and the halo are always there.
    expect(f.pass.material.fragmentShader).toContain('ring(p, axis');
    expect(f.pass.material.fragmentShader).toContain('exp(-dy * dy');
    f.pass.setSize(1280, 800);
    expect(f.pass.material.uniforms.uAspect.value).toBeCloseTo(1.6);
  });

  it('enable toggles reach the pass the composer reads', () => {
    const g = makeGodRaysPass('high', false);
    const f = makeLensFlarePass('high', false);
    const c = makeGradePass(false);
    expect(g.pass.enabled).toBe(false);
    expect(f.pass.enabled).toBe(false);
    expect(c.pass.enabled).toBe(false);
    g.setEnabled(true); f.setEnabled(true); c.setEnabled(true);
    expect(g.pass.enabled).toBe(true);
    expect(f.pass.enabled).toBe(true);
    expect(c.pass.enabled).toBe(true);
  });

  it('the grade starts from clean whites: a white pixel stays white through lift, gain and the split tone', () => {
    const { pass } = makeGradePass(true);
    const u = pass.uniforms;
    // The same arithmetic as the shader, on (1,1,1).
    const c = new THREE.Vector3(1, 1, 1).multiplyScalar(u.uExposure.value as number);
    c.subScalar(0.5).multiplyScalar(u.uContrast.value as number).addScalar(0.5);
    c.multiply(u.uGain.value as THREE.Vector3).add(u.uLift.value as THREE.Vector3);
    const l = 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z;
    const hw = THREE.MathUtils.smoothstep(l, 0.35, 0.8) * (1 - THREE.MathUtils.smoothstep(l, 0.85, 1));
    expect(hw).toBe(0);
    expect(Math.min(c.x, c.y, c.z)).toBeGreaterThanOrEqual(0.99);
    // And the shadows lean blue: lift is negative in red, positive in blue.
    const lift = u.uLift.value as THREE.Vector3;
    expect(lift.x).toBeLessThan(0);
    expect(lift.z).toBeGreaterThan(0);
  });

  it('bloom grows with the preset and never drops the threshold under the planets\' shoulder', () => {
    for (const kind of ['surface', 'flight'] as const) {
      const b = bloomFor('balanced', kind);
      const h = bloomFor('high', kind);
      const u = bloomFor('ultra', kind);
      expect(b.strength).toBeLessThan(h.strength);
      expect(h.strength).toBeLessThan(u.strength);
      for (const x of [b, h, u]) expect(x.threshold).toBeGreaterThan(0.78);
    }
    expect(bloomFor('ultra', 'surface')).toEqual({ strength: 0.55, radius: 0.75, threshold: 0.9 });
    expect(bloomFor('ultra', 'flight')).toEqual({ strength: 0.6, radius: 0.8, threshold: 0.85 });
  });
});
