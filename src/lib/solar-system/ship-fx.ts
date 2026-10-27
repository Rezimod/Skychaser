// What the ship leaves behind it and what shows on it when it is hurt.
//
// - Engine trails: a ribbon of hot exhaust from each main engine, left in
//   space where the ship was, so turns draw a curve. It brightens and
//   lengthens with throttle and boost, and is capped in length so the fast
//   drive leaves a streak, not a line across the system.
// - Shield: an egg of light around the hull that is invisible until hit,
//   then flares with a ripple running out from where the shot landed.
// - Damage: below half hull the ship smokes; below a quarter it trails
//   embers too. The smoke stays where it was let go, so it streams behind.
//
// Each is one draw. Every material is in the scene from the start (hidden
// until needed), so the warm-up compiles it and nothing builds a shader
// mid-fight.

import * as THREE from 'three';
import { softSpriteTexture } from '@/lib/solar-system/soft-sprite';

const TRAIL_POINTS = 48;
/** Trails drawn at most: the outer engines of a bigger cluster carry it. */
const MAX_TRAILS = 4;
const TRAIL_LIFE = 0.7;
const TRAIL_STEP = 1 / 60;
const SMOKE_N = 72;
const SMOKE_LIFE = 1.6;
const EMBER_LIFE = 0.55;
const SHIELD_FLASH = 0.55;

export interface ShipFxFrame {
  /** Engine glow anchors (world transforms read from them). */
  emitters: readonly THREE.Object3D[];
  /** The hull: smoke comes off it, the shield wraps it. */
  hull: THREE.Object3D;
  camera: THREE.Camera;
  /** 0..1 how hard the mains are burning. */
  throttle: number;
  boost: boolean;
  /** Drive colour. */
  color: THREE.Color;
  /** 0..1 of full hull. */
  hullFrac: number;
  /** False while crashed, jumping, out on EVA or in the cockpit view of a hidden ship. */
  visible: boolean;
}

export interface ShipFx {
  /** World-space: trails and smoke. */
  group: THREE.Group;
  /** Rides on the ship: the shield egg. */
  shield: THREE.Mesh;
  /** Fit the shield and the smoke to the hull (again when its model loads). */
  fit: (hull: THREE.Object3D) => void;
  /** A hit on the shield; `from` is a world point the shot came from, or null. */
  shieldHit: (from: THREE.Vector3 | null, strength: number) => void;
  update: (dt: number, f: ShipFxFrame) => void;
  /** Drop every trail and puff, e.g. after a respawn or a jump. */
  clear: () => void;
  dispose: () => void;
}

interface Trail {
  pts: Float32Array;
  ages: Float32Array;
  count: number;
  since: number;
  geom: THREE.BufferGeometry;
  pos: Float32Array;
  alpha: Float32Array;
  mesh: THREE.Mesh;
}

