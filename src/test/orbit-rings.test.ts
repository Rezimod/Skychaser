import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { disposeOrbitRings, makeOrbitRings, setOrbitRingsFade } from '@/lib/solar-system/scene-extras';

describe('orbit rings', () => {
  it('draws every path from one line-segment buffer', () => {
    const group = makeOrbitRings('orrery', true);
    expect(group.children).toHaveLength(1);
    const line = group.children[0] as THREE.LineSegments;
    expect(line).toBeInstanceOf(THREE.LineSegments);
    const pos = line.geometry.getAttribute('position');
    // Nine closed loops: every vertex opens one segment and closes another.
    expect(pos.count % 2).toBe(0);
    expect(pos.count).toBeGreaterThan(9 * 2 * 8);
    disposeOrbitRings(group);
  });

  it('fades against the base opacity and hides when gone', () => {
    const group = makeOrbitRings('orrery', false);
    const mat = (group.children[0] as THREE.LineSegments).material as THREE.LineBasicMaterial;
    const base = mat.opacity;
    setOrbitRingsFade(group, 0.5);
    expect(mat.opacity).toBeCloseTo(base * 0.5);
    setOrbitRingsFade(group, 1);
    expect(mat.opacity).toBeCloseTo(base);
    setOrbitRingsFade(group, 0);
    expect(group.visible).toBe(false);
    disposeOrbitRings(group);
  });
});
