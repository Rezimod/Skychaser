import { FIRST_LIGHT_WHEN } from '@/lib/skychaser/first-light';

/**
 * Site-wide structured data (JSON-LD), rendered once in the root layout.
 */
export default function JsonLd() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://skychaser.io/#organization',
        name: 'Skychaser',
        url: 'https://skychaser.io',
        logo: 'https://skychaser.io/apple-touch-icon.png',
        sameAs: ['https://astroman.ge'],
        description: `Skychaser issues real astronomical objects as numbered card editions, sold in sealed capsules; the rarest come with a real meteorite. The Live Telescope, which will photograph the night’s card, is being commissioned for first light in ${FIRST_LIGHT_WHEN}.`,
      },
      {
        '@type': 'WebSite',
        '@id': 'https://skychaser.io/#website',
        name: 'Skychaser',
        url: 'https://skychaser.io',
        publisher: { '@id': 'https://skychaser.io/#organization' },
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
