// Writes src/lib/sets/set-001.shelf.json: each card's seed and record, worked out once here so a
// browser never loads the telescope model or the sky catalogue to print a card. Re-run after any
// change to the set; a test fails while the file is out of date.
//   npx tsx scripts/skychaser-shelf.ts
import fs from 'node:fs';
import { SET_001_CARDS } from '@/lib/sets/set-001';

const shelf = SET_001_CARDS.map(({ seed, record }) => ({ seed, record }));
fs.writeFileSync('src/lib/sets/set-001.shelf.json', JSON.stringify(shelf) + '\n');
console.log(`${shelf.length} cards`);
