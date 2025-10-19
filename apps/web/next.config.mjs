/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Ensure TS from workspaces is transpiled
  transpilePackages: ["@doewe/shared"]
};

export default nextConfig;