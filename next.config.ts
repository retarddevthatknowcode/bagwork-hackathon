import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Type errors are no longer suppressed. `ignoreBuildErrors` was on while the project
  // carried 59 legacy errors; they are all fixed now, so the build should fail loudly
  // rather than ship a broken type.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
