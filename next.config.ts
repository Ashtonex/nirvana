import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Static export for Capacitor mobile app
  output: 'export',
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
