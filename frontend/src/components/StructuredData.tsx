import { DESCRIPTION, SITE_URL, TITLE } from '@/lib/seo';

/**
 * SoftwareApplication structured data so search engines can surface the tool as
 * a rich result. Rendered once, from the server layout.
 *
 * Its own module because the App Router only permits a fixed set of exports
 * from a `layout.tsx` - anything else fails the type check.
 */
export default function StructuredData() {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Any',
    browserRequirements: 'Requires a modern browser with JavaScript',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: [
      'Pixelate images to a configurable grid',
      'Colour quantization with dithering',
      'Built-in NES, PICO-8, Game Boy, Sweetie 16, CGA and greyscale palettes',
      'Cross stitch and craft pattern charts',
      'Export to PNG, CSV and Markdown',
    ],
  };

  return (
    <script
      type="application/ld+json"
      // Content is a build-time constant, never user input.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}