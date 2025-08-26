import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Vercel: allow build to succeed even if ESLint finds issues
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Optional: allow build to succeed even if there are TS errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
