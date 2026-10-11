// Samples each card's accent from its own front picture: the strongest hue in it, made bold enough
// for a rim. Pictures with no real colour (the Moon, Mercury, grey rock) get silver.
// Writes src/lib/skychaser/accents.json. Re-run after any front picture changes.
//   npx tsx scripts/skychaser-plates/accents.ts
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { SET_001_CARDS } from '@/lib/sets/set-001';

const SILVER = '#dfe3ea';

function hsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

async function accent(file: string) {
  const { data } = await sharp(file).resize(64, 64, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Array(36).fill(0);
  const hues: number[][] = Array.from({ length: 36 }, () => []);
  let colourful = 0;
  for (let i = 0; i < data.length; i += 3) {
    const [h, s, l] = hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    if (s < 0.25 || l < 0.15 || l > 0.9) continue;
    const w = s * (1 - Math.abs(l - 0.5) * 1.4);
    bins[Math.floor(h / 10) % 36] += w;
    hues[Math.floor(h / 10) % 36].push(h, w);
    colourful += w;
  }
  if (colourful < 12) return SILVER;
  // The strongest hue, smoothed over its neighbours so a gradient does not split it.
  const smooth = bins.map((_, i) => bins[(i + 35) % 36] * 0.5 + bins[i] + bins[(i + 1) % 36] * 0.5);
  const top = smooth.indexOf(Math.max(...smooth));
  // The exact hue: the weighted mean of the pixels in that bin and its two neighbours.
  let sum = 0, weight = 0;
  for (const k of [top + 35, top, top + 1]) {
    const list = hues[k % 36];
    for (let i = 0; i < list.length; i += 2) {
      const h = list[i] + (k === top + 35 && top === 0 ? -360 : k === top + 1 && top === 35 ? 360 : 0);
      sum += h * list[i + 1];
      weight += list[i + 1];
    }
  }
  const raw = ((sum / weight) % 360 + 360) % 360;
  // Most of the set is fire, rust and gold, all within a few degrees of orange; spread those apart
  // so a red Mars, an orange Jupiter and a gold Saturn read as three colours.
  const hue = Math.round(raw < 60 ? Math.min(52, Math.max(4, 26 + (raw - 26) * 2.2)) : raw);
  // Blues and violets read darker, so they are lifted a little more.
  const light = hue > 190 && hue < 290 ? 64 : 58;
  return `hsl(${hue} 82% ${light}%)`;
}

async function main() {
  const out: Record<string, string> = {};
  for (const { seed } of SET_001_CARDS) {
    const d = seed.designation;
    out[d] = await accent(path.join('public/cards/art', `${d}.webp`));
    console.log(d, out[d]);
  }
  fs.writeFileSync('src/lib/skychaser/accents.json', JSON.stringify(out, null, 1) + '\n');
}

main();
