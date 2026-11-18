import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import en from '@/messages/voyage.en.json';

// A stand-in model, as in ship-model.test: a hull and a lamp material, one engine.
function fakeModel(): THREE.Group {
  const scene = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ name: 'ShipFighterHull', metalness: 1 });
  const lampMat = new THREE.MeshStandardMaterial({ name: 'ShipFighterLamp', emissive: 0xffffff });
  const body = new THREE.Group();
  body.name = 'ShipFighter_Body';
  body.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hullMat), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lampMat));
  const engine = new THREE.Object3D();
  engine.name = 'Engine_P';
  engine.position.set(0, 0, -5);
  scene.add(body, engine);
  return scene;
}
vi.mock('@/game/models', () => ({
  acquireModel: () => Promise.resolve({ scene: fakeModel(), release: () => {} }),
}));

// jsdom has no 2D canvas: one that swallows calls, so the pattern tiles still draw.
const ctx: unknown = new Proxy({}, { get: () => () => ctx, set: () => true });
HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];

const { SKIN_IDS, SKINS, applySkin, defaultSkinFor, isSkinId, skinUniforms, patternTexture } = await import('@/lib/solar-system/ship-skins');
const { buildEndurance, buildXfoil } = await import('@/lib/solar-system/ship-mesh');
const { readPose, createRoomLink, pushSample } = await import('@/lib/multiplayer/room-link');
const { makeRemoteFleet, writeFlightPose } = await import('@/lib/multiplayer/remote-fleet');
const livery = await import('@/game/livery');

const hex = (c: THREE.Color) => c.getHex();

