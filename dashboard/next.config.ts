import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/sim/:path*", destination: "http://localhost:3000/:path*" },
      { source: "/api/go/:path*", destination: "http://localhost:8080/:path*" },
    ];
  },
};

export default nextConfig;
