import { expect, it } from 'vitest';
import { supernovaLength } from '@/components/skychaser/supernova/engine';
import { BAKE, BLUR, DOWN, FX, SCENE } from '@/components/skychaser/supernova/shaders';

it('runs about ten seconds, longer the rarer the card', () => {
  const lens = (['common', 'rare', 'epic', 'legendary'] as const).map(supernovaLength);
  expect(lens[0]).toBeGreaterThan(8);
  expect(lens[3]).toBeLessThan(11);
  for (let i = 1; i < lens.length; i++) expect(lens[i]).toBeGreaterThan(lens[i - 1]);
});

it('ships every shader as plain GLSL', () => {
  for (const src of [BAKE, SCENE, DOWN, BLUR, FX]) {
    expect(src.startsWith('precision highp float;')).toBe(true);
    expect(src).toContain('void main()');
    expect(src).toContain('gl_FragColor');
  }
});
