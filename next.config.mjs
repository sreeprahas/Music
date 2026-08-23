/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Electron serves the renderer from the fixed loopback port below. Next 16
  // otherwise blocks its dev scripts/HMR, leaving only the server HTML and a
  // permanently stuck loading shell.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    '127.0.0.1:47821',
    'localhost:47821',
    '127.0.0.1:3000',
    'localhost:3000',
    '127.0.0.1:3001',
    'localhost:3001',
  ],
  outputFileTracingExcludes: {
    '/*': ['./data/**/*'],
  },
  transpilePackages: ['lucide-react'],
  trailingSlash: false,
  reactStrictMode: false,
  async rewrites() {
    return [{ source: '/settings', destination: '/' }];
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' }
    ]
  }
};

export default nextConfig;
