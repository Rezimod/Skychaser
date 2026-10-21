// A name tag that stays the same size on screen however far away its owner
// is, drawn over everything so a friend can be found from across the system.

import * as THREE from 'three';

const W = 256;
const H = 64;
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--seafoam').trim() || 'white';

export interface NameLabel {
  sprite: THREE.Sprite;
  set: (name: string, detail: string) => void;
  dispose: () => void;
}

/** `height`: the tag's angular size — its height at one unit of distance. */
export function makeNameLabel(height: number): NameLabel {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
  const sprite = new THREE.Sprite(mat);
  sprite.center.set(0.5, -0.2);
  sprite.scale.set(height * (W / H), height, 1);
  sprite.renderOrder = 999;
  sprite.frustumCulled = false;
  let shown = '';
  return {
    sprite,
    set(name, detail) {
      const key = `${name}\n${detail}`;
      if (key === shown) return;
      shown = key;
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = accent();
      ctx.font = '600 26px system-ui, sans-serif';
      ctx.fillText(name, W / 2, detail ? 22 : H / 2, W - 8);
      if (detail) {
        ctx.fillStyle = 'rgba(232,238,248,0.85)';
        ctx.font = '500 18px ui-monospace, monospace';
        ctx.fillText(detail, W / 2, 48, W - 8);
      }
      tex.needsUpdate = true;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}
