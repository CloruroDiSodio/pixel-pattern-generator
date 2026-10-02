/** @type {import('next').NextConfig} */
const nextConfig = {
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
