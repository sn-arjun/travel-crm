import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Output standalone for Electron packaging
  output: 'standalone',

  // Enable React strict mode for development
  reactStrictMode: true,

  // Disable image optimization for Electron (local files)
  images: {
    unoptimized: true,
  },

  // Transpile shared package
  transpilePackages: ['@travelcrm/shared'],

  // Webpack config for Electron compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Node.js modules for the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
      };
    }
    return config;
  },
};

export default nextConfig;
