import { ImageResponse } from 'next/og';

import { DESCRIPTION, TITLE } from '@/lib/seo';

/**
 * Social preview card, rendered once at build time.
 *
 * The metadata already asks for a `summary_large_image` card; without an image
 * the share preview fell back to a bare link. Next wires this file into both
 * `og:image` and `twitter:image` automatically.
 */
export const alt = TITLE;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SWATCHES = ['#7c5cff', '#4ade80', '#fbbf24', '#fb7185'];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#08090d',
          color: '#e2e8f0',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 176, gap: 8, marginBottom: 48 }}>
          {Array.from({ length: 16 }, (_, index) => (
            <div
              key={index}
              style={{
                width: 38,
                height: 38,
                borderRadius: 4,
                background: SWATCHES[(index + Math.floor(index / 4)) % SWATCHES.length],
              }}
            />
          ))}
        </div>
        <div style={{ fontSize: 72, fontWeight: 700, color: '#ffffff' }}>{TITLE}</div>
        <div style={{ fontSize: 30, marginTop: 24, maxWidth: 960, color: '#94a3b8' }}>{DESCRIPTION}</div>
      </div>
    ),
    size,
  );
}
