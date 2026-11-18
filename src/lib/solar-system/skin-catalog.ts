// The liveries a ship can fly in, as data: ids, colours, the swatch the
// picker shows. No three.js here, so the menus and the save can read it
// without pulling the renderer in; ship-skins.ts puts them on a hull.

export const SKIN_IDS = [
  'factory', 'crimson', 'cobalt', 'stealth', 'gold', 'synthwave',
  'arctic', 'aurora', 'georgia', 'carbon', 'hazard',
] as const;
export type SkinId = (typeof SKIN_IDS)[number];
export const DEFAULT_SKIN: SkinId = 'factory';

export type Pattern = 'pinstripe' | 'grid' | 'camo' | 'aurora' | 'georgia' | 'carbon' | 'hazard';

export interface Skin {
  id: SkinId;
  /** Multiplies the light paint (and the pattern, when there is one). */
  paint: number;
  /** Multiplies the dark panels and trim. */
  trim: number;
  /** Replaces the baked accent colour (the orange flashes). */
  accent: number;
  /** Hull metalness and roughness factors. */
  metal: number;
  rough: number;
  pattern?: Pattern;
  /** Pattern tiles along the hull's length. */
  repeats?: number;
  /** How much the pattern lights itself (neon trim). */
  glow?: number;
  /** Colour the hull turns at grazing angles (Aurora's shimmer), and how far. */
  sheen?: number;
  sheenAmt?: number;
  /** Window and lamp glow. */
  lamp: number;
  /** The drive's flame, engine core and plume. */
  drive: number;
  /** Bolt colour hint, for whoever draws this pilot's shots. */
  bolt: number;
  /** CSS for a picker swatch and a name-tag chip. */
  swatch: string;
  chip: string;
}

