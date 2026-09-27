import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CORS on every /api route (contract: allow all origins), including preflight.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Device-Token" },
        ],
      },
    ];
  },
};

export default nextConfig;
