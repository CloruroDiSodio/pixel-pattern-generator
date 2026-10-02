/**
 * Shared SEO constants.
 *
 * Lives here (rather than in `layout.tsx`) so both the metadata export and the
 * JSON-LD component can import it: the App Router only permits a fixed set of
 * exports from a layout file.
 */

const DEFAULT_SITE_URL = 'https://pixel-pattern-generator.netlify.app';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL).replace(/\/+$/, '');

export const TITLE = 'Pixel Art & Pattern Generator';

export const DESCRIPTION =
  'Turn any photo into a pixel art grid, quantize it to a retro palette ' +
  '(NES, PICO-8, Game Boy) and export a printable cross stitch pattern as PNG, CSV or Markdown.';

export const KEYWORDS = [
  'pixel art generator',
  'pixelate image online',
  'cross stitch pattern generator',
  'embroidery pattern',
  'colour quantization',
  'image palette converter',
  'PICO-8 palette',
  'NES palette',
  'Game Boy palette',
  'craft pattern',
  'pixel grid',
];