export const SKINS: Record<SkinId, Skin> = {
  factory: {
    id: 'factory', paint: 0xffffff, trim: 0xffffff, accent: 0xff9448, metal: 1, rough: 0.72,
    lamp: 0xffffff, drive: 0, bolt: 0xffb35a,
    swatch: 'linear-gradient(135deg, #d9dde3 0 58%, #4a5059 58% 80%, #ff9448 80%)', chip: '#c9ced6',
  },
  crimson: {
    id: 'crimson', paint: 0xc0182a, trim: 0xdcdcdc, accent: 0xf4f4f4, metal: 0.55, rough: 0.42,
    lamp: 0xffd2a8, drive: 0xff5a36, bolt: 0xff5040,
    swatch: 'linear-gradient(135deg, #c0182a 0 58%, #2b2d33 58% 80%, #f4f4f4 80%)', chip: '#e0283a',
  },
  cobalt: {
    id: 'cobalt', paint: 0x2457e0, trim: 0xc8d4ff, accent: 0xffc531, metal: 0.85, rough: 0.32,
    lamp: 0xa8d4ff, drive: 0x5aa0ff, bolt: 0x6ab0ff,
    swatch: 'linear-gradient(135deg, #2457e0 0 58%, #1a2238 58% 80%, #ffc531 80%)', chip: '#3a6cff',
  },
  stealth: {
    id: 'stealth', paint: 0xffffff, trim: 0x707070, accent: 0xff2233, metal: 0.25, rough: 1,
    pattern: 'pinstripe', repeats: 3, glow: 1.2,
    lamp: 0xff3344, drive: 0xff2a3a, bolt: 0xff3040,
    swatch: 'linear-gradient(135deg, #1b1d21 0 46%, #ff2233 46% 50%, #1b1d21 50% 80%, #ff2233 80%)', chip: '#ff2233',
  },
  gold: {
    id: 'gold', paint: 0xe0b04a, trim: 0x9c8460, accent: 0x1c1a17, metal: 1, rough: 0.24,
    lamp: 0xffe2a8, drive: 0xffc04a, bolt: 0xffd060,
    swatch: 'linear-gradient(135deg, #f3d27a 0 30%, #c8962e 58%, #1c1a17 80%)', chip: '#e8b84a',
  },
  synthwave: {
    id: 'synthwave', paint: 0xffffff, trim: 0x8a6ac0, accent: 0x21f0ff, metal: 0.5, rough: 0.4,
    pattern: 'grid', repeats: 5, glow: 1.6,
    lamp: 0x21f0ff, drive: 0xff4fd8, bolt: 0xff4fd8,
    swatch: 'linear-gradient(135deg, #2a0b46 0 40%, #ff2bd6 40% 48%, #2a0b46 48% 70%, #21f0ff 70%)', chip: '#ff2bd6',
  },
  arctic: {
    id: 'arctic', paint: 0xffffff, trim: 0xd0dae4, accent: 0x2b82c9, metal: 0.15, rough: 0.85,
    pattern: 'camo', repeats: 2.2,
    lamp: 0xd8f0ff, drive: 0xbfe8ff, bolt: 0xc8f0ff,
    swatch: 'radial-gradient(circle at 30% 35%, #8796a6 0 18%, transparent 19%), radial-gradient(circle at 70% 70%, #5b6876 0 16%, transparent 17%), radial-gradient(circle at 72% 25%, #c3ccd4 0 20%, transparent 21%), #eef2f5', chip: '#cfe0ee',
  },
  aurora: {
    id: 'aurora', paint: 0xffffff, trim: 0x8aa0d0, accent: 0xc4f1ff, metal: 0.9, rough: 0.22,
    pattern: 'aurora', repeats: 1.2, glow: 0.12, sheen: 0xff6ad5, sheenAmt: 0.75,
    lamp: 0x9cfff0, drive: 0x7cffd0, bolt: 0x7cffd0,
    swatch: 'linear-gradient(135deg, #19d3c5, #3b82f6 45%, #8b5cf6 75%, #ff6ad5)', chip: '#3fd9c9',
  },
  georgia: {
    id: 'georgia', paint: 0xffffff, trim: 0xffffff, accent: 0xe3141b, metal: 0.25, rough: 0.5,
    pattern: 'georgia', repeats: 1.6,
    lamp: 0xfff2ee, drive: 0xff6a5a, bolt: 0xff4a40,
    swatch: 'linear-gradient(90deg, transparent 42%, #e3141b 42% 58%, transparent 58%), linear-gradient(0deg, transparent 42%, #e3141b 42% 58%, transparent 58%), #fafafa', chip: '#e3141b',
  },
  carbon: {
    id: 'carbon', paint: 0xffffff, trim: 0x8a8a8a, accent: 0xc8ff2a, metal: 0.4, rough: 0.34,
    pattern: 'carbon', repeats: 26,
    lamp: 0xd7ff3a, drive: 0x9fd8ff, bolt: 0xc8ff2a,
    swatch: 'repeating-linear-gradient(45deg, #2a2c31 0 4px, #3c3f46 4px 8px), #2a2c31', chip: '#c8ff2a',
  },
  hazard: {
    id: 'hazard', paint: 0xffffff, trim: 0xb0a080, accent: 0x151515, metal: 0.3, rough: 0.6,
    pattern: 'hazard', repeats: 5,
    lamp: 0xffcc00, drive: 0xffd23a, bolt: 0xffd23a,
    swatch: 'repeating-linear-gradient(45deg, #ffcc00 0 7px, #151515 7px 14px)', chip: '#ffcc00',
  },
};

export function isSkinId(v: unknown): v is SkinId {
  return typeof v === 'string' && (SKIN_IDS as readonly string[]).includes(v);
}

export const skinOr = (v: unknown, fallback: SkinId = DEFAULT_SKIN): SkinId => (isSkinId(v) ? v : fallback);

/** The paint a pilot flies in until they pick one: from their id, so two
 *  players who never open the picker still look different. FNV-1a. */
export function defaultSkinFor(id: string): SkinId {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return SKIN_IDS[(h >>> 0) % SKIN_IDS.length];
}
