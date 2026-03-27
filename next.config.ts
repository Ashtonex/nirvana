import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  images: {
    unoptimized: true,
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{member}}',
      skipDefaultConversion: true,
    },
  },
  experimental: {
    optimizePackageImports: ['lucide-react', '@/components/ui'],
  },
  headers: async () => [
    {
      source: '/api/:path*',
      headers: [
        { key: 'Cache-Control', value: 'no-store, must-revalidate' },
      ],
    },
  ],
};

export default nextConfig;
