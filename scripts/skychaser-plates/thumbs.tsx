// Renders each card's face, frame and all, as it sits on a shelf at rest, to one WebP:
// public/cards/plate/<DESIGNATION>/card.webp. Shelves and the home fan show these instead of
// building the live card (layers, frame SVG, glitter filter, blend modes) a hundred times over.
// Draws CardFront itself, with the set's fonts from Google Fonts; no app server needed.
// Re-run after a plate or the frame changes.
//   npx tsx scripts/skychaser-plates/thumbs.tsx [DESIGNATION ...]
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SET_001_CARDS } from '@/lib/sets/set-001';
import { plateFor } from '@/lib/skychaser/plate';

const PUBLIC = path.resolve('public');
const ORIGIN = 'http://cards.local';
const FONTS =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Anton&family=Oswald:wght@300;400;500;600;700&display=block';
const only = process.argv.slice(2);
const names = only.length ? only : SET_001_CARDS.map((c) => c.seed.designation);

// The shelf's resting state (foil dark, glitter and glare low), on nothing, so the corners stay clear.
// Drawn at 520px wide so the poster's small type stays crisp in the WebP.
const style = `
  :root { --font-geist: 'Geist'; --font-mono: 'JetBrains Mono'; --font-anton: 'Anton'; --font-oswald: 'Oswald'; }
  html, body { margin: 0; background: transparent; }
  .wrap { --px: 0.5; --py: 0.5; width: 520px; }
  ${fs.readFileSync('src/components/skychaser/card/skychaser-card.css', 'utf8')}
  .sdc-card { box-shadow: inset 0 0 0 max(3px, 1cqw) #0008, inset 0 0 6cqw -1cqw color-mix(in srgb, var(--card-accent) 30%, transparent) !important; }
  .sdc-foil, .sdc-holo, .sdc-breath { opacity: 0 !important; }
  *, *::before, *::after { animation: none !important; }
  .sdc-glitter { opacity: 0.25 !important; }
  .sdc-glare { opacity: 0.5 !important; }
`;

async function main() {
  // tsx compiles the app's JSX with the classic runtime, which wants React in scope.
  Object.assign(globalThis, { React });
  const { default: CardFront } = await import('@/components/skychaser/card/CardFront');
  let html = '';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(120000);
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    const file = path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const type = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });

  for (const name of names) {
    const plate = plateFor(name);
    if (!plate) {
      console.error(`${name}: not in the set`);
      continue;
    }
    const face = renderToStaticMarkup(React.createElement(CardFront, { plate, u: 't' }));
    html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>${style}</style></head><body><div class="wrap">${face}</div></body></html>`;
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const card = page.locator('.sdc-card');
    await card.evaluate((el) => Promise.all([...el.querySelectorAll('img')].map((i) => i.decode().catch(() => {}))));
    const png = await card.screenshot({ omitBackground: true });
    await sharp(png).resize(520).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(path.join(PUBLIC, 'cards/plate', name, 'card.webp'));
    console.log(name);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
