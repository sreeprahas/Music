/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: false,
  output: process.env.IS_NATIVE_BUILD === 'true' ? 'standalone' : undefined,
  reactStrictMode: false,
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
