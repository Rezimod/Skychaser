// Writes public/cards/art/sm/<DESIGNATION>.webp, each painted scene at half size, for the shelf and
// the Collection, where a card is never shown wider than about 220px; and public/cards/plate/<D>/card-sm.webp,
// each baked face at 400px, for the home page's fans. Re-run after any picture or face changes.
//   npx tsx scripts/skychaser-plates/art-small.ts
import sharp from 'sharp';
import fs from 'node:fs';

async function main() {
  fs.mkdirSync('public/cards/art/sm', { recursive: true });
  for (const f of fs.readdirSync('public/cards/art').filter((f) => f.endsWith('.webp'))) {
    await sharp(`public/cards/art/${f}`).resize(440).webp({ quality: 74, effort: 6 }).toFile(`public/cards/art/sm/${f}`);
  }
  for (const d of fs.readdirSync('public/cards/plate')) {
    const face = `public/cards/plate/${d}/card.webp`;
    if (fs.existsSync(face)) await sharp(face).resize(400).webp({ quality: 80, effort: 6 }).toFile(`public/cards/plate/${d}/card-sm.webp`);
  }
}

void main();
