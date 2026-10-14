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

  // Production builds use Turbopack (the Next 16 default). The former webpack()
  // hook only stubbed fs/path/os for the client bundle; no client module imports
  // them, so no resolveAlias is needed here.
  // Do not pin `turbopack.root`: the parallel fix worktrees junction node_modules
  // from the main checkout, and Turbopack rejects symlinks that leave a pinned root.
  turbopack: {},

  // The operator console is a separate app (super-admin/); old bookmarks to the removed pages land on the dashboard.
  async redirects() {
    return [
      { source: '/super-admin', destination: '/dashboard', permanent: false },
      { source: '/super-admin/:path*', destination: '/dashboard', permanent: false },
    ];
  },
};

export default nextConfig;
