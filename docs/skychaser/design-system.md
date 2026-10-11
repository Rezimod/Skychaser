# Stellar design system

The brief for every Stellar page. Read `docs/skychaser/RULES.md` (tone and vocabulary) first.

**Site direction — 2026-10-09, the Odyssey layer (`src/styles/skychaser-odyssey.css`).** The site keeps its bold poster type (Bowlby One, Anton, Oswald; owner asked for it back). The layer adds HAL red, the login colour, for every call to action; black monolith panels with corner brackets; a red glow behind the home hero (no hyperspace lines, owner removed them); deep space behind every page; the rarity filter as a console over the shelf (it scrolls with the cards; the capsule counter on the left is the pinned column from 1024px). Rarity colours: common blue #4C8DFF, rare violet #A66BFF, epic the login red #E3482C with white text, legendary gold #D8B66F with dark text. Rarity badges carry the word only, no diamonds.

**Current card direction — 2026-10-09, owner’s Figma reference, then the 2001 pass.** Dark, full-bleed astronomy artwork, fine rarity borders (grey, blue, violet, gold). The face says three things only: the rarity badge, the name (bold Anton again, owner's reference 2026-10-09), its one-line description, and the set number under a hairline. The card stock is rich: a metallic rim in the rarity colour (`.sdc-card::after`, a masked gradient ring), an inner glow behind the object that strengthens with rarity, a diagonal sheen that follows the pointer, an inner bevel; around it a halo in the rarity colour on the shelf, in the viewer and on the card page. Earlier note: card type was Michroma (`--font-michroma`, the wide Eurostile Extended of *2001: A Space Odyssey*’s screens) for the name, the number, the badge and the back’s name; `CardFront.nameSize` fits the longest word on one line and the whole name on two. No headline, no set word, no quote on the face. The sealed card (`public/cards/sealed.webp?v=odyssey1`) is the same black card with gold rings and a gold `?`. Moon Rock shows NASA’s Apollo 16 sample 68815 cut onto black. A restrained reflection follows the pointer; field-note backs contain real object records and image attribution. `CardFront` is the source for both the live viewer and generated WebP shelf/share thumbnails. Regenerate all thumbnails with `npx tsx scripts/skychaser-plates/thumbs.tsx` after changing its artwork or styling, and update the version in `CardThumb.tsx`. The capsule counter (the glowing star, the four capsules, the odds and what each rarity gives) stands beside the shelf on the left, as before; the shelf runs four columns and becomes two on phones. The rarity is not drawn into the face: `RarityBadge` sits on the card's corner like a stuck-on label, inside `CardThumb` and on the viewer's front face, with a passing glint (epic and legendary breathe). The viewer supports previous/next, F to turn, Escape to close, focus containment and reduced motion. Catalog size, odds, prices and inventory come from the product data, not the illustrative numbers in the reference.

**Previous direction, 2026-10-02: the space-opera poster.** Every
card copies the owner's Crab Nebula and Saturn references — cream stock, a dark
window with the drawing (warmed, sun rays, halftone, colour fringe), a quote
across the top, the name in Bowlby One sunset letters banded at the foot with a
glint, an Oswald line spaced out under it, and a cream panel (three warm rules,
Anton headline, red sub-line, three figures, FIRST LIGHT · FOUNDING SET ·
edition). The back is the real thing: a photograph of the object (Hubble first,
then other missions; artist's impressions labelled, fiction drawn) with its
credit, then the story and the record. The site wears the same palette —
espresso night, cream ink, sunset orange/brick, gold — and the same faces.
Copy per card: `src/lib/skychaser/poster.ts`; photos and credits:
`src/lib/skychaser/photos.json` + `public/cards/photo/`. Re-render shelf images
with `npx tsx scripts/skychaser-plates/thumbs.tsx` after any card change.

**Superseded 2026-09-21, by the owner.** The card product wears the Stellar design
language — the same cosmic navy canvas, terracotta accent and Geist/JetBrains
stack that stellarr.club runs on — with the Stellar comet mark beside the
name. The references are ripcars.io and skymapper.io: a hero that shows the
product, one hot accent, numbered steps, stat rows. The institutional
serif-and-brass system described in the rest of this file is **no longer in
force**; `src/styles/skychaser-theme.css` is the current source of truth, and
the sections below are kept only for the parts that still hold (the plate
anatomy, rarity vs observation status, the primitives). Do not restore the
serif system without asking.

## Opting in

Stellar pages wrap themselves in `StellarShell`. Nothing else is needed:

```tsx
import StellarShell from '@/components/skychaser/SkychaserShell';

export default function Page() {
  return (
    <StellarShell>
      <section className="sd-container">…</section>
    </StellarShell>
  );
}
```

The shell puts `.stellar` on its root. That class scopes every token below, re-points `--font-display`, `--font-body` and `--font-mono` to the two Stellar faces, and hides the legacy Stellar nav, footer, bottom tabs and starfield while the page is mounted (`html:has(.stellar)`). Legacy pages do not change. The shell provides a sticky top bar (wordmark, Set 001, Capsules, Collection, account control — Tonight joins it in Phase 8) and a footer line. Do not render a second `<main>`; the root layout already has one.

Stellar is dark-only. The light theme and the `data-theme` toggle do not reach inside `.stellar`. Field mode (red night vision) still applies, on purpose.

## Tokens (`src/styles/skychaser-theme.css`)

| Token | Value | Use |
| --- | --- | --- |
| `--sd-ground` | `#0b0c0e` | Page ground. Near-black, faintly cool. Never `#000`. |
| `--sd-plate` / `--sd-plate-hover` | `#131417` / `#181a1d` | A card plate, a menu, a raised panel. |
| `--sd-ink` | `#ece7da` | Bone white. Object names, headings, body. 15.9:1. |
| `--sd-ink-2` | `#b3aea1` | Secondary copy, data values. 8.8:1. |
| `--sd-ink-3` | `#8a867c` | Captions, data labels. The floor for text: 5.4:1. |
| `--sd-ink-4` | `#5f5c55` | Outlines of unowned plates, disabled. Not for text. |
| `--sd-rule` / `--sd-rule-strong` | ink at 12% / 24% | 1px hairlines. The only separators. |
| `--brass` | `#c9a84c` | The one warm accent. Defined on `:root` too. |
| `--sd-rarity-common` | `#978d72` | Brass ramp, nearest the neutrals. |
| `--sd-rarity-rare` | `#b09a5f` | |
| `--sd-rarity-epic` | `#c9a84c` | `= --brass` |
| `--sd-rarity-legendary` | `#e2c77a` | Brightest brass. |
| `--sd-status-dedicated` / `-eligible` / `-not-available` | ink / ink-2 / ink-3 | Observation status. Monochrome. |
| `--sd-gutter` / `--sd-max` / `--sd-bar-h` | `16px` / `1040px` / `56px` | Layout. |

The same rarity hexes live in `RARITY_MAP` in `src/lib/rarity.ts`; `rarityInfo(r).color` is safe to use for an SVG stroke or a share image.

Utilities: `.sd-container` (gutter and measure), `.sd-display`, `.sd-name`, `.sd-mono`, `.sd-data`, `.sd-label`, `.sd-rule`. They are unlayered, so they beat the global `p` and `h1`–`h6` rules and also Tailwind utilities. Do not combine an `sd-*` type class with a Tailwind font or tracking class on the same element.

## Type — two faces, nothing else

- **Baskervville** (`--font-stellar-serif`, `.sd-serif`), a transitional serif revived from Baskerville's 1757 type, the face of mid-century institutional print. Wordmark, object names, headings, body copy. Regular weight, and italic for a Latin or catalogue name. It has no small caps, so the wordmark uses capitals, widely tracked.
- **IBM Plex Mono** (`--font-stellar-mono`, `.sd-mono`), a typewriter-lineage mono with tabular figures. Use it for all data: coordinates, UTC timestamps, edition numbers, magnitudes, node IDs, prices, counts, rarity and status words. Any number that came off an instrument goes in mono.

No sans. No Orbitron, Geist or JetBrains Mono on a Stellar page. The minimum text size is 12px.

## The brass rule

Brass marks rarity and does nothing else. It is never used for a link, a button, a hover state, a focus ring, a heading, a price or a "live" state. Interactive states use ink and hairlines. If a screen shows brass anywhere except a rarity mark or a rarity-coloured plate rule, it is wrong.

Rarity rises along one ramp: common sits nearest the neutrals and legendary is the brightest brass. It also rises through the glyph: an open diamond, a diamond with a centre, a filled diamond, then a four-point star. Colour alone never carries it.

## Observation status is not rarity

`dedicated` / `eligible` / `not_available` answer whether Node 01 can photograph the card. That question has nothing to do with scarcity: Europa is epic and cannot be observed. The mark uses ink, never brass. Its glyphs are circles, never diamonds: filled, open, and open with a stroke through it. It sits in a hairline outline, dashed for `not_available`. Always show both marks on a plate, side by side.

Node 01 is `commissioning`. No string may imply that it is observing now.

## No decorative glow

No glow, lens flare, starburst, gradient mesh, glass, gradient text or coloured shadow. Light that the object itself emits is fine, and expected: Jupiter and Orion glow in reality. The rule is that every glow must come from the object. Depth comes from hairlines and the ground/plate step, not from shadows. The capsule reveal is the one place for motion, and it uses CSS keyframes only. Respect `prefers-reduced-motion`.

## Card plate anatomy

A card is a plate in a catalogue, one object shot on black, repeated without variation.

```
┌──────────────────────────────┐  --sd-plate, 1px --sd-rule border (rarity colour for epic/legendary)
│                              │
│         [ image ]            │  full width of the plate, object on black
│                              │
├──────────────────────────────┤  <Rule strong />
│ M42                          │  designation — .sd-label
│ Orion Nebula                 │  object name — .sd-name (serif)
│ ◆ EPIC        ○ Eligible     │  <RarityMark> + <ObservationStatusMark>, always both
│ ED 017 / 250 · MAG 4.0 · …   │  <DataRow> in mono, beneath the image
└──────────────────────────────┘
```

Image first, then designation, name, edition number (`017 / 250`, zero-padded, never "mint number"), rarity and observation status. Metadata goes beneath the image in mono, the way a survey captions a detection. An unowned card in `/set/001` is the same plate drawn as an outline (`--sd-ink-4` hairline, no image).

An observation image is shown full width with its real capture data beneath it in a `<Caption>`: node, UTC timestamp, instrument, seeing. That data is the ornament. A third-party image carries its source in the caption, always.

## Primitives (`src/components/skychaser/ui/`)

All are server components with no client JavaScript.

| Component | Props | Notes |
| --- | --- | --- |
| `Wordmark` | `size?: 'sm'\|'md'\|'lg'`, `href?`, `asHeading?` | Text-set, serif capitals. No logo file exists yet. |
| `Caption` | `parts?: string[]` or `children`, `source?`, `as?` | Mono line beneath an image, joined with `·`. |
| `DataRow` | `items: {label, value}[]`, `layout?: 'inline'\|'stacked'` | A `<dl>`, so labels pair with values for screen readers. |
| `RarityMark` | `rarity`, `glyphOnly?` | Brass glyph and word. The screen reader hears "Rarity: Epic". |
| `ObservationStatusMark` | `status` | Ink circle and word in a hairline box. |
| `Rule` | `strong?` | 1px hairline `<hr>`. |

The shell itself is `src/components/skychaser/SkychaserShell.tsx`, with `StellarNavLinks` and `StellarAccount` as its only client parts. `StellarAccount` uses the same Privy hooks and `AuthModal` as the legacy nav.

## Layout

Design mobile-first at 360px, with 16px gutters and no horizontal scroll. The content measure is 1040px, centred. Below 640px the top bar drops its links to a second row. Tap targets are at least 36px tall.

## Words

Use: capsule, card, set, observation, Node 01, Collection, holder, edition number. Never write NFT, mint, drop, payload, manifest, registry, airdrop, "verified" (unless plate-solved), exclamation marks or emoji. The copy is English only.
