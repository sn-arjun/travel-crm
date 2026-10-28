import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Announcements, support and SEO have no backend API yet (owner question Q8): the pages are hidden.
  async redirects() {
    return [
      { source: '/announcements', destination: '/dashboard', permanent: false },
      { source: '/support', destination: '/dashboard', permanent: false },
      { source: '/support/:path*', destination: '/dashboard', permanent: false },
      { source: '/seo', destination: '/dashboard', permanent: false },
    ];
  },
};

export default nextConfig;

