import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/lib/seo';

/** Single-page app: one indexable route, refreshed weekly. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 1,
    },
  ];
}