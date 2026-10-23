import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

let resolveLoad: ((g: { scene: THREE.Group }) => void) | null = null;
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder() { /* none */ }
    loadAsync() { return new Promise((r) => { resolveLoad = r; }); }
  },
}));
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({ MeshoptDecoder: {} }));

afterEach(() => { vi.useRealTimers(); });

describe('a model that never arrives', () => {
  it('rejects after the timeout, and a late model is disposed, not kept', async () => {
    vi.useFakeTimers();
    const { acquireModel, MODEL_TIMEOUT_MS } = await import('@/game/models');
    const p = acquireModel('/models/stalled.glb', true);
    const caught = p.catch((e: Error) => e);
    vi.advanceTimersByTime(MODEL_TIMEOUT_MS + 1);
    expect(await caught).toBeInstanceOf(Error);

    // The file turns up late: its geometry is freed.
    const geo = new THREE.BufferGeometry();
    const freed = vi.fn();
    geo.addEventListener('dispose', freed);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
    resolveLoad!({ scene });
    await Promise.resolve(); await Promise.resolve();
    expect(freed).toHaveBeenCalled();

    // The failed entry left the cache: asking again makes a fresh request.
    resolveLoad = null;
    void acquireModel('/models/stalled.glb', true).catch(() => undefined);
    expect(resolveLoad).not.toBeNull();
  });
});