const trailVert = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  varying float vEdge;
  void main() {
    vAlpha = aAlpha;
    vEdge = mod(float(gl_VertexID), 2.0) * 2.0 - 1.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`;
const trailFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uGain;
  varying float vAlpha;
  varying float vEdge;
  void main() {
    float across = 1.0 - vEdge * vEdge;
    float a = vAlpha * across * uGain;
    // White-hot along the centre of a fresh trail, the drive colour at the edges and as it cools.
    vec3 c = mix(uColor, vec3(1.0, 0.97, 0.9), pow(across, 3.0) * vAlpha * 0.7);
    gl_FragColor = vec4(c * a, a);
  }
`;

const puffVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aHot;
  varying float vAlpha;
  varying float vHot;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vHot = aHot;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(1e-6, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const puffFrag = /* glsl */ `
  uniform sampler2D uMap;
  varying float vAlpha;
  varying float vHot;
  void main() {
    float m = texture2D(uMap, gl_PointCoord).a;
    vec3 smoke = vec3(0.16, 0.15, 0.15);
    vec3 ember = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.8, 0.4), vHot);
    vec3 c = mix(smoke, ember * 2.0, step(0.01, vHot));
    gl_FragColor = vec4(c, m * vAlpha);
  }
`;

const shieldVert = /* glsl */ `
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    vLocal = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const shieldFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHit;
  uniform float uT;
  uniform float uK;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float nv = abs(dot(vN, vView));
    // Bright toward the silhouette but feathered right at it: no hard outline.
    float rim = pow(1.0 - nv, 2.5) * smoothstep(0.0, 0.25, nv);
    float d = acos(clamp(dot(vLocal, uHit), -1.0, 1.0));
    float front = uT * 5.0;
    float ripple = exp(-pow((d - front) * 7.0, 2.0)) * (1.0 - uT);
    float spot = exp(-d * d * 18.0) * (1.0 - uT) * 1.6;
    float hex = 0.6 + 0.4 * sin(vLocal.x * 60.0) * sin(vLocal.y * 60.0) * sin(vLocal.z * 60.0);
    float a = (rim * 0.5 + ripple * hex * 0.7 + spot * 0.8) * uK * smoothstep(0.0, 0.3, nv);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

export function makeShipFx(H: number, length: number): ShipFx {
  const group = new THREE.Group();
  group.name = 'shipFx';

  // ── Engine trails. ──
  const trailMat = new THREE.ShaderMaterial({
    vertexShader: trailVert,
    fragmentShader: trailFrag,
    uniforms: { uColor: { value: new THREE.Color() }, uGain: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const index: number[] = [];
  for (let i = 0; i < TRAIL_POINTS - 1; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const trails: Trail[] = [];
  for (let e = 0; e < MAX_TRAILS; e++) {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_POINTS * 2 * 3);
    const alpha = new Float32Array(TRAIL_POINTS * 2);
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geom.setIndex(index);
    const mesh = new THREE.Mesh(geom, trailMat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 2;
    group.add(mesh);
    trails.push({ pts: new Float32Array(TRAIL_POINTS * 3), ages: new Float32Array(TRAIL_POINTS), count: 0, since: 0, geom, pos, alpha, mesh });
  }

  // ── Smoke and embers off a hurt hull. ──
  const puffGeom = new THREE.BufferGeometry();
  const puffPos = new Float32Array(SMOKE_N * 3);
  const puffSize = new Float32Array(SMOKE_N);
  const puffAlpha = new Float32Array(SMOKE_N);
  const puffHot = new Float32Array(SMOKE_N);
  const puffVel = new Float32Array(SMOKE_N * 3);
  const puffAge = new Float32Array(SMOKE_N).fill(-1);
  const puffLife = new Float32Array(SMOKE_N);
  puffGeom.setAttribute('position', new THREE.BufferAttribute(puffPos, 3).setUsage(THREE.DynamicDrawUsage));
  puffGeom.setAttribute('aSize', new THREE.BufferAttribute(puffSize, 1).setUsage(THREE.DynamicDrawUsage));
  puffGeom.setAttribute('aAlpha', new THREE.BufferAttribute(puffAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  puffGeom.setAttribute('aHot', new THREE.BufferAttribute(puffHot, 1).setUsage(THREE.DynamicDrawUsage));
  const puffMat = new THREE.ShaderMaterial({
    vertexShader: puffVert,
    fragmentShader: puffFrag,
    uniforms: { uMap: { value: softSpriteTexture() }, uScale: { value: 600 } },
    transparent: true,
    depthWrite: false,
  });
  const puffs = new THREE.Points(puffGeom, puffMat);
  puffs.frustumCulled = false;
  puffs.visible = false;
  puffs.renderOrder = 3;
  group.add(puffs);
  let nextPuff = 0;
  let puffDebt = 0;
  let puffsLive = 0;

  // ── Shield. ──
  const shieldMat = new THREE.ShaderMaterial({
    vertexShader: shieldVert,
    fragmentShader: shieldFrag,
    uniforms: {
      uColor: { value: new THREE.Color(0.45, 0.8, 1.6) },
      uHit: { value: new THREE.Vector3(0, 0, 1) },
      uT: { value: 1 },
      uK: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), shieldMat);
  shield.name = 'shieldEgg';
  shield.renderOrder = 4;
  shield.frustumCulled = false;
  shield.visible = false;
  let shieldT = 1;
  let shieldK = 0;

  const hullBox = new THREE.Box3();
  const box = new THREE.Box3();
  const rel = new THREE.Matrix4();
  let fittedTo = -1;
  const hullHalf = new THREE.Vector3(1, 1, 1);
  const hullMid = new THREE.Vector3();

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const side = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  const fx: ShipFx = {
    group,
    shield,
    fit(hull) {
      // The hull's own extent, without the exhaust (which reaches far back)
      // or the shield itself.
      hullBox.makeEmpty();
      hull.updateWorldMatrix(true, true);
      inv.copy(hull.matrixWorld).invert();
      hull.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m === shield || !m.geometry) return;
        const mat = m.material as THREE.Material;
        if (Array.isArray(mat) || mat.blending === THREE.AdditiveBlending) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        box.copy(m.geometry.boundingBox!).applyMatrix4(rel.multiplyMatrices(inv, m.matrixWorld));
        hullBox.union(box);
      });
      if (hullBox.isEmpty()) hullBox.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(length * 0.5, length * 0.25, length));
      hullBox.getCenter(hullMid);
      hullBox.getSize(hullHalf).multiplyScalar(0.5);
      const floor = length * 0.22;
      shield.position.copy(hullMid);
      shield.scale.set(Math.max(floor, hullHalf.x * 1.3), Math.max(floor, hullHalf.y * 1.5), Math.max(floor, hullHalf.z * 1.18));
      if (shield.parent !== hull) hull.add(shield);
      fittedTo = hull.children.length;
    },
    shieldHit(from, strength) {
      shieldT = 0;
      shieldK = Math.min(1.1, 0.5 + strength);
      if (from && shield.parent) {
        shield.updateWorldMatrix(true, false);
        tmp.copy(from);
        shield.worldToLocal(tmp);
        if (tmp.lengthSq() > 1e-12) shieldMat.uniforms.uHit.value.copy(tmp.normalize());
      } else {
        shieldMat.uniforms.uHit.value.set(Math.random() - 0.5, Math.random() - 0.5, 1).normalize();
      }
    },
    update(dt, f) {
      // A model hull arrives after the ship is built: fit to it when it does.
      if (f.hull.children.length !== fittedTo) fx.fit(f.hull);
      f.camera.getWorldPosition(camPos);
      const gain = f.visible ? Math.min(1.4, 0.15 + f.throttle * 0.75 + (f.boost ? 0.5 : 0)) : 0;
      const cap = (f.boost ? 70 : 42) * H;
      trailMat.uniforms.uColor.value.copy(f.color);
      trailMat.uniforms.uGain.value += (gain - trailMat.uniforms.uGain.value) * (1 - Math.exp(-dt * 8));

      for (let e = 0; e < trails.length; e++) {
        const t = trails[e];
        const n = f.emitters.length;
        // Spread over the cluster: with more engines than trails, every other one.
        const src = n > 0 && e < n ? f.emitters[n <= MAX_TRAILS ? e : Math.round(e * (n - 1) / (MAX_TRAILS - 1))] : null;
        for (let i = 0; i < t.count; i++) t.ages[i] += dt;
        while (t.count > 0 && t.ages[t.count - 1] > TRAIL_LIFE) t.count--;
        if (!src || !f.visible) {
          t.count = 0;
        } else {
          src.getWorldPosition(tmp);
          t.since += dt;
          if (t.count === 0 || t.since >= TRAIL_STEP) {
            // Shift down and lay a new point at the head.
            t.since = 0;
            const n = Math.min(TRAIL_POINTS - 1, t.count);
            t.pts.copyWithin(3, 0, n * 3);
            t.ages.copyWithin(1, 0, n);
            t.count = n + 1;
          }
          t.pts[0] = tmp.x;
          t.pts[1] = tmp.y;
          t.pts[2] = tmp.z;
          t.ages[0] = 0;
          // Keep the streak short in space, however fast the ship.
          let run = 0;
          for (let i = 1; i < t.count; i++) {
            const dx = t.pts[i * 3] - t.pts[i * 3 - 3];
            const dy = t.pts[i * 3 + 1] - t.pts[i * 3 - 2];
            const dz = t.pts[i * 3 + 2] - t.pts[i * 3 - 1];
            const seg = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (run + seg > cap) {
              // Cut the last piece short at the cap.
              const k = (cap - run) / seg;
              t.pts[i * 3] = t.pts[i * 3 - 3] + dx * k;
              t.pts[i * 3 + 1] = t.pts[i * 3 - 2] + dy * k;
              t.pts[i * 3 + 2] = t.pts[i * 3 - 1] + dz * k;
              t.count = i + 1;
              break;
            }
            run += seg;
          }
        }
        const live = t.count >= 2 && trailMat.uniforms.uGain.value > 0.01;
        t.mesh.visible = live;
        if (!live) continue;
        const width = (f.boost ? 0.34 : 0.24) * H;
        for (let i = 0; i < TRAIL_POINTS; i++) {
          const k = Math.min(i, t.count - 1);
          const a = k * 3;
          const b = Math.min(k + 1, t.count - 1) * 3;
          const c = Math.max(k - 1, 0) * 3;
          tmp.set(t.pts[a], t.pts[a + 1], t.pts[a + 2]);
          tmp2.set(t.pts[c] - t.pts[b], t.pts[c + 1] - t.pts[b + 1], t.pts[c + 2] - t.pts[b + 2]);
          side.subVectors(camPos, tmp).cross(tmp2);
          const sl = side.length();
          const age = i < t.count ? t.ages[k] / TRAIL_LIFE : 1;
          const along = i / (TRAIL_POINTS - 1);
          const w = width * (0.35 + 0.65 * (1 - age)) * (1 + age * 1.4);
          if (sl > 1e-12) side.multiplyScalar(w / sl);
          else side.set(0, 0, 0);
          t.pos[i * 6] = tmp.x + side.x;
          t.pos[i * 6 + 1] = tmp.y + side.y;
          t.pos[i * 6 + 2] = tmp.z + side.z;
          t.pos[i * 6 + 3] = tmp.x - side.x;
          t.pos[i * 6 + 4] = tmp.y - side.y;
          t.pos[i * 6 + 5] = tmp.z - side.z;
          const fade = i < t.count ? Math.pow(1 - age, 1.6) * (1 - along * 0.3) : 0;
          // The first point sits inside the nozzle glow: ease it in.
          const head = Math.min(1, i / 2);
          t.alpha[i * 2] = t.alpha[i * 2 + 1] = fade * head;
        }
        (t.geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (t.geom.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
      }

      // ── Smoke from a hurt hull. ──
      const hurt = f.visible ? THREE.MathUtils.clamp((0.5 - f.hullFrac) / 0.5, 0, 1) : 0;
      puffDebt += hurt > 0 ? dt * (10 + 40 * hurt) : 0;
      if (hurt > 0) {
        f.hull.getWorldQuaternion(q);
        while (puffDebt >= 1) {
          puffDebt -= 1;
          const i = nextPuff;
          nextPuff = (nextPuff + 1) % SMOKE_N;
          const ember = f.hullFrac < 0.25 && Math.random() < 0.45;
          tmp.set(
            hullMid.x + (Math.random() - 0.5) * hullHalf.x * 1.2,
            hullMid.y + hullHalf.y * (0.2 + Math.random() * 0.5),
            hullMid.z + (Math.random() - 0.5) * hullHalf.z * 1.2,
          );
          f.hull.localToWorld(tmp);
          puffPos[i * 3] = tmp.x;
          puffPos[i * 3 + 1] = tmp.y;
          puffPos[i * 3 + 2] = tmp.z;
          tmp2.set((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.4, -0.3 - Math.random() * 0.5).applyQuaternion(q).multiplyScalar(H * (ember ? 3 : 1.4));
          puffVel[i * 3] = tmp2.x;
          puffVel[i * 3 + 1] = tmp2.y;
          puffVel[i * 3 + 2] = tmp2.z;
          puffAge[i] = 0;
          puffLife[i] = ember ? EMBER_LIFE * (0.6 + Math.random() * 0.8) : SMOKE_LIFE * (0.7 + Math.random() * 0.6);
          puffHot[i] = ember ? 0.3 + Math.random() * 0.7 : 0;
        }
      } else puffDebt = 0;
      puffsLive = 0;
      for (let i = 0; i < SMOKE_N; i++) {
        if (puffAge[i] < 0) {
          puffAlpha[i] = 0;
          continue;
        }
        puffAge[i] += dt;
        const k = puffAge[i] / puffLife[i];
        if (k >= 1) {
          puffAge[i] = -1;
          puffAlpha[i] = 0;
          continue;
        }
        puffsLive++;
        puffPos[i * 3] += puffVel[i * 3] * dt;
        puffPos[i * 3 + 1] += puffVel[i * 3 + 1] * dt;
        puffPos[i * 3 + 2] += puffVel[i * 3 + 2] * dt;
        const hot = puffHot[i] > 0;
        puffSize[i] = (hot ? 0.25 * (1 - k) : 0.5 + 2.2 * k) * H;
        puffAlpha[i] = hot ? 1 - k : 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.2)) * (1 - k);
      }
      puffs.visible = puffsLive > 0;
      if (puffs.visible) {
        const cam = f.camera as THREE.PerspectiveCamera;
        const h = typeof window !== 'undefined' ? window.innerHeight : 800;
        puffMat.uniforms.uScale.value = cam.isPerspectiveCamera ? h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) : 600;
        (puffGeom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (puffGeom.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
        (puffGeom.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
        (puffGeom.attributes.aHot as THREE.BufferAttribute).needsUpdate = true;
      }

      // ── Shield flare. ──
      shieldT = Math.min(1, shieldT + dt / SHIELD_FLASH);
      shieldMat.uniforms.uT.value = shieldT;
      shieldMat.uniforms.uK.value = shieldK * (1 - shieldT);
      shield.visible = f.visible && shieldT < 1;
    },
    clear() {
      for (const t of trails) {
        t.count = 0;
        t.mesh.visible = false;
      }
      puffAge.fill(-1);
      puffs.visible = false;
      puffDebt = 0;
      shieldT = 1;
      shield.visible = false;
    },
    dispose() {
      for (const t of trails) t.geom.dispose();
      trailMat.dispose();
      puffGeom.dispose();
      puffMat.dispose();
      shield.geometry.dispose();
      shieldMat.dispose();
      shield.removeFromParent();
    },
  };
  return fx;
}
