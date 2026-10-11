// Renders a plate's three layers stacked, as the card window shows them, to a PNG.
//   node scripts/skychaser-plates/preview.mjs <DESIGNATION> [out.png]
// Reads public/cards/plate/<DESIGNATION>/{sky,object,survey}.svg.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [des, out = `/tmp/plate-${process.argv[2]}.png`] = process.argv.slice(2);
const dir = path.resolve('public/cards/plate', des);
const layer = (n) => fs.readFileSync(path.join(dir, `${n}.svg`), 'utf8');
const html = `<body style="margin:0;background:#080d1e"><div style="position:relative;width:582px;height:832px;overflow:hidden">
${['sky', 'object', 'survey'].map((n) => `<div style="position:absolute;inset:0">${layer(n)}</div>`).join('')}</div></body>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 582, height: 832 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(400);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 582, height: 832 } });
await browser.close();
console.log(out);
