/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure TS from workspaces is transpiled
  transpilePackages: ["@doewe/shared"],
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    return config;
  }
};

export default nextConfig;