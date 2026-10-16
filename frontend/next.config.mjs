/**
 * Security headers for every route.
 *
 * Declared here rather than in netlify.toml: the Netlify Next.js runtime serves
 * the pages and ignores [[headers]] rules for them, so the headers listed there
 * never reached a browser.
 *
 * CSP notes: 'unsafe-inline' is required for the inline bootstrap scripts the
 * App Router emits and for React style attributes. connect-src allows any HTTPS
 * origin because the API host is only known at build time (NEXT_PUBLIC_API_URL).
 * blob:/data: cover the uploaded-image preview and exported PNGs. `next dev`
 * needs 'unsafe-eval' and a plain-http API, so the CSP is production-only.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // The app needs no device APIs; deny them so injected script cannot ask.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }]
    : []),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  reactStrictMode: true,
  // The API lives on a separate host (Render in production, localhost in dev)
  // and is read from NEXT_PUBLIC_API_URL at build time, so no rewrites are
  // needed.
  //
  // Note: images.remotePatterns is intentionally NOT configured. This app only
  // renders local object URLs and base64 data URIs via <img>, so allowing every
  // remote host would be pure attack surface (the Next.js image optimizer can be
  // abused as an open proxy for anyone who later switches to next/image).
  poweredByHeader: false,
};

export default nextConfig;
