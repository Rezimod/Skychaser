// Building Level 0 a chunk at a time: carpet, ceiling tiles, wallpapered
// walls and pillars, the small things stuck to them, and a panel in every
// cell. Each chunk folds down to a handful of draw calls — floor, ceiling,
// walls, decals, one instanced set of panels — and lets all of it go again.
//
// The light is not three's. Every surface reads the panel grid it is under
// from a small texture (one texel a cell over the whole repeating plan) and
// lights itself from the four panels nearest: pools on the carpet, bright
// upper walls, and a wall that dims when the tube above it dies. Nothing
// casts a shadow; nothing costs a light.

import * as THREE from 'three';
import { keep, mergeStatic } from '@/lib/solar-system/moon-batch';
import {
  CEILING, CELL, CHUNK, CHUNK_M, DX, DZ, PERIOD, SCALE, SIDE, hash, mod, type Dir, type Maze,
} from '@/lib/solar-system/backrooms-maze';
import { carpetTexture, ceilingTexture, dampTexture, decalAtlas, decalUV, wallpaperTexture, type DecalId } from '@/lib/solar-system/backrooms-textures';

export interface ChunkBuild {
  group: THREE.Group;
  panels: THREE.InstancedMesh;
  /** Torus cell of each panel instance. */
  cells: Int32Array;
  geometries: THREE.BufferGeometry[];
  /** The exit door, when this chunk holds it: its hinge pivot and where to stand, world metres. */
  door: { pivot: THREE.Object3D; x: number; z: number; nx: number; nz: number } | null;
}

export interface ChunkKit {
  build: (cx: number, cz: number) => ChunkBuild;
  free: (c: ChunkBuild) => void;
  /** Per torus cell: R panel light, A the guide's light. Written by the scene. */
  panelData: Uint8Array;
  panelTexture: THREE.DataTexture;
  dispose: () => void;
}

const WALL_T = 0.14;
const HALF_H = 1.1;
export const PANEL_COLOR = new THREE.Color(2.3, 2.2, 1.75);

/** Hook the flat fluorescent light into a Lambert material. One program per kind, shared by every chunk. */
function fluoro(mat: THREE.MeshLambertMaterial, kind: 'WALL' | 'FLOOR' | 'CEIL' | 'DECAL', uniforms: Record<string, THREE.IUniform>) {
  mat.defines = { ...(mat.defines ?? {}), [`BR_${kind}`]: '' };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBrPos;\nvarying vec3 vBrNrm;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vBrPos = (modelMatrix * vec4(transformed, 1.0)).xyz / ${SCALE.toFixed(1)};
        vBrNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uPanels;
        uniform sampler2D uDamp;
        varying vec3 vBrPos;
        varying vec3 vBrNrm;
        vec3 brLight() {
          vec2 c = vBrPos.xz / ${CELL.toFixed(1)} - 0.5;
          vec2 base = floor(c);
          float sum = 0.0;
          for (int dy = 0; dy < 2; dy++) {
            for (int dx = 0; dx < 2; dx++) {
              vec2 cell = base + vec2(float(dx), float(dy));
              vec4 s = texture2D(uPanels, (mod(cell, ${SIDE.toFixed(1)}) + 0.5) / ${SIDE.toFixed(1)});
              vec3 L = vec3((cell.x + 0.5) * ${CELL.toFixed(1)}, ${(CEILING - 0.05).toFixed(2)}, (cell.y + 0.5) * ${CELL.toFixed(1)}) - vBrPos;
              float d2 = dot(L, L);
              float lam = max(dot(normalize(vBrNrm), L * inversesqrt(max(d2, 1e-4))), 0.0);
              sum += (s.r + s.a * 1.8) * (0.3 + 0.7 * lam) / (1.0 + d2 * 0.42);
            }
          }
          return vec3(1.0, 0.965, 0.76) * (0.34 + sum * 0.95);
        }`)
      .replace('#include <aomap_fragment>', `{
          vec3 brL = brLight();
          #ifdef BR_WALL
            brL *= mix(0.68, 1.0, smoothstep(0.0, 0.7, vBrPos.y)) * mix(1.0, 1.1, smoothstep(1.8, ${CEILING.toFixed(2)}, vBrPos.y));
          #endif
          #ifdef BR_FLOOR
            diffuseColor.rgb *= mix(0.5, 1.0, texture2D(uDamp, vBrPos.xz / 17.0).r);
          #endif
          #ifdef BR_CEIL
            diffuseColor.rgb *= mix(0.72, 1.0, texture2D(uDamp, vBrPos.xz / 11.0 + 0.37).r);
          #endif
          reflectedLight.indirectDiffuse += diffuseColor.rgb * brL;
        }
        #include <aomap_fragment>`);
  };
  mat.customProgramCacheKey = () => `br-fluoro-${kind}`;
}

