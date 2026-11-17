// node seg.js <in> <out-mask.png>  — ISNet general-use (rembg's settings)
const ort = require('onnxruntime-node');
const sharp = require('sharp');
const os = require('os');
(async () => {
  const [inp, out] = process.argv.slice(2);
  const S = 1024;
  const sess = await ort.InferenceSession.create(os.homedir() + '/.u2net/isnet-general-use.onnx');
  const img = sharp(inp).flatten({ background: '#ffffff' });
  const { width, height } = await sharp(inp).metadata();
  const { data } = await img.clone().resize(S, S, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let mx = 0; for (const v of data) if (v > mx) mx = v; const max = mx / 255 || 1;
  const t = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) t[c * S * S + i] = (data[i * 3 + c] / 255 / max - 0.5) / 1.0;
  const r = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, S, S]) });
  const m = r[sess.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < S * S; i++) { if (m[i] < lo) lo = m[i]; if (m[i] > hi) hi = m[i]; }
  const px = Buffer.alloc(S * S);
  for (let i = 0; i < S * S; i++) px[i] = Math.round(((m[i] - lo) / (hi - lo)) * 255);
  await sharp(px, { raw: { width: S, height: S, channels: 1 } }).resize(width, height, { kernel: 'lanczos3' }).png().toFile(out);
  console.log(out, width, height);
})();
