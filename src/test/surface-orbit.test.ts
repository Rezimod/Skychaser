// The orbit view's arithmetic and its bookkeeping: which layer the sky is
// on, which parts of a patch are drawn at which height, how far the camera
// must see, the air's fade to space, and the curvature the far ground takes.
// No WebGL: the globe is a stub.

import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PLANET_BODIES, curvatureDrop } from '@/lib/solar-system/planet-frame';

vi.mock('@/lib/solar-system/planet-globe', async () => {
  const frame = await vi.importActual<typeof import('@/lib/solar-system/planet-frame')>('@/lib/solar-system/planet-frame');
  return {
    makePlanetGlobe: (world: 'moon' | 'mars' | 'earth') => {
      const body = frame.PLANET_BODIES[world];
      const patches: number[] = [];
      return {
        world, body, basis: frame.siteBasis(body), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        sync: vi.fn(), setPatch: (r: number) => patches.push(r), setSun: vi.fn(), update: vi.fn(),
        groundHeightAt: () => 0, stats: () => ({ tiles: 1 }), dispose: vi.fn(), patches,
      };
    },
  };
});

const orbit = await import('@/lib/solar-system/surface-orbit');
const { haze } = await import('@/lib/solar-system/world-earth-haze');
const {
  SKY_LAYER, CEILINGS, tagSky, tierShown, farFor, nearFor, airGlow, horizonDip, hazeLift, skyAt,
  curvatureDropAt, withCurvature, patchTiers, earthTiers, attachOrbitView,
} = orbit;

describe('sky layer', () => {
  it('puts every object under the sky roots on the sky layer only', () => {
    const dome = new THREE.Group();
    const star = new THREE.Points();
    const moon = new THREE.Mesh();
    dome.add(star, moon);
    expect(tagSky([dome, null, undefined])).toBe(3);
    for (const o of [dome, star, moon]) {
      expect(o.layers.isEnabled(SKY_LAYER)).toBe(true);
      expect(o.layers.isEnabled(0)).toBe(false);
    }
  });
});

describe('ceilings', () => {
  it('hides a tier above its ceiling and shows it again a little below', () => {
    expect(tierShown(7999, 8000, true)).toBe(true);
    expect(tierShown(8001, 8000, true)).toBe(false);
    // Hanging just under the ceiling does not bring it back.
    expect(tierShown(7900, 8000, false)).toBe(false);
    expect(tierShown(7500, 8000, false)).toBe(true);
  });

  it('gives Earth all its local ground to 12 km; the Moon and Mars 8 km', () => {
    expect(CEILINGS.earth).toEqual({ local: 12000, far: 12000 });
    expect(CEILINGS.moon.local).toBe(8000);
    expect(CEILINGS.mars.local).toBe(8000);
  });
});

describe('camera planes', () => {
  it('keeps the scene\'s far plane on the ground and grows it to take in the patch from above', () => {
    expect(farFor(4000, 2, 1500, 0)).toBe(4000);
    const at8 = farFor(4000, 8000, 1500, 0);
    expect(at8).toBeGreaterThan(Math.hypot(8000, 1500));
    expect(at8).toBeLessThan(10000);
    // Folded geometry (reach 0) never needs more.
    expect(farFor(30000, 50000, 0, 0)).toBe(30000);
  });

  it('keeps the near plane on the ground and lets it out to a metre up high', () => {
    expect(nearFor(0.05, 1.7)).toBe(0.05);
    expect(nearFor(0.05, 300)).toBeCloseTo(0.05);
    expect(nearFor(0.05, 1200)).toBeCloseTo(0.5);
    expect(nearFor(0.05, 100000)).toBe(1);
  });
});

