// The head tags that make Stellar Explore an installable app, shared by the
// game (/play) and its platform page (/explore): the manifest, the icons, and
// what iOS needs on top (it ignores most of the manifest).

import type { Metadata } from 'next';

export const PWA_THEME = '#050812';
export const PWA_MANIFEST = '/play.webmanifest';
const ICONS = '/explore/site/icons';
const SPLASH = '/explore/site/splash';

/** iPhone launch screens, generated from a game frame and the mark: the
 *  device in pixels (portrait) and the CSS size + pixel ratio iOS matches on. */
export const SPLASH_SCREENS: ReadonlyArray<{ w: number; h: number; cssW: number; cssH: number; dpr: number }> = [
  { w: 1320, h: 2868, cssW: 440, cssH: 956, dpr: 3 }, // 16 Pro Max
  { w: 1206, h: 2622, cssW: 402, cssH: 874, dpr: 3 }, // 16 Pro
  { w: 1290, h: 2796, cssW: 430, cssH: 932, dpr: 3 }, // 14 Pro Max, 15 Plus / Pro Max, 16 Plus
  { w: 1179, h: 2556, cssW: 393, cssH: 852, dpr: 3 }, // 14 Pro, 15, 15 Pro, 16
  { w: 1284, h: 2778, cssW: 428, cssH: 926, dpr: 3 }, // 12 / 13 Pro Max, 14 Plus
  { w: 1170, h: 2532, cssW: 390, cssH: 844, dpr: 3 }, // 12, 13, 14, 12 / 13 Pro
  { w: 1125, h: 2436, cssW: 375, cssH: 812, dpr: 3 }, // X, XS, 11 Pro, 12 / 13 mini
  { w: 1242, h: 2688, cssW: 414, cssH: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { w: 828, h: 1792, cssW: 414, cssH: 896, dpr: 2 }, // XR, 11
  { w: 750, h: 1334, cssW: 375, cssH: 667, dpr: 2 }, // SE 2nd / 3rd gen, 8
];

export const splashPath = (w: number, h: number) => `${SPLASH}/splash-${w}x${h}.jpg`;

/** Both orientations: the game plays upright and sideways on a phone. */
function startupImages() {
  return SPLASH_SCREENS.flatMap(({ w, h, cssW, cssH, dpr }) => {
    const media = `(device-width: ${cssW}px) and (device-height: ${cssH}px) and (-webkit-device-pixel-ratio: ${dpr})`;
    return [
      { url: splashPath(w, h), media: `${media} and (orientation: portrait)` },
      { url: splashPath(h, w), media: `${media} and (orientation: landscape)` },
    ];
  });
}

export const APPLE_TOUCH_ICON = `${ICONS}/apple-touch-icon-180.png`;

/** Next writes `mobile-web-app-capable`; iOS before 17.4 still reads the Apple name. */
export const PWA_OTHER: Record<string, string> = { 'apple-mobile-web-app-capable': 'yes' };

/** Spread into a page's metadata. */
export const pwaMetadata: Pick<Metadata, 'manifest' | 'icons' | 'appleWebApp' | 'other'> = {
  manifest: PWA_MANIFEST,
  icons: {
    icon: [
      { url: `${ICONS}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${ICONS}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: APPLE_TOUCH_ICON, sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Explore',
    statusBarStyle: 'black-translucent',
    startupImage: startupImages(),
  },
  other: PWA_OTHER,
};
