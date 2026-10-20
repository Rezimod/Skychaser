import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { cachedTexture } from '@/lib/solar-system/texture-cache';

describe('cachedTexture', () => {
  it('draws once per key and hands every caller a clone of its own on the same image', () => {
    const make = vi.fn(() => {
      const t = new THREE.DataTexture(new Uint8Array(4), 1, 1);
      t.wrapS = THREE.RepeatWrapping;
      return t;
    });
    const a = cachedTexture('test:a', make);
    const b = cachedTexture('test:a', make);
    expect(make).toHaveBeenCalledTimes(1);
    expect(a).not.toBe(b);
    expect(a.source).toBe(b.source);
    expect(b.wrapS).toBe(THREE.RepeatWrapping);
    // Disposing one caller's texture is that caller's business alone.
    a.dispose();
    expect(cachedTexture('test:a', make).source).toBe(b.source);
    expect(make).toHaveBeenCalledTimes(1);
  });
  it('keys are separate', () => {
    const make = vi.fn(() => new THREE.DataTexture(new Uint8Array(4), 1, 1));
    cachedTexture('test:b', make);
    cachedTexture('test:c', make);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