describe('air', () => {
  it('glows fully on the ground, thins with height, and is gone at the top', () => {
    expect(airGlow(0, 8500, 60000)).toBe(1);
    expect(airGlow(900, 8500, 60000)).toBe(1);
    const a10 = airGlow(10000, 8500, 60000);
    expect(a10).toBeGreaterThan(0.3);
    expect(a10).toBeLessThan(0.6);
    expect(airGlow(60000, 8500, 60000)).toBe(0);
    expect(airGlow(400000, 8500, 60000)).toBe(0);
    expect(airGlow(0, 0, 0)).toBe(0);
    let last = 2;
    for (let h = 0; h <= 60000; h += 2000) {
      const a = airGlow(h, 11100, 50000);
      expect(a).toBeLessThanOrEqual(last);
      last = a;
    }
  });

  it('sinks the horizon by acos(R / (R + h))', () => {
    const R = PLANET_BODIES.earth.radiusKm * 1000;
    expect(horizonDip(0, R)).toBe(0);
    // From the station's 400 km the horizon is about 20° down.
    expect((horizonDip(400000, R) * 180) / Math.PI).toBeCloseTo(19.8, 0);
  });

  it('keeps the ground haze on the ground and thins it from above', () => {
    expect(hazeLift(2)).toBe(1);
    expect(hazeLift(700)).toBe(1);
    expect(hazeLift(2000)).toBeLessThan(0.3);
    expect(hazeLift(20000)).toBe(0.02);
  });

  it('turns each sky to space and takes its clouds away', () => {
    expect(skyAt('earth', 500)).toMatchObject({ air: 1, clouds: 1 });
    expect(skyAt('earth', 5000).clouds).toBe(0);
    expect(skyAt('earth', 400000).air).toBe(0);
    expect(skyAt('mars', 10000).clouds).toBe(0);
    expect(skyAt('mars', 250000).air).toBe(0);
    expect(skyAt('moon', 0).air).toBe(0);
  });
});

describe('curvature', () => {
  it('drops the flat frame by d²/2R, which is the sphere to well under a percent', () => {
    const R = PLANET_BODIES.earth.radiusKm * 1000;
    const d = 240000;
    expect(curvatureDropAt(d, R)).toBeCloseTo(4520, -1);
    expect(curvatureDropAt(d, R) / curvatureDrop(PLANET_BODIES.earth, d)).toBeCloseTo(1, 2);
    // The Moon's horizon ring, 1.5 km out: under a metre.
    expect(curvatureDropAt(1500, PLANET_BODIES.moon.radiusKm * 1000)).toBeLessThan(1);
  });

  it('wraps the hooks a material already has and extends its program key', () => {
    const mat = new THREE.MeshStandardMaterial();
    const seen: string[] = [];
    mat.onBeforeCompile = (shader) => { seen.push('haze'); shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '// haze'); };
    mat.customProgramCacheKey = () => 'earth-haze|far|ring';
    withCurvature(mat, 6371000);
    const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '' };
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(seen).toEqual(['haze']);
    expect(shader.vertexShader).toContain('uniform float uCurveK');
    expect(shader.vertexShader).toContain('transformed.y -= dot( cSite, cSite ) * uCurveK');
    expect(shader.vertexShader).toContain('// haze');
    expect(shader.uniforms.uCurveK.value).toBeCloseTo(1 / (2 * 6371000));
    expect(mat.customProgramCacheKey()).toBe('earth-haze|far|ring|curve');
  });

  it('keeps two materials with different hooks and default keys apart', () => {
    const a = new THREE.MeshStandardMaterial();
    a.onBeforeCompile = () => { /* one hook */ };
    const b = new THREE.MeshStandardMaterial();
    b.onBeforeCompile = () => { /* another hook, not the same */ };
    withCurvature(a, 1737400);
    withCurvature(b, 1737400);
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});

