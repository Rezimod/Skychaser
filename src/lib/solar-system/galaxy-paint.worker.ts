// Paints a galaxy disk off the main thread and hands back its pixels. Pixels,
// not an ImageBitmap: a bitmap from a worker's canvas lives on that worker's
// GPU context, and the page's WebGL context cannot upload it ("invalid mailbox").
import { ANDROMEDA_MODEL, MILKY_WAY_MODEL, paintSpiralGalaxy } from '@/lib/solar-system/galaxy-paint';

export interface GalaxyPaintRequest { galaxy: 'milky-way' | 'andromeda'; lite: boolean; size: number }

const reply = (msg: Uint8ClampedArray | null) => (self as unknown as Worker).postMessage(msg, msg ? [msg.buffer] : []);

self.onmessage = (e: MessageEvent<GalaxyPaintRequest>) => {
  const { galaxy, lite, size } = e.data;
  const ctx = new OffscreenCanvas(size, size).getContext('2d');
  if (!ctx) { reply(null); return; }
  paintSpiralGalaxy(ctx, galaxy === 'andromeda' ? ANDROMEDA_MODEL : MILKY_WAY_MODEL, lite, size);
  reply(ctx.getImageData(0, 0, size, size).data);
};
