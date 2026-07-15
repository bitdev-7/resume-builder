/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "http://localhost:4000";

const nextConfig = {
  allowedDevOrigins: ["192.168.4.201", "localhost", "127.0.0.1"],
  // Next.js's rewrite proxy defaults to a 30s proxyTimeout, which aborts long-running
  // requests like /api/analyze (the AI tailoring pipeline can take minutes) with a
  // "socket hang up" / ECONNRESET. Raise it to match the backend's SERVER_TIMEOUT_MS
  // (10 min) so the frontend proxy doesn't kill the connection before the backend
  // finishes. Self-hosted only — Vercel caps proxied requests at 120s.
  experimental: {
    proxyTimeout: Number(process.env.PROXY_TIMEOUT_MS || 600_000),
  },
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return [];
    }
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        canvas: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
