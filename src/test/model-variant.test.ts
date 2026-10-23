import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loaded: string[] = [];
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() { /* none */ }
    loadAsync(url: string) { loaded.push(url); return Promise.resolve({ scene: new THREE.Group() }); }
  },
}));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));
const quality = { lite: false };
vi.mock('@/game/quality', () => ({ currentQuality: () => quality }));

import { LITE_MODELS, acquireModel, dropPrefetch, modelUrl, prefetchModels, resetModelVariant } from '@/game/models';
import { assetsFor } from '@/lib/solar-system/surface-assets';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  loaded.length = 0;
  quality.lite = false;
  resetModelVariant();
});

describe('phone model variants', () => {
  it('every lite file named exists, beside its full one', () => {
    for (const name of LITE_MODELS) {
      expect(fs.existsSync(path.join('public/explore/models', name)), name).toBe(true);
      expect(fs.existsSync(path.join('public/explore/models/lite', name)), name).toBe(true);
    }
    for (const a of assetsFor('moon', 'kestrel')) expect(LITE_MODELS.has(a.url.split('/').pop()!), a.url).toBe(true);
  });

  it('a desktop gets the full file; the performance preset gets the lite one', () => {
    expect(modelUrl('/explore/models/base-kit.glb')).toBe('/explore/models/base-kit.glb');
    resetModelVariant();
    quality.lite = true;
    expect(modelUrl('/explore/models/base-kit.glb')).toBe('/explore/models/lite/base-kit.glb');
    expect(modelUrl('/explore/models/lite/base-kit.glb')).toBe('/explore/models/lite/base-kit.glb');
    expect(modelUrl('/models/other.glb')).toBe('/models/other.glb');
  });

  it('a coarse pointer gets the lite file', () => {
    const mm = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', mm);
    try {
      expect(modelUrl('/explore/models/cosmonaut.glb')).toBe('/explore/models/lite/cosmonaut.glb');
      expect(mm).toHaveBeenCalledWith('(pointer: coarse)');
    } finally { vi.unstubAllGlobals(); }
  });

  it('the prefetch and the scene fetch the same file once, even if the preset changes in between', async () => {
    quality.lite = true;
    prefetchModels([{ url: '/explore/models/rover.glb', keepNodes: true, group: 'vehicle' }]);
    await flush();
    quality.lite = false; // the governor, or the player, moves the preset mid-arrival
    const h = await acquireModel('/explore/models/rover.glb', true);
    dropPrefetch();
    expect(loaded).toEqual(['/explore/models/lite/rover.glb']);
    h.release();
    // Nothing held now: the next surface makes the choice afresh.
    const h2 = await acquireModel('/explore/models/rover.glb', true);
    expect(loaded).toEqual(['/explore/models/lite/rover.glb', '/explore/models/rover.glb']);
    h2.release();
  });
});
