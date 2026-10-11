// Renders each plate's sky and object layers, as Chrome draws them, to WebP at two-thirds size beside the SVGs:
// public/cards/plate/<DESIGNATION>/{sky,object}.webp. Small cards load these; the hero card keeps the SVGs.
//   node scripts/skychaser-plates/raster.mjs [DESIGNATION ...]
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/cards/plate');
const only = process.argv.slice(2);
const names = (only.length ? only : fs.readdirSync(ROOT)).filter((d) => fs.existsSync(path.join(ROOT, d, 'object.svg')));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 582, height: 832 }, deviceScaleFactor: 1 });
for (const name of names) {
  for (const layer of ['sky', 'object']) {
    const svg = fs.readFileSync(path.join(ROOT, name, `${layer}.svg`), 'utf8');
    await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
    await page.waitForTimeout(150);
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: 582, height: 832 }, omitBackground: layer === 'object' });
    await sharp(png).resize(388, 555).webp({ quality: 72, alphaQuality: 85, effort: 6 }).toFile(path.join(ROOT, name, `${layer}.webp`));
  }
  console.log(name);
}
await browser.close();
