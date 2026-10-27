import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeCrashFx, type CrashFx } from '@/lib/solar-system/crash-fx';

const H = 1;
const ground = { position: new THREE.Vector3(0, -100, 0), radius: 100, surfaceG: 9.81 };
/** The hull's fragments: plates and pipes. */
const fragments = (fx: CrashFx) => fx.group.children.filter((o) => {
  const t = (o as THREE.Mesh).geometry?.type;
  return o.visible && (t === 'BoxGeometry' || t === 'CylinderGeometry');
});

describe('the ship blowing up', () => {
  it('bursts on the ground, throws its fragments up, lands them on the surface, then clears away', () => {
    const fx = makeCrashFx(H, 20);
    expect(fx.group.visible).toBe(false);
    fx.trigger(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), ground, new THREE.Vector3(0, -50, 0));
    expect(fx.group.visible).toBe(true);
    const pieces = fragments(fx);
    expect(pieces.length).toBeGreaterThan(10);
    let highest = 0;
    for (let i = 0; i < 60 * 3; i++) {
      fx.update(1 / 60);
      for (const p of pieces) highest = Math.max(highest, p.position.y);
    }
    // Up off the impact, and back down onto the ground, never through it.
    expect(highest).toBeGreaterThan(H);
    for (const p of pieces) {
      const fromCentre = p.position.clone().add(fx.group.position).sub(ground.position).length();
      expect(fromCentre).toBeGreaterThan(ground.radius);
    }
    for (let i = 0; i < 60; i++) fx.update(1 / 60);
    expect(fx.group.visible).toBe(false);
    fx.dispose();
  });

  it('in open space nothing falls: the fragments keep flying outward', () => {
    const fx = makeCrashFx(H, 20);
    fx.trigger(new THREE.Vector3(5, 5, 5), new THREE.Vector3(0, 1, 0), null, new THREE.Vector3());
    const pieces = fragments(fx);
    fx.update(0.5);
    const early = pieces.map((p) => p.position.length());
    fx.update(0.5);
    pieces.forEach((p, i) => expect(p.position.length()).toBeGreaterThan(early[i]));
    fx.dispose();
  });
});