describe('the livery catalogue', () => {
  it('has at least ten distinct, well-formed skins with names in both languages', () => {
    expect(SKIN_IDS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(SKIN_IDS).size).toBe(SKIN_IDS.length);
    const names = (m: typeof en) => (m.play.livery.names as Record<string, string>);
    for (const id of SKIN_IDS) {
      const s = SKINS[id];
      expect(s.id).toBe(id);
      for (const c of [s.paint, s.trim, s.accent, s.lamp, s.drive, s.bolt]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
      expect(s.metal).toBeGreaterThanOrEqual(0);
      expect(s.metal).toBeLessThanOrEqual(1);
      expect(s.rough).toBeGreaterThan(0);
      expect(s.rough).toBeLessThanOrEqual(1);
      expect(s.swatch.length).toBeGreaterThan(0);
      expect(s.chip).toMatch(/^#[0-9a-f]{6}$/i);
      expect(names(en)[id]).toBeTruthy();
    }
    // No two hulls read alike.
    const looks = new Set(SKIN_IDS.map((id) => `${SKINS[id].paint}/${SKINS[id].pattern ?? ''}/${SKINS[id].accent}`));
    expect(looks.size).toBe(SKIN_IDS.length);
    expect(isSkinId('gold')).toBe(true);
    expect(isSkinId('nope')).toBe(false);
    expect(isSkinId(3)).toBe(false);
  });

  it('spreads new pilots over every skin from their ids', () => {
    const counts = new Map<string, number>();
    const N = 2200;
    for (let i = 0; i < N; i++) {
      const id = `g-${(i * 7919).toString(36).toUpperCase().padStart(4, 'A').slice(-4)}-${(i * 104729 + 17).toString(36)}`;
      const s = defaultSkinFor(id);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    expect(counts.size).toBe(SKIN_IDS.length);
    const even = N / SKIN_IDS.length;
    for (const n of counts.values()) {
      expect(n).toBeGreaterThan(even * 0.6);
      expect(n).toBeLessThan(even * 1.4);
    }
    // The same id, the same paint.
    expect(defaultSkinFor('g-7KQ2-abc')).toBe(defaultSkinFor('g-7KQ2-abc'));
  });

  it('draws each pattern tile once and shares it', () => {
    expect(patternTexture('hazard')).toBe(patternTexture('hazard'));
    expect(patternTexture(undefined).wrapS).toBe(THREE.RepeatWrapping);
  });
});

describe('painting a hull', () => {
  it('recolours the Endurance and takes the paint off again', () => {
    const parts = buildEndurance(1);
    const [titanium] = parts.paint!.hull;
    const [graphite] = parts.paint!.trim;
    const [accent] = parts.paint!.accent;
    const graphiteWas = hex(graphite.color);
    const accentWas = hex(accent.color);
    const plumeWas = parts.plumeMat!.color.clone();
    const roughWas = titanium.roughness;

    applySkin(parts, 'crimson');
    expect(parts.skin).toBe('crimson');
    const u = skinUniforms(titanium)!;
    expect(u.uSkinOn.value).toBe(1);
    expect(hex(u.uSkinPaint.value)).toBe(SKINS.crimson.paint);
    expect(hex(graphite.color)).not.toBe(graphiteWas);
    expect(hex(accent.color)).toBe(SKINS.crimson.accent);
    expect(titanium.roughness).toBe(SKINS.crimson.rough);
    expect(parts.plumeMat!.color.equals(plumeWas)).toBe(false);
    expect(parts.glowMats[0].color.equals(parts.plumeMat!.color)).toBe(true);

    applySkin(parts, 'hazard');
    expect(u.uSkinPat.value).toBe(patternTexture('hazard'));

    applySkin(parts, 'factory');
    expect(u.uSkinOn.value).toBe(0);
    expect(hex(graphite.color)).toBe(graphiteWas);
    expect(hex(accent.color)).toBe(accentWas);
    expect(titanium.roughness).toBe(roughWas);
    expect(parts.plumeMat!.color.equals(plumeWas)).toBe(true);
  });

  it('puts the hook into the standard shader where it means to', () => {
    const parts = buildEndurance(1);
    applySkin(parts, 'synthwave');
    const mat = parts.paint!.hull[0];
    const sh = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    mat.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(sh.vertexShader).toContain('vSkinPos = position * length(modelMatrix[0].xyz);');
    expect(sh.fragmentShader).toContain('uniform sampler2D uSkinPat;');
    expect(sh.fragmentShader).toContain('totalEmissiveRadiance += uSkinGlow');
    expect(sh.uniforms.uSkinGlow).toBe(skinUniforms(mat)!.uSkinGlow);
    expect(mat.customProgramCacheKey()).toBe('shipskin');
  });

  it('paints a model hull once it arrives, and tints its windows', async () => {
    const parts = buildXfoil(1);
    applySkin(parts, 'gold');
    await Promise.resolve();
    await Promise.resolve();
    // The model's hull was copied in; the livery is back on it.
    expect(parts.skinMat.name).toBe('ShipFighterHull');
    expect(skinUniforms(parts.skinMat)!.uSkinOn.value).toBe(1);
    expect(parts.skinMat.metalness).toBe(SKINS.gold.metal);
    expect(parts.paint!.lamp).toHaveLength(1);
    expect(hex(parts.paint!.lamp[0].emissive)).not.toBe(0xffffff);
    expect(parts.glowMats.length).toBeGreaterThan(0);
    expect(parts.glowMats[0].color.equals(parts.plumeMat!.color)).toBe(true);
    applySkin(parts, 'factory');
    expect(parts.skinMat.metalness).toBe(1);
    expect(hex(parts.paint!.lamp[0].emissive)).toBe(0xffffff);
  });
});

describe('liveries in a room', () => {
  it('carries the livery on the pose and refuses ones it does not know', () => {
    expect(readPose({ id: 'x', n: 1, s: 'flight', c: 'aurora' })!.c).toBe('aurora');
    expect(readPose({ id: 'x', n: 1, s: 'flight', c: 'plaid' })!.c).toBeUndefined();
    expect(readPose({ id: 'x', n: 1, s: 'flight', c: 7 })!.c).toBeUndefined();
    expect('c' in readPose({ id: 'x', n: 1, s: 'orbit' })!).toBe(false);
    const self = createRoomLink('me').self;
    const earth = { id: 'earth', position: new THREE.Vector3(), radius: 1 } as never;
    writeFlightPose(self, new THREE.Object3D(), null, 'kestrel', [earth], 'georgia');
    expect(self.c).toBe('georgia');
  });

  it('shows another ship in its pilot’s livery and repaints it when they change', () => {
    const earth = { id: 'earth', position: new THREE.Vector3(10, 0, 0), radius: 1 } as never;
    const camera = new THREE.PerspectiveCamera(60, 1.5, 0.0001, 1000);
    camera.position.set(10, 0, 5);
    camera.lookAt(10, 0, 0);
    const fleet = makeRemoteFleet();
    const link = createRoomLink('me');
    link.code = 'K7M2Q';
    const peer = { id: 'p', name: 'Nino', samples: [], lastSeq: -1 };
    link.peers.set('p', peer);
    const at = (n: number, c?: string) => pushSample(peer, readPose({ id: 'p', n, s: 'flight', b: 'earth', p: [0.5, 0, 0], q: [0, 0, 0, 1], k: 'endurance', c, t: n * 100 })!, n * 100);
    const ship = () => fleet.group.children.find((o) => o.name === 'playerShip')!;
    const paintOf = () => {
      let found: THREE.MeshStandardMaterial | null = null;
      ship().traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!found && m && skinUniforms(m)) found = m;
      });
      return skinUniforms(found!)!;
    };

    at(1, 'gold');
    at(2, 'gold');
    fleet.update(link, [earth], camera, 1000);
    const first = ship();
    expect(hex(paintOf().uSkinPaint.value)).toBe(SKINS.gold.paint);

    at(3, 'stealth');
    at(4, 'stealth');
    fleet.update(link, [earth], camera, 2000);
    expect(ship()).toBe(first); // repainted, not rebuilt
    expect(paintOf().uSkinPat.value).toBe(patternTexture('pinstripe'));

    // A pilot on an older build sends none: the factory paint.
    at(5);
    at(6);
    fleet.update(link, [earth], camera, 3000);
    expect(paintOf().uSkinOn.value).toBe(0);
    fleet.dispose();
  });
});

describe('the player’s livery', () => {
  beforeEach(() => {
    localStorage.clear();
    livery.resetLiveryForTests();
  });

  it('defaults from the id until one is picked, and keeps the pick', () => {
    livery.setLiverySeed('account-123');
    expect(livery.chosenLivery()).toBeNull();
    expect(livery.currentLivery()).toBe(defaultSkinFor('account-123'));
    const seen: string[] = [];
    livery.onLiveryChange((s) => seen.push(s));
    livery.chooseLivery('cobalt');
    expect(seen).toEqual(['cobalt']);
    livery.resetLiveryForTests();
    expect(livery.currentLivery()).toBe('cobalt'); // read back off the device
    livery.chooseLivery(null);
    livery.setLiverySeed('someone-else');
    expect(livery.currentLivery()).toBe(defaultSkinFor('someone-else'));
  });

  it('ignores junk in storage', () => {
    localStorage.setItem('stellar_ship_livery', JSON.stringify({ v: 1, skin: 'plaid' }));
    expect(livery.chosenLivery()).toBeNull();
  });
});
