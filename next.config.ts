import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // typedRoutes disabled for Phase 2
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent bundling native .node binaries
      config.externals = config.externals || [];
      config.externals.push({ "@napi-rs/canvas": "commonjs @napi-rs/canvas" });
    }
    return config;
  },
};

export default nextConfig;
