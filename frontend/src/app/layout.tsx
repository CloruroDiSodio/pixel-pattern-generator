import type { Metadata, Viewport } from 'next';

import StructuredData from '@/components/StructuredData';
import { DESCRIPTION, KEYWORDS, SITE_URL, TITLE } from '@/lib/seo';

import './globals.css';

export const metadata: Metadata = {
  // Absolute base so canonical / Open Graph URLs are never emitted relative.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: `%s | ${TITLE}`,
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  keywords: KEYWORDS,
  authors: [{ name: TITLE }],
  creator: TITLE,
  alternates: { canonical: '/' },
  // The studio is a client-side tool: index the landing content, but let
  // search engines skip query-string permutations of it.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: TITLE,
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: '#08090d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        {/* Lets keyboard users jump straight past the header controls. */}
        <a
          href="#studio"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50
            focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to the studio
        </a>
        <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-16 sm:px-6">
          <StructuredData />
          {children}
        </div>
      </body>
    </html>
  );
}
