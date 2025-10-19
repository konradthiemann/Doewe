/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: ["@doewe/shared"],
};

export default nextConfig;