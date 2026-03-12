import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["better-sqlite3", "undici"],
  webpack: (config) => {
    config.watchOptions = {
      poll: false,
      ignored: ["**/*"],
    };
    return config;
  },
};

export default nextConfig;
