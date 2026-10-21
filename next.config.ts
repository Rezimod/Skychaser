import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** The legacy Skychaser project's production alias — independent of which project holds the custom domains. */
const LEGACY_ORIGIN = 'https://stellarsky.vercel.app';

const nextConfig: NextConfig = {
  compress: true,
  experimental: {
    // Disabled: Vercel webpack occasionally crashed with
    // `uncaughtException TypeError: Cannot read properties of undefined (reading 'length')`
    // during "Creating an optimized production build" while this was enabled.
    reactCompiler: false,
    // Privy/Solana barrel optimization can crash Vercel webpack (undefined `.length`).
    optimizePackageImports: ['lucide-react'],
  },
  serverExternalPackages: ['three', 'astronomy-engine'],
  // OG image reads its background + fonts from disk at request time.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./src/app/_og/**'],
    '/card/[designation]/opengraph-image': ['./src/app/_og/geist-600.ttf', './public/cards/plate/*/card.webp'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'www.celestron.com' },
      { protocol: 'https', hostname: 'www.bresser.com' },
      { protocol: 'https', hostname: 'images.bresser.de' },
      { protocol: 'https', hostname: 'astroman.ge' },
      { protocol: 'https', hostname: 'levenhuk.com' },
      { protocol: 'https', hostname: 'www.levenhuk.com' },
    ],
  },
  turbopack: {
    root: __dirname,
    resolveAlias: {
      '@farcaster/mini-app-solana': { browser: './src/lib/empty-module.ts' },
      // Optional Privy fiat-onramp peer dep we don't use — silences a build warning.
      '@stripe/crypto': { browser: './src/lib/empty-module.ts' },
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@farcaster/mini-app-solana': false,
      // Optional Privy fiat-onramp peer dep we don't use — silences a build warning.
      '@stripe/crypto': false,
    };
    if (process.env.VERCEL) {
      config.cache = false;
    }
    return config;
  },
  // skychaser.io is the card product (stellarr.club forwards its pages there); the legacy app lives on its own project. Only what
  // minted metadata, old links and this app still point at here is forwarded to it: /m/*, the
  // NFT metadata and images, observation photos, OG images, passports, the signed X-agent links,
  // and what this app's own pages call: the user/cohort upserts and the voyage's sky forecast. Nothing that moves money or SOL (mint,
  // orders, wallet/fund, award-stars, redeem-code, stars, club, admin) is reachable from here.
  // The set's page moved from /set/001 to /genesis; old links and search results follow it.
  // The old domain's pages move to skychaser.io; its /api and /m stay put, because minted
  // metadata and NFT images point at stellarr.club.
  async redirects() {
    const oldHost = [{ type: 'host' as const, value: '(?:www\\.)?stellarr\\.club' }];
    return [
      { source: '/', has: oldHost, destination: 'https://skychaser.io/', permanent: true },
      { source: '/:path((?!api/|m/|_next/).+)', has: oldHost, destination: 'https://skychaser.io/:path', permanent: true },
      { source: '/set/001', destination: '/genesis', permanent: true },
      { source: '/tonight', destination: '/vote', permanent: true },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/api/:path((?:metadata|nft-image|passport|og|share/og|observe/photo|agent|sky/forecast|users/upsert|cohort/upsert)(?:/.*)?)',
          destination: `${LEGACY_ORIGIN}/api/:path`,
        },
        { source: '/m/:path*', destination: `${LEGACY_ORIGIN}/m/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    // Pages that sign payments: no eval outside development (Next's dev overlay needs it; the
    // voyage's physics needs only WebAssembly compilation, 'wasm-unsafe-eval'), and
    // a devnet RPC only on a devnet build.
    const dev = process.env.NODE_ENV !== 'production';
    const devnet = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet';
    const csp = [
      "default-src 'self'",
      `script-src 'self' ${dev ? "'unsafe-eval'" : "'wasm-unsafe-eval'"} 'unsafe-inline' https://auth.privy.io https://*.privy.io https://challenges.cloudflare.com`,
      "style-src 'self' 'unsafe-inline' https://auth.privy.io",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://auth.privy.io",
      `connect-src 'self' blob: https://api.mainnet-beta.solana.com${devnet ? ' https://api.devnet.solana.com wss://api.devnet.solana.com' : ''} https://api.open-meteo.com https://api.coingecko.com https://mainnet.helius-rpc.com https://*.helius-rpc.com wss://*.helius-rpc.com wss://mainnet.helius-rpc.com https://auth.privy.io https://api.privy.io https://*.privy.io https://*.rpc.privy.systems https://challenges.cloudflare.com wss://relay.walletconnect.com wss://relay.walletconnect.org https://pulse.walletconnect.com https://verify.walletconnect.com https://verify.walletconnect.org https://explorer-api.walletconnect.com https://nominatim.openstreetmap.org`,
      "frame-src https://auth.privy.io https://challenges.cloudflare.com https://verify.walletconnect.com https://verify.walletconnect.org",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    return [
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Card art is redrawn rarely and keeps its name: a day in the browser, then refreshed in the background.
        source: '/cards/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=self, geolocation=self' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