describe('tiers', () => {
  it('splits Earth into the city and the far rings, both gone above 12 km', () => {
    const ringOf = (half: number, name: string) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2).rotateX(-Math.PI / 2));
      m.name = name;
      return m;
    };
    const city = ringOf(6000, 'terrain-city');
    const valley = ringOf(30000, 'terrain-valley');
    const caucasus = ringOf(240000, 'terrain-caucasus');
    const walk = ringOf(2048, 'terrain-walk');
    const tGroup = new THREE.Group();
    tGroup.add(walk, city, valley, caucasus);
    const group = new THREE.Group();
    const streets = new THREE.Group();
    group.add(tGroup, streets);
    const dust = new THREE.Points();
    const earth = { group, terrain: { group: tGroup, rings: { city, valley, caucasus } } } as unknown as Parameters<typeof earthTiers>[0];
    const [near, far] = earthTiers(earth, [dust]);
    expect(near.objects).toEqual(expect.arrayContaining([streets, walk, city, dust]));
    expect(near.objects).not.toContain(valley);
    expect(near.objects).not.toContain(tGroup);
    expect(near.ceiling).toBe(12000);
    expect(near.patch).toBeCloseTo(6000);
    expect(far.objects).toEqual([valley, caucasus]);
    expect(far.ceiling).toBe(12000);
    expect(far.reach).toBe(0);
    expect(far.patch).toBeCloseTo(240000);
  });
});

describe('attachOrbitView', () => {
  const fakeHost = () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.05, 4000);
    const post = { setLayers: vi.fn() };
    const host = { scene, camera, sun, post, quality: {}, lite: true, compileExtra: vi.fn() };
    return host as unknown as Parameters<typeof attachOrbitView>[0] & { post: typeof post; compileExtra: ReturnType<typeof vi.fn> };
  };

  it('layers the sky, hides the patch above its ceiling, and grows the far plane only while it is drawn', () => {
    const host = fakeHost();
    const dome = new THREE.Mesh();
    const ground = new THREE.Mesh();
    host.scene.add(dome, ground);
    const setAltitude = vi.fn();
    const view = attachOrbitView(host, 'mars', {
      sky: [dome], skies: [{ setAltitude }], sunDir: new THREE.Vector3(0, 1, 0),
      tiers: patchTiers('mars', [ground]),
    });
    expect(dome.layers.isEnabled(SKY_LAYER)).toBe(true);
    expect(host.camera.layers.isEnabled(SKY_LAYER)).toBe(false);
    expect(host.sun.layers.isEnabled(SKY_LAYER)).toBe(true);
    expect(host.sun.layers.isEnabled(0)).toBe(true);
    expect(host.post.setLayers).toHaveBeenLastCalledWith(expect.objectContaining({ skyCamera: view.skyCamera }));
    expect(host.compileExtra).toHaveBeenCalledWith(view.globe.scene, view.globe.camera);

    host.camera.position.set(0, 2, 0);
    view.update(0.016);
    expect(view.altitude).toBeCloseTo(2, 0);
    expect(ground.visible).toBe(true);
    expect(host.camera.far).toBe(4000);
    expect(haze.uHazeLift.value).toBe(1);
    expect(view.skyCamera.layers.isEnabled(SKY_LAYER)).toBe(true);
    expect(view.skyCamera.layers.isEnabled(0)).toBe(false);
    expect(dome.position.y).toBe(2);

    host.camera.position.set(0, 6000, 0);
    view.update(0.016);
    expect(ground.visible).toBe(true);
    expect(host.camera.far).toBeGreaterThan(6000);
    expect(host.camera.near).toBe(1);

    host.camera.position.set(0, 250000, 0);
    view.update(0.016);
    expect(ground.visible).toBe(false);
    expect(host.camera.far).toBe(4000);
    expect(setAltitude).toHaveBeenLastCalledWith(expect.closeTo(250000, -2), host.camera.position);

    // A scene that shows it again itself is overruled while the camera is up there.
    ground.visible = true;
    view.update(0.016);
    expect(ground.visible).toBe(false);

    host.camera.position.set(0, 3, 0);
    view.update(0.016);
    expect(ground.visible).toBe(true);

    view.dispose();
    expect(host.post.setLayers).toHaveBeenLastCalledWith(null);
    expect(host.camera.layers.isEnabled(SKY_LAYER)).toBe(true);
    expect(haze.uHazeLift.value).toBe(1);
  });
});
