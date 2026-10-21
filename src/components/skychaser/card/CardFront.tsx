import { memo, type CSSProperties, type ReactNode } from 'react';
import FadeImg from '../FadeImg';
import type { Plate } from '@/lib/skychaser/plate';
import { perkFor } from '@/lib/skychaser/perks';
import { cardPriceUsd } from '@/lib/skychaser/economics';
import { SHELF_BY_DESIGNATION } from '@/lib/sets/shelf';
import ACCENTS from '@/lib/skychaser/accents.json';
import AgencyBadge, { MISSION } from './AgencyBadge';
import { rarityInfo } from '@/lib/rarity';

type Props = {
  plate: Plate;
  capture?: string | null;
  lite?: boolean;
  priority?: boolean;
  /** On the shelf, drawn small: the half-size picture. */
  small?: boolean;
  u: string;
  /** '$8', or 'Sealed'. Defaults to the card's list price. */
  price?: string;
  /** The line at the foot: how many are left, or an Almanac card's date. */
  sub?: ReactNode;
};

/** The card's painted scene (scripts/skychaser-plates/art-prompts.json). */
export const artFor = (designation: string, small = false) => `/cards/art/${small ? 'sm/' : ''}${designation}.webp?v=4`;

/** The card's colour, sampled from its own picture (scripts/skychaser-plates/accents.ts). */
export const accentFor = (designation: string) => (ACCENTS as Record<string, string>)[designation] ?? '#dfe3ea';

/** Ink for text set on the card's colour: near-black on a light colour, white on a dark one. */
export function accentInkFor(designation: string) {
  const c = accentFor(designation);
  const m = c.match(/hsl\((\d+) (\d+)% (\d+)%\)/);
  let r = 0.87, g = 0.89, b = 0.92;
  if (m) {
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const ch = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    [r, g, b] = [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
  }
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.36 ? '#120b06' : '#ffffff';
}

/** The pictures a full-size card face loads, to fetch ahead of opening it. */
export function faceSources(plate: Plate) {
  return [artFor(plate.designation)];
}

function CardFront({ plate, capture, priority = false, small = false, price, sub }: Props) {
  const source = capture ?? artFor(plate.designation, small);
  const seed = SHELF_BY_DESIGNATION.get(plate.designation)?.seed;
  const perk = perkFor(plate.designation, plate.rarity);
  const shown = price ?? `$${cardPriceUsd(plate.designation, plate.rarity)}`;
  const foot = sub ?? `${Number(plate.of)} editions`;

  return (
    <div
      className="sdc-card sdc-card--front"
      data-rarity={plate.rarity}
      style={{ '--card-accent': accentFor(plate.designation), '--rarity': rarityInfo(plate.rarity).color } as CSSProperties}
    >
      <header className="sdc-top">
        <span className="sdc-no">No. {plate.num}</span>
        <span className="sdc-tier">{plate.rname}<i aria-hidden="true" /></span>
      </header>
      <div className="sdc-panel">
        <div className="sdc-art">
          <FadeImg src={source} alt="" priority={priority} />
          {MISSION[plate.designation] && <AgencyBadge agencies={['NASA']} label={MISSION[plate.designation]} className="sdc-mission" />}
        </div>
        <div className="sdc-caption">
          <div className="sdc-title">
            <strong className="sdc-name" style={{ '--card-name-size': `${Math.max(7, Math.min(10.5, 150 / plate.name.length))}cqw` } as CSSProperties}>{plate.name}</strong>
            <span className="sdc-price">{shown}</span>
          </div>
          <span className="sdc-kind">{seed?.objectType ?? plate.poster.headline}</span>
          <div className="sdc-foot">
            <span className="sdc-perk">{perk.short}</span>
            <span className="sdc-left">{foot}</span>
          </div>
        </div>
      </div>
      <div className="sdc-glare" aria-hidden="true" />
    </div>
  );
}

export default memo(CardFront);
