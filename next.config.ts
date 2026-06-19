import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  // Allow large uploads for media optimization (images + videos).
  // Route Handlers parse multipart/form-data; this raises the default 1MB limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  // Allow preview panel cross-origin requests
  allowedDevOrigins: [
    'preview-chat-74dbc56d-4ece-4b21-8aaf-46e532a4d0fb.space-z.ai',
    'preview-chat-3dedfb8f-205b-42df-b720-4d4398b77e4d.space-z.ai',
  ],
  // Production optimizations
  poweredByHeader: false,
  compress: true,
  // Security & performance headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
            : []),
        ],
      },
      {
        source: '/brand/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // Uploaded media is content-hash named → "incorruptible". Safe to cache
        // for a full year (immutable). If the same image is re-uploaded, the
        // content hash matches and the URL stays the same; if a different image
        // is uploaded, it gets a new hash → new URL → instant cache miss.
        source: '/uploads/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/products/:path*',
        headers: [
          // Keep a short max-age so replaced photos are revalidated quickly,
          // but still allow stale-while-revalidate for performance. The real
          // cache-busting is handled via the `?v=` query param on each URL
          // (see src/lib/media-version.ts) which forces a fresh fetch whenever
          // MEDIA_VERSION is bumped.
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
