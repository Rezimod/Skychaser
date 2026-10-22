import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { SET_001_CARD_BY_DESIGNATION } from '@/lib/sets/set-001';
import { isRarity, rarityInfo } from '@/lib/rarity';

export const alt = 'One numbered edition of a Skychaser card';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Drawn on first request and cached a day, as the card's preview is. */
export const revalidate = 86400;

const read = (path: string) => readFile(join(process.cwd(), path));
const pad = (n: number) => String(n).padStart(3, '0');

/** An edition's link preview: the card's face, its name, and the number that makes it this holder's. */
export default async function Image({ params }: { params: Promise<{ designation: string; number: string }> }) {
  const { designation, number } = await params;
  const card = SET_001_CARD_BY_DESIGNATION.get(designation.toUpperCase());
  const n = /^[0-9]{1,6}$/.test(number) ? Number(number) : 0;
  const [g600, face] = await Promise.all([
    read('src/app/_og/geist-600.ttf'),
    card ? read(`public/cards/plate/${card.seed.designation}/card.webp`).then((b) => sharp(b).resize({ height: 547 }).flatten({ background: '#0d0d0d' }).jpeg({ quality: 88 }).toBuffer()).catch(() => null) : null,
  ]);
  const name = card?.seed.name ?? 'Genesis';
  const rarity = card && isRarity(card.seed.rarity) ? rarityInfo(card.seed.rarity) : null;
  const edition = card && n > 0 ? `No. ${pad(n)} of ${card.seed.editionSize}` : 'Edition';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0d0d0d', fontFamily: 'Geist', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute', left: 560, top: -160, width: 760, height: 760, borderRadius: 760,
            background: `radial-gradient(circle, ${rarity?.color ?? '#D8B66F'}30 0%, rgba(13, 13, 13, 0) 70%)`,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, width: 700, padding: '0 80px' }}>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: 10, color: '#ADADA8' }}>SKYCHASER · EDITION</div>
          <div style={{ fontSize: name.length > 22 ? 54 : 68, fontWeight: 600, letterSpacing: -2, lineHeight: 1.04, color: '#FFFFFF' }}>{name}</div>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: 2, color: rarity?.color ?? '#D8B66F' }}>{edition}</div>
          {rarity && <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: 6, color: '#ADADA8' }}>{rarity.label.toUpperCase()}</div>}
        </div>
        {face && (
          <img
            src={`data:image/jpeg;base64,${face.toString('base64')}`}
            width={392}
            height={547}
            style={{ position: 'absolute', right: 110, top: 42, borderRadius: 18, boxShadow: '0 30px 80px rgba(0,0,0,0.85)' }}
          />
        )}
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Geist', data: g600, weight: 600, style: 'normal' }],
    },
  );
}
