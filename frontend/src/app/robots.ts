import type { MetadataRoute } from 'next';

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://turnipmedia-pixel-pattern-generator.netlify.app'
).replace(/\/+$/, '');

/**
 * The whole app is a single static route, so this exists mainly to declare the
 * crawl directives explicitly rather than relying on defaults. The API host
 * (NEXT_PUBLIC_API_URL) is deliberately *not* advertised here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}