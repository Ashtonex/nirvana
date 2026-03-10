import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Keep as server for API routes and server actions
  // For Capacitor mobile, use separate build if needed
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
