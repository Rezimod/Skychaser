// Writes public/cards/art/sm/<DESIGNATION>.webp: each painted scene at half size, for the shelf
// and the Collection, where a card is never shown wider than about 220px. Re-run after any picture changes.
//   npx tsx scripts/skychaser-plates/art-small.ts
import sharp from 'sharp';
import fs from 'node:fs';

fs.mkdirSync('public/cards/art/sm', { recursive: true });
for (const f of fs.readdirSync('public/cards/art').filter((f) => f.endsWith('.webp'))) {
  await sharp(`public/cards/art/${f}`).resize(440).webp({ quality: 74, effort: 6 }).toFile(`public/cards/art/sm/${f}`);
}
