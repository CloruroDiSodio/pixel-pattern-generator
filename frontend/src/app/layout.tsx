import type { Metadata, Viewport } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Pixel Art & Pattern Generator',
  description:
    'Turn any photo into a pixel art grid, quantize it to a retro palette and export a cross stitch or craft pattern.',
  applicationName: 'Pixel Art & Pattern Generator',
  keywords: ['pixel art', 'pattern generator', 'cross stitch', 'quantization', 'PICO-8', 'NES'],
};

export const viewport: Viewport = {
  themeColor: '#08090d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 sm:px-6">
          {children}
        </div>
      </body>
    </html>
  );
}
