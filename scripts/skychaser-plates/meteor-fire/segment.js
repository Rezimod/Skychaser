const ort = require('onnxruntime-node');
const sharp = require('sharp');
const G = '../gen/';
const names = process.argv.slice(2);
(async () => {
  const sess = await ort.InferenceSession.create('u2net.onnx');
  for (const n of names) {
    const img = sharp(G + n + '.png');
    const { width, height } = await img.metadata();
    const { data } = await img.clone().resize(320, 320, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
    let mx = 0; for (const v of data) if (v > mx) mx = v; const max = mx / 255 || 1;
    const t = new Float32Array(3 * 320 * 320);
    for (let i = 0; i < 320 * 320; i++) for (let c = 0; c < 3; c++) t[c * 320 * 320 + i] = (data[i * 3 + c] / 255 / max - mean[c]) / std[c];
    const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, 320, 320]) });
    const m = out[sess.outputNames[0]].data;
    let lo = Infinity, hi = -Infinity;
    for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const px = Buffer.alloc(320 * 320);
    for (let i = 0; i < m.length; i++) px[i] = Math.round(((m[i] - lo) / (hi - lo)) * 255);
    await sharp(px, { raw: { width: 320, height: 320, channels: 1 } }).resize(width, height, { kernel: 'lanczos3' }).png().toFile(`mask-${n}.png`);
    console.log(n);
  }
})();
