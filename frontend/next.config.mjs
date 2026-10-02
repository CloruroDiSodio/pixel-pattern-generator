/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The API lives on a separate host (Render in production, localhost in dev).
  // Everything is read from NEXT_PUBLIC_API_URL at runtime, so no rewrites are
  // needed - but they are handy when the backend is mounted under /api.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