export function makeChunkKit(maze: Maze): ChunkKit {
  const wallpaper = wallpaperTexture();
  const carpet = carpetTexture();
  const ceiling = ceilingTexture();
  const damp = dampTexture();
  const atlas = decalAtlas();
  const panelData = new Uint8Array(SIDE * SIDE * 4);
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) {
      const s = maze.panel(i, j);
      panelData[(j * SIDE + i) * 4] = s === 0 || s === 1 ? 255 : 0;
    }
  }
  const panelTexture = new THREE.DataTexture(panelData, SIDE, SIDE, THREE.RGBAFormat);
  panelTexture.magFilter = THREE.NearestFilter;
  panelTexture.minFilter = THREE.NearestFilter;
  panelTexture.needsUpdate = true;
  const uniforms = { uPanels: { value: panelTexture }, uDamp: { value: damp } };

  const wallMat = new THREE.MeshLambertMaterial({ map: wallpaper });
  fluoro(wallMat, 'WALL', uniforms);
  const floorMat = new THREE.MeshLambertMaterial({ map: carpet });
  fluoro(floorMat, 'FLOOR', uniforms);
  const ceilMat = new THREE.MeshLambertMaterial({ map: ceiling });
  fluoro(ceilMat, 'CEIL', uniforms);
  const decalMat = new THREE.MeshLambertMaterial({ map: atlas, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  fluoro(decalMat, 'DECAL', uniforms);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0x5f5d56 });
  fluoro(doorMat, 'WALL', uniforms);
  const doorDark = new THREE.MeshBasicMaterial({ color: 0x050404 });
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const materials: THREE.Material[] = [wallMat, floorMat, ceilMat, decalMat, doorMat, doorDark, panelMat];

  // Shared, never merged: a chunk's floor and ceiling, and a panel.
  const floorGeom = new THREE.PlaneGeometry(CHUNK_M, CHUNK_M);
  floorGeom.rotateX(-Math.PI / 2);
  floorGeom.translate(CHUNK_M / 2, 0, CHUNK_M / 2);
  { const uv = floorGeom.attributes.uv as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * CHUNK_M / 1.5, uv.getY(k) * CHUNK_M / 1.5); }
  const ceilGeom = new THREE.PlaneGeometry(CHUNK_M, CHUNK_M);
  ceilGeom.rotateX(Math.PI / 2);
  ceilGeom.translate(CHUNK_M / 2, CEILING, CHUNK_M / 2);
  { const uv = ceilGeom.attributes.uv as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * CHUNK_M / 0.6, uv.getY(k) * CHUNK_M / 0.6); }
  const panelGeom = new THREE.PlaneGeometry(0.58, 0.58);
  panelGeom.rotateX(Math.PI / 2);
  const shared = [floorGeom, ceilGeom, panelGeom];

  const arrowsAt = new Map<number, typeof maze.arrows>();
  for (const a of maze.arrows) {
    const k = mod(a.j, SIDE) * SIDE + mod(a.i, SIDE);
    const list = arrowsAt.get(k) ?? [];
    list.push(a);
    arrowsAt.set(k, list);
  }
  const patchesAt = new Map<number, typeof maze.patches>();
  for (const p of maze.patches) {
    const k = mod(Math.floor(p.z / CHUNK_M), PERIOD) * PERIOD + mod(Math.floor(p.x / CHUNK_M), PERIOD);
    const list = patchesAt.get(k) ?? [];
    list.push(p);
    patchesAt.set(k, list);
  }

  const m4 = new THREE.Matrix4();
  const xa = new THREE.Vector3(); const ya = new THREE.Vector3(); const za = new THREE.Vector3();

  const build = (cx: number, cz: number): ChunkBuild => {
    const group = new THREE.Group();
    group.name = `br-chunk ${cx},${cz}`;
    const ox = cx * CHUNK_M; const oz = cz * CHUNK_M;
    group.position.set(ox, 0, oz);
    const geometries: THREE.BufferGeometry[] = [];
    const plan = maze.chunk(cx, cz);
    const pcx = mod(cx, PERIOD); const pcz = mod(cz, PERIOD);
    const add = (g: THREE.BufferGeometry, mat: THREE.Material) => { const m = new THREE.Mesh(g, mat); group.add(m); return m; };
    group.add(keep(new THREE.Mesh(floorGeom, floorMat)));
    group.add(keep(new THREE.Mesh(ceilGeom, ceilMat)));

    /** A wallpapered box, UVs laid on in world metres so the paper runs on round corners. */
    const block = (x: number, z: number, sx: number, sz: number, h: number, seamSalt: number) => {
      const g = new THREE.BoxGeometry(sx, h, sz);
      g.translate(x, h / 2, z);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nrm = g.attributes.normal as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      // A misaligned seam: every panel of paper starts somewhere a little different.
      const shift = hash(maze.seed, seamSalt, pcx * 16 + pcz, 7) * 0.9;
      for (let k = 0; k < pos.count; k++) {
        const ny = nrm.getY(k);
        if (Math.abs(ny) > 0.5) { uv.setXY(k, 0.1, 0.5); continue; }
        const along = Math.abs(nrm.getX(k)) > 0.5 ? pos.getZ(k) + oz : pos.getX(k) + ox;
        uv.setXY(k, (along + shift) / 1.06, pos.getY(k) / CEILING);
      }
      add(g, wallMat);
    };

    const decal = (id: DecalId, x: number, y: number, z: number, nx: number, ny: number, nz: number, ax: number, ay: number, az: number, w: number, h: number) => {
      const g = new THREE.PlaneGeometry(w, h);
      const [u0, v0, u1, v1] = decalUV(id);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
      za.set(nx, ny, nz).normalize();
      xa.set(ax, ay, az).normalize();
      ya.crossVectors(za, xa);
      m4.makeBasis(xa, ya, za).setPosition(x, y, z);
      g.applyMatrix4(m4);
      add(g, decalMat);
    };

    // ── Walls this chunk owns, with what is stuck to them. ──
    for (let b = 0; b < CHUNK; b++) {
      for (let a = 0; a < CHUNK; a++) {
        const c = b * CHUNK + a;
        for (const d of [0, 1] as Dir[]) {
          const e = d === 0 ? plan.east[c] : plan.north[c];
          if (e === 0) continue;
          const h = e === 1 ? CEILING : HALF_H;
          const x = d === 0 ? (a + 1) * CELL : (a + 0.5) * CELL;
          const z = d === 0 ? (b + 0.5) * CELL : (b + 1) * CELL;
          const isExit = e === 1 && isExitWall(maze, cx * CHUNK + a, cz * CHUNK + b, d);
          if (isExit) continue;
          block(x, z, d === 0 ? WALL_T : CELL + WALL_T, d === 0 ? CELL + WALL_T : WALL_T, h, c * 2 + d);
          if (e !== 1) continue;
          const r = (salt: number) => hash(maze.seed, pcx * 97 + pcz * 13, c * 2 + d, salt);
          const side = r(1) < 0.5 ? 1 : -1;
          const nx = d === 0 ? side : 0; const nz = d === 1 ? side : 0;
          const ax = d === 1 ? 1 : 0; const az = d === 0 ? 1 : 0;
          const off = WALL_T / 2 + 0.004;
          const slide = (r(2) - 0.5) * 2;
          if (r(3) < 0.14) decal('outlet', x + nx * off + ax * slide, 0.32, z + nz * off + az * slide, nx, 0, nz, ax, 0, az, 0.16, 0.16);
          if (r(4) < 0.16) decal(r(5) < 0.5 ? 'stainA' : 'stainB', x + nx * off + ax * slide * 0.6, r(6) < 0.6 ? 2.15 : 0.5, z + nz * off + az * slide * 0.6, nx, 0, nz, ax, 0, az, 0.8 + r(7) * 0.7, 0.8 + r(8) * 0.5);
          if (r(9) < 0.1) decal('drip', x + nx * off + ax * slide * 0.8, 1.95, z + nz * off + az * slide * 0.8, nx, 0, nz, ax, 0, az, 1.0, 1.4);
        }
      }
    }
    for (const [px, pz] of plan.pillars) block(px, pz, 0.6, 0.6, CEILING, px * 7 + pz);

    // ── The ceiling's damage, and the arrows and patches along the way out. ──
    const cells = new Int32Array(CHUNK * CHUNK);
    let panelCount = 0;
    for (let b = 0; b < CHUNK; b++) {
      for (let a = 0; a < CHUNK; a++) {
        const gi = cx * CHUNK + a; const gj = cz * CHUNK + b;
        const ti = mod(gi, SIDE); const tj = mod(gj, SIDE);
        const state = maze.panel(ti, tj);
        const r = (salt: number) => hash(maze.seed, ti, tj, salt);
        const ccx = (a + 0.5) * CELL; const ccz = (b + 0.5) * CELL;
        if (state === 3) decal('hole', ccx, CEILING - 0.004, ccz, 0, -1, 0, 1, 0, 0, 0.6, 0.6);
        else cells[panelCount++] = tj * SIDE + ti;
        if (r(11) < 0.2) decal('ceilingStain', ccx + (r(12) - 0.5) * 1.6, CEILING - 0.006, ccz + (r(13) - 0.5) * 1.6, 0, -1, 0, 1, 0, 0, 1.0 + r(14), 1.0 + r(14));
        if (r(15) < 0.05) decal('hole', ccx + (Math.floor(r(16) * 4) - 1.5) * 0.6, CEILING - 0.004, ccz + (Math.floor(r(17) * 4) - 1.5) * 0.6, 0, -1, 0, 1, 0, 0, 0.6, 0.6);
        for (const arrow of arrowsAt.get(tj * SIDE + ti) ?? []) {
          const d = arrow.wall;
          const off = CELL / 2 - WALL_T / 2 - 0.006;
          decal('arrow', ccx + DX[d] * off, 1.3 + r(18) * 0.25, ccz + DZ[d] * off, -DX[d], 0, -DZ[d], DX[arrow.point], 0, DZ[arrow.point], 0.72, 0.72);
        }
      }
    }
    for (const p of patchesAt.get(pcz * PERIOD + pcx) ?? []) {
      const lx = mod(p.x, CHUNK_M); const lz = mod(p.z, CHUNK_M);
      decal('patch', lx, 0.006, lz, 0, 1, 0, Math.cos(p.spin), 0, Math.sin(p.spin), 0.26, 0.26);
    }

    // ── The exit door, when it is in this chunk. ──
    let door: ChunkBuild['door'] = null;
    const ex = maze.exit;
    if (Math.floor(ex.i / CHUNK) === pcx && Math.floor(ex.j / CHUNK) === pcz) {
      const a = ex.i % CHUNK; const b = ex.j % CHUNK; const d = ex.wall;
      const nx = -DX[d]; const nz = -DZ[d];
      const wx = (a + 0.5) * CELL + DX[d] * CELL / 2; const wz = (b + 0.5) * CELL + DZ[d] * CELL / 2;
      // The wall round the doorway: two jambs and a header, then a frame and the leaf.
      const along = d % 2 === 0 ? 'z' : 'x';
      const seg = (from: number, to: number, y0: number, y1: number) => {
        const len = to - from; const mid = (from + to) / 2;
        const g = new THREE.BoxGeometry(along === 'x' ? len : WALL_T, y1 - y0, along === 'z' ? len : WALL_T);
        g.translate(along === 'x' ? wx + mid : wx, (y0 + y1) / 2, along === 'z' ? wz + mid : wz);
        const uv = g.attributes.uv as THREE.BufferAttribute; const pos = g.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, ((along === 'x' ? pos.getX(k) + ox : pos.getZ(k) + oz)) / 1.06, pos.getY(k) / CEILING);
        add(g, wallMat);
      };
      const halfW = CELL / 2 + WALL_T / 2;
      seg(-halfW, -0.55, 0, CEILING);
      seg(0.55, halfW, 0, CEILING);
      seg(-0.55, 0.55, 2.15, CEILING);
      const frame = new THREE.Group();
      frame.position.set(wx, 0, wz);
      frame.rotation.y = Math.atan2(nx, nz);
      group.add(frame);
      const part = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) => {
        geometries.push(g);
        const m = keep(new THREE.Mesh(g, mat));
        m.position.set(x, y, z);
        parent.add(m);
        return m;
      };
      part(new THREE.BoxGeometry(0.08, 2.15, 0.2), doorMat, -0.51, 1.075, 0, frame);
      part(new THREE.BoxGeometry(0.08, 2.15, 0.2), doorMat, 0.51, 1.075, 0, frame);
      part(new THREE.BoxGeometry(1.1, 0.08, 0.2), doorMat, 0, 2.13, 0, frame);
      part(new THREE.PlaneGeometry(0.96, 2.1), doorDark, 0, 1.05, -0.05, frame);
      const hinge = keep(new THREE.Group());
      hinge.position.set(-0.47, 0, 0.06);
      frame.add(hinge);
      part(new THREE.BoxGeometry(0.94, 2.08, 0.05), doorMat, 0.47, 1.05, 0, hinge);
      part(new THREE.BoxGeometry(0.62, 0.05, 0.06), doorDark, 0.5, 1.0, 0.05, hinge);
      door = { pivot: hinge, x: ox + wx + nx * 0.9, z: oz + wz + nz * 0.9, nx, nz };
    }

    const panels = new THREE.InstancedMesh(panelGeom, panelMat, Math.max(1, panelCount));
    panels.count = panelCount;
    for (let k = 0; k < panelCount; k++) {
      const c = cells[k];
      const ti = c % SIDE; const tj = (c - ti) / SIDE;
      // The torus cell's copy inside this chunk.
      const a = mod(ti - cx * CHUNK, SIDE) % CHUNK; const b = mod(tj - cz * CHUNK, SIDE) % CHUNK;
      m4.makeTranslation((a + 0.5) * CELL, CEILING - 0.008, (b + 0.5) * CELL);
      panels.setMatrixAt(k, m4);
      panels.setColorAt(k, PANEL_COLOR);
    }
    panels.instanceMatrix.needsUpdate = true;
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    panels.computeBoundingSphere();
    panels.frustumCulled = true;
    group.add(panels);

    group.updateMatrixWorld(true);
    const merged = mergeStatic(group, { minCaster: Infinity });
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    geometries.push(...merged.geometries);
    return { group, panels, cells: cells.slice(0, panelCount), geometries, door };
  };

  const free = (c: ChunkBuild) => {
    c.group.removeFromParent();
    for (const g of c.geometries) g.dispose();
    c.panels.dispose();
  };

  return {
    build, free, panelData, panelTexture,
    dispose() {
      for (const m of materials) m.dispose();
      for (const g of shared) g.dispose();
      for (const t of [wallpaper, carpet, ceiling, damp, atlas, panelTexture]) t.dispose();
    },
  };
}

/** Is this the wall the exit door is set into (from either side)? */
function isExitWall(maze: Maze, gi: number, gj: number, d: Dir): boolean {
  const ex = maze.exit;
  const ti = mod(gi, SIDE); const tj = mod(gj, SIDE);
  if (ti === ex.i && tj === ex.j && ex.wall === d) return true;
  // The same edge seen from the neighbour's side.
  const ni = mod(ex.i + DX[ex.wall], SIDE); const nj = mod(ex.j + DZ[ex.wall], SIDE);
  return ti === ni && tj === nj && ((ex.wall + 2) % 4) === d;
}
