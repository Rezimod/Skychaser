// A name tag that stays the same size on screen however far away its owner
// is, drawn over everything on a dark pill so a friend can be read from
// across the system, against a planet as well as against black.

import * as THREE from 'three';

const W = 512;
const H = 128;
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--seafoam').trim() || 'white';

export interface NameLabel {
  sprite: THREE.Sprite;
  set: (name: string, detail: string) => void;
  /** 0..1, for a pilot fading out. */
  setOpacity: (a: number) => void;
  dispose: () => void;
}

/** `height`: the tag's angular size — its height at one unit of distance. */
export function makeNameLabel(height: number): NameLabel {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  // No 2D canvas (a test's DOM, a refused context): a blank tag rather than a crash.
  const ctx = canvas.getContext('2d');
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
      if (key === shown || !ctx) return;
      shown = key;
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 50px system-ui, sans-serif';
      const nameW = Math.min(W - 24, ctx.measureText(name).width);
      ctx.font = '500 34px ui-monospace, monospace';
      const detailW = detail ? Math.min(W - 24, ctx.measureText(detail).width) : 0;
      // The pill behind the text, as wide as the longer line.
      const pw = Math.max(nameW, detailW) + 36;
      const ph = detail ? H - 8 : 70;
      const px = (W - pw) / 2;
      const py = (H - ph) / 2;
      ctx.fillStyle = 'rgba(4,7,12,0.62)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(px, py, pw, ph, 22);
      else ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.fillStyle = accent();
      ctx.font = '600 50px system-ui, sans-serif';
      ctx.fillText(name, W / 2, detail ? 42 : H / 2, W - 24);
      if (detail) {
        ctx.fillStyle = 'rgba(232,238,248,0.9)';
        ctx.font = '500 34px ui-monospace, monospace';
        ctx.fillText(detail, W / 2, 94, W - 24);
      }
      tex.needsUpdate = true;
    },
    setOpacity(a) {
      mat.opacity = a;
      sprite.visible = a > 0.01;
    },
    dispose() {
      tex.dispose();
      mat.dispose();
    },
  };
}
