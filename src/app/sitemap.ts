import type { MetadataRoute } from 'next';
import { SET_001_CARDS } from '@/lib/sets/set-001';

const BASE = 'https://stellarr.club';

/** Skychaser's public pages: the shop, the set, every card, and the pages around them. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }> = [
    { path: '/', changeFrequency: 'daily', priority: 1.0 },
    { path: '/genesis', changeFrequency: 'weekly', priority: 0.9 },
    ...SET_001_CARDS.map((c) => ({ path: `/card/${c.seed.designation}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
    { path: '/capsules', changeFrequency: 'daily', priority: 0.8 },
    { path: '/vote', changeFrequency: 'daily', priority: 0.8 },
    { path: '/node', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/capsules/log', changeFrequency: 'daily', priority: 0.5 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/terms', changeFrequency: 'monthly', priority: 0.3 },
    { path: '/privacy', changeFrequency: 'monthly', priority: 0.3 },
  ];

  return routes.map((r) => ({
    url: `${BASE}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
